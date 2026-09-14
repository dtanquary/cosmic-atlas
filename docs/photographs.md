# Telescope photographs

The optional Photo panel compares a real observation with the atlas illustration. It pauses the tour, keeps the map usable, and fetches nothing until opened. Desktop shows both views; phone users can switch back to Model. Closing does not resume the tour. Credits and CC BY 4.0 links stay attached to each image; the original source is always available.

The ten publisher-provided screen JPEGs are distributed verbatim, totaling 3,148,132 bytes. `scripts/photo-sources.json` pins publisher URLs, exact identity, source bytes, field, orientation, credit and usage terms. Run `python3 scripts/prepare_photos.py` to reproduce `public/photos/` and `src/data/photos.json`. Changed publisher bytes fail the pin and require review. Download caches and the WCS witness FITS remain ignored. These images have separate rights from the MIT application.

| Destination | Observation | Limits |
| --- | --- | --- |
| Milky Way | [ESO / S. Brunier panorama](https://www.eso.org/public/images/eso0932a/) | Taken from Earth, inside the Galaxy; no external photograph exists |
| LMC | [ESO VMC / VISTA](https://www.eso.org/public/images/eso1914a/) | Near infrared; colors differ from visible light |
| SMC | [ESO VISTA VMC](https://www.eso.org/public/images/eso1714a/) | Near infrared; foreground 47 Tuc is separately identified |
| Andromeda | [Hubble mosaic](https://esahubble.org/images/heic2501a/) | Jagged survey footprint, independent crop |
| M32 | [Hubble core](https://esahubble.org/images/opo9209a/) | Tiny nuclear field, false-color single optical band |
| M110 | [Hubble central field](https://esahubble.org/images/potw1937a/) | Central crop, not the entire galaxy |
| Triangulum | [ESO VST](https://www.eso.org/public/images/eso1424a/) | Optical and H-alpha composite |
| NGC 3982 | [Hubble composite](https://esahubble.org/images/opo1036a/) | Optical/near-infrared/emission composite |
| NGC 4026 | [Legacy Surveys DR9](https://www.legacysurvey.org/viewer?ra=179.8544868&dec=50.9616574&layer=ls-dr9&zoom=14) | Calibrated 8×8 arcminute sky cutout |
| Coma | [DSS2 field](https://esahubble.org/images/heic0813e/) | Foreground/background mixed; no individual DESI identity matching |

Publisher image terms were checked on 14 September 2026: [ESA/Hubble](https://esahubble.org/copyright/), [ESO](https://www.eso.org/public/outreach/copyright/) and [Legacy Surveys](https://www.legacysurvey.org/acknowledgment/). Full unabridged credits accompany each asset in `public/photos/credits.txt`. No publisher endorsement is implied. The unpublished full-resolution Milky Way panorama is not redistributed; only ESO's published screen image is included.

A photograph is selected through an exact public identity. The companions chapter offers M32 and M110. Unsupported views disclose that no matched photograph is included and retain the existing visualization. Observations do not replace catalog classifications, positions, adopted radii, projected ellipses or illustrative model colors.

Only NGC 4026 offers Match observed view. The accompanying Legacy DR9 FITS header confirms a north-up/east-left TAN field, 768×768 at 0.625 arcseconds/pixel, centered at RA 179.8544868°, Dec 50.9616574°. The existing equatorial camera looks outward from the observer direction, matching the vertical field; the viewport may have a different aspect ratio. Undo restores the previous camera/selection. Other images disclose their independent fields/orientations and offer no inferred automatic match.

One image is retained and one fetch is cancellable. Encoded bytes are limited to 1 MiB and verified by SHA-256 before decode; dimensions are checked and limited to 8 MiB RGBA (largest supplied image: 7,321,600 bytes). Switching/closing releases the object URL and aborts stale work. Browser HTTP caching and transient decoder/driver memory are outside this retained-image accounting. No per-galaxy image collection or extra WebGL model is created. Production packaging explicitly allows only the photo manifest, credits and hash-pinned assets.

Final implementation `240bd55`: 113 tests and strict TypeScript pass. Production photograph checks pass 221 assertions on Chrome/WebKit, including all ten images, credits, one-image ownership, zero startup requests, corrupt-byte rejection/retry, close cancellation, exact framing/undo and portrait/landscape/desktop restoration. All 28 captures were reviewed. Full/subset tour/UI/home/share/nearby GPU checks include a held real-metadata navigation lease and context recovery. Existing mobile, tour/history and all-stop journeys pass 126, 50 and 493 assertions. These are browser tests on the Mac GPU, not a physical iPhone result.
