# Cosmic Atlas working instructions

## Git workflow

Dave requested on 2026-09-11: **commit early and often, and commit the work you do.**

- Reuse this repository. Make small, coherent commits as useful milestones are reached; do not leave an entire completed feature uncommitted.
- Include related source, tests, requirements, and validation notes. Describe unfinished checkpoints honestly in the commit message.
- Before committing, review the staged changes and run checks appropriate to that milestone. Finish production and actual-GPU validation before describing a feature as complete.
- Keep generated catalog binaries, raw FITS downloads, local caches, credentials, and dependencies out of Git. Track reproducible preparation scripts, compact sidecars, manifests, and attribution.
- Preserve existing user work and the full accepted catalog.

## Product and delivery

- Build a simple, clean 3D galaxy explorer with high scientific fidelity and smooth navigation.
- The intended delivery is a **public URL and all application source shared on GitHub**. Keep the code reproducible, document data sources and licenses, and design catalog delivery independently of the source repository.
- Measured positions, sizes and projected shapes must remain distinguishable from assumed depth, missing-shape fallbacks, and illustrative structure/colors.
- Use bounded streaming and level of detail. Never create one scene object or DOM element for every catalog galaxy.
- The existing full static archive exceeds the current Sites upload limit. Preserve the local catalog while arranging a separate public catalog-storage path; do not replace it with a small sample and call it complete.

## Checks and documentation

- `npm test` checks TypeScript data, interaction logic, and model geometry.
- `npm run test:models` verifies every profile sidecar, complete catalog coverage, and visual-type parsing.
- `npm run build` checks TypeScript and catalog asset presence/sizes, then builds the static app.
- Use the Sites build helper when required by the active Sites skills.
- Keep `docs/requirements.md`, `docs/architecture.md`, `docs/galaxy-detail.md`, and `docs/validation.md` consistent with the implemented experience. Record measured performance separately from targets.

## Agent skills

Use [the local engineering workflow](docs/agents/workflow.md) for issue tracking and domain-document locations. UI diagnosis uses `docs/ux-review.md`; the existing product and validation documents remain authoritative. Keep the requested small, frequent commits throughout review and fixes.

For changes to close-up visibility, camera focus, or search lifecycle, rerun the development `?uxtest` checks on the actual browser GPU. They cover observer obstruction, deliberate focus, display-mode fading, reachable inspector actions, and cancelled/reopened visits. Preserve these checks and record results in the UI review and validation notes.

The Milky Way is a separate reference model, not a fabricated DESI observation. Keep the Solar System at the coordinate origin, preserve sourced frame parameters, and exclude the reference from catalog counts/IDs/pair measurements. Run `?hometest` when changing it, alongside the applicable navigation/model checks.

Milky Way toolbar/search visits target the Galactic core; only Sun / Observer focus targets the origin. Preserve the real-control wheel regression in `?hometest`. Nearby point enlargement is an independent, saved setting, off by default; use the `?selftest` GPU/settings checks when changing its sizing or picking behavior.
