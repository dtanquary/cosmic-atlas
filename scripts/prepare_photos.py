#!/usr/bin/env python3
"""Package publisher-provided small JPEGs verbatim. No generated/recolored imagery.
Run from the checkout: python3 scripts/prepare_photos.py
Original downloads and WCS witnesses remain ignored; the source manifest pins bytes.
"""
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
MAX_ENCODED = 1024 * 1024
MAX_DECODED = 8 * 1024 * 1024


def jpeg_size(data):
    if data[:2] != b'\xff\xd8':
        raise ValueError('Expected JPEG')
    pos = 2
    while pos < len(data):
        if data[pos] != 255:
            raise ValueError('Invalid JPEG marker')
        while pos < len(data) and data[pos] == 255:
            pos += 1
        marker = data[pos]
        pos += 1
        if marker in [0xD8, 0xD9] or 0xD0 <= marker <= 0xD7:
            continue
        length = int.from_bytes(data[pos:pos + 2], 'big')
        if length < 2 or pos + length > len(data):
            raise ValueError('Invalid JPEG segment')
        if marker in [0xC0, 0xC1, 0xC2]:
            return (int.from_bytes(data[pos + 5:pos + 7], 'big'), int.from_bytes(data[pos + 3:pos + 5], 'big'))
        pos += length
    raise ValueError('JPEG dimensions missing')


def prepare():
    source = json.loads((ROOT / 'scripts/photo-sources.json').read_text())
    cache = ROOT / '.cache/photos'
    out = ROOT / 'public/photos'
    cache.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    entries = []
    for item in source['photos']:
        path = cache / f"{item['key']}.jpg"
        if not path.exists():
            with urllib.request.urlopen(item['download'], timeout=45) as response:
                data = response.read(MAX_ENCODED + 1)
            if len(data) > MAX_ENCODED:
                raise ValueError('Photo exceeds the encoded budget')
            path.write_bytes(data)
        data = path.read_bytes()
        sha = hashlib.sha256(data).hexdigest()
        if sha != item['sourceSha256']:
            raise ValueError(f"Source bytes changed for {item['key']}; review the publisher asset before updating its pin")
        width, height = jpeg_size(data)
        if len(data) > MAX_ENCODED or width * height * 4 > MAX_DECODED or min(width, height) < 1:
            raise ValueError('Photo exceeds the memory budget')
        name = f"{item['key']}.{sha[:12]}.jpg"
        (out / name).write_bytes(data)
        entries.append({**item, 'asset': '/photos/' + name, 'bytes': len(data), 'sha256': sha, 'width': width, 'height': height})
    manifest = {'version': 1, 'verified': source['verified'], 'maxEncodedBytes': MAX_ENCODED, 'maxDecodedBytes': MAX_DECODED, 'photos': entries}
    (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    (ROOT / 'src/data/photos.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    credit = ['Photographs in Cosmic Atlas', '', 'Original code is MIT licensed; these photographs are separately licensed CC BY 4.0.', 'Publisher-provided screen JPEGs are distributed unchanged. No organization endorses this app.', '']
    for item in entries:
        credit.extend([item['title'], item['credit'], 'Source: ' + item['source'], 'License: ' + item['license'], 'Usage terms: ' + item['rights'], 'Asset: ' + item['asset'], ''])
    (out / 'credits.txt').write_text('\n'.join(credit))
    print(f"Prepared {len(entries)} verbatim photographs: {sum(e['bytes'] for e in entries):,} bytes; largest decoded image {max(e['width'] * e['height'] * 4 for e in entries):,} bytes")


if __name__ == '__main__':
    prepare()
