"""Reproducible DESI FITS → spatially chunked, immutable browser data.

Run with uv run python scripts/prepare_data.py --help. Bootstrap reads small,
distributed byte ranges of the official file; full builds require its entire
verified table. The bootstrap is never described as a complete survey.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import gzip
import hashlib
import json
import math
from pathlib import Path
import struct
import time
from urllib.request import Request, urlopen
import warnings

import numpy as np
from astropy.io import fits
from astropy.cosmology import Planck18

SOURCE = 'https://data.desi.lbl.gov/public/dr1/spectro/redux/iron/zcatalog/v1/zall-pix-iron.fits'
SOURCE_BYTES = 22_371_272_640
META = np.dtype([('targetid','<i8'), ('ra','<f8'), ('dec','<f8'), ('z','<f8'),
                 ('zerr','<f8'), ('distance','<f8'), ('delta','<f8')])


def leaf_metadata(directory, node):
    """Checksum-verified metadata rows of one leaf node of a prepared catalog."""
    compressed = (directory / node['metadata']['url']).read_bytes()
    assert hashlib.sha256(compressed).hexdigest() == node['metadata']['sha256']
    rows = np.frombuffer(gzip.decompress(compressed), META, offset=16)
    assert len(rows) == node['count']
    return rows
FILTERS = ["ZCAT_PRIMARY = true", "SPECTYPE = GALAXY", "OBJTYPE = TGT", "ZWARN = 0",
           "finite Z > 0", "finite 0 <= RA < 360 and -90 <= DEC <= 90"]


def hash_ids(ids):
    """SplitMix64: a stable, spatially independent ordering of actual objects."""
    with np.errstate(over='ignore'):
        x = ids.astype(np.uint64) + np.uint64(0x9E3779B97F4A7C15)
        x = (x ^ (x >> 30)) * np.uint64(0xBF58476D1CE4E5B9)
        x = (x ^ (x >> 27)) * np.uint64(0x94D049BB133111EB)
        return x ^ (x >> 31)


def accepted_mask(rows):
    # Raw FITS logicals are the ASCII bytes T/F, not C booleans.
    primary = rows['ZCAT_PRIMARY'] == ord('T')
    ra, dec, z = rows['TARGET_RA'], rows['TARGET_DEC'], rows['Z']
    stages = [primary, rows['SPECTYPE'] == b'GALAXY', rows['OBJTYPE'] == b'TGT',
              rows['ZWARN'] == 0, np.isfinite(z) & (z > 0),
              np.isfinite(ra) & (ra >= 0) & (ra < 360) & np.isfinite(dec) & (dec >= -90) & (dec <= 90)]
    keep = np.ones(len(rows), dtype=bool)
    excluded = []
    for stage in stages:
        before = int(keep.sum())
        keep &= stage
        excluded.append(before - int(keep.sum()))
    return keep, excluded


def project(ra, dec, distance):
    ra, dec = np.deg2rad(ra), np.deg2rad(dec)
    return np.column_stack((distance*np.cos(dec)*np.cos(ra),
                            distance*np.cos(dec)*np.sin(ra), distance*np.sin(dec)))


def distance_lookup(z):
    # Log1p spacing resolves the nearby volume while covering rare high-z rows.
    grid = np.expm1(np.linspace(0, np.log1p(float(np.max(z))), 65537))
    dgrid = Planck18.comoving_distance(grid).value
    values = np.interp(z, grid, dgrid)
    rng = np.random.default_rng(20260910)
    check_z = np.concatenate(([1e-6], np.expm1(rng.uniform(0, np.log1p(float(np.max(z))), 256))))
    exact = Planck18.comoving_distance(check_z).value
    approximate = np.interp(check_z, grid, dgrid)
    max_error = float(np.max(np.abs(exact - approximate)))
    # The numerical error budget is 0.1 kpc, well below redshift uncertainties.
    assert max_error < 1e-4, f'Distance interpolation error {max_error} Mpc'
    return values, max_error


def header(path):
    if not path.exists() or path.stat().st_size<65536:
        path=Path('.cache/desi-header.fits')
        if not path.exists():
            path.parent.mkdir(parents=True,exist_ok=True)
            with urlopen(Request(SOURCE,headers={'Range':'bytes=0-65535'}),timeout=30) as response:
                if response.status!=206:raise RuntimeError('Header range request was not honored')
                payload=response.read(65537)
                if len(payload)!=65536:raise RuntimeError('Incomplete source header')
            path.write_bytes(payload)
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        with fits.open(path, memmap=True, lazy_load_hdus=True) as hdus:
            hdu = hdus[1]
            return hdu.columns.dtype.newbyteorder('>'), hdu.fileinfo()['datLoc'], hdu.header['NAXIS2']


def bootstrap_ranges(dtype, offset, total, blocks, rows_per_block, cache):
    cache.mkdir(parents=True, exist_ok=True)
    # Uniformly distributed row strata with seeded offsets, independent of positions.
    rng = np.random.default_rng(20260910)
    starts = [int(i*total/blocks + rng.integers(0, max(1, total//blocks-rows_per_block))) for i in range(blocks)]
    def fetch(start):
        file = cache / f'{start}-{rows_per_block}.fitsrows'
        length = rows_per_block * dtype.itemsize
        if not file.exists() or file.stat().st_size != length:
            begin = offset + start*dtype.itemsize
            req = Request(SOURCE, headers={'Range':f'bytes={begin}-{begin+length-1}'})
            for attempt in range(4):
                try:
                    with urlopen(req,timeout=60) as response:
                        if response.status != 206: raise RuntimeError('Source did not honor Range')
                        payload = response.read(length+1)
                    if len(payload) != length: raise RuntimeError('Truncated range')
                    file.write_bytes(payload)
                    break
                except Exception:
                    if attempt == 3: raise
                    time.sleep(2**attempt)
        return start, file.read_bytes()
    results = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        jobs = [pool.submit(fetch,start) for start in starts]
        for i, job in enumerate(as_completed(jobs)):
            start, payload = job.result()
            results[start] = payload
            print(f'Bootstrap ranges {i+1}/{blocks}', flush=True)
    digest = hashlib.sha256()
    for start in sorted(results):
        digest.update(struct.pack('<Q',start)); digest.update(results[start])
    return [np.frombuffer(results[start], dtype=dtype) for start in sorted(results)], digest.hexdigest(), starts


def extract(args):
    if not args.bootstrap and not args.source.exists():
        raise RuntimeError('Download the complete source with scripts/download_catalog.py first')
    dtype, offset, total = header(args.source)
    accounting = np.zeros(6, dtype=np.int64)
    source_hash, range_starts = None, None
    if args.bootstrap:
        batches, source_hash, range_starts = bootstrap_ranges(dtype,offset,total,args.blocks,args.rows_per_block,Path('.cache/ranges'))
        source_read = args.blocks * args.rows_per_block
    else:
        checkpoint=args.source.with_suffix('.download.json')
        if checkpoint.exists() and not json.loads(checkpoint.read_text()).get('complete'):
            raise RuntimeError('Resumable download is still incomplete; missing blocks must not be treated as catalog data')
        if args.source.stat().st_size != SOURCE_BYTES:
            raise RuntimeError(f'Full source incomplete: {args.source.stat().st_size:,}/{SOURCE_BYTES:,} bytes')
        raw = np.memmap(args.source, dtype=dtype, mode='r', offset=offset, shape=(total,))
        batches = (raw[i:i+262144] for i in range(0,total,262144))
        source_read = total
        print('Hashing full source…',flush=True)
        with args.source.open('rb') as file:
            source_hash = hashlib.file_digest(file,'sha256').hexdigest()
    parts=[]
    for i, rows in enumerate(batches):
        keep, excluded = accepted_mask(rows)
        accounting += excluded
        selected=rows[keep]
        part=np.zeros(len(selected),dtype=META)
        for dest,src in [('targetid','TARGETID'),('ra','TARGET_RA'),('dec','TARGET_DEC'),('z','Z'),('zerr','ZERR'),('delta','DELTACHI2')]:
            part[dest]=selected[src]
        parts.append(part)
        if i % 16 == 0: print(f'Read batch {i+1}: {sum(len(p) for p in parts):,} accepted',flush=True)
    records=np.concatenate(parts)
    del parts
    assert len(records)>0, 'No accepted galaxies'
    assert len(np.unique(records['targetid']))==len(records), 'Duplicate primary TARGETID'
    assert sum(accounting)+len(records)==source_read, 'Selection accounting mismatch'
    accepted_count=len(records)
    if args.sample and len(records)>args.sample:
        indices=np.argpartition(hash_ids(records['targetid']),args.sample)[:args.sample]
        records=records[np.sort(indices)]
    print(f'Computing distances for {len(records):,} galaxies…',flush=True)
    records['distance'], error=distance_lookup(records['z'])
    provenance={'url':SOURCE,'sha256':source_hash,'hashScope':'sampled row ranges with offsets' if args.bootstrap else 'complete source file',
                'sourceBytes':SOURCE_BYTES,'sourceRows':total,'examinedRows':source_read,
                'acceptedRows':accepted_count,'excludedByStage':dict(zip(FILTERS,map(int,accounting))),
                'sampleRangeStarts':range_starts,'maxDistanceInterpolationErrorMpc':error}
    return records,provenance


def write_dataset(records, provenance, output, subset):
    output.mkdir(parents=True,exist_ok=True)
    positions=project(records['ra'],records['dec'],records['distance'])
    priorities=hash_ids(records['targetid'])
    nodes=[]
    max_render_error=0.0
    total_bytes=0
    def save_payload(name, payload):
        nonlocal total_bytes
        compressed=gzip.compress(payload,compresslevel=6,mtime=0)
        path=output/name
        path.write_bytes(compressed)
        total_bytes+=len(compressed)
        return {'url':name,'bytes':len(compressed),'decodedBytes':len(payload),'sha256':hashlib.sha256(compressed).hexdigest()}
    def build(indices, depth=0):
        nonlocal max_render_error
        node_id=str(len(nodes))
        xyz=positions[indices]
        minimum,maximum=xyz.min(axis=0),xyz.max(axis=0)
        center=(minimum+maximum)/2
        node={'id':node_id,'count':len(indices),'center':center.tolist(),'min':minimum.tolist(),'max':maximum.tolist(),'children':[]}
        nodes.append(node)
        leaf=len(indices)<=65536 or depth>=16 or np.max(maximum-minimum)<1e-6
        size=len(indices) if leaf else min(65536 if depth==0 else 8192,len(indices))
        if size<len(indices):
            sample=indices[np.argpartition(priorities[indices],size)[:size]]
        else: sample=indices
        sample=sample[np.argsort(priorities[sample],kind='stable')]
        relative=(positions[sample]-center).astype('<f4')
        error=float(np.max(np.abs((relative.astype(np.float64)+center)-positions[sample])))
        max_render_error=max(max_render_error,error)
        point_payload=struct.pack('<4I',0x43415431,1,size,0)+relative.tobytes()+sample.astype('<u4').tobytes()
        meta_payload=struct.pack('<4I',0x43414d31,1,size,0)+records[sample].tobytes()
        node['storedCount']=size
        node['points']=save_payload(f'{node_id}.points.bin',point_payload)
        node['metadata']=save_payload(f'{node_id}.meta.bin',meta_payload)
        if not leaf:
            octants=((xyz[:,0]>=center[0]).astype(np.uint8) + 2*(xyz[:,1]>=center[1]).astype(np.uint8) + 4*(xyz[:,2]>=center[2]).astype(np.uint8))
            for octant in range(8):
                child=indices[octants==octant]
                if len(child): node['children'].append(build(child,depth+1))
        return node_id
    build(np.arange(len(records),dtype=np.uint32))
    manifest={'version':1,'id':output.name,'title':'DESI Data Release 1','count':len(records),
              'subset':subset,'source':provenance,'filters':FILTERS,'units':'Mpc',
              'coordinateSystem':'Equatorial Cartesian: +x RA 0°, +y RA 90°, +z north celestial pole',
              'cosmology':{'name':'Planck18','H0':67.66,'Om0':0.30966,'Tcmb0':2.7255,'Neff':3.046,'m_nu_eV':[0,0,0.06],'Ob0':0.04897},
              'distanceConvention':'Redshift-derived comoving distance; source frame; no peculiar-velocity correction',
              'createdAt':datetime.now(timezone.utc).isoformat(),'root':'0','nodes':nodes,
              'maxDistanceMpc':float(np.max(records['distance'])),'maxRedshift':float(np.max(records['z'])),
              'maxRenderCoordinateErrorMpc':max_render_error,'totalCompressedBytes':total_bytes,
              'acknowledgments':'/acknowledgments.txt'}
    # The manifest is the commit point: never expose it before every referenced chunk exists.
    temporary=output/'manifest.json.tmp'
    temporary.write_text(json.dumps(manifest,separators=(',',':')))
    temporary.replace(output/'manifest.json')
    print(json.dumps({'dataset':str(output),'galaxies':len(records),'nodes':len(nodes),'compressedMiB':round(total_bytes/1048576,1),'maxRenderErrorMpc':max_render_error}),flush=True)
    return manifest


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=Path('.cache/zall-pix-iron.fits'))
    parser.add_argument('--out',type=Path,default=Path('public/data/dr1'))
    parser.add_argument('--bootstrap',action='store_true')
    parser.add_argument('--blocks',type=int,default=24)
    parser.add_argument('--rows-per-block',type=int,default=4096)
    parser.add_argument('--sample',type=int,default=0)
    parser.add_argument('--emit-development',action='store_true',help='Also write a deterministic one-million-object development dataset')
    parser.add_argument('--activate',action='store_true',help='Atomically make the output dataset the default browser catalog')
    args=parser.parse_args()
    records,provenance=extract(args)
    if args.emit_development:
        size=min(1_000_000,len(records))
        indices=np.argpartition(hash_ids(records['targetid']),size)[:size] if size<len(records) else np.arange(size)
        write_dataset(records[np.sort(indices)],provenance,Path('public/data/development'),'Deterministic one-million-galaxy development subset')
    subset='Distributed development sample of source row ranges' if args.bootstrap else ('Deterministic one-million-galaxy development subset' if args.sample else None)
    write_dataset(records,provenance,args.out,subset)
    if args.activate:
        index=Path('public/data/catalog.json')
        temp=index.with_suffix('.tmp');temp.write_text(json.dumps({'manifest':f'/data/{args.out.name}/manifest.json'}));temp.replace(index)


if __name__=='__main__': main()
