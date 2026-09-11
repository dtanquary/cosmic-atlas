"""Validate model families, all profile chunks, coverage, and original previews."""
import gzip
import hashlib
import json
from pathlib import Path
import numpy as np
from prepare_model_catalog import family

ROOT = Path(__file__).resolve().parent.parent


def main():
    for label, expected in [('Sb',1),('Sbc',1),('SABb',1),('SBb',2),('SBcd',2),('S0',4),('SB0',4),('E-S0',4),('E',3),('dE',3),('I',5),('IB',5),('',0),('?',0),('Pec',0)]:
        assert family(label) == expected, label
    base = ROOT / 'public/data/models'
    model = json.loads((base/'manifest.json').read_text())
    catalog = json.loads((ROOT/'public/data/dr1/manifest.json').read_text())
    assert model['count'] == catalog['count'] and model['catalogSourceSha256'] == catalog['source']['sha256']
    seen = np.zeros(model['count'], dtype=np.uint8)
    measured = classified = 0
    originals = {d['galaxy']['id']: d for d in [json.loads((ROOT/f'public/data/{file}.json').read_text()) for file in ['galaxy-detail','galaxy-spiral']]}
    checked = set()
    for node in catalog['nodes']:
        asset = model['nodes'][node['id']]; compressed = (base/asset['url']).read_bytes()
        assert len(compressed) == asset['bytes'] and hashlib.sha256(compressed).hexdigest() == asset['sha256']
        data = gzip.decompress(compressed); header = np.frombuffer(data,'<u4',count=4)
        assert header.tolist() == [0x43415331,1,node['storedCount'],0]
        assert len(data) == asset['decodedBytes'] == 16+20*node['storedCount']
        values = np.frombuffer(data,'<f4',offset=16).reshape(-1,5);flags = np.frombuffer(data,'<u4',offset=16).reshape(-1,5)[:,4]
        ids = np.frombuffer(gzip.decompress((ROOT/'public/data/dr1'/node['points']['url']).read_bytes()),'<u4',offset=16+12*node['storedCount'])
        for id, original in originals.items():
            rows = np.flatnonzero(ids == id)
            if len(rows):
                shape=original['shape'];expected=[shape['radiusArcsec'],shape['e1'],shape['e2'],shape['sersic']]
                np.testing.assert_array_equal(values[rows[0],:4],expected);checked.add(id)
        if not node['children']:
            assert not seen[ids].any();seen[ids]=1
            valid=(values[:,0]>0)&np.isfinite(values[:,:3]).all(axis=1)&(np.hypot(values[:,1],values[:,2])<.999)&np.isin(flags&255,[2,3,4,5])
            measured+=int(valid.sum());classified+=int(((flags>>8)>0).sum())
    assert seen.all() and checked == set(originals)
    assert measured == model['measuredShapes'] and classified == model['visualTypes']
    assert model['assumedShapes']+measured == model['count']
    assert max(item['weightedError'] for item in model['library']) < .005
    print(f'Validated {model["count"]:,} model records, {measured:,} measured shapes, {classified:,} visual types, all hashes and full leaf coverage.')


if __name__ == '__main__':
    main()
