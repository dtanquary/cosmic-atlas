import type {Explorer} from './explorer';

/** Exercise the actual home buttons, search and wheel handler at galaxy scales. */
export async function probeHomeNavigation(atlas:Explorer){
 const element=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
 const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
 const center=atlas.milkyWay.center,origin=center.clone().set(0,0,0);
 const sample=()=>{
  const projected=center.clone().project(atlas.camera);
  return {distanceMpc:atlas.camera.position.distanceTo(atlas.controls.target),targetErrorMpc:atlas.controls.target.distanceTo(center),centerOffsetPx:Math.hypot(projected.x*atlas.canvas.clientWidth/2,projected.y*atlas.canvas.clientHeight/2)};
 };
 const zoom=async()=>{
  const samples=[sample()];
  for(let step=0;step<3;step++){
   for(let notch=0;notch<8;notch++)atlas.canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true,cancelable:true}));
   await frame();samples.push(sample());
  }
  return samples;
 };
 element('observer-button').click();await frame();const observer=await zoom();
 element('home-galaxy-view').click();await frame();const galaxyView=await zoom();
 element('home-solar-view').click();await frame();
 const solarTargetErrorMpc=atlas.controls.target.distanceTo(origin),sunOffsetPx=(()=>{const p=origin.clone().project(atlas.camera);return Math.hypot(p.x*atlas.canvas.clientWidth/2,p.y*atlas.canvas.clientHeight/2)})();
 let search:ReturnType<typeof sample>[]|null=null;
 if(!element('visit-galaxy-button').hidden){
  element('visit-galaxy-button').click();const input=element<HTMLInputElement>('galaxy-query');
  const deadline=performance.now()+10000;
  while(input.disabled||!element('galaxy-results').children.length){if(performance.now()>deadline)throw new Error('Milky Way search timed out');await frame()}
  input.value='Milky Way';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  await frame();search=await zoom();
 }
 element('home-galaxy-view').click();await frame();
 const centered=(samples:ReturnType<typeof sample>[])=>samples.every(s=>s.targetErrorMpc<1e-12&&s.centerOffsetPx<1)&&samples.at(-1)!.distanceMpc<samples[0].distanceMpc*.4;
 return {observer,galaxyView,search,solarTargetErrorMpc,sunOffsetPx,passed:centered(observer)&&centered(galaxyView)&&(search===null||centered(search))&&solarTargetErrorMpc<1e-12&&sunOffsetPx<1};
}

/** Development-only checks against the real controls and async visit path. */
export async function probeUI(atlas:Explorer){
 const element=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
 const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
 const waitFor=async(check:()=>boolean)=>{const end=performance.now()+10000;while(!check()){if(performance.now()>end)throw new Error('UI check timed out');await sleep(20)}};
 const reachable=(node:HTMLElement)=>{const r=node.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===node};
 if(atlas.homeSelected)atlas.visitGalaxy(atlas.resolvedGalaxies.find(model=>model.data.spiral)?.data.galaxy.id);
 const inspector=element('inspector').querySelector<HTMLElement>('.inspector-body')??element('inspector');inspector.scrollTop=0;
 const focusReachable=reachable(element('focus-button'));
 inspector.scrollTop=inspector.scrollHeight;const closeReachableAfterScroll=reachable(element('close-inspector'));inspector.scrollTop=0;
 const error=document.createElement('div');error.className='loading';error.innerHTML='<div>Retry interaction check</div><div class="error-actions"><button class="button">Retry</button></div>';element('app').append(error);
 const retryReachable=reachable(error.querySelector('button')!);error.remove();
 const dialog=element<HTMLDialogElement>('visit-dialog'),input=element<HTMLInputElement>('galaxy-query');
 const originalVisit=atlas.visitCatalog.bind(atlas);
 let release!:()=>void,finished!:()=>void;
 const gate=new Promise<void>(resolve=>release=resolve),done=new Promise<void>(resolve=>finished=resolve);
 atlas.visitCatalog=async(...args)=>{try{await gate;await originalVisit(...args)}finally{finished()}};
 let cancelledVisitStable=false,searchReusable=false,reopenedVisitStable=false;
 try{
  element('visit-galaxy-button').click();await waitFor(()=>element('galaxy-results').children.length>2);
  const position=atlas.camera.position.clone(),selected=atlas.selected?.id;
  element('galaxy-option-2').click();await waitFor(()=>input.disabled);
  dialog.close();await sleep(30);release();await done;
  cancelledVisitStable=atlas.selected?.id===selected&&atlas.camera.position.distanceTo(position)<1e-10;
  element('visit-galaxy-button').click();searchReusable=dialog.open&&!input.disabled&&document.activeElement===input;dialog.close();await sleep(30);
  let releaseSecond!:()=>void,finishSecond!:()=>void;
  const secondGate=new Promise<void>(resolve=>releaseSecond=resolve),secondDone=new Promise<void>(resolve=>finishSecond=resolve);
  atlas.visitCatalog=async(...args)=>{try{await secondGate;await originalVisit(...args)}finally{finishSecond()}};
  element('visit-galaxy-button').click();element('galaxy-option-2').click();
  // Reopen before the queued close event or old network request completes.
  dialog.close();element('visit-galaxy-button').click();releaseSecond();await secondDone;await sleep(30);
  reopenedVisitStable=dialog.open&&!input.disabled&&document.activeElement===input&&atlas.selected?.id===selected&&atlas.camera.position.distanceTo(position)<1e-10;
  dialog.close();await sleep(30);
 }finally{release();atlas.visitCatalog=originalVisit;if(dialog.open)dialog.close()}
 element('fly-button').click();const speedEditable=!element<HTMLInputElement>('speed').disabled&&!element('flight-controls').hidden;
 element('auto-flight-button').click();const automaticWithFreePointer=atlas.autoFly&&document.pointerLockElement!==atlas.canvas;
 window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',key:'Escape'}));
 const escapeKeepsSpeedMenu=!atlas.autoFly&&!element('flight-controls').hidden&&!element<HTMLInputElement>('speed').disabled;
 element('orbit-button').click();
 return {focusReachable,closeReachableAfterScroll,retryReachable,cancelledVisitStable,searchReusable,reopenedVisitStable,speedEditable,automaticWithFreePointer,escapeKeepsSpeedMenu,
  passed:focusReachable&&closeReachableAfterScroll&&retryReachable&&cancelledVisitStable&&searchReusable&&reopenedVisitStable&&speedEditable&&automaticWithFreePointer&&escapeKeepsSpeedMenu};
}
