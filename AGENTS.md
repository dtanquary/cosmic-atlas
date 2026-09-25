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

The home galaxy uses the procedural look from outside and a dedicated continuous starlight/dust volume in `milky-way-light.ts` inside the disc and edge-on, with Andromeda imagery as visual reference only. Preserve its adopted Milky Way geometry and disclosed illustrative structure. Keep the fixed density field bounded, integrate only forward rays, filter steep-angle texture detail, and preserve the home appearance GPU checks for dust attenuation, unclipped highlights, inside views, deterministic redraws, one draw call and context recovery. Catalog spiral variants retain their separate renderer.

Milky Way toolbar/search visits target the Galactic core; only Sun / Observer focus targets the origin. Preserve the real-control wheel regression in `?hometest`. Nearby point enlargement is an independent, saved setting, off by default; use the `?selftest` GPU/settings checks when changing its sizing or picking behavior.

Redshift-only positions below 1 Mpc are hidden by default; raw display uses amber points and never physical galaxy models. Preserve the records/counts and the explicit uncertainty disclosure. Keep visual and GPU ID filtering consistent, including positive opacity floors, annotation lifecycle and pending selection changes. The sourced Milky Way and Sun/core markers bypass this catalog guard. Run the full-data `?hometest` local-position and settings/interaction regressions when changing this policy; do not describe the guard as corrected local distances.

The ten independently measured nearby galaxies are a separate catalog layer, with stable negative internal IDs, namespaced public identities, null redshifts and separate counts. There are six Local Group galaxies, plus M51, NGC 5195, M101 and NGC 1300 (added 2026-09-25). Preserve their distance/shape citations and explicitly assumed properties in `nearby-sources.json`; regenerate with `prepare_nearby_galaxies.py`. NGC 5195 shares M51's red giant branch distance as a disclosed assumption. NGC 1300 uses a Tully–Fisher distance until a Cepheid or red giant branch distance exists. The Local Group tour stop frames only the entries within 1 Mpc. They bypass the redshift-only local guard; original DESI observations are never globally deduplicated or corrected by this layer. Keep the point batch and model allocations bounded (currently at most 12 nearby entries). Run `?nearbytest` on full data and a subset for nearby changes, alongside applicable shared UI/home/model checks.

All spirals is the user-requested default visual appearance, independent of model visibility. Preserve original classifications/profiles and adopted positions, radii and sky ellipses; keep the override disclosed and Catalog types available in Settings. For model residency, transition range or appearance changes, run `?continuitytest` alongside the applicable GPU suites. Automatic models must fade before eviction and remain within the 12-model DESI pool; streamed point-frontier changes alone must not remove visible resident models.

Galaxy color variation is illustrative, not calibrated photometry. Key it to exact public target identities so it survives model recycling, subset row changes and appearance switches. Catalog looks tint their disc and young-star colours by the identity palette at fixed luminance; named looks keep their tuned colours. Add no per-record color work to the full point catalog. Run `?colortest` plus applicable shared rendering checks for palette changes.

Catalog galaxies drawn as spirals use per-type looks (Dave, 2026-09-25), replacing the earlier shared light-budget variants. There are six: grand-design, multi-arm, tightly wound, flocculent, barred and weakly barred. The recorded Hubble type chooses the look (SB → barred, SAB → weakly barred, then the stage), and otherwise the exact identity does. Each look keeps its own bulge, bar and colours, but every look must render unclipped, in one draw with no texture, with face-on light within 0.5–2× of the median look. Use exact identities for seeds, pattern angle, handedness and tint, and keep the inspector's label and its type/identity sentence. Run `?varianttest` (optionally `&variantpreview`), `?colortest`, `?continuitytest`, `?modeltest` and applicable shared/nearby GPU suites.

