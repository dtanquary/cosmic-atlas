import {readFile, writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {sha256} from './release-lib.mjs';

// The deployed URL remains in ignored local configuration, not source or logs.
const {url} = JSON.parse(await readFile('.deploy/site.json', 'utf8'));
const site = new URL(url);
if (site.protocol !== 'https:' || site.username || site.password || site.search || site.hash) throw new Error('Expected a public HTTPS site URL');
const report = JSON.parse(await readFile('.deploy/release.json', 'utf8'));
async function fetchAsset(name) {
  const response = await fetch(new URL(name, site), {signal: AbortSignal.timeout(60_000)});
  if (!response.ok) throw new Error(`Hosted request failed: ${name} (${response.status})`);
  return {response, bytes: Buffer.from(await response.arrayBuffer())};
}
async function exact(name) {
  const expected = report.assets.find(asset => asset.path === name);
  if (!expected) throw new Error(`File absent from local release: ${name}`);
  const result = await fetchAsset(name);
  if (result.bytes.length !== expected.bytes || sha256(result.bytes) !== expected.sha256) throw new Error(`Hosted bytes differ: ${name}`);
  return result;
}
const pointer = await exact('data/catalog.json');
if (!pointer.response.headers.get('content-type')?.includes('application/json')) throw new Error('Catalog pointer has wrong content type');
const manifestPath = JSON.parse(pointer.bytes).manifest.slice(1);
if (manifestPath !== `data/releases/${report.releaseId}/dr1/manifest.json`) throw new Error('Unexpected hosted release');
const prefix = `data/releases/${report.releaseId}`;
const manifest = JSON.parse((await exact(manifestPath)).bytes);
const models = JSON.parse((await exact(`${prefix}/models/manifest.json`)).bytes);
if (manifest.count !== report.count || models.count !== report.count) throw new Error('Hosted catalog coverage differs');
for (const name of ['galaxy-search.json', 'galaxy-detail.json', 'galaxy-spiral.json']) await exact(`${prefix}/${name}`);
// All app/credit assets plus root/middle/last catalog chunks, not a full CDN re-download.
for (const asset of report.assets) if (!asset.path.startsWith('data/') && !['_headers', '404.html'].includes(asset.path)) await exact(asset.path);
let chunks = 0;
for (const index of new Set([0, Math.floor(manifest.nodes.length / 2), manifest.nodes.length - 1])) {
  const node = manifest.nodes[index];
  for (const [directory, asset, magic] of [
    ['dr1', node.points, 0x43415431], ['dr1', node.metadata, 0x43414d31], ['models', models.nodes[node.id], 0x43415331],
  ]) {
    const {response, bytes} = await exact(`${prefix}/${directory}/${asset.url}`);
    if (!response.headers.get('content-type')?.includes('application/octet-stream')) throw new Error('Wrong binary MIME type');
    const decoded = gunzipSync(bytes);
    if (decoded.length !== asset.decodedBytes || decoded.readUInt32LE(0) !== magic || decoded.readUInt32LE(4) !== 1 || decoded.readUInt32LE(8) !== node.storedCount) throw new Error('Invalid hosted binary payload');
    chunks++;
  }
}
for (const name of ['.deploy/cloudflare.json', '.env', '.openai/hosting.json', 'data/missing-file.bin']) {
  const response = await fetch(new URL(name, site), {signal: AbortSignal.timeout(30_000)});
  if (response.status !== 404) throw new Error(`Expected a real 404 for ${name}`);
}
await writeFile('.deploy/hosted-verification.json', JSON.stringify({url, checkedAt: new Date().toISOString(), count: manifest.count, releaseId: report.releaseId, sampledChunks: chunks, status: 'passed'}, null, 2) + '\n');
console.log(`Hosted checks passed: ${manifest.count.toLocaleString()} observations, ${chunks} sampled point/metadata/model chunks, all app/license assets, search sidecars, private-path 404s. Receipt saved locally.`);
