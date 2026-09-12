"""Sky occupancy of the accepted DR1 rows at 0.5°, for the survey footprint overlay.

Streams every leaf metadata chunk of the prepared catalog (checksum-verified),
histograms RA/Dec, and writes a compact base64 uint8 grid. This is derived from
this catalog's rows, not the official DESI tiling: dark cells were not surveyed
here and are not confirmed empty.
"""
import base64
import json
from pathlib import Path

import numpy as np
from prepare_data import leaf_metadata

ROOT = Path(__file__).resolve().parent.parent
WIDTH, HEIGHT = 720, 360  # 0.5° cells; rows = Dec south→north, columns = RA 0→360
DISCLOSURE = ('Sky occupancy of the accepted DESI DR1 galaxy rows in this catalog at 0.5° resolution, '
              'not the official survey tiling, depth or completeness. A tinted cell holds at least one accepted row '
              '(shade = log row count); dark cells were not surveyed here and are not confirmed empty.')


# ponytail: uint8 log scale, ~3% count steps; store uint16 raw counts (518 KB) if a consumer ever needs counts.
def encode(counts, maximum):
    """0 = no accepted galaxy; 1..255 span log1p(count) up to the densest cell (`maximum`)."""
    assert counts.max() <= maximum
    return np.ceil(255 * np.log1p(counts) / np.log1p(maximum)).astype(np.uint8)


def main():
    directory = ROOT / 'public/data/dr1'
    manifest = json.loads((directory / 'manifest.json').read_text())
    counts = np.zeros((HEIGHT, WIDTH), dtype=np.int64)
    for node in manifest['nodes']:
        if node['children']:
            continue
        rows = leaf_metadata(directory, node)
        # numpy includes the right edge in the last bin: Dec exactly +90 lands in the northernmost row; RA 360 is excluded by the catalog filter.
        counts += np.histogram2d(rows['dec'], rows['ra'], bins=[HEIGHT, WIDTH], range=[[-90, 90], [0, 360]])[0].astype(np.int64)
    assert int(counts.sum()) == manifest['count'], 'Leaf-once coverage broken or rows fell outside the sky range'
    grid = encode(counts, counts.max())
    result = {'version': 1, 'catalogId': manifest['id'], 'catalogSourceSha256': manifest['source']['sha256'],
              'count': manifest['count'], 'width': WIDTH, 'height': HEIGHT, 'degreesPerCell': 0.5,
              'maxCellCount': int(counts.max()), 'occupiedCells': int(np.count_nonzero(counts)),
              'cells': base64.b64encode(grid.tobytes()).decode(),
              'sources': ['https://data.desi.lbl.gov/doc/releases/dr1/'], 'disclosure': DISCLOSURE}
    path = ROOT / 'public/data/survey-footprint.json'
    path.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    # Area-weighted by cos(Dec) so polar cells do not inflate the fraction.
    weight = np.cos(np.deg2rad(np.linspace(-89.75, 89.75, HEIGHT)))[:, None]
    sky_fraction = float((weight * (counts > 0)).sum() / (weight.sum() * WIDTH))
    row, col = np.unravel_index(np.argmax(counts), counts.shape)
    print(f'{result["occupiedCells"]:,} occupied cells ({sky_fraction:.1%} of the sky), max cell count {result["maxCellCount"]:,} '
          f'at RA {col / 2 + .25:.2f}° Dec {row / 2 - 89.75:+.2f}°, {path.stat().st_size:,} bytes')


if __name__ == '__main__':
    main()
