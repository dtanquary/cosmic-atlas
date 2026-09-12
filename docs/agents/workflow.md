# Local engineering workflow

The repository has a GitHub source remote. Record active diagnosis and acceptance evidence in local Markdown; create external issues only when requested. Keep hosting destinations and operational receipts in ignored local deployment files, separate from the public issue tracker.

- Active UI review: `docs/ux-review.md`.
- Product/domain language: `docs/requirements.md`, `docs/architecture.md`, `docs/galaxy-detail.md`.
- Validation conventions: `docs/validation.md`; measured results: `docs/validation-results.json`.
- States in local reviews: reproducing → fixing → verified. Use concrete repros and acceptance checks rather than inferred bug lists.
- Continue small local Git commits under the existing authorization in AGENTS.md.
