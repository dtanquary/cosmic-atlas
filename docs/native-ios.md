# Native iOS / iPadOS client

Requested 16 September 2026. Dave chose a Swift + Metal port for iPhone/iPad performance after reviewing the trade-offs.
The web app remains the primary delivery and its runtime code is unchanged by this work; the native client is an
additive second consumer of the same fingerprinted catalog release. Source lives in [`native/`](../native/README.md).

## Why native, and what it must prove

- The web bottleneck measured on the M3 Max is CPU-side JavaScript (streaming, frontier selection, model preparation),
  not fill rate ([performance](performance.md)). Native code removes that overhead from exactly this path.
- Memory is the Safari ceiling: the web budget is fixed at 768 MiB adaptive / 1536 MiB full detail, far above what an
  iOS Safari tab survives. A native foreground app is not bound by the tab limit, so complete Full detail on a phone or
  tablet becomes testable rather than impossible. The full point catalog is about 226 MB of 16-byte rows.
- Pointer-lock flight has no iOS equivalent; native input uses gesture recognizers and iPad keyboards.
- No physical-device measurement of the web app exists yet. The native client is judged against numbers recorded on the
  actual devices, never against the desktop targets.

## Data contract (unchanged)

`/data/catalog.json` → `/data/releases/<fingerprint>/dr1/manifest.json`; sidecars one directory up; `.bin` chunks are
whole-file gzip served as `application/octet-stream` without `Content-Encoding`, so the client inflates them itself.
Every chunk has a 16-byte header (`magic, version 1, count, reserved`); points are planar float32 offsets from the
node centre followed by uint32 dense ids; metadata rows are 56 bytes; profile rows are 20 bytes. SHA-256 covers the
compressed bytes. The public origin sends `access-control-allow-origin: *` and immutable caching for releases. Dense
ids are release-scoped; the 64-bit DESI target id is the public identity.

## Phases

| Phase | Result | Effort |
| --- | --- | --- |
| 0 | Device baseline of the web app on the paired iPhone/iPad; `native/` scaffold; this document | Small |
| 1 | `AtlasCore`: manifest, decoders, gunzip + SHA-256, loader, frontier, camera/travel, link codecs, tour runner, search, model catalog, settings; all 25 vitest files ported | Large |
| 2 | Metal point pass, LOD streaming, GPU picking, orbit gestures; first device numbers | Large |
| 3 | CMB shell, lookback rings, survey footprint, settings sheet | Medium |
| 4 | Galaxy models, volumes, nearby layer, Milky Way, clouds, portraits, annotations | Large |
| 5 | Product UI: inspector, search, share, tours, trips, photos, About the data | Large |
| 6 | Parity validation, privacy manifest, credits, App Store preparation | Medium |

Each phase is a coherent commit series with acceptance checks measured on the real devices; see the checked-in plan
summary in this file's history and `AGENTS.md` for the standing rules.

## Recording the web baseline on a device (Phase 0)

1. On the iPhone/iPad enable Settings → Apps → Safari → Advanced → Web Inspector, connect to the Mac, and open the
   production URL with `#tour=road-trip` in Safari.
2. In Mac Safari, Develop → *device* → the page. Start a Timelines recording (Rendering Frames, CPU, Memory) before
   the tour begins; from the console run `window.dispatchEvent(new KeyboardEvent('keydown',{code:'F8'}))` to show the
   app's own diagnostics HUD (FPS · p95 ms / draw calls · models / MiB managed).
3. Let all ten stops complete. Note the HUD peak managed MiB, movement p95/p99 from the timeline, the first navigable
   view time, and whether the tab reloaded. Then switch to Full detail at the overview and record whether the tab
   survives.
4. Record device model identifier, iOS and Safari build, charge state and whether the device was warm to the touch as
   a separate observation. Add a row to the *Physical devices* table in [performance.md](performance.md) and a
   `physicalDevice: true` run in `performance-results.json`. Do not infer temperature or power from frame rate.

## Progress (16 September 2026)

- Phase 0: scaffold, docs and the pending physical-device table are in place; the web baseline on the paired devices
  is still to be recorded by hand.
- Phase 1: AtlasCore ports the data contract, loader, link codecs, tours/trips, search, model decoding, camera and
  settings; the vitest suites are ported 1:1 with the repository fixtures.
- Phase 2: the Metal point pass, GPU picking, session streaming and the iOS view with gestures run on the simulator and
  install on the iPhone; the on-device journey test exists but has not yet completed a run (the phone must be unlocked
  and the developer app trusted for the test runner to attach).
- Phase 3: the CMB shell, lookback rings and survey footprint overlays, the settings sheet and ring labels.
- Phase 4: galaxy volumes (Gaussian bodies, the disk template for the Milky Way and portraits, Magellanic clouds, arm
  points), the twelve-model scheduler, nearby layer, visits and link application in the session.
- Not yet: the product UI of Phase 5 beyond a minimal inspector and settings sheet, and the Phase 6 store preparation.

Judge device performance only on Release builds; Debug builds of unoptimised Swift are many times slower in the
per-frame streaming code and are what `xcodebuild test` installs by default (see `native/README.md`).

Frame pacing (input latency): idle frames draw on demand, but while the session animates the view is driven by a
`CADisplayLink`, one frame per vsync, and the main thread never waits for the GPU: if the previous command buffer is
still running the frame is dropped rather than blocking touch delivery behind `nextDrawable`. Orbit input applies an
`Orbit.update` inside the gesture handler as well as in the frame loop, as three.js OrbitControls does on every
pointer/touch move, so the damped response matches the web. The diagnostics line shows the last frame's GPU time.

## Native measurement rules

- Device performance tests live in `native/App/CosmicAtlasDeviceTests`, run with
  `xcodebuild test -destination 'platform=iOS,id=<udid>'`, skip on the simulator, and attach a JSON summary.
- Every native record carries `physicalDevice: true`, the machine identifier, OS build, app commit, drawable scale,
  charger state and thermal state at start and end. `.xcresult` bundles stay in ignored `native/.cache/`.
- Acceptance targets for first coarse view, movement p95/p99, peak footprint, thermal state and Full detail
  feasibility are set from the Phase 0 device baseline, not from desktop numbers.
- Offscreen Metal checks on the Mac pin draw-call counts and FNV-1a pixel checksums over the development subset;
  checksum fixtures change only in a commit that explains why.

## Deliberate v1 limits

Drawable scale capped at 1.5 like the web until per-device measurement; memory budget from
`os_proc_available_memory()` with one safety factor; no universal links (sharing emits ordinary web URLs and a paste
field accepts every link kind); no offline beyond the URL cache; full-screen only on iPad; 60 Hz; system fonts;
disclosure sentences duplicated in Swift and guarded by a verbatim-presence test against the web source.
