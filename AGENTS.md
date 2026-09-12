# Cosmic Atlas working instructions

## Git workflow

Dave requested on 2026-09-11: **commit early and often, and commit the work you do.**

- Reuse this repository. Make small, coherent commits as useful milestones are reached; do not leave an entire completed feature uncommitted.
- Include related source, tests, requirements, and validation notes. Describe unfinished checkpoints honestly in the commit message.
- Before committing, review the staged changes and run checks appropriate to that milestone. Finish production and actual-GPU validation before describing a feature as complete.
- Keep generated catalog binaries, raw FITS downloads, local caches, credentials, and dependencies out of Git. Track reproducible preparation scripts, compact sidecars, manifests, and attribution.
- Public-release privacy: keep host account/project IDs, tokens, domains and deployment notes in ignored `.deploy/`, `.env.*`, `.openai/` or local Wrangler files. Commit only sanitized examples. Never put secrets in `VITE_*` variables or browser assets. Git ignores do not remove older commits; audit history before the initial public push.
- Original code, tools and documentation are MIT licensed. Preserve the separate DESI, OpenNGC-derived data, font and dependency licenses/credits.
- Preserve existing user work and the full accepted catalog.

## Product and delivery

- Product name: **Cosmic Atlas**. Dave chose **`cosmic-atlas`** as the intended GitHub repository name. The local checkout folder can have a different name; use the actual remote URL once configured.
- Build a simple, clean 3D galaxy explorer with high scientific fidelity and smooth navigation.
- The intended delivery is a **public URL and all application source shared on GitHub**. Keep the code reproducible, document data sources and licenses, and design catalog delivery independently of the source repository.
- Measured positions, sizes and projected shapes must remain distinguishable from assumed depth, missing-shape fallbacks, and illustrative structure/colors.
- Use bounded streaming and level of detail. Never create one scene object or DOM element for every catalog galaxy.
- The full archive exceeds the old Sites upload limit, but fits Cloudflare Pages' documented Wrangler Direct Upload limits. `npm run build:pages` packages the full catalog with fingerprints and an explicit allowlist. Preserve full coverage; consider separate object storage if it outgrows Pages.

## Checks and documentation

- `npm test` checks TypeScript data, interaction logic, and model geometry.
- `npm run test:models` verifies every profile sidecar, complete catalog coverage, and visual-type parsing.
- `npm run build` checks TypeScript and catalog asset presence/sizes, then builds the static app.
- `npm run build:pages` validates full-data hashes and builds the isolated public package; `npm run release:audit` checks tracked files and reachable history for known private hosting values/configs. Keep deployed URLs and operational reports in ignored `.deploy/`.
- Use the Sites build helper when required by the active Sites skills.
- Keep `docs/requirements.md`, `docs/architecture.md`, `docs/galaxy-detail.md`, and `docs/validation.md` consistent with the implemented experience. Record measured performance separately from targets.

## Agent skills

Use [the local engineering workflow](docs/agents/workflow.md) for issue tracking and domain-document locations. UI diagnosis uses `docs/ux-review.md`; the existing product and validation documents remain authoritative. Keep the requested small, frequent commits throughout review and fixes.

For changes to close-up visibility, camera focus, or search lifecycle, rerun the development `?uxtest` checks on the actual browser GPU. They cover observer obstruction, deliberate focus, display-mode fading, reachable inspector actions, and cancelled/reopened visits. Preserve these checks and record results in the UI review and validation notes.

The Milky Way is a separate reference model, not a fabricated DESI observation. Keep the Solar System at the coordinate origin, preserve sourced frame parameters, and exclude the reference from catalog counts/IDs/pair measurements. Run `?hometest` when changing it, alongside the applicable navigation/model checks.

The home galaxy uses a dedicated continuous starlight/dust volume in `milky-way-light.ts`, with Andromeda imagery as visual reference only. Preserve its adopted Milky Way geometry and disclosed illustrative structure. Keep the fixed density field bounded, integrate only forward rays, filter steep-angle texture detail, and preserve the home appearance GPU checks for dust attenuation, unclipped highlights, inside views, deterministic redraws, one draw call and context recovery. Catalog spiral variants retain their separate renderer.

Milky Way toolbar/search visits target the Galactic core; only Sun / Observer focus targets the origin. Preserve the real-control wheel regression in `?hometest`. Nearby point enlargement is an independent, saved setting, off by default; use the `?selftest` GPU/settings checks when changing its sizing or picking behavior.

Redshift-only positions below 1 Mpc are hidden by default; raw display uses amber points and never physical galaxy models. Preserve the records/counts and the explicit uncertainty disclosure. Keep visual and GPU ID filtering consistent, including positive opacity floors, annotation lifecycle and pending selection changes. The sourced Milky Way and Sun/core markers bypass this catalog guard. Run the full-data `?hometest` local-position and settings/interaction regressions when changing this policy; do not describe the guard as corrected local distances.

The six independently measured nearby galaxies are a separate catalog layer, with stable negative internal IDs, namespaced public identities, null redshifts and separate counts. Preserve their distance/shape citations and explicitly assumed properties in `nearby-sources.json`; regenerate with `prepare_nearby_galaxies.py`. They bypass the redshift-only local guard; original DESI observations are never globally deduplicated or corrected by this layer. Keep the point batch and model allocations bounded (currently at most 12 nearby entries). Run `?nearbytest` on full data and a subset for nearby changes, alongside applicable shared UI/home/model checks.

All spirals is the user-requested default visual appearance, independent of model visibility. Preserve original classifications/profiles and adopted positions, radii and sky ellipses; keep the override disclosed and Catalog types available in Settings. For model residency, transition range or appearance changes, run `?continuitytest` alongside the applicable GPU suites. Automatic models must fade before eviction and remain within the 12-model DESI pool; streamed point-frontier changes alone must not remove visible resident models.

Galaxy color variation is illustrative, not calibrated photometry. Key it to exact public target identities so it survives model recycling, subset row changes and appearance switches. Preserve geometry random sequences and controlled luminance; add no per-record color work to the full point catalog. Run `?colortest` plus applicable shared rendering checks for palette changes.

The related disk variants must stay within the common spiral's scale and light budget. Keep a shared exponential profile/exposure, radial sample distribution, depth, point sizes and count; change angular structure without introducing concentrated bright bulges. Use stable exact identities for variant assignment and structure seeds. Run `?varianttest` (optionally `&variantpreview`) for brightness, highlights, picking and allocation comparisons, plus `?continuitytest` and applicable shared/nearby GPU suites.

The CMB shell, lookback rings and survey footprint are observer-centered reference overlays sharing `screen-overlay.ts`: one draw each when enabled, zero when disabled, never in the GPU ID pass, excluded from counts/IDs/measurements. Lookback times come from the Planck18 table generated by `prepare_lookback.py`; the browser only interpolates. The footprint is sky occupancy of the accepted rows, derived by `prepare_survey_footprint.py` and validated against the catalog source hash and accepted count; never describe it as survey completeness or the official tiling, and keep dark directions "not surveyed here", not empty. Run `?lookbacktest` with `?cosmictest` for changes to the shell and rings, and `?footprinttest` on full data and `?dataset=development` for the footprint.

Camera travel runs inside the existing frame loop; any orbit input cancels it. Shared links carry only target, camera and identity and are re-verified against the catalog before anything is selected. Run `?sharetest` with `?uxtest`/`?hometest` for navigation changes.
