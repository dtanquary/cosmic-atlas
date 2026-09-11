"""Stream imaging profiles for every accepted DR1 row into aligned sidecars.

Does not rewrite positions or metadata. Run after data:prepare and the named
search extractor. Binary records are SHAPE_R, E1, E2, Sersic (float32) and
flags (uint32: imaging model in low byte, visual family in next byte).
"""
import csv
import gzip
import hashlib
import json
import re
import struct
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from astropy.io import fits
from scipy.optimize import nnls
from scipy.special import gammaincinv
from prepare_data import META, accepted_mask, header

ROOT = Path(__file__).resolve().parent.parent
FAMILIES = {0: 'unknown', 1: 'spiral', 2: 'barred', 3: 'elliptical', 4: 'lenticular', 5: 'irregular'}
PROFILE_TYPES = {'PSF': 1, 'REX': 2, 'EXP': 3, 'DEV': 4, 'SER': 5}
DTYPE = np.dtype([('radius', '<f4'), ('e1', '<f4'), ('e2', '<f4'), ('sersic', '<f4'), ('flags', '<u4')])


def family(value):
    # Preserve case: Sb/Sbc mean unbarred spiral stage b/bc; SB means a bar.
    value = re.sub(r'[\s():?]', '', value)
    if re.match(r'^(S0|SB0|SAB0|E/S0|E-S0)', value):
        return 4
    if value.startswith(('Irr', 'IRR', 'I', 'IB')):
        return 5
    if value.startswith(('E', 'cE', 'dE')):
        return 3
    if value.startswith('SB'):
        return 2
    if value.startswith('S'):
        return 1
    return 0


def known_types():
    search_path = ROOT / 'public/data/galaxy-search.json'
    search = json.loads(search_path.read_text())
    matched = {e['sgaId']: e for e in search['entries'] if 'id' in e and 'sgaId' in e}
    result = {}
    for prefix in ['NGC', 'IC', 'UGC']:
        with fits.open(ROOT / f'.cache/SGA-{prefix}.fits') as source:
            for row in source['ELLIPSE'].data:
                entry = matched.get(int(row['SGA_ID']))
                if not entry:
                    continue
                morphology = str(row['MORPHTYPE']).strip()
                code = family(morphology)
                if code:
                    result[str(entry['id'])] = dict(name=entry['name'], morphology=morphology, family=FAMILIES[code], code=code, source='SGA / HyperLEDA', node=entry['node'], row=entry['row'], targetId=entry['targetId'])
    # Preserve explicit provenance if OpenNGC supplies a missing SGA type.
    by_name = {e['name'].replace(' ', ''): e for e in matched.values()}
    with (ROOT / '.cache/OpenNGC.csv').open() as stream:
        for row in csv.DictReader(stream, delimiter=';'):
            name = re.sub(r'^(NGC|IC)0*(\d+)', r'\1\2', row['Name'])
            entry = by_name.get(name)
            code = family(row['Hubble'])
            if entry and str(entry['id']) not in result and row['Type'] == 'G' and code:
                result[str(entry['id'])] = dict(name=entry['name'], morphology=row['Hubble'], family=FAMILIES[code], code=code, source='OpenNGC', node=entry['node'], row=entry['row'], targetId=entry['targetId'])
    return result, search


def profile_library():
    result = []
    for n in np.round(np.arange(.5, 6.01, .1), 1):
        if n == .5:
            b = float(gammaincinv(1, .5))
            result.append(dict(n=.5, weightedError=0., gaussians=[dict(sigmaRe=(2*b)**-.5, peak=float(np.exp(b)))]))
            continue
        radius = np.geomspace(.01, 8, 500)
        profile = np.exp(-gammaincinv(2*n, .5) * (radius**(1/n)-1))
        weight = np.maximum(profile, .001)
        fits = []
        for low, high in [(.03,3),(.1,3),(.007,8),(.005,10)]:
            sigma = np.geomspace(low, high, 20)
            basis = np.exp(-.5*(radius[:, None]/sigma)**2)
            peak, _ = nnls(basis/weight[:, None], profile/weight, maxiter=2000)
            error = float(np.max(np.abs((basis@peak-profile)/weight)))
            fits.append((error, sigma, peak))
        error, sigma, peak = min(fits, key=lambda fit: fit[0])
        assert error < .015, (n, error)
        result.append(dict(n=float(n), weightedError=error, gaussians=[dict(sigmaRe=float(s), peak=float(p)) for s, p in zip(sigma, peak) if p > 1e-10]))
    return result


