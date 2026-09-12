import {describe, expect, it} from 'vitest';
// Node-only packaging helpers; kept out of the browser TypeScript build.
// @ts-expect-error The release helper is native JavaScript.
import {assetPath, checkPagesLimits, releasePath, PAGES_LIMITS} from '../scripts/release-lib.mjs';

describe('public release boundaries', () => {
  it('rejects paths that could publish files outside the catalog', () => {
    for (const url of ['../.env', '/.deploy/cloudflare.json', 'https://example.com/data', '..\\secret', 'a/../../secret']) {
      expect(() => assetPath('data/dr1', url)).toThrow('Unsafe');
    }
    expect(assetPath('data/dr1', '0.meta.bin')).toBe('data/dr1/0.meta.bin');
  });
  it('versions data as one hierarchy and leaves public attribution accessible', () => {
    expect(releasePath('data/models/0.bin.gz', 'abc')).toBe('data/releases/abc/models/0.bin.gz');
    expect(releasePath('acknowledgments.txt', 'abc')).toBe('acknowledgments.txt');
    const manifest = new URL('https://example.com/data/releases/abc/dr1/manifest.json');
    expect(new URL('../galaxy-search.json', manifest).pathname).toBe('/data/releases/abc/galaxy-search.json');
  });
  it('fails at hosting boundaries rather than silently dropping data', () => {
    expect(() => checkPagesLimits([{path: 'large.bin', bytes: PAGES_LIMITS.bytesPerFile + 1}])).toThrow('per-file');
    expect(() => checkPagesLimits(Array(PAGES_LIMITS.files + 1).fill({path: 'data.bin', bytes: 1}))).toThrow('file-count');
    expect(checkPagesLimits([{path: 'data.bin', bytes: 10}])).toEqual({files: 1, bytes: 10, largestFileBytes: 10});
  });
});
