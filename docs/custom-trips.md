# Stop invitations and custom trips

Share → Copy this stop link sends a built-in destination with its canonical framing. `#stop=1:road-trip:andromeda` is a versioned, paused invitation; Continue starts from there. Only known route and stable chapter IDs are accepted. The original `#tour=road-trip` remains an automatic invitation from stop one.

Tours → Create a trip and Share → My trips open the local itinerary editor. Choose from built-in destinations, an existing saved view or the current camera. Reorder with Up/Down or desktop drag; remove stops and add short personal notes. Save/Open/Delete operates only in this browser. Preview shows the itinerary; the recipient explicitly chooses Start trip. Closing an editor or preview leaves the existing tour paused.

## Bounded version 1 format

A trip contains `version`, `title` and `stops`. The title is at most 60 Unicode characters; each of 1–10 stops has a unique short ASCII ID and an optional note of at most 180 Unicode characters.

- A place stop contains `id`, `kind: "place"`, a known built-in `route` and `stop`, and optional `note`.
- A view stop contains `id`, `kind: "view"`, `name` (60 characters), a validated existing camera `hash`, and optional `note`.

The share fragment is `#trip=1.` followed by unpadded base64url UTF-8 JSON. The fragment is limited to 8,000 characters and the final URL to 8,192 bytes. A valid larger trip remains exportable/importable as a JSON file up to 64 KiB. No destination or note is silently truncated. File imports use strict UTF-8 decoding and always show a preview before travel.

Unknown versions/fields, duplicate IDs, malformed Unicode, control characters other than newline, invalid camera grammar and unsupported destinations are rejected. Trip camera hashes allow only one each of `t`, `c` and optional `g`; arbitrary URLs are never navigated. User names and notes are assigned through text/value nodes. Markup remains literal text. A link contains no account identifier, settings, catalog payload or executable content.

Local storage uses `atlas-custom-trips`, version 1, with at most ten saved trips. Reads are size-bounded before JSON parsing and validate every entry; inaccessible, corrupt or full storage leaves link/file sharing available. Clipboard failure exposes the complete link for manual copying. Imports and clipboard results have generation checks so closing or replacing the panel cannot apply an old result.

## Navigation and scientific meaning

Custom routes run through the existing Tour class and single timer. Built-in stops preserve source captions, distances, visual cues and companion/photo identities independently of the creator's stop ID. Personal notes appear separately as “Trip note”; they do not replace scientific captions or add inferred factual claims.

Saved views preserve a possibly panned target and camera. Exact public galaxy identities are rechecked against current metadata; a missing identity gives a camera-only arrival with a notice. Dense internal catalog IDs are never accepted from a link. The usual uncertain-local policy still applies. Explicit saved views may intentionally frame empty sky or a panned-away selection, so their readiness means camera arrival after identity verification, not inferred survey coverage. Built-in destinations retain their representation-readiness checks and unavailable-subset skip notices.

The caller's generation lease guards pending metadata selection and camera movement. Pause, Exit, a new stop and input takeover invalidate it. New trip/stop invitations work in fresh tabs and through a deliberate hash change; consumed fragments are removed so reload and graphics recovery cannot replay them. Initial invitations wait for the atlas; input while a route waits for its name index cancels that pending start. Manual authoring can remain open while the map loads; Start waits for readiness.

No new animation loop, point frontier, per-record data work, geometry or model allocations are added. The full catalog, adopted dimensions, separate nearby references, 12-model DESI pool and 0.5% background floor remain unchanged.

## Validation checkpoint

Ten additional unit tests cover strict round trips, Unicode limits, malformed links/files, missing identities, bounded/blocked persistence, source-caption separation, custom companion/photo lookup and saved-view cancellation ownership. Production editor, recipient, subset, GPU and phone journeys follow before release. Operational deployment receipts remain ignored.
