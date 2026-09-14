import './style.css';
import {setupMobileUI} from './mobile-ui';
import { Explorer, DEFAULT_MINIMUM_OPACITY, type AtlasStats } from './explorer';
import { formatDistance, niceScale, MLY_PER_MPC, type Units } from './format';
import {GalaxySearch} from './galaxy-search';
import type {ModelDisplay,GalaxyAppearance} from './galaxy-detail';
import {milkyWayReference} from './milky-way';
import {nearbyReference} from './nearby-galaxies';
import type { Galaxy } from './types';
import {uncertainLocalPosition} from './local-distances';
import {galaxyVariant} from './galaxy-variants';
import {galaxyPortrait} from './galaxy-portraits';
import {cloudLabels} from './magellanic-clouds';
import {CMB_RADIUS_MPC,catalogRadialReach,cosmicHorizonReference} from './cosmic-scale';
import {formatLookback,lightTravelGyr,lookbackForDistance,lookbackReference} from './lookback';
import {decodeView,encodeView,decodeTourLink,ROAD_TRIP_HASH} from './view-link';
import {Tour,tours,type TourState,type TourPace} from './tour';
import {ViewHistory} from './view-history';

const FOOTPRINT_HINT='Tinted sky = directions with accepted DESI DR1 rows in this catalog. Dark = not surveyed here, not confirmed empty. Missing points inside the tint are adaptive sampling, distance fading or real structure.';