def main():
    directory = ROOT / 'public/data/dr1'
    manifest = json.loads((directory / 'manifest.json').read_text())
    destination = ROOT / 'public/data/models'
    destination.mkdir(exist_ok=True)
    known, search = known_types()
    assert search['catalogSourceSha256'] == manifest['source']['sha256']
    source = ROOT / '.cache/zall-pix-iron.fits'
    dtype, offset, count = header(source)
    raw = np.memmap(source, mode='r', dtype=dtype, offset=offset, shape=(count,))
    reuse = '--repack' in sys.argv
    if reuse:
        previous = json.loads((destination / 'manifest.json').read_text())
        assert previous['catalogSourceSha256'] == manifest['source']['sha256'] and previous['count'] == manifest['count']
    records = np.lib.format.open_memmap(ROOT / '.cache/model-profiles.npy', mode='r+' if reuse else 'w+', dtype=DTYPE, shape=(manifest['count'],))
    assert records.shape == (manifest['count'],) and records.dtype == DTYPE
    total, counts = 0, Counter()
    for start in range(0 if not reuse else count, count, 262144):
        batch = raw[start:start+262144]
        selected = batch[accepted_mask(batch)[0]]
        part = records[total:total+len(selected)]
        for field, original in [('radius', 'SHAPE_R'), ('e1', 'SHAPE_E1'), ('e2', 'SHAPE_E2'), ('sersic', 'SERSIC')]:
            part[field] = selected[original]
        part['flags'] = 0
        for key, code in PROFILE_TYPES.items():
            mask = selected['MORPHTYPE'] == key.encode()
            part['flags'][mask] = code
            counts[key] += int(mask.sum())
        total += len(selected)
        if start % (262144*16) == 0:
            print(f'Profiles: {total:,} accepted / {start+len(batch):,} source rows', flush=True)
    if reuse:
        total = manifest['count']
        counts = Counter(previous['imagingTypes'])
    assert total == manifest['count']
    records['flags'] &= 255
    for id, item in known.items():
        records[int(id)]['flags'] |= item['code'] << 8
    valid = (records['radius'] > 0) & np.isfinite(records['radius']) & np.isfinite(records['e1']) & np.isfinite(records['e2']) & (np.hypot(records['e1'], records['e2']) < .999) & np.isin(records['flags'] & 255, [2,3,4,5])
    measured = int(valid.sum())
    records.flush()
    assets, leaf_count, unresolved_example = {}, 0, None
    for i, node in enumerate(manifest['nodes']):
        def payload(asset):
            compressed = (directory / asset['url']).read_bytes()
            assert hashlib.sha256(compressed).hexdigest() == asset['sha256']
            return gzip.decompress(compressed)
        ids = np.frombuffer(payload(node['points']), '<u4', offset=16+node['storedCount']*12)
        assert len(ids) == node['storedCount'] and np.all(ids < total)
        subset = records[ids]
        metadata = np.frombuffer(payload(node['metadata']), META, offset=16)
        if not node['children'] and unresolved_example is None:
            missing = np.flatnonzero(~valid[ids] & (metadata['distance'] > 10))
            if len(missing):
                row = int(missing[0])
                unresolved_example = dict(id=int(ids[row]), node=node['id'], row=row, targetId=str(int(metadata[row]['targetid'])))
        # Conservative maximum determines whether a chunk might resolve on screen.
        radius = np.where(valid[ids], subset['radius']*metadata['distance']*np.pi/(180*3600), .005)
        binary = struct.pack('<4I', 0x43415331, 1, len(ids), 0)+subset.tobytes()
        compressed = gzip.compress(binary, compresslevel=6, mtime=0)
        path = destination / f'{node["id"]}.bin'
        path.write_bytes(compressed)
        assets[node['id']] = dict(url=path.name, bytes=len(compressed), decodedBytes=len(binary), sha256=hashlib.sha256(compressed).hexdigest(), maxRadiusMpc=float(radius.max()))
        if not node['children']:
            leaf_count += len(ids)
        if i % 100 == 0:
            print(f'Wrote {i+1}/{len(manifest["nodes"])} profile chunks', flush=True)
    assert leaf_count == total
    result = dict(version=1, catalogId=manifest['id'], catalogSourceSha256=manifest['source']['sha256'], count=total,
                  measuredShapes=measured, assumedShapes=total-measured, visualTypes=len(known), imagingTypes=counts,
                  families=FAMILIES, nodes=assets, namedTypes=known, library=profile_library(),
                  fallbackRadiusMpc=.005, license='CC-BY-SA-4.0', sources=search['sources'], aliasesSource=search['aliasesSource'],
                  unresolvedExample=unresolved_example,
                  totalCompressedBytes=sum(asset['bytes'] for asset in assets.values()))
    (destination / 'manifest.json').write_text(json.dumps(result, separators=(',', ':'))+'\n')
    print(json.dumps({k: result[k] for k in ['count','measuredShapes','assumedShapes','visualTypes','imagingTypes','totalCompressedBytes']}, indent=2))


if __name__ == '__main__':
    main()
