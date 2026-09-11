import type {Explorer} from './explorer';

/** A recognized name without a destination must not masquerade as a visit. */
export async function probeSearchAvailability(atlas:Explorer){
 const element=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
 const dialog=element<HTMLDialogElement>('visit-dialog'),input=element<HTMLInputElement>('galaxy-query'),list=element('galaxy-results'),status=element('search-status');
 const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
 const query=(value:string)=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))};
 if(dialog.open){dialog.close();await frame()}
 element('visit-galaxy-button').click();const deadline=performance.now()+10000;
 while(!list.children.length){if(performance.now()>deadline)throw new Error('Search availability check timed out');await frame()}
 const position=atlas.camera.position.clone(),selected=atlas.selected;
 try{
  query('Sombrero');await frame();
  const before=status.textContent;
  const recognized={status:before,visitOptions:list.querySelectorAll('[role=option]').length,activeOption:input.getAttribute('aria-activedescendant'),explanation:element('unavailable-matches')?.textContent??''};
  (element('unavailable-matches')??list.querySelector<HTMLElement>('[aria-disabled=true]'))?.click();
  input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
  input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await frame();
  const unavailableStable=status.textContent===before&&dialog.open&&atlas.camera.position.distanceTo(position)<1e-12&&atlas.selected===selected&&!input.hasAttribute('aria-activedescendant');
  const browse=element('browse-available');let browseWorks=false;
  if(browse&&!browse.hidden){browse.click();await frame();browseWorks=input.value===''&&list.children.length>2&&list.querySelectorAll('[aria-disabled=true]').length===0&&document.activeElement===input}
  query('NGC 398');await frame();const mixedHasOnlyVisitsInList=list.children.length>0&&list.querySelectorAll('[aria-disabled=true]').length===0;
  query('zz-no-such-galaxy-998877');await frame();const noMatch={status:status.textContent,visitOptions:list.children.length,unavailableHidden:element('unavailable-matches')?.hidden??true,activeOption:input.getAttribute('aria-activedescendant')};
  return {recognized,unavailableStable,browseWorks,mixedHasOnlyVisitsInList,noMatch,passed:recognized.visitOptions===0&&recognized.activeOption===null&&!!recognized.explanation&&/1 name match/.test(recognized.status??'')&&unavailableStable&&browseWorks&&mixedHasOnlyVisitsInList&&noMatch.visitOptions===0&&noMatch.unavailableHidden&&noMatch.activeOption===null&&/No name matches/.test(noMatch.status??'')};
 }finally{dialog.close();await frame()}
}

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
 const coreControlActive=element('home-galaxy-view').getAttribute('aria-pressed')==='true'&&element('home-solar-view').getAttribute('aria-pressed')==='false';
 element('home-galaxy-view').click();await frame();const galaxyView=await zoom();
 element('home-solar-view').click();await frame();
 const solarTargetErrorMpc=atlas.controls.target.distanceTo(origin),sunOffsetPx=(()=>{const p=origin.clone().project(atlas.camera);return Math.hypot(p.x*atlas.canvas.clientWidth/2,p.y*atlas.canvas.clientHeight/2)})();
 const solarControlActive=element('home-solar-view').getAttribute('aria-pressed')==='true'&&element('home-galaxy-view').getAttribute('aria-pressed')==='false';
 let search:ReturnType<typeof sample>[]|null=null;
 if(!element('visit-galaxy-button').hidden){
  element('visit-galaxy-button').click();const input=element<HTMLInputElement>('galaxy-query');
  const deadline=performance.now()+10000;
  while(input.disabled||!element('galaxy-results').children.length){if(performance.now()>deadline)throw new Error('Milky Way search timed out');await frame()}
  input.value='Milky Way';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  await frame();search=await zoom();
 }
 element('home-galaxy-view').click();await frame();
 const coreLabeled=!element('home-center-label').hidden,sunLabeled=!element('origin-label').hidden;
 const centered=(samples:ReturnType<typeof sample>[])=>samples.every(s=>s.targetErrorMpc<1e-12&&s.centerOffsetPx<1)&&samples.at(-1)!.distanceMpc<samples[0].distanceMpc*.4;
 return {observer,galaxyView,search,solarTargetErrorMpc,sunOffsetPx,coreControlActive,solarControlActive,coreLabeled,sunLabeled,passed:centered(observer)&&centered(galaxyView)&&(search===null||centered(search))&&solarTargetErrorMpc<1e-12&&sunOffsetPx<1&&coreControlActive&&solarControlActive&&coreLabeled&&sunLabeled};
}

