import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {checkPagesLimits, inventory, sha256} from './release-lib.mjs';

const config = JSON.parse(await readFile('.deploy/cloudflare.json', 'utf8'));
if (!/^[a-f0-9]{32}$/.test(config.accountId) || !/^[a-z0-9][a-z0-9-]{0,57}$/.test(config.projectName) ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_/-]*$/.test(config.branch)) throw new Error('Fill in the ignored .deploy/cloudflare.json before deployment');
const env = {...process.env, CLOUDFLARE_ACCOUNT_ID: config.accountId, WRANGLER_SEND_METRICS: 'false'};
let args;
if (process.argv.includes('--create')) {
  args = ['pages', 'project', 'create', config.projectName, '--production-branch', config.branch];
} else {
  const report = JSON.parse(await readFile('.deploy/release.json', 'utf8'));
  const files = await inventory('dist-pages');
  checkPagesLimits(files);
  if (files.length !== report.assets.length) throw new Error('Release output changed; rebuild before deploying');
  for (const asset of report.assets) {
    if (sha256(await readFile(path.join('dist-pages', asset.path))) !== asset.sha256) throw new Error('Release output changed; rebuild before deploying');
  }
  args = ['pages', 'deploy', 'dist-pages', '--project-name', config.projectName, '--branch', config.branch];
}
// No shell interpolation; account config is used only by the deployment process.
const result = spawnSync('wrangler', args, {env, stdio: 'inherit'});
if (result.error) throw new Error('Wrangler is unavailable. Install Wrangler 4 and log in first.');
process.exitCode = result.status ?? 1;
