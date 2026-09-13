import './mobile-ui.css';

/** Responsive controls reuse the original elements/handlers. No second copy of
 * settings, selection or tour state; restoring desktop restores its DOM slots. */
export function setupMobileUI(signal:AbortSignal){
 const root=document.documentElement,app=document.getElementById('app')!;
 const element=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
 const media=matchMedia('(max-width:700px), (max-width:1024px) and (pointer:coarse)');
 const icon=(path:string)=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
 const added:HTMLElement[]=[],slots=new Map<Node,Comment>();
 const move=(node:Node,parent:Node)=>{if(!slots.has(node)){const slot=document.createComment('desktop control position');node.parentNode!.insertBefore(slot,node);slots.set(node,slot)}parent.appendChild(node)};
 const create=(tag:string,className:string,html='')=>{const node=document.createElement(tag);node.className=className;node.innerHTML=html;added.push(node);return node};
 const nav=create('nav','mobile-nav');nav.id='mobile-nav';nav.setAttribute('aria-label','Explore the atlas');nav.hidden=true;
 const menu=create('dialog','dialog mobile-menu') as HTMLDialogElement;menu.id='mobile-menu';menu.setAttribute('aria-labelledby','mobile-menu-title');
 menu.innerHTML=`<div class="dialog-title"><h2 id="mobile-menu-title">Explore</h2><button class="button quiet icon-button" aria-label="Close explore menu">${icon('M6 6l12 12M18 6L6 18')}</button></div><p class="mobile-gesture-hint">Drag to orbit · pinch to zoom<br>Two fingers to pan · tap a galaxy for details</p><div class="mobile-menu-grid"></div><section class="mobile-menu-display" aria-label="Display preferences"><h3>Display</h3></section><section class="mobile-menu-catalog" aria-label="Catalog and loading status"></section>`;
 const menuButton=create('button','button mobile-menu-button',`${icon('M4 6h16M4 12h16M4 18h16')}<span>Menu</span>`) as HTMLButtonElement;
 menuButton.id='mobile-menu-button';menuButton.setAttribute('aria-label','Explore menu');menuButton.setAttribute('aria-haspopup','dialog');menuButton.setAttribute('aria-controls','mobile-menu');
 menuButton.onclick=()=>menu.showModal();menu.querySelector('button')!.onclick=()=>menu.close();
 menu.addEventListener('click',event=>{const target=event.target as Element;if(target.closest('.mobile-menu-grid button'))menu.close();else if(target===menu){const r=menu.getBoundingClientRect();if(event.clientY<r.top||event.clientX<r.left||event.clientX>r.right||event.clientY>r.bottom)menu.close()}},{capture:true,signal});
 app.append(nav,menu);
 const sheets=['inspector','home-inspector','tour-panel','cosmic-context'].map(element);
 const toggles=new Map<HTMLElement,HTMLButtonElement>();
 const cosmicHeader=create('div','mobile-cosmic-header');
 const cosmicBody=create('div','mobile-cosmic-body');cosmicBody.id='cosmic-mobile-details';
 cosmicHeader.innerHTML=`<h2>Cosmic scale</h2><button class="button quiet icon-button" aria-label="Hide CMB shell">${icon('M6 6l12 12M18 6L6 18')}</button>`;
 cosmicHeader.querySelector('button')!.onclick=()=>element('cosmic-horizon-button').click();
 const cosmicChildren=Array.from(element('cosmic-context').childNodes);
 const collapse=(panel:HTMLElement,expanded=false)=>{
  panel.dataset.expanded=String(expanded);const button=toggles.get(panel)!;
  button.textContent=expanded?'Less':'Details';button.setAttribute('aria-expanded',String(expanded));
  const body=panel.querySelector<HTMLElement>('.inspector-body,.mobile-cosmic-body');if(body)body.inert=media.matches&&!expanded;
 };
 for(const panel of sheets){
  const button=create('button','button mobile-sheet-toggle','Details') as HTMLButtonElement;
  button.setAttribute('aria-label',panel.id==='tour-panel'?'Show or hide tour description':panel.id==='cosmic-context'?'Show or hide cosmic scale details':panel.id==='home-inspector'?'Show or hide Milky Way details':'Show or hide galaxy details');
  const body=panel.querySelector<HTMLElement>('.inspector-body')??cosmicBody;if(!body.id)body.id=`${panel.id}-details`;
  button.setAttribute('aria-controls',body.id);button.onclick=()=>collapse(panel,panel.dataset.expanded!=='true');toggles.set(panel,button);
 }
 const flightClose=create('button','button mobile-flight-close','Done');flightClose.setAttribute('aria-label','Close flight controls');flightClose.onclick=()=>element('orbit-button').click();
 const touchFlight=create('p','fineprint mobile-flight-hint','Choose Auto fly to travel forward. Stop auto fly pauses; Done returns to orbit.');
 const unitsLabel=create('label','mobile-units-label','Distance units');unitsLabel.setAttribute('for','units');
 const summaries=new Map(['inspector','home-inspector'].map(id=>[id,create('div','mobile-sheet-summary')]));
 const settingGroups:HTMLElement[]=[];
 const settings=element('help-dialog').querySelector<HTMLElement>('.display-settings')!;
 const settingsChildren=Array.from(settings.children) as HTMLElement[];
 const groupStarts=[0,settingsChildren.indexOf(settings.querySelector<HTMLElement>('label[for="galaxy-appearance"]')!),settingsChildren.indexOf(settings.querySelector('#show-uncertain-local')!.closest('label')!)];
 ['Cosmic overlays','Galaxies','Points & distance'].forEach((label,i)=>{const group=create('details','mobile-settings-section');group.innerHTML=`<summary>${label}</summary>`;group.dataset.start=String(groupStarts[i]);settingGroups.push(group)});
 let mobile=false,lastPanel='',lastIdentity='';
 const sync=()=>{
  if(!mobile)return;
  const uncertain=!element('local-distance-warning').hidden,galaxySummary=summaries.get('inspector')!;
  galaxySummary.textContent=`${uncertain?'Uncertain distance · ':''}${element('object-distance').textContent}`;galaxySummary.toggleAttribute('data-uncertain',uncertain);
  summaries.get('home-inspector')!.textContent=`Sun to core · ${element('home-distance').textContent}`;
  const active=!element('flight-controls').hidden?element('flight-controls'):sheets.find(p=>p.id==='tour-panel'&&!p.hidden)??sheets.find(p=>!p.hidden);
  const identity=active?.id==='inspector'?element('object-name').textContent:active?.id==='tour-panel'?element('tour-stop-title').textContent:active?.id;
  if(active&&(active.id!==lastPanel||identity!==lastIdentity)&&toggles.has(active)){collapse(active);const body=active.querySelector('.inspector-body,.mobile-cosmic-body');if(body)body.scrollTop=0}
  lastPanel=active?.id??'';lastIdentity=identity??'';
  root.toggleAttribute('data-mobile-sheet',!!active);
  for(const panel of [...sheets,element('flight-controls')])panel.toggleAttribute('data-mobile-active',panel===active);
 };
 const viewport=()=>{
  if(!mobile)return;
  const visual=window.visualViewport,height=visual?.height??innerHeight;
  root.style.setProperty('--visual-height',`${height}px`);
  root.style.setProperty('--keyboard-offset',`${Math.max(0,innerHeight-height-(visual?.offsetTop??0))}px`);
 };
 const restore=()=>{
   menu.close();for(const [node,slot] of slots){slot.replaceWith(node)}slots.clear();
   for(const button of toggles.values())button.remove();cosmicHeader.remove();cosmicBody.remove();flightClose.remove();touchFlight.remove();
   for(const summary of summaries.values())summary.remove();
   for(const group of settingGroups)group.remove();menu.querySelector('.mobile-units-label')?.remove();
   for(const panel of sheets){panel.removeAttribute('data-expanded');panel.removeAttribute('data-mobile-active');const body=panel.querySelector<HTMLElement>('.inspector-body');if(body)body.inert=false}
   element('flight-controls').removeAttribute('data-mobile-active');root.removeAttribute('data-mobile-sheet');lastPanel=lastIdentity='';
   root.style.removeProperty('--visual-height');root.style.removeProperty('--keyboard-offset');
 };
 const apply=()=>{
  if(mobile===media.matches)return;
  mobile=media.matches;root.toggleAttribute('data-mobile',mobile);nav.hidden=!mobile;
  if(mobile){
   for(const id of ['visit-galaxy-button','observer-button','tours-button'])move(element(id),nav);nav.append(menuButton);
   for(const id of ['reset-button','orbit-button','measure-button','cosmic-horizon-button','fly-button','share-button','help-button','data-button'])move(element(id),menu.querySelector('.mobile-menu-grid')!);
   const display=menu.querySelector('.mobile-menu-display')!;
   move(document.querySelector('.mode-switch')!,display);
   display.append(unitsLabel);move(element('units'),display);
   move(document.querySelector('.footer>div')!,menu.querySelector('.mobile-menu-catalog')!);move(element('detail-status'),menu.querySelector('.mobile-menu-catalog')!);move(element('lookback-note'),menu.querySelector('.mobile-menu-catalog')!);
   for(const [id,summary] of summaries)element(id).querySelector('.inspector-header')!.append(summary);
   move(element('tour-stop-title'),element('tour-panel').querySelector('.inspector-header')!);
   for(const panel of sheets){
    if(panel.id==='cosmic-context'){for(const child of cosmicChildren)move(child,cosmicBody);panel.append(cosmicHeader,cosmicBody);cosmicHeader.append(toggles.get(panel)!)}
    else panel.querySelector(panel.id==='tour-panel'?'.tour-controls':'.panel-actions')!.append(toggles.get(panel)!);
    collapse(panel);
   }
   element('flight-controls').prepend(flightClose);element('flight-controls').append(touchFlight);
   settingGroups.forEach((group,i)=>{settings.append(group);for(const child of settingsChildren.slice(groupStarts[i],groupStarts[i+1]??settingsChildren.length))move(child,group)});
   viewport();sync();
  }else{
   restore();
  }
 };
 const observer=new MutationObserver(sync);
 for(const panel of [...sheets,element('flight-controls')])observer.observe(panel,{attributes:true,attributeFilter:['hidden']});
 for(const id of ['object-name','tour-stop-title','object-distance','home-distance'])observer.observe(element(id),{childList:true,subtree:true,characterData:true});
 element('viewport').addEventListener('pointerdown',()=>{if(mobile)for(const panel of sheets)collapse(panel)},{passive:true,signal});
 media.addEventListener('change',apply,{signal});window.addEventListener('resize',viewport,{signal});window.visualViewport?.addEventListener('resize',viewport,{signal});window.visualViewport?.addEventListener('scroll',viewport,{signal});
 signal.addEventListener('abort',()=>{observer.disconnect();restore();root.removeAttribute('data-mobile');for(const node of added)node.remove()},{once:true});
 apply();
 return {get active(){return mobile}};
}