/** The settings control must update the real shader independently of fading. */
export async function probePointSettings(atlas:Explorer){
 const input=document.getElementById('enlarge-points') as HTMLInputElement,fade=document.getElementById('depth-cues') as HTMLInputElement;
 const saved=input.checked,stored=localStorage.getItem('atlas-enlarge-points'),fading=fade.checked;
 const change=(node:HTMLInputElement,value:boolean)=>{node.checked=value;node.dispatchEvent(new Event('change',{bubbles:true}))};
 try{
  change(input,false);const off=atlas.probeDepthCues();
  change(input,true);const on=atlas.probeDepthCues(),savedOn=localStorage.getItem('atlas-enlarge-points')==='true';
  change(fade,false);const independentControl=input.checked&&!input.disabled;
  change(input,false);const savedOff=localStorage.getItem('atlas-enlarge-points')==='false';
  return {offPixels:off.configuredNear.coveredPixels,onPixels:on.configuredNear.coveredPixels,savedOn,savedOff,independentControl,passed:off.passed&&on.passed&&on.configuredNear.coveredPixels>off.configuredNear.coveredPixels&&savedOn&&savedOff&&independentControl};
 }finally{change(input,saved);change(fade,fading);if(stored===null)localStorage.removeItem('atlas-enlarge-points');else localStorage.setItem('atlas-enlarge-points',stored)}
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
  [...element('galaxy-results').children].find(item=>item.textContent?.includes('NGC 3982'))!.dispatchEvent(new MouseEvent('click',{bubbles:true}));await waitFor(()=>input.disabled);
  dialog.close();await sleep(30);release();await done;
  cancelledVisitStable=atlas.selected?.id===selected&&atlas.camera.position.distanceTo(position)<1e-10;
  element('visit-galaxy-button').click();searchReusable=dialog.open&&!input.disabled&&document.activeElement===input;dialog.close();await sleep(30);
  let releaseSecond!:()=>void,finishSecond!:()=>void;
  const secondGate=new Promise<void>(resolve=>releaseSecond=resolve),secondDone=new Promise<void>(resolve=>finishSecond=resolve);
  atlas.visitCatalog=async(...args)=>{try{await secondGate;await originalVisit(...args)}finally{finishSecond()}};
  element('visit-galaxy-button').click();[...element('galaxy-results').children].find(item=>item.textContent?.includes('NGC 3982'))!.dispatchEvent(new MouseEvent('click',{bubbles:true}));
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

/** Search the shipped nearby layer through the real dialog on any dataset. */
export async function probeNearbySearch(atlas:Explorer){
 const element=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
 const dialog=element<HTMLDialogElement>('visit-dialog'),input=element<HTMLInputElement>('galaxy-query');
 const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
 const cases=[];
 for(const [query,id] of [['Andromeda',-1],['M33',-2],['LMC',-3],['SMC',-4],['M32',-5],['M110',-6]] as const){
  element('visit-galaxy-button').click();const deadline=performance.now()+10000;
  while(!element('galaxy-results').children.length){if(performance.now()>deadline)throw new Error('Nearby search timed out');await frame()}
  input.value=query;input.dispatchEvent(new Event('input',{bubbles:true}));await frame();
  const available=element('galaxy-results').children.length===1&&!element('galaxy-results').hidden;
  input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await frame();
  cases.push({query,available,closed:!dialog.open,selectedId:atlas.selected?.id,passed:available&&!dialog.open&&atlas.selected?.id===id});
 }
 return {cases,passed:cases.every(c=>c.passed)};
}
