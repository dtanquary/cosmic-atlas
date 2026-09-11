"""Download the small, filtered SGA catalogs and OpenNGC name aliases.

The generated search index records a SHA-256 for each input. These downloads
may change upstream; preserve the original cache to reproduce a specific index.
"""
import http.cookiejar
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / '.cache'


def main():
    CACHE.mkdir(exist_ok=True)
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    for prefix in ['NGC', 'IC', 'UGC']:
        path = CACHE / f'SGA-{prefix}.fits'
        if path.exists():
            print(f'Keeping {path.name}', flush=True)
            continue
        url = f'https://sga.legacysurvey.org/?galaxy__match={prefix}'
        with opener.open(url, timeout=30) as response:
            html = response.read().decode()
        token = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', html)
        if not token:
            raise RuntimeError('SGA download form changed; inspect its Download action.')
        request = urllib.request.Request(url, data=urllib.parse.urlencode({
            'csrfmiddlewaretoken': token[1], 'dbutn': '',
        }).encode(), headers={'Referer': url})
        with opener.open(request, timeout=90) as response:
            data = response.read()
        if not data.startswith(b'SIMPLE  =') or len(data) % 2880:
            raise RuntimeError(f'{prefix} response is not a complete FITS file')
        path.write_bytes(data)
        print(f'{path.name}: {len(data):,} bytes', flush=True)

    path = CACHE / 'OpenNGC.csv'
    if not path.exists():
        url = 'https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/NGC.csv'
        with opener.open(url, timeout=30) as response:
            data = response.read()
        if not data.startswith(b'Name;Type;'):
            raise RuntimeError('Unexpected OpenNGC response')
        path.write_bytes(data)
    print(f'{path.name}: {path.stat().st_size:,} bytes')


if __name__ == '__main__':
    main()