const icon=(body:string)=>`<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const icons={
 settings:icon('<path d="M4 6h9m5 0h2M4 12h2m5 0h9M4 18h9m5 0h2"/><circle cx="15.5" cy="6" r="2.5"/><circle cx="8.5" cy="12" r="2.5"/><circle cx="15.5" cy="18" r="2.5"/>'),
 orbit:icon('<circle cx="12" cy="12" r="7"/><ellipse cx="12" cy="12" rx="4" ry="11" transform="rotate(45 12 12)"/>'),
 fly:icon('<path d="M21 3L3 10l7 4 4 7 7-18zM10 14L21 3"/>'),
 measure:icon('<path d="M4 17L17 4l4 4L8 21zM8 13l3 3m1-7l3 3m1-7l3 3"/>'),
 observer:icon('<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>'),
 horizon:icon('<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="9" ry="3.5"/><path d="M12 3v18"/>'),
 reset:icon('<path d="M4 9a8 8 0 111 9M4 4v5h5"/>'),
 info:icon('<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>'),
 help:icon('<circle cx="12" cy="12" r="9"/><path d="M9.5 8.5a2.5 2.5 0 015 0c0 2-2.5 2-2.5 4m0 3v.2"/>'),
 close:icon('<path d="M6 6l12 12M18 6L6 18"/>'),
 focus:icon('<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/><circle cx="12" cy="12" r="3"/>'),
 copy:icon('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>'),
 tour:icon('<path d="M4 18c5 0 4-9 8.5-9s4 9 8.5 9"/><circle cx="4" cy="18" r="1.8"/><circle cx="12.5" cy="9" r="1.8"/><circle cx="21" cy="18" r="1.8"/>'),
};
document.querySelector('#app')!.innerHTML=`
<div id="viewport" aria-label="Three-dimensional galaxy map"></div>
<header class="topbar"><div class="brand"><div class="brand-mark">${icons.orbit}</div><div><div class="brand-name">Cosmic Atlas</div><div class="brand-sub" id="place-context">THE MEASURED UNIVERSE</div></div></div><div class="top-actions"><button class="button quiet" id="back-view-button" aria-label="Back to previous view" title="Back to previous view" hidden>${icons.reset}<span>Back</span></button><button class="button quiet" id="visit-galaxy-button" aria-label="Visit a galaxy" hidden title="Search galaxies">${icons.focus}<span>Visit</span></button><button class="button quiet" id="share-button" aria-label="Share this view" title="Copy a link or save this view">${icons.copy}<span>Share</span></button><button class="button quiet" id="data-button" aria-label="About the data">${icons.info}<span>About the data</span></button><button class="button icon-button quiet" id="help-button" aria-label="Settings and navigation" title="Settings">${icons.settings}</button></div></header>
<nav class="rail" aria-label="Map tools"><button id="orbit-button" aria-label="Orbit" class="button active" aria-pressed="true" title="Orbit the map">${icons.orbit}<span>Orbit</span></button><button id="fly-button" aria-label="Flight controls" class="button" aria-pressed="false" aria-controls="flight-controls" aria-expanded="false" title="Open flight controls">${icons.fly}<span>Fly</span></button><div class="rail-rule"></div><button id="measure-button" aria-label="Measure between galaxies" class="button" aria-pressed="false" title="Measure between two galaxies">${icons.measure}<span>Measure</span></button><button id="observer-button" class="button" aria-label="Visit the Milky Way" title="Milky Way — focus on the Galactic core">${icons.observer}<span>Milky Way</span></button><button id="cosmic-horizon-button" aria-label="Show CMB shell" class="button" aria-pressed="false" aria-controls="cosmic-context" title="Toggle the cosmic microwave background shell">${icons.horizon}<span>CMB shell</span></button><button id="reset-button" aria-label="Return to overview" class="button" title="Return to overview (R)">${icons.reset}<span>Overview</span></button><button id="tours-button" class="button" aria-label="Guided tours" aria-haspopup="dialog" title="Guided tours">${icons.tour}<span>Tours</span></button></nav>
<aside id="cosmic-context" class="cosmic-context" aria-label="Cosmic scale reference" hidden><div class="eyebrow">Cosmic microwave background</div><div class="cosmic-radius" id="cosmic-radius"></div><div class="fineprint">Last-scattering surface · radius today</div><div class="cosmic-comparison"><div class="cosmic-reach-label"><span>This catalog's reach</span><strong id="cosmic-reach"></strong></div><div class="cosmic-reach-track" aria-hidden="true"><span id="cosmic-reach-bar"></span></div><p class="fineprint" id="cosmic-catalog-distance"></p></div><p class="fineprint">Early light, not a physical edge. Planck18 distance; shell and grid are illustrative.</p><button class="button" id="cosmic-scale-button">${icons.focus}View cosmic scale</button><a class="profile-source" href="${cosmicHorizonReference.sources.explanation}" target="_blank" rel="noopener">About this early light ↗</a></aside>
<div class="flight-controls" id="flight-controls" hidden><label for="speed">Travel speed</label><input id="speed" type="range" min="-6" max="4" step=".1" value="3"/><div class="flight-speed" id="flight-speed"></div><button class="button" id="start-flight-button">Start flying</button><button class="button" id="auto-flight-button" aria-pressed="false">Auto fly</button><p class="fineprint" id="flight-hint">Set your speed, then start flying.<br>Choose Orbit to close.</p></div>
<div class="crosshair" id="crosshair" hidden></div><div class="origin-label" id="origin-label" aria-hidden="true" hidden>OBSERVER</div><div class="origin-label home-center-label" id="home-center-label" aria-hidden="true" hidden>GALACTIC CORE</div>${Array.from({length:8},(_,i)=>`<div class="origin-label ring-label" id="ring-label-${i}" aria-hidden="true" hidden><span></span><span class="ring-where"></span></div>`).join('')}
<aside class="inspector" id="inspector" aria-label="Selected galaxy" hidden><div class="inspector-header"><div class="panel-top"><div class="eyebrow" id="object-source">Galaxy observation</div><button class="button quiet icon-button" id="close-inspector" aria-label="Close galaxy details">${icons.close}</button></div><h2 class="object-name" id="object-name"></h2><div class="object-kind" id="object-kind">DESI target ID</div><div class="panel-actions"><button class="button" id="focus-button">${icons.focus}Focus</button><button class="button" id="copy-button">${icons.copy}Copy ID</button></div></div><div class="inspector-body"><p class="local-distance-warning" id="local-distance-warning" hidden></p><div class="distance-value" id="object-distance"></div><div class="distance-caption" id="object-distance-caption">Comoving distance from observer</div><section class="nearby-provenance" id="nearby-provenance" hidden><p class="fineprint" id="nearby-distance-method"></p><p class="fineprint" id="nearby-distance-error"></p><a class="profile-source" id="nearby-distance-source" target="_blank" rel="noopener">Distance measurement ↗</a></section><section class="galaxy-profile" id="galaxy-profile" hidden aria-label="Galaxy model"><div class="eyebrow" id="profile-heading">Galaxy model</div><p class="model-kind" id="profile-kind"></p><p class="fineprint" id="profile-appearance" hidden>Spiral appearance: morphology, light profile and depth are illustrative. Adopted size and sky ellipse are retained. Colors vary illustratively, not from measured photometry. Source properties are described below.</p><dl><div><dt>Half-light radius</dt><dd id="profile-radius"></dd></div><div><dt>Sky position angle</dt><dd id="profile-angle"></dd></div></dl><p class="fineprint" id="profile-description">Measured size, sky angle and light profile. 3D tilt assumes a flattened shape; its near side is unknown. Color and exposure are illustrative. Sizes are comoving.</p><button class="button" id="observed-view-button">Observer-facing view</button><a id="profile-source" class="profile-source" href="https://www.legacysurvey.org/viewer?ra=179.8544868&amp;dec=50.9616574&amp;layer=ls-dr9&amp;zoom=14" target="_blank" rel="noopener">Compare telescope image ↗</a></section><dl><div><dt>Right ascension</dt><dd id="object-ra"></dd></div><div><dt>Declination</dt><dd id="object-dec"></dd></div><div id="redshift-row"><dt>Redshift</dt><dd id="object-z"></dd></div><div id="redshift-error-row"><dt>Redshift fit error</dt><dd id="object-zerr"></dd></div><div id="lookback-row"><dt>Light travel time</dt><dd id="object-lookback"></dd></div></dl><p class="fineprint" id="lookback-caption"></p><p class="fineprint" id="distance-inference-note">Distance inferred using Planck18. Fit error excludes velocity and cosmology uncertainties.</p></div></aside>
<aside class="inspector" id="home-inspector" aria-label="Milky Way reference model" hidden><div class="inspector-header"><div class="panel-top"><div class="eyebrow">Our home galaxy</div><button class="button quiet icon-button" id="close-home" aria-label="Close Milky Way details">${icons.close}</button></div><h2 class="object-name">Milky Way</h2><div class="object-kind">Barred spiral · reference model</div><div class="panel-actions"><button class="button" id="home-galaxy-view" aria-pressed="false">Galactic core</button><button class="button" id="home-solar-view" aria-pressed="false">Sun / Observer</button></div><p class="fineprint home-view-hint" id="home-view-hint"></p></div><div class="inspector-body"><div class="distance-value" id="home-distance"></div><div class="distance-caption">Sun to Galactic center · adopted distance</div><section class="galaxy-profile"><div class="eyebrow">A place in our galaxy</div><p class="fineprint">The Sun · Observer marker is our location inside the disk, offset from the Galactic core. Choose a focus above to zoom and orbit around either position.</p><dl><div><dt>Sun above midplane</dt><dd id="home-height"></dd></div><div><dt>Disk scale length</dt><dd id="home-disk-scale"></dd></div><div><dt>Bar half-length</dt><dd id="home-bar-length"></dd></div></dl><p class="fineprint">Placement and plane use a published Galactic reference frame. Disk and bar dimensions adopt literature estimates. Spiral paths, bulge shape, depth, dust and colors are illustrative. The lighting and texture are inspired by telescope images of Andromeda.</p><p class="fineprint" id="home-display-note" hidden>Points-only display is on. Choose Automatic or Focused galaxy only in Settings to show the model.</p><a class="profile-source" href="https://docs.astropy.org/en/stable/coordinates/galactocentric.html" target="_blank" rel="noopener">Galactic reference frame ↗</a><a class="profile-source" href="https://arxiv.org/abs/astro-ph/0510520" target="_blank" rel="noopener">Disk measurements ↗</a><a class="profile-source" href="https://arxiv.org/abs/1504.01401" target="_blank" rel="noopener">Bar measurements ↗</a><a class="profile-source" href="https://esahubble.org/images/heic2501a/" target="_blank" rel="noopener">Andromeda appearance reference ↗</a><p class="fineprint">This reference model is separate from the DESI catalog count and redshift-distance measurements.</p></section></div></aside>
<aside class="inspector tour-panel" id="tour-panel" aria-label="Guided tour" hidden><div class="inspector-header"><div class="panel-top"><button class="eyebrow tour-options-button" id="tour-progress" aria-label="Tour stops and pace" aria-haspopup="dialog" aria-controls="tour-options-dialog">Guided tour</button><button class="button quiet icon-button" id="tour-exit" aria-label="Exit the tour">${icons.close}</button></div><div class="tour-title" id="tour-title"></div></div><div class="inspector-body"><h2 class="object-name" id="tour-stop-title"></h2><p class="tour-cue" id="tour-cue"></p><p class="tour-caption" id="tour-caption"></p></div><div class="tour-footer"><div class="panel-actions tour-controls"><button class="button" id="tour-previous" aria-label="Previous stop">Prev</button><button class="button" id="tour-play" aria-pressed="false" aria-label="Play the tour">Play</button><button class="button" id="tour-next" aria-label="Next stop">Next</button></div><p class="fineprint tour-status" id="tour-status" role="status"></p></div></aside>
<div class="measurement" id="measurement" hidden><button class="button quiet close-measure" id="close-measure" aria-label="Close measurement">${icons.close}</button><div class="eyebrow">Distance between galaxies</div><div class="measurement-value" id="measurement-value">Select the first galaxy</div><div class="measurement-hint" id="measurement-hint">Click any point in the map</div></div>
<footer class="footer"><div><div class="count-label">Catalog observations</div><div class="count-value" id="galaxy-count">—</div><div class="count-caption" id="dataset-caption">DESI · DATA RELEASE 1</div><div class="count-caption" id="nearby-count">+ ${nearbyReference.entries.length} nearby galaxies · independent distances</div><div class="local-policy" id="local-policy">Uncertain local positions hidden</div><div class="count-meta"><span><strong id="loaded-count">—</strong> loaded</span><span><strong id="drawn-count">—</strong> submitted</span></div></div><div class="footer-right"><div class="mode-switch" role="group" aria-label="Rendering detail"><button id="adaptive-button" class="active" aria-pressed="true">Adaptive</button><button id="full-button" aria-pressed="false">Full detail</button></div><div class="scale"><div class="legend-row"><select id="units" aria-label="Distance units"><option value="ly">Light-years</option><option value="Mpc">Megaparsecs</option></select><div class="scale-label" id="scale-label">—</div></div><div class="scale-rule" id="scale-rule"></div><div class="scale-note">At focus depth · map distance</div><div class="scale-note" id="lookback-note"></div></div></div></footer>
<div class="status" id="status"><strong id="detail-status">Opening the catalog</strong><br><span id="navigation-hint">Drag to orbit · click a point to inspect</span><br><button class="button quiet" id="retry-button" hidden>Retry missing detail</button></div>
<div class="loading" id="loading"><div class="orbit"></div><span id="loading-text">Opening the cosmic web</span></div><div class="toast" id="toast" role="status" hidden></div><div class="diagnostics" id="diagnostics" hidden></div>
<dialog class="dialog" id="data-dialog" aria-labelledby="data-title"><div class="eyebrow">DESI · Data release 1</div><div class="dialog-title"><h2 id="data-title">A measured, incomplete universe.</h2><button class="button quiet icon-button" data-close aria-label="Close data information">${icons.close}</button></div><p id="data-summary">Loading catalog information.</p><p id="sample-disclosure"></p><h3>Positions, with perspective</h3><p>DESI positions preserve linear comoving distances, inferred from measured redshifts using Planck18 cosmology. These observations span different lookback times; they are not a simultaneous picture of the universe today. Local galaxy motions and measurement uncertainty affect inferred distances.</p><h3>What the points tell you</h3><p>Each survey point marks an accepted observation classified as a galaxy; the six nearby points use separate, cited measurements. Distant points can fade smoothly from the camera; nearby point enlargement is optional and off by default. These display cues do not represent physical size or luminosity. Unobserved regions and survey selection effects are not confirmed cosmic voids.</p><h3>Cosmic microwave background shell</h3><p>The optional CMB shell marks the approximate last-scattering surface centered on the Sun / Observer, where the early universe became transparent. Its 45.3 billion light-year radius is inferred using Planck18 at rounded redshift 1090, in the same comoving scale as the catalog. The light traveled for about 13.8 billion years while space expanded. This is not a physical edge of the universe. The thin shell, colors and grid are illustrative, with no measured temperature map. The radial comparison describes this catalog only; uneven sky coverage and selection effects mean it is not the fraction of galaxies or volume mapped by humanity.</p><a class="profile-source" href="${cosmicHorizonReference.sources.parameters}" target="_blank" rel="noopener">Planck cosmological parameters ↗</a><h3>Lookback time</h3><p>The footer and inspector show how long ago the light we see now left the focus depth or the selected galaxy; Settings can add faint observer-centered lookback rings. ${lookbackReference.disclosure}</p><a class="profile-source" href="${lookbackReference.sources.calculation}" target="_blank" rel="noopener">Planck18 lookback model ↗</a><h3>Survey footprint</h3><p>Settings can tint the sky directions where this catalog holds accepted DESI DR1 rows, at 0.5° resolution. This is sky occupancy of the accepted rows, not the official survey tiling, depth or completeness: a tinted cell holds at least one accepted row, shaded by the log of its row count, and dark cells were not surveyed here and are not confirmed empty. The overlay is drawn on a sphere at the catalog's farthest distance, so its shading is exact only as seen from the Sun / Observer position; from elsewhere it is a reference backdrop, not a per-galaxy mask.</p><a class="profile-source" href="https://data.desi.lbl.gov/doc/releases/dr1/" target="_blank" rel="noopener">DESI Data Release 1 ↗</a><h3>Galaxy close-ups</h3><p>Spiral illustrations are the default visual appearance, retaining adopted positions, radii and projected ellipses. The two Magellanic Clouds instead have distinct stellar haze and dust volumes in both appearance modes; their fine structure is illustrative, not a measured gas map. Settings → Galaxy appearance → Catalog types restores the source-based variants described below. The override does not change catalog classifications.</p><p>Catalog galaxies outside the local-distance safeguard can resolve into a close-up model: spiral, barred spiral, elliptical, lenticular or irregular. Recorded visual types choose the model where available; otherwise the inspector labels it as an approximation. Usable imaging measurements set the size and projected ellipse. Objects without usable shapes use a clearly labeled assumed size of 5 kpc half-light radius. Depth, near side, arms, clumps, colors and exposure are illustrative. Distant galaxies stay as points; nearby models load within a fixed rendering budget. In Automatic mode, incidental models fade back to points before filling the view. Visit or Focus keeps the chosen galaxy fully visible, including from inside. Settings also offers focused-only and points-only views. These visibility cues never change measured sizes or positions.</p><h3>Uncertain local positions</h3><p>Very small redshifts cannot establish reliable nearby distances. Some catalog records consequently land inside the Milky Way in this redshift-only map. We hide positions inferred within 1 Mpc (3.26 million light-years) of the observer by default. Settings can reveal them as amber points, with no physical galaxy models. Their original records and the catalog total remain intact. This radius is a display safeguard, not a scientific reliability boundary; distances beyond it can also be uncertain. <a href="https://ned.ipac.caltech.edu/Documents/Overview" target="_blank" rel="noopener">Why local motions affect distances ↗</a></p><h3>Nearby galaxies</h3><p>Andromeda, Triangulum, the Magellanic Clouds, M32 and M110 use separately sourced distances from resolved stars or eclipsing binaries. They are available in every dataset, including the small preview, and stay visible when uncertain local redshift positions are hidden. Their inspectors distinguish adopted measured shapes from illustrative sizes and orientations. Their six entries are counted separately from DESI observations; this combined view is not a globally deduplicated census. Local distances are used directly on the observer-centered map axes, with no redshift conversion. <a href="https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/en/community/nearby/" target="_blank" rel="noopener">Nearby-galaxy compilation ↗</a></p><h3>Our home galaxy</h3><p>Milky Way opens a view centered on the Galactic core. The Sun / Observer marker stays at our location in the disk, at the coordinate origin. Its placement and plane use an adopted Galactic reference frame; disk and bar scales come from literature estimates. Arms, bulge, depth, light knots and colors are illustrative. It is a separate reference model, with no DESI target ID or redshift, and is excluded from catalog counts and galaxy-pair measurements.</p><h3>Detail and completeness</h3><p>Adaptive mode draws a disclosed selection of real positions and reveals more as you approach. Full detail submits every accepted observation in view once loading completes; the local-distance safeguard still applies. It may run slower. The submitted count records points sent to the renderer; some overlap, are hidden by the local safeguard, fade out with distance, or lie outside the viewport within a spatial chunk.</p><p>The DESI import accepts only primary galaxy records with no redshift warning, valid sky coordinates, and positive redshift. These cuts do not guarantee every redshift is correct.</p><p><a href="https://data.desi.lbl.gov/doc/releases/dr1/" target="_blank" rel="noopener">DESI release documentation ↗</a><br><a href="https://docs.astropy.org/en/stable/api/astropy.cosmology.realizations.Planck18.html" target="_blank" rel="noopener">Planck18 distance model ↗</a><br><a href="/acknowledgments.txt" target="_blank" rel="noopener">Data attribution and processing notes ↗</a></p></dialog>
<dialog class="dialog" id="help-dialog" aria-labelledby="help-title"><div class="eyebrow">Settings</div><div class="dialog-title"><h2 id="help-title">Navigation &amp; display</h2><button class="button quiet icon-button" data-close aria-label="Close navigation help">${icons.close}</button></div><div class="display-settings"><label class="view-preference"><input id="show-cosmic-horizon" type="checkbox" aria-describedby="cosmic-horizon-hint"/>Cosmic microwave background shell</label><p class="fineprint" id="cosmic-horizon-hint">A faint observer-centered bubble at the approximate last-scattering distance, 45.3 billion light-years today. This is early light, not a physical boundary of the universe. No measured temperature map is shown. Use View cosmic scale to compare the catalog.</p><button class="button cosmic-settings-view" id="settings-cosmic-scale">View cosmic scale</button><label class="view-preference"><input id="show-lookback-rings" type="checkbox" aria-describedby="lookback-rings-hint"/>Lookback time rings</label><p class="fineprint" id="lookback-rings-hint">Faint observer-centered rings marking how long ago the light we see now left each distance, from 10 million to 13.5 billion years (Planck18). Labels give the present-day comoving distance, not the distance the light traveled.</p><label class="view-preference"><input id="show-survey-footprint" type="checkbox" aria-describedby="survey-footprint-hint"/>Survey footprint</label><p class="fineprint" id="survey-footprint-hint">${FOOTPRINT_HINT}</p><div class="cosmic-settings-rule"></div><label class="model-display-label" for="galaxy-appearance">Galaxy appearance</label><select id="galaxy-appearance" aria-describedby="galaxy-appearance-hint"><option value="spiral">Image-inspired targets + spirals</option><option value="catalog">Catalog types</option></select><p class="fineprint" id="galaxy-appearance-hint">Road-trip galaxies and Magellanic Clouds use image-inspired models in both modes. Other galaxies use five restrained spiral illustrations. Adopted sizes and sky ellipses are preserved; internal structure and colors are illustrative. Catalog types restores the other source-based variants.</p><label class="model-display-label" for="model-display">Galaxy close-ups</label><select id="model-display" aria-describedby="model-display-hint"><option value="automatic">Automatic · clear navigation</option><option value="focused">Focused galaxy only</option><option value="points">Points only</option></select><p class="fineprint" id="model-display-hint">Nearby galaxies resolve automatically. Models that fill the view fade back to points; use Visit or Focus to explore one fully.</p><label class="view-preference"><input id="show-uncertain-local" type="checkbox" aria-describedby="local-distance-hint"/>Show uncertain local positions</label><p class="fineprint" id="local-distance-hint">Reveal redshift-only positions within 1 Mpc of the observer as amber points. These distances are unreliable; no galaxy models are shown for them. Hidden by default to keep them out of our Milky Way view.</p><label class="view-preference"><input id="enlarge-points" type="checkbox"/>Enlarge nearby points</label><p class="fineprint">Optional size boost for point markers. Galaxy models retain their physical scale.</p><label class="view-preference"><input id="depth-cues" type="checkbox" checked/>Distance fading</label><label class="opacity-label" for="minimum-opacity">Minimum distant opacity <output id="opacity-value">${DEFAULT_MINIMUM_OPACITY*100}%</output></label><input id="minimum-opacity" type="range" min="0" max="100" step="0.5" value="${DEFAULT_MINIMUM_OPACITY*100}"/><p class="fineprint">Distant galaxies fade to this level. Try 1–5% for a faint background; 0% lets them disappear completely.</p></div><div class="help-grid"><span>Orbit around the focus</span><kbd>Drag</kbd><span>Pan the focus</span><kbd>Right-drag / two-finger drag</kbd><span>Move closer or farther</span><kbd>Scroll / pinch</kbd><span>Inspect a galaxy</span><kbd>Click a point</kbd><span>Focus on the selection</span><kbd>F</kbd><span>Focus on our galaxy</span><kbd>Milky Way button</kbd><span>Return to the overview</span><kbd>R</kbd><span>Fly forward / sideways</span><kbd>W A S D</kbd><span>Fly down / up</span><kbd>Q / E</kbd><span>Accelerate in flight</span><kbd>Shift</kbd><span>Change flight speed</span><kbd>Scroll</kbd><span>Leave flight</span><kbd>Esc</kbd><span>Show performance readout</span><kbd>F8</kbd></div><p>Choose Measure, then click two galaxies to compare their estimated separation in the map. Choose Fly to set your travel speed, then Start flying to capture the pointer. Choose Auto fly for a straight forward pass at the current speed with the mouse free; adjust the slider while moving. Stop auto fly or Escape pauses it. Scroll to change speed while manually flying. Escape releases the pointer and keeps the speed controls open; choose Orbit to close them.</p><p class="mobile-message">This first version is designed for a desktop mouse and keyboard.</p></dialog><dialog class="dialog visit-dialog" id="visit-dialog" aria-labelledby="visit-title"><div class="dialog-title"><h2 id="visit-title">Visit a galaxy</h2><button class="button quiet icon-button" data-close aria-label="Close galaxy search">${icons.close}</button></div><label class="search-label" for="galaxy-query">Galaxy name</label><input id="galaxy-query" type="search" placeholder="Try Andromeda, M33 or LMC" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-controls="galaxy-results" aria-expanded="false"/><p id="search-status" class="search-status" role="status"></p><ul id="galaxy-results" role="listbox" aria-label="Galaxies available to visit"></ul><section id="unavailable-matches" class="unavailable-matches" aria-labelledby="unavailable-title" hidden><h3 id="unavailable-title">Location unavailable in this atlas</h3><ul id="unavailable-names"></ul><p>We recognize these names, but this atlas has no verified 3D visit location for them yet. They cannot be visited in the current dataset.</p></section><button class="button browse-available" id="browse-available" hidden>Browse available galaxies</button><button class="button" id="search-retry" hidden>Retry loading names</button><p class="fineprint search-note">Search NGC, IC, UGC and common aliases. Name coverage is broader than the available visit locations. DESI distances are inferred from redshift; the nearby layer uses independent measurements.</p></dialog><dialog class="dialog share-dialog" id="share-dialog" aria-labelledby="share-title"><div class="dialog-title"><h2 id="share-title">Share this view</h2><button class="button quiet icon-button" data-close aria-label="Close sharing">${icons.close}</button></div><p class="fineprint">A view link carries only the camera position and, when something is selected, its catalog identity, which is re-checked against the catalog when opened. Saved views stay in this browser.</p><div class="share-actions"><button class="button" id="copy-link-button">${icons.copy}Copy view link</button><button class="button" id="copy-road-trip-button" aria-describedby="share-tour-hint">${icons.tour}Copy cosmic road trip link</button></div><p class="fineprint share-tour-hint" id="share-tour-hint">Send someone a tour: the cosmic road trip link starts at the Milky Way and plays through all ten stops.</p><input id="share-link" class="share-link" type="text" readonly aria-label="Link to share" hidden/><label class="search-label" for="view-name">Save this view</label><div class="save-view-row"><input id="view-name" type="text" maxlength="60" autocomplete="off" placeholder="Name this view"/><button class="button" id="save-view-button">Save view</button></div><ul id="saved-views" class="saved-views" aria-label="Saved views"></ul><p class="fineprint" id="saved-views-empty">No saved views yet.</p></dialog><dialog class="dialog tours-dialog" id="tours-dialog" aria-labelledby="tours-title"><div class="dialog-title"><h2 id="tours-title">Guided tours</h2><button class="button quiet icon-button" data-close aria-label="Close tours">${icons.close}</button></div><p class="fineprint">A tour moves the camera between real destinations and explains each one. Drag, scroll or any navigation control pauses it; Escape exits. Nothing about the catalog or your saved settings changes.</p><ul class="tour-list" id="tour-list" aria-label="Available tours">${tours.map(tour=>`<li><div><h3>${tour.title}</h3><p>${tour.summary}</p></div><button class="button" data-tour="${tour.key}" disabled aria-label="Start ${tour.title}">Start</button></li>`).join('')}</ul></dialog><dialog class="dialog tour-options-dialog" id="tour-options-dialog" aria-labelledby="tour-options-title"><div class="dialog-title"><h2 id="tour-options-title">Stops &amp; pace</h2><button class="button quiet icon-button" data-close aria-label="Close tour options">${icons.close}</button></div><p>The tour is paused. Choose a stop or take time to look around.</p><label for="tour-chapter">Jump to a stop</label><select id="tour-chapter"></select><label for="tour-pace">Tour pace</label><select id="tour-pace"><option value="quick">Quick · shorter stops</option><option value="relaxed">Relaxed · more time to look</option><option value="manual">Manual · advance with Next</option></select><p class="fineprint">Pace changes the time at each stop. Your camera travels at the same comfortable speed.</p><div class="panel-actions"><button class="button" id="tour-explore">Explore here</button><button class="button" id="tour-return">Return to stop</button></div></dialog>`;

const element=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const text=(id:string,value:string)=>element(id).textContent=value;
let galaxySearch:GalaxySearch;
let atlas:Explorer,units:Units='ly',diagnostics=false,flightControlsOpen=false;
let tour:Tour|null=null,pausedByInput=false,atlasReady=false;
let tourPace:TourPace='quick';
const viewHistory=new ViewHistory();
const tourActive=()=>tour!==null&&tour.state.status!=='idle';
const uiLifecycle=new AbortController();
setupMobileUI(uiLifecycle.signal);
let toastTimer:ReturnType<typeof setTimeout>;
function notify(message:string){text('toast',message);element('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>element('toast').hidden=true,4000)}
function pressed(id:string,value:boolean){element(id).classList.toggle('active',value);element(id).setAttribute('aria-pressed',String(value))}
function galaxyName(galaxy:Galaxy){const detail=atlas.resolvedFor(galaxy.id);return (detail?.data.name!==galaxy.targetId?detail?.data.name:undefined)??galaxySearch?.nameFor(galaxy.id)}
/** Saved views: `{version:1,views:[{name,hash,savedAt}]}` in localStorage, newest first, at most 50; unreadable or off-grammar entries are dropped on read. */
type SavedView={name:string;hash:string;savedAt:string};
const escapeHtml=(value:string)=>value.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]!);
function readViews():SavedView[]{
 try{const data=JSON.parse(localStorage.getItem('atlas-saved-views')??'null');if(data?.version!==1||!Array.isArray(data.views))return [];
  return data.views.filter((view:Partial<SavedView>)=>typeof view?.name==='string'&&typeof view.hash==='string'&&typeof view.savedAt==='string'&&decodeView(view.hash)).slice(0,50)}catch{return []}
}
function writeViews(views:SavedView[]){try{localStorage.setItem('atlas-saved-views',JSON.stringify({version:1,views}))}catch{notify('Saved views could not be stored in this browser.')}}
function renderViews(){
 const views=readViews();element('saved-views-empty').hidden=views.length>0;
 element('saved-views').innerHTML=views.map((view,i)=>`<li><span class="saved-view-name">${escapeHtml(view.name)}</span><span class="saved-view-when">${escapeHtml(new Date(view.savedAt).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'}))}</span><button class="button" data-open="${i}" aria-label="Open ${escapeHtml(view.name)}">Open</button><button class="button quiet icon-button" data-delete="${i}" aria-label="Delete ${escapeHtml(view.name)}">${icons.close}</button></li>`).join('');
}
function shareHash(){const hash=encodeView(atlas.viewState());if(!hash)notify('This view is beyond the range a link can carry.');return hash}
function saveView(){
 const hash=shareHash();if(!hash)return;
 const input=element<HTMLInputElement>('view-name'),name=(input.value.trim()||input.placeholder).slice(0,60);
 writeViews([{name,hash,savedAt:new Date().toISOString()},...readViews()].slice(0,50));input.value='';renderViews();notify(`Saved “${name}”`);
}
function renderFlightControls(){
 const active=atlas.flight,automatic=atlas.autoFly,open=flightControlsOpen||active||automatic;
 pressed('fly-button',open);pressed('orbit-button',!open);
 element('fly-button').setAttribute('aria-expanded',String(open));
 element('flight-controls').hidden=!open;element('crosshair').hidden=!active;
 element<HTMLInputElement>('speed').disabled=active;
 element('start-flight-button').hidden=active;element('auto-flight-button').hidden=active;
 pressed('auto-flight-button',automatic);text('auto-flight-button',automatic?'Stop auto fly':'Auto fly');
 text('flight-hint',automatic?'Moving forward at the selected speed. Adjust it anytime. Stop auto fly or Esc to pause.':active?'W A S D · Q / E · Shift to accelerate. Scroll to change speed. Esc to adjust settings.':'Set your speed, then start flying. Choose Orbit to close.');
 text('navigation-hint',automatic?'Auto fly · moving forward · Esc to pause':active?'W A S D to travel · Esc to adjust settings':'Drag to orbit · click a point to inspect');
}
function closeFlightControls(){flightControlsOpen=false;atlas.exitFlight();renderFlightControls()}
function showHomeFocus(){
 const view=atlas.homeView;pressed('home-galaxy-view',view==='galaxy');pressed('home-solar-view',view==='sun');
 text('home-view-hint',view==='galaxy'?'Zoom and orbit around the Galactic core.':view==='sun'?'Zoom and orbit around the Sun / Observer.':'Panned view · choose a focus above to recenter.');
}
function showHome(){
 element('home-inspector').hidden=!atlas.homeSelected||tourActive();if(!atlas.homeSelected)return;
 showHomeFocus();
 element('inspector').hidden=true;
 text('home-distance',formatDistance(milkyWayReference.observerDistanceMpc,units));
 text('home-height',formatDistance(milkyWayReference.solarHeightMpc,units));
 text('home-disk-scale',formatDistance(milkyWayReference.diskScaleMpc,units));
 text('home-bar-length',formatDistance(milkyWayReference.barHalfLengthMpc,units));
 element('home-display-note').hidden=element<HTMLSelectElement>('model-display').value!=='points';
}
function showSelection(galaxy:Galaxy|null){
 if(atlas.homeSelected){showHome();return}
 element('inspector').hidden=!galaxy||tourActive();if(!galaxy)return;
 const nearby=galaxy.nearby,uncertain=uncertainLocalPosition(galaxy);
 text('object-source',nearby?'Nearby galaxy':'Galaxy observation');
 element('nearby-provenance').hidden=!nearby;
 element('redshift-row').hidden=!!nearby;element('redshift-error-row').hidden=!!nearby;element('distance-inference-note').hidden=!!nearby;
 if(nearby){text('nearby-distance-method',nearby.method);text('nearby-distance-error',nearby.distanceError);element<HTMLAnchorElement>('nearby-distance-source').href=nearby.distanceSource}
 element('local-distance-warning').hidden=!uncertain;
 text('local-distance-warning',`Uncertain local position. This redshift does not establish a reliable nearby distance. ${atlas.showUncertainLocal?'Shown in amber':'Position hidden'}; no physical model is available.`);
 text('object-distance-caption',nearby?'Independent distance from observer':uncertain?'Unreliable redshift-only distance':'Comoving distance from observer');
 element<HTMLButtonElement>('focus-button').disabled=uncertain&&!atlas.showUncertainLocal;
 const detail=atlas.resolvedFor(galaxy.id);
 element('galaxy-profile').hidden=!detail;
 const name=galaxyName(galaxy);
 text('object-name',name??galaxy.targetId);text('object-kind',nearby?`Nearby catalog · ${nearby.aliases[0]}`:name?`DESI ${galaxy.targetId}`:'DESI target ID');
 if(detail){
  const model=detail.data.model,measured=model?.shapeMeasured!==false,portrait=galaxyPortrait(galaxy.targetId);
  text('profile-heading',nearby?(measured?'Adopted global shape':'Illustrative shape'):(measured?'Measured global shape':'Illustrative shape'));
  const typeLabel=model?.typeLabel??(detail.data.spiral?'Spiral · NGC 3982':'Lenticular · NGC 4026');
  text('profile-kind',portrait?`${portrait.label} · image-inspired · source: ${typeLabel}`:detail.data.cloud?`${cloudLabels[detail.data.cloud]} · illustrative · source: ${typeLabel}`:atlas.galaxyAppearance==='spiral'?`${galaxyVariant(galaxy.targetId).variant.label} · illustrative · source: ${typeLabel}`:typeLabel);
  element('profile-appearance').hidden=!portrait&&(!!detail.data.cloud||atlas.galaxyAppearance!=='spiral');
  text('profile-appearance',portrait?'Appearance guided by telescope images. Adopted size and sky ellipse are retained; feature placement, depth, colors and exposure remain illustrative. This is not a reconstructed 3D photograph.':'Spiral appearance: morphology, light profile and depth are illustrative. Adopted size and sky ellipse are retained. Colors vary illustratively, not from measured photometry. Source properties are described below.');
  const origin=model?.typeSource==='proxy'?'The visual type is an approximation; morphology is not classified. ':model?.sourceName?`Type from ${model.sourceName}. `:'';
  text('profile-description',nearby?nearby.shapeNote+(detail.data.cloud?' The stellar haze, knots, gas-like glow and dust are illustrative, not a measured gas map. Near side, depth and colors are assumed.':' Internal structure, near side, depth and colors remain illustrative.'):origin+(measured?'Size and projected ellipse follow the catalog. ':'No usable shape measurement: size is assumed (5 kpc half-light radius), with no measured orientation. ')+ 'Depth, near side, internal structure and colors are illustrative. Sizes are comoving.');
  element<HTMLAnchorElement>('profile-source').href=`https://www.legacysurvey.org/viewer?ra=${galaxy.ra}&dec=${galaxy.dec}&layer=ls-dr9&zoom=14`;
  text('profile-source','Compare telescope image ↗');
  if(nearby){element<HTMLAnchorElement>('profile-source').href=nearby.shapeSources[0];text('profile-source','Shape source ↗')}
  if(portrait){element<HTMLAnchorElement>('profile-source').href=portrait.source;text('profile-source','Compare reference image ↗')}
  text('profile-radius',`${measured?'':'Assumed · '}${formatDistance(detail.radius,units)}`);
  text('profile-angle',nearby&&!nearby.orientationMeasured||!nearby&&!measured?'Unknown':Math.hypot(detail.data.shape.e1,detail.data.shape.e2)<.00001?'Unconstrained':`${detail.frame.positionAngle.toFixed(2)}°`);
 }
 text('object-distance',formatDistance(galaxy.distance,units));
 element('lookback-row').hidden=uncertain;element('lookback-caption').hidden=uncertain;
 text('object-lookback',formatLookback(nearby?lightTravelGyr(galaxy.distance):lookbackForDistance(galaxy.distance)));
 text('lookback-caption',nearby?'Light travel time from the measured distance (distance ÷ c).':'Planck18 lookback time from the redshift-derived distance.');
 text('object-ra',`${galaxy.ra.toFixed(5)}°`);text('object-dec',`${galaxy.dec>=0?'+':''}${galaxy.dec.toFixed(5)}°`);
 text('object-z',galaxy.z===null?'Not used':galaxy.z<.0001?galaxy.z.toExponential(3):galaxy.z.toFixed(6));text('object-zerr',galaxy.zerr!==null&&Number.isFinite(galaxy.zerr)&&galaxy.zerr>=0?`± ${galaxy.zerr.toExponential(2)}`:'Not available');
}
function showMeasurement(galaxies:Galaxy[],enabled:boolean){
 element('measurement').hidden=!enabled;pressed('measure-button',enabled);
 text('measurement-value',galaxies.length===2?formatDistance(atlas.measurementDistance!,units):galaxies.length===1?'Select the second galaxy':'Select the first galaxy');
 text('measurement-hint',galaxies.some(galaxy=>uncertainLocalPosition(galaxy))?'Unreliable separation · includes an uncertain local redshift distance':galaxies.length===2?(galaxies.every(galaxy=>galaxy.nearby)?'Estimated local separation · distance errors not propagated':galaxies.some(galaxy=>galaxy.nearby)?'Estimated map separation · local and redshift distances':'Estimated comoving separation · click to start again'):galaxies.length===1?'Choose another point in the map':'Click any point in the map');
}
function renderCosmicContext(){
 const enabled=atlas.cosmicHorizon.enabled;
 element('cosmic-context').hidden=!enabled||!!atlas.selected||atlas.homeSelected||tourActive();
 text('cosmic-radius',`≈ ${formatDistance(CMB_RADIUS_MPC,units,3)}`);
 if(!atlas.manifest)return;
 const reach=catalogRadialReach(atlas.manifest.maxDistanceMpc);
 text('cosmic-reach',reach===null?'Unavailable':`${(reach*100).toFixed(0)}% of radius`);
 element('cosmic-reach-bar').style.width=`${Math.min(100,(reach??0)*100)}%`;
 text('cosmic-catalog-distance',`${formatDistance(atlas.manifest.maxDistanceMpc,units,3)} at its farthest. Uneven sky coverage; not a fraction of galaxies mapped.`);
}
/** The tour panel owns the right column while a tour runs; the inspectors and CMB card come back on exit. */
function renderTour(state:TourState){
 const active=state.status!=='idle'; // start() emits one idle state before travelling, so the runner is never dropped here
 element('tour-panel').hidden=!active;
 showSelection(atlas.selected);showHome();renderCosmicContext();
 atlas.setTourLabels(active&&state.stop?.id==='andromeda-companions'?['m32','m110']:[]);renderPlace();
 if(!active||!tour)return;
 const playing=state.autoplay&&state.status!=='finished';
 text('tour-progress',`Guided tour · ${state.index+1} / ${tour.tour.stops.length}`);text('tour-title',tour.tour.title);
 text('tour-stop-title',state.stop?.title??'');text('tour-cue',state.stop?.cue??'');text('tour-caption',state.stop?.caption??'');
 element('tour-panel').dataset.stopId=state.stop?.id??'';
 pressed('tour-play',playing);const action=playing?'Pause':state.status==='finished'?'Restart':'Continue';text('tour-play',action);element('tour-play').setAttribute('aria-label',`${action} the tour`);
 element<HTMLButtonElement>('tour-play').disabled=tour.pace==='manual';
 if(tour.pace==='manual'){text('tour-play','Manual');element('tour-play').setAttribute('aria-label','Manual pace: choose Previous or Next stop')}
 element<HTMLButtonElement>('tour-previous').disabled=state.index<=0;element<HTMLButtonElement>('tour-next').disabled=state.status==='finished';
 text('tour-status',state.status==='travelling'?'Travelling…':state.status==='dwelling'?'Arrived · continuing shortly':state.status==='finished'?'Finished · Exit returns to the map':pausedByInput?'Paused · drag or scroll moved the view':'Paused');
}
function enableTours(){if(atlasReady&&galaxySearch)document.querySelectorAll<HTMLButtonElement>('[data-tour]').forEach(button=>button.disabled=false)}
function renderPlace(){
 const context=tourActive()&&!pausedByInput?tour?.state.stop?.context:atlas.homeSelected?'Milky Way · reference model':atlas.selected?element('object-name').textContent:null;
 text('place-context',context||`${formatDistance(atlas.stats.focusFromObserver,units,2)} from observer`);
}
function renderStats(stats:AtlasStats){
 renderPlace();
 element('back-view-button').hidden=!viewHistory.available(atlas.viewState());
 renderCosmicContext();
 if(atlas.homeSelected)showHomeFocus();
 text('local-policy',atlas.showUncertainLocal?'Uncertain local positions · amber':'Uncertain local positions hidden');
 element('local-policy').classList.toggle('raw',atlas.showUncertainLocal);
 text('loaded-count',stats.loaded.toLocaleString());text('drawn-count',stats.drawn.toLocaleString());
 let state=stats.mode==='adaptive'?'Adaptive detail':'Full detail';
 if(stats.blocked)state+=' · memory limit reached';else if(stats.failed)state+=' · some data unavailable';else if(stats.pending)state+=` · loading ${stats.pending} chunks`;else if(stats.complete)state+=' · all detail in view';else if(!stats.drawn)state+=' · outside survey view';else if(stats.mode==='full')state+=' · loading detail';else state+=' · sampled positions';
 text('detail-status',state);element('retry-button').hidden=stats.failed===0&&!stats.blocked;
 const height=atlas.canvas.clientHeight||innerHeight,mpcPerPixel=2*stats.focusDistance*Math.tan(atlas.camera.fov*Math.PI/360)/height;
 const multiplier=units==='ly'?MLY_PER_MPC*1e6:1,value=niceScale(mpcPerPixel*140*multiplier)/multiplier;
 text('scale-label',formatDistance(value,units,2));element('scale-rule').style.width=`${Math.max(20,Math.min(160,value/mpcPerPixel))}px`;
 element('lookback-note').hidden=!stats.focusFromObserver;
 text('lookback-note',`Light from this depth left ≈ ${formatLookback(lookbackForDistance(stats.focusFromObserver))} ago`);
 text('survey-footprint-hint',atlas.surveyFootprint.state==='failed'?'Footprint data could not load. Toggle again to retry.':atlas.surveyFootprint.disclosure||FOOTPRINT_HINT);
 text('flight-speed',`${formatDistance(atlas.speed,units,2)} / sec`);element<HTMLInputElement>('speed').value=String(Math.log10(atlas.speed));
 if(diagnostics)element('diagnostics').innerHTML=`${stats.fps?stats.fps.toFixed(0):'—'} FPS · p95 ${stats.p95.toFixed(1)} ms<br>${stats.calls} draw calls · ${stats.models} close-up models · ${stats.managedMiB.toFixed(1)} MiB managed<br>${stats.budget.toLocaleString()} adaptive point budget`;
}
async function initialize(){
 try{
  atlas=new Explorer(element('viewport'));
  atlas.onMessage=notify;atlas.onHomeSelection=()=>showHome();atlas.onSelection=showSelection;atlas.onMeasure=showMeasurement;atlas.onStats=renderStats;
  let hashApplied=false,pendingSharedTour=decodeTourLink(location.hash),tourStartSerial=0;
  atlas.onReady=()=>{
   element('loading').hidden=true;renderStats(atlas.stats);atlasReady=true;enableTours();
   // Production reads the hash once (a deliberate departure from ignoring query parameters), then strips it so reloads and HMR do not reapply it.
   if(hashApplied)return;hashApplied=true;
   const state=decodeView(location.hash);if(location.hash)history.replaceState(null,'',location.pathname+location.search);
   if(state)void atlas.applyView(state,0);else startSharedTour();
  };
  atlas.onError=message=>{element('loading').hidden=false;text('loading-text',message)};
  atlas.onOrigin=(x,y,visible)=>{const label=element('origin-label');label.hidden=!visible;label.textContent=atlas.milkyWay.blend.value>.1?'SUN · OBSERVER':'OBSERVER';label.style.left=`${x+4}px`;label.style.top=`${y+8}px`};
  atlas.onHomeCenter=(x,y,visible)=>{const label=element('home-center-label');label.hidden=!visible;label.style.left=`${x+4}px`;label.style.top=`${y-22}px`};
  const tourLabels=Array.from({length:2},(_,i)=>{const label=document.createElement('div');label.id=`tour-label-${i}`;label.className='tour-object-label';label.hidden=true;label.setAttribute('aria-hidden','true');document.getElementById('app')!.append(label);return label});
  atlas.onTourLabels=labels=>tourLabels.forEach((element,i)=>{const label=labels[i];element.hidden=!label?.visible;if(label){element.textContent=label.name;element.style.left=`${label.x}px`;element.style.top=`${label.y}px`;element.dataset.side=i?'right':'left'}});
  atlas.onRings=labels=>{for(let i=0;i<8;i++){const label=element(`ring-label-${i}`),ring=labels[i];label.hidden=!ring?.visible;if(ring){label.children[0].textContent=`${formatLookback(ring.lookbackGyr)} ago`;label.children[1].textContent=` · ${formatDistance(ring.comovingMpc,units)} away now`;label.style.left=`${ring.x}px`;label.style.top=`${ring.y-5}px`}}};
  atlas.onFlight=active=>{if(active)flightControlsOpen=true;renderFlightControls()};
  atlas.onAutoFly=active=>{if(active)flightControlsOpen=true;renderFlightControls()};
  element('orbit-button').onclick=()=>closeFlightControls();
  element('fly-button').onclick=()=>{flightControlsOpen=true;renderFlightControls()};
  element('start-flight-button').onclick=()=>atlas.enterFlight();
  element('auto-flight-button').onclick=()=>atlas.setAutoFly(!atlas.autoFly);
  const applyCosmicHorizon=(enabled:boolean,persist=true)=>{atlas.setCosmicHorizon(enabled);pressed('cosmic-horizon-button',enabled);element<HTMLInputElement>('show-cosmic-horizon').checked=enabled;renderCosmicContext();if(persist)try{localStorage.setItem('atlas-cosmic-horizon',String(enabled))}catch{}};
  /** The saved choice wins: a tour shows the shell without persisting and calls this to put it back. */
  const restoreCosmicHorizon=()=>{let saved=false;try{saved=localStorage.getItem('atlas-cosmic-horizon')==='true'}catch{}applyCosmicHorizon(saved,false)};
  element('cosmic-horizon-button').onclick=()=>applyCosmicHorizon(!atlas.cosmicHorizon.enabled);
  element<HTMLInputElement>('show-cosmic-horizon').onchange=event=>applyCosmicHorizon((event.target as HTMLInputElement).checked);
  element('cosmic-scale-button').onclick=()=>{closeFlightControls();atlas.viewCosmicHorizon()};
  element('settings-cosmic-scale').onclick=()=>{element<HTMLDialogElement>('help-dialog').close();applyCosmicHorizon(true);closeFlightControls();atlas.viewCosmicHorizon()};
  restoreCosmicHorizon();
  const startTour=async(key:string,invitation=false)=>{
   const route=tours.find(route=>route.key===key);if(!route)return;
   const serial=++tourStartSerial;
   element<HTMLDialogElement>('tours-dialog').close();closeFlightControls();tour?.exit();pausedByInput=false;
   await galaxySearch.ready(); // catalog stops resolve by name through the loaded index; subsets leave it unmatched
   if(serial!==tourStartSerial||uiLifecycle.signal.aborted)return;
   tour=new Tour(atlas,route,{showCosmicHorizon:visible=>{if(visible)applyCosmicHorizon(true,false);else restoreCosmicHorizon()},resolveCatalog:name=>galaxySearch.find(name),onChange:renderTour,notify});
   tour.setPace(invitation?'quick':tourPace);tour.start();
  };
  const startSharedTour=()=>{if(!atlasReady||!galaxySearch||!pendingSharedTour)return;const key=pendingSharedTour;pendingSharedTour=null;void startTour(key,true)};
  window.addEventListener('hashchange',()=>{const key=decodeTourLink(location.hash);if(!key)return;pendingSharedTour=key;if(hashApplied){history.replaceState(null,'',location.pathname+location.search);startSharedTour()}},{signal:uiLifecycle.signal});
  // Input wins while a linked or manually chosen tour waits for catalog names.
  const cancelPendingTour=()=>{pendingSharedTour=null;tourStartSerial++};
  for(const type of ['pointerdown','wheel','keydown'])window.addEventListener(type,cancelPendingTour,{passive:true,signal:uiLifecycle.signal});
  element('tours-button').onclick=()=>{atlas.exitFlight();element<HTMLDialogElement>('tours-dialog').showModal()};
  element('tour-list').onclick=event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-tour]');if(button&&!button.disabled)void startTour(button.dataset.tour!)};
  const tourOptions=element<HTMLDialogElement>('tour-options-dialog');
  element('tour-progress').onclick=()=>{
   if(!tourActive())return;pausedByInput=false;tour!.pause();
   element<HTMLSelectElement>('tour-pace').value=tour!.pace;
   element('tour-chapter').innerHTML=tour!.tour.stops.map((stop,index)=>`<option value="${stop.id}">${index+1}. ${escapeHtml(stop.title)}</option>`).join('');
   element<HTMLSelectElement>('tour-chapter').value=tour!.state.stop?.id??'';
   tourOptions.showModal();
  };
  element<HTMLSelectElement>('tour-pace').onchange=event=>{tourPace=(event.target as HTMLSelectElement).value as TourPace;tour?.setPace(tourPace);if(tour)renderTour(tour.state)};
  element<HTMLSelectElement>('tour-chapter').onchange=event=>{const id=(event.target as HTMLSelectElement).value;tourOptions.close();pausedByInput=false;tour?.jump(id)};
  element('tour-explore').onclick=()=>tourOptions.close();
  element('tour-return').onclick=()=>{tourOptions.close();pausedByInput=false;tour?.returnToStop()};
  element('tour-exit').onclick=()=>{tourOptions.close();cancelPendingTour();tour?.exit()};
  element('tour-previous').onclick=()=>{pausedByInput=false;tour?.previous()};
  element('tour-next').onclick=()=>{pausedByInput=false;tour?.next()};
  element('tour-play').onclick=()=>{pausedByInput=false;if(tour?.state.autoplay&&tour.state.status!=='finished')tour.pause();else tour?.play()};
  const pauseTour=()=>{cancelPendingTour();if(tourActive()){pausedByInput=true;tour!.pause()}};
  // Record only deliberate destinations, before their handlers navigate. Tour
  // hops, orbit frames, options and inspector selection are not history entries.
  const historyControls=new Set(['observer-button','home-galaxy-view','home-solar-view','observed-view-button','focus-button','reset-button','cosmic-scale-button','settings-cosmic-scale']);
  document.addEventListener('click',event=>{
   const target=event.target instanceof Element?event.target:null,button=target?.closest<HTMLButtonElement>('button');
   if(button?.disabled)return;
   if(button&&(historyControls.has(button.id)||button.hasAttribute('data-open')||button.hasAttribute('data-tour'))||target?.closest('#galaxy-results [role="option"]'))viewHistory.remember(atlas.viewState());
  },{capture:true,signal:uiLifecycle.signal});
  window.addEventListener('keydown',event=>{
   if(event.metaKey||event.ctrlKey)return;
   const visit=event.key==='Enter'&&(event.target as Element)?.id==='galaxy-query'&&document.querySelector('#galaxy-results [aria-selected="true"]');
   const navigation=['KeyR','KeyF'].includes(event.code)&&!document.querySelector('dialog[open]')&&!(event.target instanceof Element&&event.target.matches('input,select,textarea'));
   if(visit||navigation)viewHistory.remember(atlas.viewState());
  },{capture:true,signal:uiLifecycle.signal});
  element('back-view-button').onclick=()=>{pauseTour();const previous=viewHistory.back(atlas.viewState());if(previous)void atlas.applyView(previous,1.5,{preserveTarget:true});renderStats(atlas.stats)};
  // Orbit input pauses a dwell at once (the runner's pose check at hop time is the backstop); other navigation controls pause before they move the camera.
  // ponytail: explicit id list; a future navigation button must be added here or the hop-time pose check is the only pause
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelPendingTour();if(tourActive()){pausedByInput=false;tour!.pause();notify('Tour paused while the tab was hidden. Choose Continue when ready.')}}},{signal:uiLifecycle.signal});
  atlas.controls.addEventListener('start',pauseTour);
  for(const id of ['orbit-button','fly-button','start-flight-button','auto-flight-button','visit-galaxy-button','observer-button','home-galaxy-view','home-solar-view','observed-view-button','focus-button','reset-button','share-button','cosmic-scale-button','settings-cosmic-scale'])element(id).addEventListener('click',pauseTour,{capture:true,signal:uiLifecycle.signal});
  // Capture phase so the explorer's own Escape (auto fly) is judged on the state before it runs; open dialogs and flight keep Escape for themselves.
  window.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&tourActive()&&!atlas.autoFly&&!atlas.flight&&!document.querySelector('dialog[open]'))tour!.exit();
   // The explorer's own R (overview) and F (focus) shortcuts move the camera: pause first, like the buttons.
   if(tourActive()&&(event.code==='KeyR'||event.code==='KeyF')&&!event.metaKey&&!event.ctrlKey&&!document.querySelector('dialog[open]')&&!(event.target instanceof Element&&event.target.matches('input,select,textarea')))pauseTour();
  },{capture:true,signal:uiLifecycle.signal});
  const applyLookbackRings=(enabled:boolean)=>{atlas.setLookbackRings(enabled);element<HTMLInputElement>('show-lookback-rings').checked=enabled;try{localStorage.setItem('atlas-lookback-rings',String(enabled))}catch{}};
  element<HTMLInputElement>('show-lookback-rings').onchange=event=>applyLookbackRings((event.target as HTMLInputElement).checked);
  try{applyLookbackRings(localStorage.getItem('atlas-lookback-rings')==='true')}catch{}
  const applySurveyFootprint=(enabled:boolean)=>{atlas.setSurveyFootprint(enabled);element<HTMLInputElement>('show-survey-footprint').checked=enabled;try{localStorage.setItem('atlas-survey-footprint',String(enabled))}catch{}};
  element<HTMLInputElement>('show-survey-footprint').onchange=event=>applySurveyFootprint((event.target as HTMLInputElement).checked);
  try{applySurveyFootprint(localStorage.getItem('atlas-survey-footprint')==='true')}catch{}
  element('reset-button').onclick=()=>{closeFlightControls();atlas.reset()};
  element('visit-galaxy-button').onclick=()=>{closeFlightControls();galaxySearch.open()};
  element('observed-view-button').onclick=()=>{closeFlightControls();atlas.visitGalaxy(atlas.selected?.id)};
  element('observer-button').onclick=()=>{closeFlightControls();atlas.visitMilkyWay()};
  element('home-galaxy-view').onclick=()=>{closeFlightControls();atlas.visitMilkyWay()};
  element('home-solar-view').onclick=()=>{closeFlightControls();atlas.focusObserver()};
  element('close-home').onclick=()=>atlas.clearHomeSelection();
  element('measure-button').onclick=()=>atlas.setMeasuring(!atlas.measuring);element('close-measure').onclick=()=>atlas.setMeasuring(false);
  element('focus-button').onclick=()=>{closeFlightControls();atlas.focusSelected()};element('close-inspector').onclick=()=>atlas.clearSelection();
  element('copy-button').onclick=()=>{if(atlas.selected)void navigator.clipboard.writeText(atlas.selected.targetId).then(()=>notify(atlas.selected?.nearby?'Nearby catalog ID copied':'DESI target ID copied')).catch(()=>notify('Copy was unavailable. The full ID is shown above.'))};
  for(const mode of ['adaptive','full'] as const)element(`${mode}-button`).onclick=()=>{atlas.setMode(mode);pressed('adaptive-button',mode==='adaptive');pressed('full-button',mode==='full');renderStats(atlas.stats)};
  element('retry-button').onclick=()=>atlas.retry();
  element<HTMLSelectElement>('galaxy-appearance').onchange=event=>{const value=(event.target as HTMLSelectElement).value as GalaxyAppearance;atlas.setGalaxyAppearance(value);try{localStorage.setItem('atlas-galaxy-appearance',value)}catch{}};
  try{const value=localStorage.getItem('atlas-galaxy-appearance');if(value==='catalog'||value==='spiral'){element<HTMLSelectElement>('galaxy-appearance').value=value;atlas.setGalaxyAppearance(value)}}catch{}
  const applyModelDisplay=(value:ModelDisplay)=>{
   atlas.setModelDisplay(value);element<HTMLSelectElement>('model-display').value=value;showHome();
   text('model-display-hint',value==='points'?'All galaxies stay as points, including the selection. Positions and distances are unchanged.':value==='focused'?'Only the galaxy opened with Visit or Focus uses a model. Other galaxies remain points.':'Nearby galaxies resolve automatically. Models that fill the view fade back to points; use Visit or Focus to explore one fully.');
  };
  element<HTMLSelectElement>('model-display').onchange=event=>{const value=(event.target as HTMLSelectElement).value as ModelDisplay;applyModelDisplay(value);try{localStorage.setItem('atlas-model-display',value)}catch{}};
  try{const value=localStorage.getItem('atlas-model-display');if(value==='automatic'||value==='focused'||value==='points')applyModelDisplay(value)}catch{}
  element<HTMLInputElement>('show-uncertain-local').onchange=event=>{const show=(event.target as HTMLInputElement).checked;atlas.setShowUncertainLocal(show);renderStats(atlas.stats);try{localStorage.setItem('atlas-show-uncertain-local',String(show))}catch{}};
  try{const show=localStorage.getItem('atlas-show-uncertain-local')==='true';element<HTMLInputElement>('show-uncertain-local').checked=show;atlas.setShowUncertainLocal(show)}catch{}
  element<HTMLInputElement>('enlarge-points').onchange=event=>{const enabled=(event.target as HTMLInputElement).checked;atlas.setEnlargePoints(enabled);try{localStorage.setItem('atlas-enlarge-points',String(enabled))}catch{}};
  try{const enabled=localStorage.getItem('atlas-enlarge-points')==='true';element<HTMLInputElement>('enlarge-points').checked=enabled;atlas.setEnlargePoints(enabled)}catch{}
  element<HTMLInputElement>('depth-cues').onchange=event=>{const enabled=(event.target as HTMLInputElement).checked;atlas.setDepthCues(enabled);element<HTMLInputElement>('minimum-opacity').disabled=!enabled};
  element<HTMLInputElement>('minimum-opacity').oninput=event=>{const value=Number((event.target as HTMLInputElement).value);atlas.setMinimumOpacity(value/100);text('opacity-value',`${value}%`);try{localStorage.setItem('atlas-minimum-opacity',String(value))}catch{}};
  try{const stored=localStorage.getItem('atlas-minimum-opacity'),value=stored?.trim()?Number(stored):NaN;if(Number.isFinite(value)&&value>=0&&value<=100){element<HTMLInputElement>('minimum-opacity').value=String(value);atlas.setMinimumOpacity(value/100);text('opacity-value',`${value}%`)}}catch{}
  element<HTMLSelectElement>('units').onchange=event=>{units=(event.target as HTMLSelectElement).value as Units;atlas.units=units;showSelection(atlas.selected);showMeasurement(atlas.measurement,atlas.measuring);renderStats(atlas.stats)};
  element<HTMLInputElement>('speed').oninput=event=>{atlas.speed=10**Number((event.target as HTMLInputElement).value);renderStats(atlas.stats)};
  for(const name of ['data','help'])element(`${name}-button`).onclick=()=>{atlas.exitFlight();element<HTMLDialogElement>(`${name}-dialog`).showModal()};
  element('share-button').onclick=()=>{
   atlas.exitFlight();element('share-link').hidden=true;renderViews();
   element<HTMLInputElement>('view-name').placeholder=`${atlas.homeSelected?'Milky Way':atlas.selected?galaxyName(atlas.selected)??atlas.selected.targetId:'Overview'} · ${new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}`;
   element<HTMLDialogElement>('share-dialog').showModal();
  };
  const copyShareLink=(hash:string,message:string)=>{
   const link=`${location.origin}${location.pathname}${hash}`,fallback=element<HTMLInputElement>('share-link');
   Promise.resolve().then(()=>navigator.clipboard.writeText(link)).then(()=>{fallback.hidden=true;notify(message)}).catch(()=>{fallback.hidden=false;fallback.value=link;fallback.select();notify('Copy was unavailable. The link is shown below.')});
  };
  element('copy-link-button').onclick=()=>{const hash=shareHash();if(hash)copyShareLink(hash,'View link copied')};
  element('copy-road-trip-button').onclick=()=>copyShareLink(ROAD_TRIP_HASH,'Cosmic road trip link copied');
  element('save-view-button').onclick=saveView;
  element<HTMLInputElement>('view-name').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();saveView()}};
  element('saved-views').onclick=event=>{
   const button=(event.target as HTMLElement).closest<HTMLElement>('[data-open],[data-delete]');if(!button)return;
   const views=readViews();
   if(button.dataset.delete!==undefined){views.splice(Number(button.dataset.delete),1);writeViews(views);renderViews();return}
   const state=decodeView(views[Number(button.dataset.open)]?.hash??'');if(!state)return;
   element<HTMLDialogElement>('share-dialog').close();closeFlightControls();void atlas.applyView(state,1.5);
  };
  document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(button=>button.onclick=()=>button.closest('dialog')!.close());
  document.querySelectorAll<HTMLDialogElement>('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close()}}));
  window.addEventListener('keydown',event=>{if(event.code==='F8'){event.preventDefault();diagnostics=!diagnostics;element('diagnostics').hidden=!diagnostics;renderStats(atlas.stats)}},{signal:uiLifecycle.signal});
  const response=await fetch('/data/catalog.json');if(!response.ok)throw new Error('The catalog index could not be opened.');
  const catalog=await response.json(),dataset=import.meta.env.DEV?new URLSearchParams(location.search).get('dataset'):null;
  const path=dataset&&/^[a-z0-9-]+$/.test(dataset)?`/data/${dataset}/manifest.json`:catalog.manifest;
  await atlas.load(path);
  galaxySearch=new GalaxySearch(atlas,uiLifecycle.signal,()=>showSelection(atlas.selected));
  element('visit-galaxy-button').hidden=false;enableTours();startSharedTour();
  text('galaxy-count',atlas.manifest.count.toLocaleString());text('dataset-caption',atlas.manifest.subset?'DESI DR1 · DEVELOPMENT SUBSET':'DESI · DATA RELEASE 1');
  text('data-summary',`This atlas contains ${atlas.manifest.count.toLocaleString()} accepted galaxy observations from the DESI DR1 primary redshift catalog.`);
  text('sample-disclosure',atlas.manifest.subset?`${atlas.manifest.subset}. Full detail refers to this included subset, not every galaxy in the release.`:'The full catalog passing the documented filters is available for progressive loading. DESI itself covers only part of the sky and does not include every galaxy.');
  registerAgentTools();
  if(import.meta.env.DEV&&(new URLSearchParams(location.search).has('benchmark')||new URLSearchParams(location.search).has('selftest')||new URLSearchParams(location.search).has('detailtest')||new URLSearchParams(location.search).has('modeltest')||new URLSearchParams(location.search).has('uxtest')||new URLSearchParams(location.search).has('hometest')||new URLSearchParams(location.search).has('nearbytest')||new URLSearchParams(location.search).has('continuitytest')||new URLSearchParams(location.search).has('colortest')||new URLSearchParams(location.search).has('varianttest')||new URLSearchParams(location.search).has('cloudtest')||new URLSearchParams(location.search).has('portraittest')||new URLSearchParams(location.search).has('cosmictest')||new URLSearchParams(location.search).has('lookbacktest')||new URLSearchParams(location.search).has('footprinttest')||new URLSearchParams(location.search).has('sharetest')||new URLSearchParams(location.search).has('tourtest'))){const {runDiagnostics}=await import('./diagnostics');void runDiagnostics(atlas,element('app'))}
 }catch(error){if(uiLifecycle.signal.aborted)return;element('loading').hidden=false;element('loading').innerHTML='<div id="load-error"></div><div class="error-actions"><button class="button" id="reload-button">Retry opening atlas</button></div>';text('load-error',error instanceof Error?error.message:'This browser could not open the 3D map.');element('reload-button').onclick=()=>location.reload()}
}
function registerAgentTools(){
 type Tool={name:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean};execute:(input:unknown)=>unknown};
 const context=(document as Document&{modelContext?:{registerTool:(tool:Tool,options:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;if(!context)return;
 const lifecycle=new AbortController();addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
 uiLifecycle.signal.addEventListener('abort',()=>lifecycle.abort(),{once:true});
 const tools:Tool[]=[
  {name:'read_atlas_view',description:'Read the current galaxy catalog, render detail, and selected galaxy.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({catalog:atlas.manifest.id,galaxies:atlas.manifest.count,subset:atlas.manifest.subset,detail:atlas.mode,autoFly:atlas.autoFly,cosmicHorizon:atlas.cosmicHorizon.enabled,lookbackRings:atlas.lookbackRings.enabled,surveyFootprint:atlas.surveyFootprint.enabled,nearbyGalaxies:atlas.nearbyGalaxies.length,showUncertainLocal:atlas.showUncertainLocal,selected:atlas.selected,measurementMpc:atlas.measurementDistance,link:encodeView(atlas.viewState()),tour:tourActive()?{key:tour!.tour.key,index:tour!.state.index,status:tour!.state.status}:null})},
  {name:'set_atlas_detail',description:'Switch the visible atlas between adaptive and full point detail.',inputSchema:{type:'object',properties:{mode:{type:'string',enum:['adaptive','full']}},required:['mode'],additionalProperties:false},annotations:{readOnlyHint:false},execute:(input)=>{const mode=(input as {mode?:string})?.mode;if(mode!=='adaptive'&&mode!=='full')throw new Error('mode must be adaptive or full');element(`${mode}-button`).click();return {mode:atlas.mode,loading:atlas.stats.pending>0}}},
  {name:'reset_atlas_view',description:'Return the visible camera to the complete survey overview.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false},execute:()=>{atlas.reset();return {view:'overview'}}},
 ];
 for(const tool of tools){try{void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{})}catch{/* Optional browser capability. */}}
}
void initialize();
if(import.meta.hot)import.meta.hot.dispose(()=>{uiLifecycle.abort();clearTimeout(toastTimer);atlas?.dispose()});
