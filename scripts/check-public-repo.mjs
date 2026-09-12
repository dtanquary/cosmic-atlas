import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

function git(args, input) {
  const result = spawnSync('git', args, {input, maxBuffer: 128 * 1024 * 1024});
  if (result.status !== 0) throw new Error(`Git audit command failed: ${args[0]}`);
  return result.stdout;
}
const privatePath = /(^|\/)(?:\.deploy|\.openai|\.wrangler)(?:\/|$)|(^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|wrangler\.(?:jsonc?|toml))$|\.(?:pem|key|p12|pfx|bundle)$/;
const example = /(?:\.example|\.example\.json)$/;
const findings = [];
const knownPrivateValues = [];
try {
  const config = JSON.parse(await readFile('.deploy/cloudflare.json', 'utf8'));
  if (/^[a-f0-9]{32}$/.test(config.accountId)) knownPrivateValues.push(config.accountId);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const sensitive = /appgprj_[a-zA-Z0-9]{16,}|(?:ghp_|github_pat_)[a-zA-Z0-9_]{30,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|["']?(?:account_id|accountId)["']?\s*[:=]\s*["'][a-f0-9]{32}["']/;
function inspect(label, content) {
  const text = content.toString('utf8');
  if (sensitive.test(text) || knownPrivateValues.some(value => text.includes(value))) findings.push(`${label}: possible private hosting value or credential`);
}
const tracked = git(['ls-files', '-z']).toString().split('\0').filter(Boolean);
for (const name of tracked) {
  if (privatePath.test(name) && !example.test(name)) findings.push(`Tracked private file: ${name}`);
  inspect(`Working tree ${name}`, await readFile(name));
}
const objects = git(['rev-list', '--objects', '--all']).toString().trim().split('\n').map(line => {
  const space = line.indexOf(' ');
  return {id: space < 0 ? line : line.slice(0, space), name: space < 0 ? '' : line.slice(space + 1)};
});
// Batch reads avoid spawning one process per historical file. Never print values.
const data = git(['cat-file', '--batch'], objects.map(object => object.id).join('\n') + '\n');
let offset = 0;
for (const object of objects) {
  const end = data.indexOf(10, offset), header = data.subarray(offset, end).toString().split(' ');
  const size = Number(header[2]), type = header[1];
  if (!Number.isFinite(size)) throw new Error('Could not inspect Git history');
  const content = data.subarray(end + 1, end + 1 + size);
  if (type === 'blob') {
    if (privatePath.test(object.name) && !example.test(object.name)) findings.push(`Historical private file: ${object.name}`);
    inspect(`History ${object.id.slice(0, 8)} ${object.name}`, content);
  } else if (type === 'commit') inspect(`Commit ${object.id.slice(0, 8)}`, content);
  offset = end + 1 + size + 1;
}
if (findings.length) {
  console.error([...new Set(findings)].join('\n'));
  process.exitCode = 1;
} else console.log(`Public-source audit passed: ${tracked.length} tracked files and ${objects.length} historical objects; no known hosting IDs, private config paths or recognized credential patterns. This is a targeted check, not a guarantee against every possible secret.`);
