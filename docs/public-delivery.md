# Public release

Cosmic Atlas publishes its source independently of its deployment. The public repository contains no personal hosting configuration. All commands below run from the repository root.

## GitHub description

> A clean, interactive 3D atlas of over 14 million galaxy observations. Explore the cosmic web, visit nearby galaxies, and fly through space with procedural galaxy models.

## Licensing and source credit

Original application code, tools and documentation use the root [MIT license](../LICENSE). MIT permits reuse and modification with the copyright and permission notices retained. It does **not** relicense imported astronomy data or third-party software/assets.

| Material | Terms and provenance |
| --- | --- |
| DESI observations and derived positions | CC BY 4.0; retain release-paper citation, official acknowledgment and processing disclosures |
| OpenNGC-derived search indexes, model sidecars and combined nearby reference | CC BY-SA 4.0; retain OpenNGC attribution, license and adaptation details |
| Nearby numerical measurements and Milky Way reference | Preserve literature citations and explicit assumptions in the JSON sources and model documentation |
| Three.js | MIT, with its own copyright notice |
| DM Sans and IBM Plex Mono | SIL Open Font License 1.1 |

[Data attribution](../public/acknowledgments.txt), [third-party notices](../public/third-party-notices.txt) and the [CC BY-SA legal text](../public/licenses/CC-BY-SA-4.0.txt) are retained verbatim in release packaging. The application exposes data attribution in **About the data**. [DESI's source policy](https://data.desi.lbl.gov/doc/acknowledgments/) and [the MIT license](https://opensource.org/license/mit) explain the respective terms.

## Recommended host: Cloudflare Pages Direct Upload

The full release fits Pages: **3,052 files, about 1.05 GiB total, largest file 3.24 MiB** in the initial release build. The older Sites connector's 512 MiB archive limit does not apply to Pages.

As checked on 2026-09-11, Pages supports **20,000 files / 25 MiB per file** through Wrangler on Free, and [static asset requests are free and unlimited](https://developers.cloudflare.com/pages/functions/pricing/). No Functions, Worker, database, R2 bucket or paid plan is required for this layout. A custom domain is optional and has its own registration cost. Future pricing or service terms may change. [Pages limits](https://developers.cloudflare.com/pages/platform/limits/).

Use **Wrangler Direct Upload**, not dashboard drag-and-drop (limited to 1,000 files). Build locally where complete data is available. A GitHub-connected build would otherwise need to download/regenerate the large catalog. A Direct Upload project cannot later switch to Git integration; create a new project if that workflow is needed. [Direct Upload documentation](https://developers.cloudflare.com/pages/get-started/direct-upload/).

## Prepare and preview

Follow the README's full-data setup first. A sample-only checkout cannot produce the public release.

```sh
npm ci
npm test
npm run test:models
npm run build:pages
npm run preview:pages
```

`build:pages` checks every full-data binary's byte count and SHA-256, matches models/search to the DESI source, compiles TypeScript and bundles the app. It packages an explicit allowlist of the full catalog and required credits/assets into ignored **`dist-pages/`**. Development/bootstrap datasets, local configs, raw downloads, source maps and arbitrary extra files in `public/` are excluded. It always uses full DR1 regardless of the active local preview. It leaves `public/data/catalog.json`, source data and ordinary `npm run build` behavior intact.

The data fingerprint versions the entire hierarchy under `/data/releases/<fingerprint>/`. Search, points, metadata and model profiles resolve together. `/data/catalog.json` is generated only in output; it and HTML revalidate, while fingerprinted data/assets can cache for a year. Binary payloads are already gzip-compressed and must reach the browser as those exact bytes. `_headers` serves them as `application/octet-stream` with `no-transform`; do not configure HTTP gzip metadata that unwraps the stored payload. [Pages headers](https://developers.cloudflare.com/pages/configuration/headers/).

The build records output hashes in ignored `.deploy/release.json`. `deploy:pages` rechecks them and Pages limits before uploading; changed output requires another build. A real `404.html` avoids returning the app shell for missing data. Production uses the packaged catalog; dataset-switch queries remain development-only.

A new data release replaces the previous release directory on the production alias. Reload an older open tab if it encounters missing old chunks after a data deployment. Pages deployment-specific URLs retain their own snapshot; keep previous deployments for rollback. Code-only deployments with unchanged data reuse the same fingerprint.

## Keep deployment settings local

Install **Wrangler 4** (`npm install --global wrangler@4`) and run `wrangler login` once. The initial release used Wrangler 4.84.1. OAuth credentials are stored by Wrangler outside public source. Do not copy them into repository files or issues.

```sh
mkdir -p .deploy
cp deployment/cloudflare.example.json .deploy/cloudflare.json
```

Edit **`.deploy/cloudflare.json`** with your account ID, Pages project name and production branch. The committed example contains placeholders only. The deploy script passes the account ID to Wrangler in its process environment, never to Vite or the browser.

```sh
# Once, for a new Pages project:
npm run pages:create

# After each validated build; this command publishes the site:
npm run deploy:pages
```

Wrangler prints the public URL. Store deployment URLs, domain/DNS notes, receipts and operational details in `.deploy/`, not tracked documentation. Add a custom domain later in the dashboard without changing app source. No GitHub deployment connection or GitHub-hosted secret is needed for this local-upload workflow.

`.gitignore` excludes `.deploy/`, `.openai/`, `.wrangler/`, local Wrangler configs, environment/variable files, keys, dependencies and build output. Keep sanitized examples under `deployment/`. Never force-add ignored private files. Never put secrets in `VITE_*` variables: Vite can embed them in public JavaScript. Anything served to a browser, including deployment/data URLs, is public regardless of Git ignores.

## Before pushing source

```sh
git status --short
git diff --cached
npm run release:audit
```

The audit checks tracked files and reachable history for private deployment paths, recognized credentials/hosting IDs and the locally configured account ID when available. It prints locations, not secret values. This targeted check cannot recognize every secret; also review the staged diff. `.gitignore` alone does not remove an already tracked file or its history.

An obsolete hosting manifest from initial development was removed from the entire history before release, with a private backup retained locally. Development commits were preserved but their hashes changed. Never publish the private backup or push a pre-cleanup branch. Commit authorship remains in public history; configure a GitHub noreply address if desired for future commits.

The public source includes TypeScript, tests, Python tools, lockfiles, compact reference/name sidecars, manifests, documentation and credits. The 22 GB source FITS file and generated binary catalog stay out of Git; contributors can reproduce them using the README. Hosting account IDs, project config and tokens are not needed to clone, test or modify the source.

## Verify the deployed site

Save the public HTTPS URL as `{"url":"https://YOUR_PAGES_DOMAIN/"}` in ignored `.deploy/site.json`, then run `npm run verify:pages`. It checks exact hosted app/credit assets, data manifests/search sidecars, nine point/metadata/profile chunks and private-path 404 responses. Results stay in `.deploy/hosted-verification.json`. This samples hosted binaries; build-time validation checks every local binary and Wrangler uploads the complete package.

1. Load the deployed HTTPS URL and confirm the full observation count and six nearby entries.
2. Check Milky Way, Andromeda, and a matched DESI visit such as NGC 3982; confirm points, model profiles and search load.
3. Open **About the data → Data attribution and processing notes**. Verify MIT and third-party license assets too.
4. Compare hosted binary SHA-256 and decompressed headers with their manifests; check JSON MIME types and binary response behavior.
5. Confirm private config paths return 404. Record the live URL and operational results only in `.deploy/`.

If the catalog eventually exceeds Pages limits, move the versioned hierarchy to an R2 custom domain/CDN with HTTPS and appropriate CORS. R2 is optional now; its [current free tier](https://developers.cloudflare.com/r2/pricing/) includes 10 GB-month standard storage and free egress, with usage-based operation charges beyond allowances. Never trim the catalog to fit a hosting limit.
