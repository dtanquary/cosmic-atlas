import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'vite';
import {checkPagesLimits, inventory, planRelease, releasePath, sha256} from './release-lib.mjs';

const publicRoot = path.resolve('public'), output = path.resolve('dist-pages');
const plan = await planRelease(publicRoot);
console.log(`Verified full catalog: ${plan.count.toLocaleString()} observations. Data release ${plan.releaseId}.`);
// Do not copy public/ wholesale or read a hosting config into a client bundle.
await build({publicDir: false, build: {outDir: output, emptyOutDir: true, sourcemap: false}});
for (const asset of plan.files) {
  const target = path.join(output, releasePath(asset.path, plan.releaseId));
  await mkdir(path.dirname(target), {recursive: true});
  await copyFile(path.join(publicRoot, asset.path), target);
  if (sha256(await readFile(target)) !== asset.sha256) throw new Error(`Asset changed while packaging: ${asset.path}`);
}
await copyFile('LICENSE', path.join(output, 'LICENSE.txt'));
await writeFile(path.join(output, 'data/catalog.json'), JSON.stringify({manifest: `/data/releases/${plan.releaseId}/dr1/manifest.json`}) + '\n');
await writeFile(path.join(output, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
/
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/data/catalog.json
  Cache-Control: no-cache
/data/releases/*
  Cache-Control: public, max-age=31536000, immutable, no-transform
/data/releases/:release/dr1/*.bin
  Content-Type: application/octet-stream
/data/releases/:release/models/*.bin
  Content-Type: application/octet-stream
/assets/*
  Cache-Control: public, max-age=31536000, immutable
`);
// A real 404 prevents missing data URLs from falling back to index.html.
await writeFile(path.join(output, '404.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><title>Not found · Cosmic Atlas</title><h1>Not found</h1><p>This file is unavailable. <a href="/">Reload the atlas</a> to use the current data release.</p></html>\n');
const files = await inventory(output);
const summary = checkPagesLimits(files);
const checksums = [];
for (const file of files) checksums.push({...file, sha256: sha256(await readFile(path.join(output, file.path)))});
await mkdir('.deploy', {recursive: true});
await writeFile('.deploy/release.json', JSON.stringify({releaseId: plan.releaseId, count: plan.count, ...summary, assets: checksums}, null, 2) + '\n');
console.log(`Pages package ready in dist-pages/: ${summary.files} files, ${(summary.bytes / 1024 ** 2).toFixed(1)} MiB; largest ${(summary.largestFileBytes / 1024 ** 2).toFixed(2)} MiB. No upload performed.`);
