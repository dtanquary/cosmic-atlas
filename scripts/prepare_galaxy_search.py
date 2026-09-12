"""Build local named-galaxy search with exact SGA reference joins to DESI.

Inputs: verified DESI FITS, prepared DR1 nodes, SGA-NGC/IC/UGC.fits downloaded
from the SGA portal's filtered Download action, and OpenNGC.csv for aliases.
No coordinate-only matches or invented distances are introduced.
"""
import csv
import gzip
import hashlib
import json
import re
from pathlib import Path

import numpy as np
from astropy.io import fits
from prepare_data import accepted_mask, header, leaf_metadata

ROOT = Path(__file__).resolve().parent.parent


def pretty(name):
    return re.sub(r'^(NGC|IC|UGC|PGC)0*(\d+)', r'\1 \2', str(name).strip())


def main():
    aliases = {}
    with (ROOT / '.cache/OpenNGC.csv').open() as stream:
        for row in csv.DictReader(stream, delimiter=';'):
            if row['Type'] != 'G':
                continue
            values = [pretty(row['Name'])]
            if row['M']:
                values.extend([f"M {int(row['M'])}", f"Messier {int(row['M'])}"])
            values.extend(x.strip() for x in row['Common names'].split(',') if x.strip())
            values.extend(pretty(x) for x in row['Identifiers'].split(',') if re.match(r'^(NGC|IC|UGC|PGC) ', x.strip()))
            aliases[row['Name']] = list(dict.fromkeys(values))

    objects, sources = {}, []
    for prefix in ['NGC', 'IC', 'UGC']:
        path = ROOT / f'.cache/SGA-{prefix}.fits'
        sources.append({'url': f'https://sga.legacysurvey.org/?galaxy__match={prefix}', 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
        with fits.open(path) as catalog:
            for row in catalog['ELLIPSE'].data:
                name = str(row['GALAXY']).strip()
                objects[int(row['SGA_ID'])] = {
                    'name': pretty(name), 'aliases': aliases.get(name, []),
                    'sgaId': int(row['SGA_ID']), 'ra': float(row['RA']), 'dec': float(row['DEC']),
                }
                if row['PGC'] > 0:
                    objects[int(row['SGA_ID'])]['aliases'].append(f"PGC {int(row['PGC'])}")

    directory = ROOT / 'public/data/dr1'
    manifest = json.loads((directory / 'manifest.json').read_text())
    dtype, offset, count = header(ROOT / '.cache/zall-pix-iron.fits')
    rows = np.memmap(ROOT / '.cache/zall-pix-iron.fits', mode='r', dtype=dtype, offset=offset, shape=(count,))
    reference_ids = np.array(list(objects), dtype=np.int64)
    selected, accepted = {}, 0
    for start in range(0, count, 262144):
        batch = rows[start:start + 262144]
        keep, _ = accepted_mask(batch)
        dense = np.cumsum(keep) - 1 + accepted
        matched = np.flatnonzero(keep & (batch['REF_CAT'] == b'L3') & np.isin(batch['REF_ID'], reference_ids))
        for index in matched:
            raw = batch[index]; sga_id = int(raw['REF_ID']); obj = objects[sga_id]
            # Duplicate DESI references may correspond to nearby knots. Keep the
            # central target, requiring agreement with the SGA center within 3".
            ra_delta = (float(raw['TARGET_RA']) - obj['ra'] + 180) % 360 - 180
            offset_arcsec = 3600 * np.hypot(ra_delta * np.cos(np.deg2rad(obj['dec'])), float(raw['TARGET_DEC']) - obj['dec'])
            rank = (offset_arcsec, -float(raw['DELTACHI2']))
            if offset_arcsec <= 3 and (sga_id not in selected or rank < selected[sga_id]['rank']):
                selected[sga_id] = {'id': int(dense[index]), 'targetId': str(int(raw['TARGETID'])), 'rank': rank}
        accepted += int(keep.sum())
    assert accepted == manifest['count']
    print(f'{len(selected)} named central targets matched; locating exact leaf metadata…', flush=True)
    by_id = {record['id']: (sga_id, record) for sga_id, record in selected.items()}
    wanted = np.array(list(by_id), dtype=np.uint32)
    for node in manifest['nodes']:
        if node['children']:
            continue
        compressed = (directory / node['points']['url']).read_bytes()
        assert hashlib.sha256(compressed).hexdigest() == node['points']['sha256']
        points = gzip.decompress(compressed)
        ids = np.frombuffer(points, '<u4', offset=16 + 12 * node['storedCount'])
        matches = np.flatnonzero(np.isin(ids, wanted))
        if not len(matches):
            continue
        metadata = leaf_metadata(directory, node)
        for index in matches:
            sga_id, record = by_id[int(ids[index])]
            assert str(int(metadata[index]['targetid'])) == record['targetId']
            objects[sga_id].update(id=record['id'], targetId=record['targetId'], node=node['id'], row=int(index), distance=float(metadata[index]['distance']))

    entries = []
    for obj in objects.values():
        obj.pop('ra'); obj.pop('dec')
        obj['aliases'] = list(dict.fromkeys(x for x in obj['aliases'] if x != obj['name']))
        entries.append(obj)
    entries.sort(key=lambda x: x['name'])
    names = {obj['name'] for obj in entries}
    for name, values in aliases.items():
        if pretty(name) not in names:
            entries.append({'name': pretty(name), 'aliases': values})
    result = {'version': 1, 'license': 'CC-BY-SA-4.0', 'catalogId': manifest['id'], 'catalogSourceSha256': manifest['source']['sha256'],
              'matched': len(selected), 'entries': entries, 'sources': sources,
              'aliasesSource': {'url': 'https://github.com/mattiaverga/OpenNGC', 'sha256': hashlib.sha256((ROOT / '.cache/OpenNGC.csv').read_bytes()).hexdigest()}}
    path = ROOT / 'public/data/galaxy-search.json'
    path.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    print(f'{len(entries)} names, {len(selected)} visitable, {path.stat().st_size:,} bytes')
    print('Messier matches:', [(o['name'], o['aliases'], round(o['distance'], 2)) for o in entries if 'id' in o and any(a.startswith('M ') for a in o['aliases'])])


if __name__ == '__main__':
    main()
