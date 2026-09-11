import type { Explorer } from './explorer';
/** Development-only acceptance runner, using the actual browser's GPU. */
export async function runDiagnostics(atlas:Explorer,parent:HTMLElement){
 const panel=document.createElement('pre');panel.id='acceptance-results';panel.style.cssText='position:absolute;left:190px;top:110px;max-height:65vh;max-width:70vw;overflow:auto;background:#08131ff2;border:1px solid #3c6177;border-radius:8px;padding:18px;font:12px/1.6 monospace;white-space:pre-wrap;z-index:20;pointer-events:none';parent.append(panel);
 const query=new URLSearchParams(location.search);
 const report:Record<string,unknown>={runId:query.get('run')??'latest',status:'waiting for data',browser:navigator.userAgent,webmcpAvailable:'modelContext' in document};
 const show=()=>{panel.textContent=JSON.stringify(report,null,2)};show();
 const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
 while(!atlas.stats.drawn){await sleep(100)}
 report.firstCoarseMs=performance.now();report.rendering=atlas.renderingInfo;report.initial=atlas.stats;show();
 if(query.has('uxtest')){report.observerPass=await atlas.probeObserverPass();const {probeUI,probeSearchAvailability}=await import('./ui-diagnostics');report.ui=await probeUI(atlas);report.searchAvailability=await probeSearchAvailability(atlas);show()}
 if(query.has('nearbytest')){const {probeNearbySearch}=await import('./ui-diagnostics');report.nearbySearch=await probeNearbySearch(atlas);report.nearby=await atlas.probeNearbyGalaxies();show();report.nearbyContext=await atlas.probeContextRecovery();report.nearbyAfterRecovery=await atlas.probeNearbyGalaxies();show()}
 if(query.has('hometest')){
  report.localPositions=await atlas.probeLocalPositions();report.localInteraction=await atlas.probeLocalInteraction();show();
  const {probeHomeNavigation}=await import('./ui-diagnostics');report.homeNavigation=await probeHomeNavigation(atlas);show();
  report.home=await atlas.probeMilkyWay();show();atlas.controls.autoRotate=true;atlas.controls.autoRotateSpeed=2;atlas.invalidate();await sleep(7000);
  atlas.controls.autoRotate=false;report.homePerformance=atlas.stats;atlas.invalidate();report.homeContext=await atlas.probeContextRecovery();report.homeAfterRecovery=await atlas.probeMilkyWay();
 }
 if(query.has('modeltest')){
  report.status='checking catalog-wide models';show();report.models=await atlas.probeModelCatalog();report.depthCues=atlas.probeDepthCues();show();
  atlas.controls.autoRotate=true;atlas.controls.autoRotateSpeed=2;atlas.invalidate();report.status='measuring model navigation';show();await sleep(7000);
  atlas.controls.autoRotate=false;report.modelPerformance=atlas.stats;atlas.invalidate();report.context=await atlas.probeContextRecovery();report.profileAfterRecovery=atlas.probeGalaxyProfile();
 }
 if(query.has('detailtest')){
  report.profiles=atlas.resolvedGalaxies.map(model=>({name:model.data.name,...atlas.probeGalaxyProfile(model.data.galaxy.id)}));
  report.resolvedPicking=[];for(const model of atlas.resolvedGalaxies)(report.resolvedPicking as unknown[]).push({name:model.data.name,...await atlas.probeResolvedPicking(model.data.galaxy.id)});
  report.depthCues=atlas.probeDepthCues();show();
  atlas.controls.autoRotate=true;atlas.controls.autoRotateSpeed=2;atlas.invalidate();
  report.status='checking close-up orbit performance';show();await sleep(7000);
  atlas.controls.autoRotate=false;report.closeupPerformance=atlas.stats;atlas.invalidate();
  report.context=await atlas.probeContextRecovery();report.profileAfterRecovery=atlas.probeGalaxyProfile();
 }
 if(query.has('selftest')){
  const {probePointSettings}=await import('./ui-diagnostics');report.pointSettings=await probePointSettings(atlas);show();
  // A preceding home/model probe may leave the camera inside a local volume,
  // where distant catalog points are intentionally faded out.
  atlas.reset();atlas.clearSelection();await sleep(250);
  report.depthCues=atlas.probeDepthCues();show();
  report.status='testing selection';show();
  atlas.setMeasuring(true);const first=await atlas.probePicking();
  const second=await atlas.probePicking(atlas.selected?.id??-1);
  const before=atlas.measurementDistance;
  atlas.setMode('full');atlas.invalidate();await sleep(2500);
  report.interaction={first,second,measuredMpc:before,measurementStable:before!==null&&before===atlas.measurementDistance,selectedExactId:atlas.selected?.targetId};
  atlas.setMeasuring(false);atlas.clearSelection();atlas.setMode('adaptive');
  report.context=await atlas.probeContextRecovery();
  report.integrity=await atlas.probeIntegrityFailure();
 }
 if(new URLSearchParams(location.search).has('benchmark')){
  const mode=query.get('benchmark')==='full'?'full':'adaptive';
  atlas.setResolution(1920,1080);atlas.setMode(mode);atlas.reset();
  if(mode==='full'){report.status='loading all visible galaxies';show();const deadline=performance.now()+90000;while(!atlas.stats.complete&&performance.now()<deadline)await sleep(200)}
  atlas.controls.autoRotate=true;atlas.controls.autoRotateSpeed=1;atlas.invalidate();report.status='warming up';show();await sleep(5000);
  const samples:number[]=[];let previous=performance.now();const until=previous+20000;
  await new Promise<void>(resolve=>{function frame(now:number){samples.push(now-previous);previous=now;if(now<until)requestAnimationFrame(frame);else resolve()}requestAnimationFrame(frame)});
  atlas.controls.autoRotate=false;atlas.invalidate();
  const sorted=samples.slice(5).sort((a,b)=>a-b),mean=sorted.reduce((a,b)=>a+b,0)/sorted.length;
  report.benchmark={mode,resolution:[1920,1080],frames:sorted.length,meanMs:mean,fps:1000/mean,p95Ms:sorted[Math.floor(sorted.length*.95)],stats:atlas.stats};
 }
 report.status='complete';show();
 try{const response=await fetch('/__atlas_validation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)});if(!response.ok){report.saveError=`HTTP ${response.status}`;show()}}catch{report.saveError='Network failure';show()}
}
