"""Numerical and end-to-end dataset validation, without an external test framework."""
import base64
import gzip
import hashlib
import json
from pathlib import Path
import struct
import sys
import unittest

import numpy as np
from astropy.cosmology import Planck18
from prepare_data import META, accepted_mask, distance_lookup, hash_ids, project
from prepare_survey_footprint import encode

ROOT=Path(__file__).resolve().parent.parent

class Numerics(unittest.TestCase):
 def test_axes(self):
  np.testing.assert_allclose(project([0,90,0],[0,0,90],[1,1,1]),np.eye(3),atol=1e-14)
 def test_distance(self):
  z=np.array([.0001,.01,.1,.5,1,1.7,3,5])
  values,error=distance_lookup(z)
  np.testing.assert_allclose(values,Planck18.comoving_distance(z).value,rtol=1e-7,atol=1e-4)
  self.assertLess(error,1e-4)
 def test_filters(self):
  dtype=[('ZCAT_PRIMARY','i1'),('SPECTYPE','S6'),('OBJTYPE','S3'),('ZWARN','i8'),('TARGET_RA','f8'),('TARGET_DEC','f8'),('Z','f8')]
  rows=np.zeros(8,dtype=dtype);rows['ZCAT_PRIMARY']=ord('T');rows['SPECTYPE']=b'GALAXY';rows['OBJTYPE']=b'TGT';rows['Z']=.2
  rows['ZCAT_PRIMARY'][1]=ord('F');rows['SPECTYPE'][2]=b'STAR';rows['OBJTYPE'][3]=b'SKY';rows['ZWARN'][4]=1;rows['Z'][5]=-.1;rows['TARGET_RA'][6]=np.nan;rows['TARGET_DEC'][7]=91
  mask,counts=accepted_mask(rows)
  self.assertEqual(mask.tolist(),[True]+[False]*7);self.assertEqual(sum(counts),7)
 def test_hash(self):
  ids=np.array([1,9007199254740993,4000000000000000000],dtype='i8')
  np.testing.assert_equal(hash_ids(ids),hash_ids(ids));self.assertEqual(len(set(map(int,hash_ids(ids)))),3)

class Footprint(unittest.TestCase):
 """The survey-footprint sidecar must describe the tracked dr1 manifest, cell for cell."""
 @classmethod
 def setUpClass(cls):
  cls.manifest=json.loads((ROOT/'public/data/dr1/manifest.json').read_text())
  cls.footprint=f=json.loads((ROOT/'public/data/survey-footprint.json').read_text())
  cls.grid=np.frombuffer(base64.b64decode(f['cells']),np.uint8).reshape(f['height'],f['width'])
 def test_header_and_grid(self):
  f,m=self.footprint,self.manifest
  self.assertEqual((f['version'],f['catalogId'],f['catalogSourceSha256'],f['count']),(1,m['id'],m['source']['sha256'],m['count']))
  self.assertEqual((f['width'],f['height'],f['degreesPerCell']),(720,360,.5));self.assertEqual(self.grid.shape,(360,720))
  self.assertEqual(int(np.count_nonzero(self.grid)),f['occupiedCells']);self.assertEqual(int(self.grid.max()),255)
  none,one,densest=encode(np.array([0,1,f['maxCellCount']]),f['maxCellCount']).tolist()
  self.assertEqual((none,densest),(0,255));self.assertGreater(one,0) # so occupiedCells == count_nonzero holds
  self.assertIn('not the official survey tiling',f['disclosure'])
 def test_leaf_cells_match_convention(self):
  # Re-bin one leaf independently (row = Dec south→north, col = RA): the sidecar holds at least that
  # leaf's galaxies in every cell, so a transposed or flipped grid fails here.
  leaf=max((n for n in self.manifest['nodes'] if not n['children']),key=lambda n:n['metadata']['bytes'])
  path=ROOT/'public/data/dr1'/leaf['metadata']['url']
  if not path.exists():self.skipTest('full dr1 binaries are not present')
  rows=np.frombuffer(gzip.decompress(path.read_bytes()),META,offset=16)
  row=np.floor((rows['dec']+90)*2).astype(int).clip(0,359);col=np.floor(rows['ra']*2).astype(int)
  leaf_counts=np.zeros((360,720),np.int64);np.add.at(leaf_counts,(row,col),1)
  occupied=leaf_counts>0;self.assertGreaterEqual(int(occupied.sum()),3)
  self.assertLessEqual(int(leaf_counts.max()),self.footprint['maxCellCount'])
  self.assertTrue(np.all(self.grid[occupied]>=encode(leaf_counts,self.footprint['maxCellCount'])[occupied]))

def validate_dataset(path):
 manifest=json.loads((path/'manifest.json').read_text());nodes={n['id']:n for n in manifest['nodes']}
 leaf_ids=[];max_error=0
 for node in nodes.values():
  buffers={}
  for kind,magic,stride in [('points',0x43415431,16),('metadata',0x43414d31,56)]:
   asset=node[kind];compressed=(path/asset['url']).read_bytes()
   assert hashlib.sha256(compressed).hexdigest()==asset['sha256']
   payload=gzip.decompress(compressed);assert len(payload)==asset['decodedBytes']
   head=struct.unpack('<4I',payload[:16]);assert head[:3]==(magic,1,node['storedCount'])
   assert len(payload)==16+stride*node['storedCount'];buffers[kind]=payload
  n=node['storedCount'];positions=np.frombuffer(buffers['points'],dtype='<f4',offset=16,count=n*3).reshape(-1,3)+node['center']
  ids=np.frombuffer(buffers['points'],dtype='<u4',offset=16+n*12,count=n)
  records=np.frombuffer(buffers['metadata'],dtype=META,offset=16,count=n)
  reference=project(records['ra'],records['dec'],records['distance'])
  max_error=max(max_error,float(np.max(np.abs(reference-positions))))
  assert np.all(ids<manifest['count']);assert len(np.unique(ids))==n
  assert np.all(reference>=np.array(node['min'])-1e-8) and np.all(reference<=np.array(node['max'])+1e-8)
  if node['children']:assert sum(nodes[c]['count'] for c in node['children'])==node['count']
  else:assert n==node['count'];leaf_ids.append(ids.copy())
 all_ids=np.concatenate(leaf_ids);assert len(all_ids)==manifest['count'];assert len(np.unique(all_ids))==manifest['count']
 assert max_error<.002 # At most 2 kpc, only in overview render samples; measured values remain float64.
 print(json.dumps({'dataset':path.name,'validatedGalaxies':manifest['count'],'nodes':len(nodes),'maxRenderErrorMpc':max_error,'status':'passed'}),flush=True)

if __name__=='__main__':
 if len(sys.argv)>1:validate_dataset(Path(sys.argv[1]))
 else:unittest.main()
