# Public release direction

Dave's intended release is a public web URL and all application source on GitHub. The local repository is active; `AGENTS.md` records the requested early, frequent commit workflow.

## Source repository

Publish the TypeScript application, tests, Python data tools, dependency lockfiles, compact profile/name sidecars, dataset manifests, documentation and attribution. Raw FITS downloads, generated binary catalogs, caches, dependencies and build output remain ignored. Contributors can prepare a small real-data point preview or reproduce the full catalog and models with the README commands.

The data have their own licenses: DESI CC BY 4.0 and OpenNGC-derived indexes CC BY-SA 4.0. Preserve source credits and processing notes. Public source visibility and application-code licensing are separate choices; an application-code license has not yet been selected.

## Hosting layout

The small static application should be hosted separately from the large immutable catalog assets. The full local archive already exceeded the Sites connector's 512 MiB upload limit before adding approximately 143 MB of model profiles. Do not reduce catalog coverage to fit that limit.

Serve the `/data` hierarchy through public object storage/CDN with HTTPS, CORS for the app origin, and the manifest-pinned bytes unchanged. The point/model binaries contain gzip payloads that the worker explicitly decompresses; serve them as binary objects without an additional `Content-Encoding: gzip` layer. Retain relative hierarchy paths for manifests, points, metadata, model profiles and named search. Use release-versioned asset paths so a deployed app does not mix data generations.

The browser resolves model profiles, the original previews, and name search relative to the selected catalog origin, so they can move together to a CDN. Before release, add a public packaging configuration that excludes CDN-hosted binaries from the application archive and validates the remote catalog instead of requiring every local binary. Point that build's `data/catalog.json` at the hosted dataset manifest. Keep the existing local configuration for development, and validate hosted checksums, name search and all model families before sharing the public URL. No server-side astronomy API or account is needed to browse.

## Remaining release decisions

Choose the GitHub owner/repository and application-code license, then provision a public catalog asset destination. With those destinations established, publish the validated application, set the public URL, and verify it against the hosted full dataset. No GitHub repository or public deployment has been created by the current model-development work.
