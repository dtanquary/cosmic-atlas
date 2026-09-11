"""Download the official FITS catalog with resumable, verified HTTP byte ranges."""
from concurrent.futures import ThreadPoolExecutor, as_completed
import argparse
import json
import math
import os
from pathlib import Path
import threading
import time
from urllib.request import Request,urlopen

URL='https://data.desi.lbl.gov/public/dr1/spectro/redux/iron/zcatalog/v1/zall-pix-iron.fits'

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--workers',type=int,default=16)
    p.add_argument('--output',type=Path,default=Path('.cache/zall-pix-iron.fits'))
    args=p.parse_args()
    with urlopen(Request(URL,method='HEAD'),timeout=30) as response:
        size=int(response.headers['Content-Length']); etag=response.headers['ETag']
    args.output.parent.mkdir(parents=True,exist_ok=True)
    checkpoint=args.output.with_suffix('.download.json')
    block=8*1024*1024
    if checkpoint.exists():
        state=json.loads(checkpoint.read_text())
        if state['etag']!=etag or state['size']!=size: raise RuntimeError('Upstream source changed; preserve this cache and choose a fresh output')
    else:
        # Existing sequential curl data can be reused only in complete blocks.
        existing=args.output.stat().st_size if args.output.exists() else 0
        state={'url':URL,'etag':etag,'size':size,'block':block,'done':list(range(existing//block)),'complete':False}
    block=state['block']; done=set(state['done']); count=math.ceil(size/block)
    fd=os.open(args.output,os.O_RDWR|os.O_CREAT)
    os.ftruncate(fd,size)
    lock=threading.Lock()
    def save():
        state['done']=sorted(done)
        temp=checkpoint.with_suffix('.tmp');temp.write_text(json.dumps(state));temp.replace(checkpoint)
    save(); started=time.monotonic(); initially=len(done)
    def fetch(index):
        start=index*block; end=min(size,start+block)-1
        request=Request(URL,headers={'Range':f'bytes={start}-{end}','If-Range':etag})
        for attempt in range(8):
            try:
                with urlopen(request,timeout=45) as response:
                    if response.status!=206 or response.headers.get('Content-Range')!=f'bytes {start}-{end}/{size}':
                        raise RuntimeError('Range/identity validation failed')
                    payload=response.read(end-start+2)
                if len(payload)!=end-start+1: raise RuntimeError('Incomplete response')
                written=os.pwrite(fd,payload,start)
                if written!=len(payload): raise RuntimeError('Incomplete disk write')
                with lock:
                    done.add(index);save()
                    if len(done)%32==0:
                        rate=(len(done)-initially)*block/(time.monotonic()-started)/1048576
                        print(f'{len(done)}/{count} blocks ({len(done)/count:.1%}) · {rate:.1f} MiB/s',flush=True)
                return
            except Exception as exc:
                if attempt==7: raise RuntimeError(f'Block {index}: {exc}') from exc
                time.sleep(min(2**attempt,20))
    try:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            jobs=[pool.submit(fetch,i) for i in range(count) if i not in done]
            for job in as_completed(jobs): job.result()
        os.fsync(fd);state['complete']=True;save()
        print(f'Complete: {size:,} verified bytes',flush=True)
    finally: os.close(fd)

if __name__=='__main__':main()
