import './style.css';
import { Explorer, type AtlasStats } from './explorer';
import { formatDistance, niceScale, MLY_PER_MPC, type Units } from './format';
import type { Galaxy } from './types';

const icon=(body:string)=>`<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const icons={
 orbit:icon('<circle cx="12" cy="12" r="7"/><ellipse cx="12" cy="12" rx="4" ry="11" transform="rotate(45 12 12)"/>'),
 fly:icon('<path d="M21 3L3 10l7 4 4 7 7-18zM10 14L21 3"/>'),
 measure:icon('<path d="M4 17L17 4l4 4L8 21zM8 13l3 3m1-7l3 3m1-7l3 3"/>'),
 reset:icon('<path d="M4 9a8 8 0 111 9M4 4v5h5"/>'),
 info:icon('<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>'),
 help:icon('<circle cx="12" cy="12" r="9"/><path d="M9.5 8.5a2.5 2.5 0 015 0c0 2-2.5 2-2.5 4m0 3v.2"/>'),
 close:icon('<path d="M6 6l12 12M18 6L6 18"/>'),
 focus:icon('<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/><circle cx="12" cy="12" r="3"/>'),
 copy:icon('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>'),
};
document.querySelector('#app')!.innerHTML=`
<div id="viewport" aria-label="Three-dimensional galaxy map"></div>
<header class="topbar"><div class="brand"><div class="brand-mark">${icons.orbit}</div><div><div class="brand-name">Cosmic Atlas</div><div class="brand-sub">THE MEASURED UNIVERSE</div></div></div><div class="top-actions"><button class="button quiet" id="data-button">${icons.info}<span>About the data</span></button><button class="button icon-button quiet" id="help-button" aria-label="Navigation help">${icons.help}</button></div></header>
<nav class="rail" aria-label="Map tools"><button id="orbit-button" class="button active" aria-pressed="true" title="Orbit the map">${icons.orbit}<span>Orbit</span></button><button id="fly-button" class="button" aria-pressed="false" title="Fly through the map">${icons.fly}<span>Fly</span></button><div class="rail-rule"></div><button id="measure-button" class="button" aria-pressed="false" title="Measure between two galaxies">${icons.measure}<span>Measure</span></button><button id="reset-button" class="button" title="Return to overview (R)">${icons.reset}<span>Overview</span></button></nav>
<div class="flight-controls" id="flight-controls" hidden><label for="speed">Travel speed</label><input id="speed" type="range" min="-2" max="4" step=".1" value="3"/><div class="flight-speed" id="flight-speed"></div><p class="fineprint">W A S D · Q / E<br>Shift to accelerate<br>Esc to release pointer</p></div>
<div class="crosshair" id="crosshair" hidden></div><div class="origin-label" id="origin-label" hidden>OBSERVER</div>
<aside class="inspector" id="inspector" aria-label="Selected galaxy" hidden><div class="panel-top"><div class="eyebrow">Galaxy observation</div><button class="button quiet icon-button" id="close-inspector" aria-label="Close galaxy details">${icons.close}</button></div><h2 class="object-name" id="object-name"></h2><div class="object-kind">DESI target ID</div><div class="distance-value" id="object-distance"></div><div class="distance-caption">Comoving distance from observer</div><dl><div><dt>Right ascension</dt><dd id="object-ra"></dd></div><div><dt>Declination</dt><dd id="object-dec"></dd></div><div><dt>Redshift</dt><dd id="object-z"></dd></div><div><dt>Redshift fit error</dt><dd id="object-zerr"></dd></div></dl><div class="panel-actions"><button class="button" id="focus-button">${icons.focus}Focus</button><button class="button" id="copy-button">${icons.copy}Copy ID</button></div><p class="fineprint">Distance inferred using Planck18. Fit error excludes velocity and cosmology uncertainties.</p></aside>
<div class="measurement" id="measurement" hidden><button class="button quiet close-measure" id="close-measure" aria-label="Close measurement">${icons.close}</button><div class="eyebrow">Distance between galaxies</div><div class="measurement-value" id="measurement-value">Select the first galaxy</div><div class="measurement-hint" id="measurement-hint">Click any point in the map</div></div>
<footer class="footer"><div><div class="count-label">Galaxies in this atlas</div><div class="count-value" id="galaxy-count">—</div><div class="count-caption" id="dataset-caption">DESI · DATA RELEASE 1</div><div class="count-meta"><span><strong id="loaded-count">—</strong> loaded</span><span><strong id="drawn-count">—</strong> drawn</span></div></div><div class="footer-right"><div class="mode-switch" role="group" aria-label="Rendering detail"><button id="adaptive-button" class="active" aria-pressed="true">Adaptive</button><button id="full-button" aria-pressed="false">Full detail</button></div><div class="scale"><div class="legend-row"><select id="units" aria-label="Distance units"><option value="ly">Light-years</option><option value="Mpc">Megaparsecs</option></select><div class="scale-label" id="scale-label">—</div></div><div class="scale-rule" id="scale-rule"></div><div class="scale-note">At focus depth · comoving distance</div></div></div></footer>
<div class="status" id="status"><strong id="detail-status">Opening the catalog</strong><br><span id="navigation-hint">Drag to orbit · click a point to inspect</span><br><button class="button quiet" id="retry-button" hidden>Retry missing detail</button></div>
<div class="loading" id="loading"><div class="orbit"></div><span id="loading-text">Opening the cosmic web</span></div><div class="toast" id="toast" role="status" hidden></div><div class="diagnostics" id="diagnostics" hidden></div>
<dialog class="dialog" id="data-dialog"><div class="eyebrow">DESI · Data release 1</div><div class="dialog-title"><h2>A measured, incomplete universe.</h2><button class="button quiet icon-button" data-close aria-label="Close data information">${icons.close}</button></div><p id="data-summary">Loading catalog information.</p><p id="sample-disclosure"></p><h3>Positions, with perspective</h3><p>The map preserves linear comoving distances, inferred from measured redshifts using Planck18 cosmology. These observations span different lookback times; they are not a simultaneous picture of the universe today. Local galaxy motions and measurement uncertainty affect inferred distances.</p><h3>What the points tell you</h3><p>Each point marks a catalog galaxy. Its screen size and brightness help you see it; they do not represent its physical size or luminosity. Unobserved regions and survey selection effects are not confirmed cosmic voids.</p><h3>Detail and completeness</h3><p>Adaptive mode draws a disclosed selection of real positions and reveals more as you approach. Full detail draws all accepted galaxies in view once loading completes. It may run slower. The drawn count records points submitted for rendering; some overlap or lie outside the viewport within a spatial chunk.</p><p>Only primary galaxy records with no redshift warning, valid sky coordinates, and positive redshift enter this atlas. These cuts do not guarantee every redshift is correct.</p><p><a href="https://data.desi.lbl.gov/doc/releases/dr1/" target="_blank" rel="noopener">DESI release documentation ↗</a><br><a href="https://docs.astropy.org/en/stable/api/astropy.cosmology.realizations.Planck18.html" target="_blank" rel="noopener">Planck18 distance model ↗</a><br><a href="/acknowledgments.txt" target="_blank" rel="noopener">Data attribution and processing notes ↗</a></p></dialog>
<dialog class="dialog" id="help-dialog"><div class="eyebrow">Navigation</div><div class="dialog-title"><h2>Find your perspective.</h2><button class="button quiet icon-button" data-close aria-label="Close navigation help">${icons.close}</button></div><div class="help-grid"><span>Orbit around the focus</span><kbd>Drag</kbd><span>Pan the focus</span><kbd>Right-drag / two-finger drag</kbd><span>Move closer or farther</span><kbd>Scroll / pinch</kbd><span>Inspect a galaxy</span><kbd>Click a point</kbd><span>Focus on the selection</span><kbd>F</kbd><span>Return to the overview</span><kbd>R</kbd><span>Fly forward / sideways</span><kbd>W A S D</kbd><span>Fly down / up</span><kbd>Q / E</kbd><span>Accelerate in flight</span><kbd>Shift</kbd><span>Change flight speed</span><kbd>Scroll</kbd><span>Leave flight</span><kbd>Esc</kbd><span>Show performance readout</span><kbd>F8</kbd></div><p>Choose Measure, then click two galaxies to compare their estimated comoving separation. To inspect during flight, press Escape first.</p><p class="mobile-message">This first version is designed for a desktop mouse and keyboard.</p></dialog>`;

const element=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const text=(id:string,value:string)=>element(id).textContent=value;
let atlas:Explorer,units:Units='ly',diagnostics=false;
const uiLifecycle=new AbortController();
let toastTimer:ReturnType<typeof setTimeout>;
function notify(message:string){text('toast',message);element('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>element('toast').hidden=true,4000)}
function pressed(id:string,value:boolean){element(id).classList.toggle('active',value);element(id).setAttribute('aria-pressed',String(value))}
function showSelection(galaxy:Galaxy|null){
 element('inspector').hidden=!galaxy;if(!galaxy)return;
 text('object-name',galaxy.targetId);text('object-distance',formatDistance(galaxy.distance,units));
 text('object-ra',`${galaxy.ra.toFixed(5)}°`);text('object-dec',`${galaxy.dec>=0?'+':''}${galaxy.dec.toFixed(5)}°`);
 text('object-z',galaxy.z.toFixed(6));text('object-zerr',Number.isFinite(galaxy.zerr)&&galaxy.zerr>=0?`± ${galaxy.zerr.toExponential(2)}`:'Not available');
}
function showMeasurement(galaxies:Galaxy[],enabled:boolean){
 element('measurement').hidden=!enabled;pressed('measure-button',enabled);
 text('measurement-value',galaxies.length===2?formatDistance(atlas.measurementDistance!,units):galaxies.length===1?'Select the second galaxy':'Select the first galaxy');
 text('measurement-hint',galaxies.length===2?'Estimated comoving separation · click to start again':galaxies.length===1?'Choose another point in the map':'Click any point in the map');
}
function renderStats(stats:AtlasStats){
 text('loaded-count',stats.loaded.toLocaleString());text('drawn-count',stats.drawn.toLocaleString());
 let state=stats.mode==='adaptive'?'Adaptive detail':'Full detail';
 if(stats.blocked)state+=' · memory limit reached';else if(stats.failed)state+=' · some data unavailable';else if(stats.pending)state+=` · loading ${stats.pending} chunks`;else if(stats.complete)state+=' · all detail in view';else if(!stats.drawn)state+=' · outside survey view';else if(stats.mode==='full')state+=' · loading detail';else state+=' · sampled positions';
 text('detail-status',state);element('retry-button').hidden=stats.failed===0&&!stats.blocked;
 const height=atlas.canvas.clientHeight||innerHeight,mpcPerPixel=2*stats.focusDistance*Math.tan(atlas.camera.fov*Math.PI/360)/height;
 const multiplier=units==='ly'?MLY_PER_MPC*1e6:1,value=niceScale(mpcPerPixel*140*multiplier)/multiplier;
 text('scale-label',formatDistance(value,units,2));element('scale-rule').style.width=`${Math.max(20,Math.min(160,value/mpcPerPixel))}px`;
 text('flight-speed',`${formatDistance(atlas.speed,units,2)} / sec`);element<HTMLInputElement>('speed').value=String(Math.log10(atlas.speed));
 if(diagnostics)element('diagnostics').innerHTML=`${stats.fps?stats.fps.toFixed(0):'—'} FPS · p95 ${stats.p95.toFixed(1)} ms<br>${stats.calls} draw calls · ${stats.managedMiB.toFixed(1)} MiB managed<br>${stats.budget.toLocaleString()} adaptive point budget`;
}
async function initialize(){
 try{
  atlas=new Explorer(element('viewport'));
  atlas.onMessage=notify;atlas.onSelection=showSelection;atlas.onMeasure=showMeasurement;atlas.onStats=renderStats;
  atlas.onReady=()=>{element('loading').hidden=true;renderStats(atlas.stats)};
  atlas.onError=message=>{element('loading').hidden=false;text('loading-text',message)};
  atlas.onOrigin=(x,y,visible)=>{const label=element('origin-label');label.hidden=!visible;label.style.left=`${x+4}px`;label.style.top=`${y+8}px`};
  atlas.onFlight=active=>{pressed('fly-button',active);pressed('orbit-button',!active);element('flight-controls').hidden=!active;element('crosshair').hidden=!active;text('navigation-hint',active?'W A S D to travel · Esc to release pointer':'Drag to orbit · click a point to inspect')};
  element('orbit-button').onclick=()=>atlas.exitFlight();element('fly-button').onclick=()=>atlas.enterFlight();element('reset-button').onclick=()=>atlas.reset();
  element('measure-button').onclick=()=>atlas.setMeasuring(!atlas.measuring);element('close-measure').onclick=()=>atlas.setMeasuring(false);
  element('focus-button').onclick=()=>atlas.focusSelected();element('close-inspector').onclick=()=>atlas.clearSelection();
  element('copy-button').onclick=()=>{if(atlas.selected)void navigator.clipboard.writeText(atlas.selected.targetId).then(()=>notify('DESI target ID copied')).catch(()=>notify('Copy was unavailable. The full ID is shown above.'))};
  for(const mode of ['adaptive','full'] as const)element(`${mode}-button`).onclick=()=>{atlas.setMode(mode);pressed('adaptive-button',mode==='adaptive');pressed('full-button',mode==='full');renderStats(atlas.stats)};
  element('retry-button').onclick=()=>atlas.retry();
  element<HTMLSelectElement>('units').onchange=event=>{units=(event.target as HTMLSelectElement).value as Units;atlas.units=units;showSelection(atlas.selected);showMeasurement(atlas.measurement,atlas.measuring);renderStats(atlas.stats)};
  element<HTMLInputElement>('speed').oninput=event=>{atlas.speed=10**Number((event.target as HTMLInputElement).value);renderStats(atlas.stats)};
  for(const name of ['data','help'])element(`${name}-button`).onclick=()=>{atlas.exitFlight();element<HTMLDialogElement>(`${name}-dialog`).showModal()};
  document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(button=>button.onclick=()=>button.closest('dialog')!.close());
  document.querySelectorAll<HTMLDialogElement>('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close()}}));
  window.addEventListener('keydown',event=>{if(event.code==='F8'){event.preventDefault();diagnostics=!diagnostics;element('diagnostics').hidden=!diagnostics;renderStats(atlas.stats)}},{signal:uiLifecycle.signal});
  const response=await fetch('/data/catalog.json');if(!response.ok)throw new Error('The catalog index could not be opened.');
  const catalog=await response.json(),dataset=new URLSearchParams(location.search).get('dataset');
  const path=dataset&&/^[a-z0-9-]+$/.test(dataset)?`/data/${dataset}/manifest.json`:catalog.manifest;
  await atlas.load(path);
  text('galaxy-count',atlas.manifest.count.toLocaleString());text('dataset-caption',atlas.manifest.subset?'DESI DR1 · DEVELOPMENT SUBSET':'DESI · DATA RELEASE 1');
  text('data-summary',`This atlas contains ${atlas.manifest.count.toLocaleString()} accepted galaxy observations from the DESI DR1 primary redshift catalog.`);
  text('sample-disclosure',atlas.manifest.subset?`${atlas.manifest.subset}. Full detail refers to this included subset, not every galaxy in the release.`:'The full catalog passing the documented filters is available for progressive loading. DESI itself covers only part of the sky and does not include every galaxy.');
  registerAgentTools();
  if(import.meta.env.DEV&&(new URLSearchParams(location.search).has('benchmark')||new URLSearchParams(location.search).has('selftest'))){const {runDiagnostics}=await import('./diagnostics');void runDiagnostics(atlas,element('app'))}
 }catch(error){if(uiLifecycle.signal.aborted)return;element('loading').hidden=false;element('loading').innerHTML='<div id="load-error"></div><div class="error-actions"><button class="button" id="reload-button">Retry opening atlas</button></div>';text('load-error',error instanceof Error?error.message:'This browser could not open the 3D map.');element('reload-button').onclick=()=>location.reload()}
}
function registerAgentTools(){
 type Tool={name:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean};execute:(input:unknown)=>unknown};
 const context=(document as Document&{modelContext?:{registerTool:(tool:Tool,options:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;if(!context)return;
 const lifecycle=new AbortController();addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
 uiLifecycle.signal.addEventListener('abort',()=>lifecycle.abort(),{once:true});
 const tools:Tool[]=[
  {name:'read_atlas_view',description:'Read the current galaxy catalog, render detail, and selected galaxy.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({catalog:atlas.manifest.id,galaxies:atlas.manifest.count,subset:atlas.manifest.subset,detail:atlas.mode,selected:atlas.selected,measurementMpc:atlas.measurementDistance})},
  {name:'set_atlas_detail',description:'Switch the visible atlas between adaptive and full point detail.',inputSchema:{type:'object',properties:{mode:{type:'string',enum:['adaptive','full']}},required:['mode'],additionalProperties:false},annotations:{readOnlyHint:false},execute:(input)=>{const mode=(input as {mode?:string})?.mode;if(mode!=='adaptive'&&mode!=='full')throw new Error('mode must be adaptive or full');element(`${mode}-button`).click();return {mode:atlas.mode,loading:atlas.stats.pending>0}}},
  {name:'reset_atlas_view',description:'Return the visible camera to the complete survey overview.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false},execute:()=>{atlas.reset();return {view:'overview'}}},
 ];
 for(const tool of tools){try{void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{})}catch{/* Optional browser capability. */}}
}
void initialize();
if(import.meta.hot)import.meta.hot.dispose(()=>{uiLifecycle.abort();clearTimeout(toastTimer);atlas?.dispose()});
