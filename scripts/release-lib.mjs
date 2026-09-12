import {createHash} from 'node:crypto';
import {lstat, readFile, readdir} from 'node:fs/promises';
import path from 'node:path';

export const PAGES_LIMITS = {files: 20_000, bytesPerFile: 25 * 1024 * 1024};
export const sha256 = data => createHash('sha256').update(data).digest('hex');

export function assetPath(directory, url) {
  // Only local relative asset references can enter a release.
  if (typeof url !== 'string' || !/^[a-zA-Z0-9_./-]+$/.test(url) ||
      url.startsWith('/') || url.split('/').some(part => part === '..' || part === '.')) {
    throw new Error('Unsafe catalog asset path');
  }
  return path.posix.join(directory, url);
}

async function regularFile(root, name) {
  let current = root;
  for (const component of name.split('/')) {
    current = path.join(current, component);
    if ((await lstat(current)).isSymbolicLink()) throw new Error(`Symlink is not a release asset: ${name}`);
  }
  if (!(await lstat(current)).isFile()) throw new Error(`Not a release file: ${name}`);
  return readFile(current);
}

export async function planRelease(publicRoot) {
  const files = new Map();
  async function add(name, expected) {
    const data = await regularFile(publicRoot, name);
    const hash = sha256(data);
    if (expected && (data.length !== expected.bytes || hash !== expected.sha256)) {
      throw new Error(`Incomplete or corrupt release asset: ${name}`);
    }
    files.set(name, {path: name, bytes: data.length, sha256: hash});
    return data;
  }
  const manifest = JSON.parse(await add('data/dr1/manifest.json'));
  if (manifest.version !== 1 || manifest.id !== 'dr1' || manifest.subset ||
      !(manifest.count > 0) || !manifest.nodes?.length) throw new Error('Release requires the full DR1 catalog');
  const models = JSON.parse(await add('data/models/manifest.json'));
  const search = JSON.parse(await add('data/galaxy-search.json'));
  if (models.version !== 1 || models.catalogId !== 'dr1' || models.count !== manifest.count ||
      models.catalogSourceSha256 !== manifest.source.sha256 || search.catalogId !== 'dr1' ||
      search.catalogSourceSha256 !== manifest.source.sha256) throw new Error('Release sidecars do not match the catalog');
  for (const node of manifest.nodes) {
    for (const kind of ['points', 'metadata']) await add(assetPath('data/dr1', node[kind].url), node[kind]);
    const profile = models.nodes[node.id];
    if (!profile) throw new Error(`Missing model profile for node ${node.id}`);
    await add(assetPath('data/models', profile.url), profile);
  }
  for (const name of ['galaxy-detail.json', 'galaxy-spiral.json']) {
    const detail = JSON.parse(await add(`data/${name}`));
    if (detail.catalogSourceSha256 !== manifest.source.sha256) throw new Error(`Mismatched ${name}`);
  }
  // An explicit allowlist prevents unrelated public files from being published.
  for (const name of ['favicon.svg', 'acknowledgments.txt', 'third-party-notices.txt', 'licenses/CC-BY-SA-4.0.txt']) await add(name);
  const assets = [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
  const releaseId = sha256(JSON.stringify(assets.filter(file => file.path.startsWith('data/')))).slice(0, 20);
  return {count: manifest.count, releaseId, files: assets};
}

export function releasePath(name, releaseId) {
  return name.startsWith('data/') ? `data/releases/${releaseId}/${name.slice(5)}` : name;
}

export async function inventory(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(path.join(root, prefix), {withFileTypes: true})) {
    const name = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink in output: ${name}`);
    if (entry.isDirectory()) files.push(...await inventory(root, name));
    else if (entry.isFile()) files.push({path: name, bytes: (await lstat(path.join(root, name))).size});
  }
  return files;
}

export function checkPagesLimits(files) {
  if (files.length > PAGES_LIMITS.files) throw new Error('Release exceeds the Pages file-count limit; consider object storage');
  for (const file of files) if (file.bytes > PAGES_LIMITS.bytesPerFile) throw new Error(`Release exceeds the Pages per-file limit: ${file.path}`);
  return {files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), largestFileBytes: Math.max(...files.map(file => file.bytes))};
}