The CMB shell, lookback rings and survey footprint are observer-centered reference overlays sharing `screen-overlay.ts`: one draw each when enabled, zero when disabled, never in the GPU ID pass, excluded from counts/IDs/measurements. Lookback times come from the Planck18 table generated by `prepare_lookback.py`; the browser only interpolates. The footprint is sky occupancy of the accepted rows, derived by `prepare_survey_footprint.py` and validated against the catalog source hash and accepted count; never describe it as survey completeness or the official tiling, and keep dark directions "not surveyed here", not empty. Run `?lookbacktest` with `?cosmictest` for changes to the shell and rings, and `?footprinttest` on full data and `?dataset=development` for the footprint.

Camera travel runs inside the existing frame loop; any orbit input cancels it. Shared links carry only target, camera and identity and are re-verified against the catalog before anything is selected. Run `?sharetest` with `?uxtest`/`?hometest` for navigation changes.

Tours are camera routes over the existing animated visits with one dwell timer; they never persist settings, skip unavailable catalog stops with a notice, and every stop's numbers are pinned to sourced data by `tests/tours.test.ts`; run `?tourtest` with `?uxtest`/`?hometest` for tour or travel changes.

Named road-trip galaxies now use image-inspired portraits in either appearance mode, following Dave's explicit 2026-09-12 request. Preserve exact-identity selection, original source profiles, adopted radii/ellipses and generic fallbacks; reference images and limits are documented in `docs/image-portraits.md`. Andromeda, Triangulum, NGC 3982, M51, M101 and NGC 1300 use procedural looks (NGC 1300's bar is pinned to its S4G fit), and NGC 5195 a smooth profile; `disk-volume.ts` is the Milky Way's inside-the-disc march, with its field and geometry unchanged. Run `?portraittest` with `?cloudtest`, `?hometest`, `?nearbytest` (full/subset), `?continuitytest`, generic variant/color checks and the actual road trip for changes to these models. The nearby texture/geometry budget remains below 4 MiB; the DESI pool stays capped at 12.

Procedural galaxy looks (Dave, 2026-09-25) port the Atrium screensaver's galaxy research to every disc galaxy, one step at a time with web and native in lockstep; the plan, choices and state are in `docs/galaxy-looks.md`. `galaxy-looks.ts` (GLSL) and `atlas_volume_look` (Metal) evaluate arms, dust, stars and H II regions where each ray crosses the midplane, with an averaged march for grazing and in-plane rays. Keep catalog positions, radii and sky ellipses, keep the smooth disc's half-light radius at the adopted radius (`lookDisc`), key seeds to exact public identities, keep highlights unclipped, and disclose all structure as illustrative. Run `?portraittest` with the applicable shared GPU suites and `swift test` (`GalaxyLooksTests`, `VolumeTests`) for look changes; compare renders against the reference photographs, as Atrium did.

Phone controls reuse the original desktop nodes through `mobile-ui.ts`; keep IDs, handlers, saved settings and desktop restoration intact. For responsive UI changes, run the real-browser `scripts/check-mobile-ui.mjs` journeys as documented in `docs/validation.md`, including Chrome touch gestures, WebKit, portrait/landscape and repeated desktop restoration. Keep panels bounded and header actions reachable, and distinguish simulated phone/keyboard checks from physical-device validation. Run applicable shared UI/home/share/tour GPU checks when changing their mobile controls.

## Native iOS client

Dave chose on 2026-09-16 to build a native Swift + Metal + SwiftUI client under `native/` for iPhone/iPad performance; see `docs/native-ios.md`. It is an additive second consumer of the same fingerprinted catalog release: never bundle `public/data`, never change the data contract for it, and keep the web app the primary delivery. `AtlasCore` is a 1:1 port of `src/*.ts` with the same error strings, link grammars and disclosure sentences; port tests from `tests/*.test.ts` with the repo fixtures rather than inventing new expectations. Reference JSON, photos and credits enter the app bundle only as build-time folder references into the web tree. Keep the generated `.xcodeproj`, signing teams, `.xcresult` bundles and `native/.cache/` out of git. Run `cd native && swift test` for logic and offscreen Metal checks, and the hosted device tests on the paired iPhone/iPad for performance; record device results with `physicalDevice: true` and the machine/OS/thermal fields, and set native acceptance targets only from measured device baselines.
