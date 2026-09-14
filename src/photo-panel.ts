import {PHOTO_MAX_BYTES,PHOTO_MAX_DECODED,type Photograph} from './photos';

/** One retained image, one cancellable fetch. Browser HTTP caching handles revisits; there is no decoded-image collection. */
export class PhotoPanel{
 private panel:HTMLElement;
 private image:HTMLImageElement;
 private serial=0;
 private navigation=0;
 cancelMatch(){this.navigation++}
 private request:AbortController|null=null;
 private objectUrl:string|null=null;
 private opener:HTMLElement|null=null;
 private options:Photograph[]=[];
 private current:Photograph|null=null;
 private el<T extends HTMLElement=HTMLElement>(id:string){return this.panel.querySelector<T>(`#${id}`)!}
 get open(){return !this.panel.hidden}
 constructor(parent:HTMLElement,private hooks:{match:(photo:Photograph,canNavigate:()=>boolean)=>Promise<boolean>;restore:(canNavigate:()=>boolean)=>Promise<void>},signal:AbortSignal){
  this.panel=document.createElement('aside');this.panel.id='photo-panel';this.panel.className='photo-panel';this.panel.hidden=true;this.panel.setAttribute('aria-labelledby','photo-title');
  this.panel.innerHTML=`<div class="photo-heading"><div><div class="eyebrow">Observation &amp; illustration</div><h2 id="photo-title"></h2></div><button class="button quiet icon-button" id="photo-close" aria-label="Close photograph">×</button></div><div class="photo-switch"><button class="button" id="photo-model">Model</button><button class="button active" id="photo-show" aria-pressed="true">Photograph</button></div><label id="photo-choice-label" for="photo-choice">Photograph</label><select id="photo-choice"></select><p id="photo-loading" role="status"></p><figure id="photo-figure"><img id="photo-image" alt="" decoding="async"/><figcaption><a id="photo-credit" target="_blank" rel="noopener"></a> · <a id="photo-license" target="_blank" rel="noopener">CC BY 4.0</a></figcaption></figure><details class="photo-notes"><summary>About this image</summary><p id="photo-note"></p><p class="fineprint" id="photo-field"></p><p class="fineprint">The atlas model preserves adopted size and sky shape; depth, fine structure, brightness and colors are illustrative.</p></details><div class="photo-actions"><button class="button" id="photo-match">Match observed view</button><button class="button" id="photo-restore" hidden>Undo match</button><button class="button" id="photo-retry" hidden>Retry photograph</button><a id="photo-source" target="_blank" rel="noopener">Source &amp; full image ↗</a></div>`;
  parent.append(this.panel);this.image=this.el('photo-image');
  this.el('photo-close').onclick=()=>this.close();this.el('photo-model').onclick=()=>this.close();
  this.el<HTMLSelectElement>('photo-choice').onchange=()=>{const photo=this.options.find(p=>p.key===this.el<HTMLSelectElement>('photo-choice').value);if(photo)void this.load(photo)};
  this.el('photo-retry').onclick=()=>{if(this.current)void this.load(this.current)};
  this.el('photo-match').onclick=async()=>{const serial=this.serial,navigation=++this.navigation,photo=this.current;if(!photo)return;const current=()=>this.open&&serial===this.serial&&navigation===this.navigation;const matched=await this.hooks.match(photo,current);if(current()&&matched){this.el('photo-restore').hidden=false;this.el('photo-field').textContent='Observer-facing · matched vertical field. The atlas viewport may be wider than the photograph.'}};
  this.el('photo-restore').onclick=async()=>{const serial=this.serial,navigation=++this.navigation,current=()=>this.open&&serial===this.serial&&navigation===this.navigation;await this.hooks.restore(current);if(current()){this.el('photo-restore').hidden=true;if(this.current)this.describeField(this.current)}};
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&this.open&&!document.querySelector('dialog[open]')){event.preventDefault();event.stopImmediatePropagation();this.close()}},{capture:true,signal});
  signal.addEventListener('abort',()=>{this.close(false);this.panel.remove()},{once:true});
 }
 show(options:Photograph[],title:string){
  this.opener=document.activeElement instanceof HTMLElement?document.activeElement:null;this.options=options;this.panel.hidden=false;document.documentElement.setAttribute('data-photo-open','');
  this.el('photo-restore').hidden=true;this.el('photo-choice').replaceChildren(...options.map(photo=>{const option=document.createElement('option');option.value=photo.key;option.textContent=photo.title;return option}));
  this.el('photo-choice').hidden=this.el('photo-choice-label').hidden=options.length<2;
  if(options.length)void this.load(options[0]);
  else{this.clear();this.current=null;this.el('photo-title').textContent=title;this.el('photo-note').textContent='No matched photograph is included for this view. Its catalog positions and existing visualizations remain available in the atlas.';this.panel.querySelector<HTMLDetailsElement>('details')!.open=true;this.el('photo-loading').textContent='';this.el('photo-field').textContent='';this.el('photo-match').hidden=this.el('photo-source').hidden=this.el('photo-figure').hidden=this.el('photo-retry').hidden=true}
  this.el('photo-close').focus({preventScroll:true});
 }
 close(focus=true){if(!this.open)return;this.clear();this.panel.hidden=true;document.documentElement.removeAttribute('data-photo-open');if(focus&&this.opener?.isConnected)this.opener.focus({preventScroll:true})}
 private clear(){this.serial++;this.request?.abort();this.request=null;this.image.removeAttribute('src');if(this.objectUrl)URL.revokeObjectURL(this.objectUrl);this.objectUrl=null}
 private describeField(photo:Photograph){
  this.el('photo-field').textContent=photo.fovArcmin?`Field ${photo.fovArcmin.join(' × ')} arcmin · ${photo.northClockwiseDeg===0?'north up':`north ${Math.abs(photo.northClockwiseDeg!)}° ${photo.northClockwiseDeg!>0?'clockwise':'counterclockwise'} from up`}. ${photo.match?'Calibrated cutout.':'Independent crop; no automatic framing match.'}`:'A panorama from inside our Galaxy, with no external-view match.';
 }
 private async load(photo:Photograph){
  this.clear();const serial=this.serial,request=this.request=new AbortController();this.current=photo;
  this.panel.querySelector<HTMLDetailsElement>('details')!.open=false;this.el('photo-title').textContent=photo.title;this.el('photo-note').textContent=photo.note;this.el('photo-retry').hidden=true;this.el('photo-figure').hidden=true;
  this.el('photo-match').hidden=!photo.match;this.el('photo-restore').hidden=true;this.el('photo-source').hidden=false;
  const source=this.el<HTMLAnchorElement>('photo-source');source.href=photo.source;
  const credit=this.el<HTMLAnchorElement>('photo-credit');credit.href=photo.source;credit.textContent=photo.credit;this.el<HTMLAnchorElement>('photo-license').href=photo.license;
  this.describeField(photo);
  this.el('photo-loading').textContent='Loading photograph…';this.image.alt=photo.title+'. '+photo.note;
  try{
   const response=await fetch(photo.asset,{signal:request.signal});if(!response.ok||!response.body)throw new Error('Photograph unavailable');
   const reader=response.body.getReader(),parts:Uint8Array<ArrayBuffer>[]= [];let bytes=0;
   try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>PHOTO_MAX_BYTES){await reader.cancel();throw new Error('Photograph exceeds its size limit')}parts.push(new Uint8Array(value))}}finally{reader.releaseLock()}
   const blob=new Blob(parts,{type:'image/jpeg'}),buffer=await blob.arrayBuffer();
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('');
   if(bytes!==photo.bytes||hash!==photo.sha256||photo.width*photo.height*4>PHOTO_MAX_DECODED)throw new Error('Photograph failed verification');
   if(request.signal.aborted||serial!==this.serial)return;
   this.objectUrl=URL.createObjectURL(blob);this.image.src=this.objectUrl;await this.image.decode();
   if(request.signal.aborted||serial!==this.serial)return;
   if(this.image.naturalWidth!==photo.width||this.image.naturalHeight!==photo.height)throw new Error('Photograph dimensions do not match');
   this.el('photo-loading').textContent='';this.el('photo-figure').hidden=false;
  }catch(error){if(request.signal.aborted||serial!==this.serial)return;this.clear();this.el('photo-loading').textContent=error instanceof Error?error.message:'Photograph unavailable';this.el('photo-retry').hidden=false}
 }
}
