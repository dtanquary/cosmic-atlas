import {tours,type TourData} from './tour';
import {MAX_TRIP_STOPS,MAX_SAVED_TRIPS,MAX_TRIP_FILE_BYTES,validateTrip,parseTripFile,serializeTrip,tripHref,tripStopTitle,tripRoute,readTrips,writeTrips,type Trip,type TripStop,type SavedTrip} from './trips';
type View={name:string;hash:string};
const id=()=>crypto.randomUUID().replaceAll('-','').slice(0,16);
/** Local, bounded authoring and recipient preview; user text is only assigned through textContent/value. */
export class TripPanel{
 private dialog:HTMLDialogElement;
 private draft:Trip={version:1,title:'My cosmic trip',stops:[]};
 private savedId:string|null=null;
 private generation=0;
 private sources:View[]=[];
 private el<T extends HTMLElement=HTMLElement>(name:string){return this.dialog.querySelector<T>(`#${name}`)!}
 constructor(parent:HTMLElement,private hooks:{ready:()=>boolean;pause:()=>void;current:()=>View|null;views:()=>View[];start:(route:TourData)=>void},signal:AbortSignal){
  this.dialog=document.createElement('dialog');this.dialog.id='trip-dialog';this.dialog.className='dialog trip-dialog';this.dialog.setAttribute('aria-labelledby','trip-heading');
  this.dialog.innerHTML=`<div class="dialog-title"><h2 id="trip-heading">Create a trip</h2><button class="button quiet icon-button" id="trip-close" aria-label="Close trip">×</button></div><p class="fineprint" id="trip-intro"></p><p id="trip-status" role="status"></p><section id="trip-editor"><label for="trip-title">Trip name · up to 60 characters</label><input id="trip-title" maxlength="120" autocomplete="off"/><div class="trip-add"><label for="trip-source">Add a destination</label><select id="trip-source"></select><div class="panel-actions"><button class="button" id="trip-add">Add destination</button><button class="button" id="trip-current">Add current view</button></div></div><ol id="trip-stops" class="trip-stops"></ol><div class="panel-actions"><button class="button" id="trip-save">Save locally</button><button class="button" id="trip-preview">Preview trip</button><button class="button" id="trip-new">New trip</button></div></section><section id="trip-recipient" hidden><h3 id="trip-preview-title"></h3><ol id="trip-itinerary"></ol><div class="panel-actions"><button class="button" id="trip-start">Start trip</button><button class="button" id="trip-edit">Make a copy</button></div></section><div class="panel-actions trip-share"><button class="button" id="trip-copy">Copy trip link</button><button class="button" id="trip-export">Export file</button><button class="button" id="trip-import">Import file</button></div><input id="trip-link" class="share-link" readonly aria-label="Trip link to copy" hidden/><input id="trip-file" type="file" accept="application/json,.json" hidden/><section id="trip-library"><h3>Saved in this browser</h3><ul id="trip-saved"></ul><p class="fineprint" id="trip-empty"></p></section>`;
  parent.append(this.dialog);this.el('trip-close').onclick=()=>this.dialog.close();this.dialog.addEventListener('close',()=>this.generation++,{signal});
  this.el<HTMLInputElement>('trip-title').oninput=e=>this.draft.title=(e.target as HTMLInputElement).value;
  this.el('trip-add').onclick=()=>{const value=this.el<HTMLSelectElement>('trip-source').value;if(value.startsWith('view:')){const view=this.sources[Number(value.slice(5))];if(view)this.add({id:id(),kind:'view',name:view.name,hash:view.hash})}else{const [route,stop]=value.split(':');this.add({id:id(),kind:'place',route,stop})}};
  this.el('trip-current').onclick=()=>{const view=this.hooks.current();if(view)this.add({id:id(),kind:'view',name:view.name,hash:view.hash});else this.message('This view cannot be saved yet.')};
  this.el('trip-save').onclick=()=>this.save();this.el('trip-new').onclick=()=>this.edit();
  this.el('trip-preview').onclick=()=>{const trip=this.valid();if(trip)this.showPreview(trip,false)};
  this.el('trip-start').onclick=()=>{if(!this.hooks.ready()){this.message('The atlas is still loading. Choose Start trip when the map is ready.');return}const trip=this.valid();if(trip){this.dialog.close();this.hooks.start(tripRoute(trip))}};
  this.el('trip-edit').onclick=()=>this.edit(this.draft,this.savedId);this.el('trip-copy').onclick=()=>void this.copy();
  this.el('trip-export').onclick=()=>{const trip=this.valid();if(!trip)return;const content=serializeTrip(trip)!;const url=URL.createObjectURL(new Blob([content],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='cosmic-atlas-trip.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.message('Trip file exported. Send this file to share a longer itinerary.')};
  this.el('trip-import').onclick=()=>this.el<HTMLInputElement>('trip-file').click();this.el<HTMLInputElement>('trip-file').onchange=()=>void this.import();
  signal.addEventListener('abort',()=>{this.generation++;this.dialog.close();this.dialog.remove()},{once:true});
 }
 private message(value:string){this.el('trip-status').textContent=value}
 private valid(){const trip=validateTrip(this.draft);if(!trip)this.message('Add 1–10 destinations. Names allow 60 characters and notes 180; remove unsupported characters or invalid views.');return trip}
 private open(){this.hooks.pause();this.generation++;this.message('');this.el('trip-link').hidden=true;if(!this.dialog.open)this.dialog.showModal()}
 edit(trip?:Trip,savedId:string|null=null){
  this.open();this.savedId=savedId;this.draft=trip?structuredClone(trip):{version:1,title:'My cosmic trip',stops:[]};
  this.el('trip-heading').textContent='Create a trip';this.el('trip-intro').textContent='Choose up to ten destinations or saved perspectives. Add your own short notes; the atlas keeps its sourced descriptions. Saved trips stay in this browser.';
  this.el('trip-editor').hidden=false;this.el('trip-recipient').hidden=true;this.el('trip-library').hidden=false;this.el<HTMLInputElement>('trip-title').value=this.draft.title;
  this.sources=this.hooks.views().slice(0,50);const select=this.el<HTMLSelectElement>('trip-source');select.replaceChildren();
  for(const route of tours){const group=document.createElement('optgroup');group.label=route.title;for(const stop of route.stops){const option=document.createElement('option');option.value=`${route.key}:${stop.id}`;option.textContent=stop.title;group.append(option)}select.append(group)}
  if(this.sources.length){const group=document.createElement('optgroup');group.label='Your saved views';this.sources.forEach((view,i)=>{const option=document.createElement('option');option.value=`view:${i}`;option.textContent=view.name;group.append(option)});select.append(group)}
  this.renderStops();this.renderSaved();
 }
 showPreview(trip:Trip,received=true){
  this.open();if(received)this.savedId=null;this.draft=structuredClone(trip);this.el('trip-heading').textContent='Your cosmic invitation';this.el('trip-intro').textContent='Preview the itinerary, then choose Start trip. It will not move the camera until you start. Notes are from the trip creator.';
  this.el('trip-editor').hidden=true;this.el('trip-recipient').hidden=false;this.el('trip-library').hidden=true;this.el('trip-preview-title').textContent=trip.title;this.el('trip-edit').textContent=received?'Make a copy':'Edit trip';
  this.el('trip-itinerary').replaceChildren(...trip.stops.map(stop=>{const li=document.createElement('li'),title=document.createElement('strong');title.textContent=tripStopTitle(stop);li.append(title);if(stop.note){const note=document.createElement('p');note.textContent='Trip note: '+stop.note;li.append(note)}return li}));
 }
 private add(stop:TripStop){if(this.draft.stops.length>=MAX_TRIP_STOPS){this.message('A trip can contain up to ten destinations.');return}this.draft.stops.push(stop);this.renderStops();this.message(`${this.draft.stops.length} of 10 destinations`)}
 private move(from:number,to:number){if(to<0||to>=this.draft.stops.length||from===to)return;this.draft.stops.splice(to,0,this.draft.stops.splice(from,1)[0]);this.renderStops();this.message('Destination order updated.')}
 private renderStops(){
  let dragged=-1;
  this.el('trip-stops').replaceChildren(...this.draft.stops.map((stop,i)=>{
   const li=document.createElement('li');li.dataset.stopId=stop.id;li.draggable=true;li.ondragstart=e=>{dragged=i;e.dataTransfer?.setData('text/plain',stop.id)};li.ondragover=e=>e.preventDefault();li.ondrop=e=>{e.preventDefault();if(dragged>=0)this.move(dragged,i)};
   const title=document.createElement('strong');title.textContent=`${i+1}. ${tripStopTitle(stop)}`;li.append(title);
   const controls=document.createElement('div');controls.className='panel-actions';
   for(const [label,action,disabled] of [['Up',()=>this.move(i,i-1),i===0],['Down',()=>this.move(i,i+1),i===this.draft.stops.length-1],['Remove',()=>{this.draft.stops.splice(i,1);this.renderStops()},false]] as const){const button=document.createElement('button');button.className='button quiet';button.textContent=label;button.dataset.action=label.toLowerCase();button.setAttribute('aria-label',`${label} ${tripStopTitle(stop)}`);button.disabled=disabled;button.onclick=action;controls.append(button)}li.append(controls);
   const label=document.createElement('label');label.textContent='Your note · up to 180 characters';const note=document.createElement('textarea');note.rows=2;note.maxLength=360;note.value=stop.note??'';note.oninput=()=>stop.note=note.value;label.append(note);li.append(label);return li;
  }));
  for(const key of ['trip-add','trip-current'])this.el<HTMLButtonElement>(key).disabled=this.draft.stops.length>=MAX_TRIP_STOPS;
 }
 private stored(){try{return readTrips(localStorage)}catch{return []}}
 private store(trips:SavedTrip[]){try{return writeTrips(localStorage,trips)}catch{return false}}
 private save(){
  const trip=this.valid();if(!trip)return;const saved=this.stored(),index=saved.findIndex(s=>s.id===this.savedId);
  if(index<0&&saved.length>=MAX_SAVED_TRIPS){this.message('Ten trips are already saved. Delete one or export this trip.');return}
  const entry={id:this.savedId??id(),trip};if(index<0)saved.unshift(entry);else saved[index]=entry;
  if(this.store(saved)){this.savedId=entry.id;this.renderSaved();this.message('Trip saved in this browser.')}else this.message('This browser could not save the trip. Copy its link or export a file.');
 }
 private renderSaved(){const saved=this.stored();this.el('trip-empty').textContent=saved.length?`${saved.length} of 10 saved trips`:'No saved trips yet.';this.el('trip-saved').replaceChildren(...saved.map(s=>{const li=document.createElement('li'),title=document.createElement('span');title.textContent=s.trip.title;li.append(title);for(const label of ['Open','Delete']){const b=document.createElement('button');b.className='button';b.textContent=label;b.dataset.action=label.toLowerCase();b.setAttribute('aria-label',`${label} ${s.trip.title}`);b.onclick=()=>{if(label==='Open')this.edit(s.trip,s.id);else if(this.store(this.stored().filter(v=>v.id!==s.id))){if(this.savedId===s.id)this.savedId=null;this.renderSaved();this.message('Saved trip deleted.')}else this.message('This browser could not delete the saved trip.')};li.append(b)}return li}))}
 private async copy(){const trip=this.valid();if(!trip)return;const href=tripHref(trip,location.href);if(!href){this.message('This trip is too long for a reliable link. Export its file to share every destination and note.');return}const generation=this.generation;try{await navigator.clipboard.writeText(href);if(generation===this.generation)this.message('Trip link copied.')}catch{if(generation!==this.generation)return;const input=this.el<HTMLInputElement>('trip-link');input.hidden=false;input.value=href;input.select();this.message('Copy was unavailable. Select and copy the link below.')}}
 private async import(){const input=this.el<HTMLInputElement>('trip-file'),file=input.files?.[0],generation=this.generation;if(!file)return;try{if(file.size>MAX_TRIP_FILE_BYTES)throw new Error('Trip files must be no larger than 64 KiB.');const trip=parseTripFile(new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer()));if(generation!==this.generation)return;if(!trip)throw new Error('This is not a supported trip file.');this.showPreview(trip)}catch(e){if(generation===this.generation)this.message(e instanceof Error?e.message:'The trip could not be imported.')}finally{input.value=''}}
}
