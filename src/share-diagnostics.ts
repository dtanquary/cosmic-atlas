import * as THREE from 'three';
import type {Explorer} from './explorer';
import {decodeGalaxy} from './format';
import {uncertainLocalDistance} from './local-distances';
import {MODEL_LIMIT} from './model-catalog';
import {frame,sleep} from './overlay-diagnostics';
import {decodeView,encodeView,type ViewIdentity,type ViewState} from './view-link';
import type {SpatialNode,Vec3} from './types';
import {element} from './overlay-diagnostics';

const MISMATCH='This link points to a galaxy this catalog does not contain.';
const OFFSET=new THREE.Vector3(.02,-.01,.015);
const rel=(a:THREE.Vector3,b:THREE.Vector3)=>a.distanceTo(b)/Math.max(1e-6,b.length());

/** Links, saved views and camera travel through the real explorer, dialog and localStorage; works on subsets. */
export async function probeShareViews(atlas:Explorer){
  const nodes=atlas['nodes'],cache=atlas['cache'],loader=atlas['loader'],base=atlas['base'];
  const metadata=(node:SpatialNode)=>loader.load(`m:${node.id}`,new URL(node.metadata.url,base).href,node.metadata,'metadata',node.storedCount,true);
  const messages:string[]=[],onMessage=atlas.onMessage;atlas.onMessage=message=>{messages.push(message);onMessage(message)};
  const raw=localStorage.getItem('atlas-saved-views'),dialog=element<HTMLDialogElement>('share-dialog');
  const identityOf=(state:ViewState)=>JSON.stringify(state.identity);
  /** Apply a link built from an identity plus a deliberately perturbed absolute target; the exact target must win. */
  const apply=async(identity:ViewIdentity,exact:THREE.Vector3,seconds=0)=>{
    messages.length=0;
    const hash=encodeView({target:[exact.x+1e-6,exact.y,exact.z] as Vec3,camera:[exact.x+1e-6+OFFSET.x,exact.y+OFFSET.y,exact.z+OFFSET.z] as Vec3,identity})!;
    const arrived=await atlas.applyView(decodeView(hash)!,seconds);await frame();
    const target=atlas.controls.target,camera=atlas.camera.position,expectedCamera=exact.clone().add(OFFSET);
    return {hash,arrived,targetError:rel(target,exact),cameraError:rel(camera,expectedCamera),identity:identityOf(atlas.viewState()),messages:[...messages],
      passed:arrived&&rel(target,exact)<1e-9&&rel(camera,expectedCamera)<1e-9&&identityOf(atlas.viewState())===JSON.stringify(identity)};
  };
  try{
    atlas.reset();atlas.clearSelection();await frame();
    const live=atlas.viewState(),decoded=decodeView(encodeView(live)!)!;
    const roundTrip={hash:encodeView(live),targetError:rel(new THREE.Vector3(...decoded.target),new THREE.Vector3(...live.target)),cameraError:rel(new THREE.Vector3(...decoded.camera),new THREE.Vector3(...live.camera)),passed:false};
    roundTrip.passed=roundTrip.targetError<1e-9&&roundTrip.cameraError<1e-9&&decoded.identity===null;
    // Fixtures: NGC 3982 from the model manifest on full data, otherwise the first distant record of the resident root; plus a leaf that is not resident so the dense id must be loaded.
    const named=atlas.modelCatalog?Object.values(atlas.modelCatalog.manifest.namedTypes).find(entry=>entry.name==='NGC 3982'):undefined;
    const root=nodes.get(atlas['root'])!,rootBuffer=await metadata(root);
    let row=0;while(row<root.storedCount-1&&decodeGalaxy(rootBuffer,row,0).distance<=1.1)row++;
    const resident={node:root.id,row,targetId:decodeGalaxy(rootBuffer,row,0).targetId,position:decodeGalaxy(rootBuffer,row,0).position};
    // A small subset can have every leaf resident at the overview; then the dense id comes from the cache and only the identity check is exercised.
    const leaves=[...nodes.values()].filter(node=>!node.children.length),allLeavesResident=leaves.every(node=>cache.has(node.id));
    const leaf=leaves.find(node=>!cache.has(node.id))??leaves[leaves.length-1],leafBuffer=await metadata(leaf);
    let leafRow=0;while(leafRow<leaf.storedCount-1&&decodeGalaxy(leafBuffer,leafRow,0).distance<=1.1)leafRow++;
    const remote={node:leaf.id,row:leafRow,targetId:decodeGalaxy(leafBuffer,leafRow,0).targetId,position:decodeGalaxy(leafBuffer,leafRow,0).position,wasResident:cache.has(leaf.id)};
    const namedFixture=named?{node:named.node,row:named.row,targetId:named.targetId,position:decodeGalaxy(await metadata(nodes.get(named.node)!),named.row,0).position}:null;
    const cases:Record<string,unknown>={};
    if(namedFixture){
      const {position,...identity}=namedFixture;
      const result=await apply(identity,new THREE.Vector3(...position));
      const model=atlas.selected?atlas.resolvedFor(atlas.selected.id):undefined;
      cases.ngc3982={...result,modelResident:!!model,modelCentered:!!model&&rel(atlas.controls.target,model.center)<1e-9,passed:result.passed&&!!model&&rel(atlas.controls.target,model.center)<1e-9};
    }
    {const {position,...identity}=resident;cases.residentRecord=await apply(identity,new THREE.Vector3(...position))}
    {const {position,wasResident,...identity}=remote;const result=await apply(identity,new THREE.Vector3(...position));cases.nonResidentLeaf={...result,loadedIdFromChunk:!wasResident,allLeavesResident,passed:result.passed&&(!wasResident||allLeavesResident)}}
    // Hold a real metadata lookup at its asynchronous boundary, then withdraw the caller's navigation lease.
    atlas.reset();atlas.clearSelection();await frame();
    const beforeGuard=encodeView(atlas.viewState()),readMetadata=atlas['metadataFor'];let release!:()=>void,allowed=true;
    const held=new Promise<void>(resolve=>{release=resolve});
    atlas['metadataFor']=async(...args)=>{const bytes=await readMetadata.apply(atlas,args);await held;return bytes};
    try{
      const {position,...identity}=resident;
      const pending=atlas.applyView({target:position,camera:[position[0]+.02,position[1],position[2]],identity},0,{canNavigate:()=>allowed});
      await sleep(100);allowed=false;release();const arrived=await pending;await frame();
      cases.withdrawnNavigation={arrived,unchanged:encodeView(atlas.viewState())===beforeGuard,passed:arrived===false&&encodeView(atlas.viewState())===beforeGuard};
    }finally{release();atlas['metadataFor']=readMetadata}
    cases.andromeda=await apply('nearby:m31',atlas.resolvedFor(-1)!.center);
    {const cameraOnly={target:[1,2,3] as Vec3,camera:[2,3,4] as Vec3,identity:null};
      const arrived=await atlas.applyView(cameraOnly);await frame();
      cases.cameraOnlyClearsSelection={arrived,identity:atlas.viewState().identity,passed:arrived&&atlas.selected===null&&encodeView(atlas.viewState())===encodeView(cameraOnly)};
    }

    {const result=await apply('core',atlas.milkyWay.center);cases.core={...result,homeSelected:atlas.homeSelected,homeView:atlas.homeView,passed:result.passed&&atlas.homeSelected&&atlas.homeView==='galaxy'}}
    // Trust boundary: a wrong target ID and an out-of-range row fall back to the camera alone with the toast; a six-digit row never decodes.
    atlas.clearSelection();atlas.clearHomeSelection();
    {const result=await apply({node:resident.node,row:resident.row,targetId:'1'},new THREE.Vector3(...resident.position));
      cases.wrongTargetId={...result,selectionEmpty:atlas.selected===null,passed:result.arrived&&atlas.selected===null&&result.identity==='null'&&result.messages.includes(MISMATCH)&&result.targetError<1e-6}}
    {const result=await apply({node:resident.node,row:99999,targetId:resident.targetId},new THREE.Vector3(...resident.position));
      cases.rowBeyondChunk={...result,passed:result.arrived&&atlas.selected===null&&result.messages.includes(MISMATCH)}}
    cases.sixDigitRow={decoded:decodeView(`#t=1,2,3&c=0,0,5&g=desi:${resident.node}:123456:${resident.targetId}`),passed:decodeView(`#t=1,2,3&c=0,0,5&g=desi:${resident.node}:123456:${resident.targetId}`)===null};
    // A hidden uncertain-local record (full data only, with the default setting): the link must not select it, mirroring visitCatalog and pick.
    let hiddenLocalRecord:Record<string,unknown>={available:false,reason:atlas.showUncertainLocal?'Uncertain local positions are shown':'No record within the local guard'};
    if(!atlas.showUncertainLocal)search:for(const node of leaves.filter(node=>atlas['bounds'].get(node.id)!.distanceToPoint(atlas.milkyWay.center)<=atlas.milkyWay.radius*8)){
      const buffer=await metadata(node);
      for(let localRow=0;localRow<node.storedCount;localRow++){
        const galaxy=decodeGalaxy(buffer,localRow,0);if(!uncertainLocalDistance(galaxy.distance))continue;
        atlas.clearSelection();const exact=new THREE.Vector3(...galaxy.position);
        const result=await apply({node:node.id,row:localRow,targetId:galaxy.targetId},exact),cameraOnlyMpc=atlas.controls.target.distanceTo(exact);
        hiddenLocalRecord={...result,targetId:galaxy.targetId,distanceMpc:galaxy.distance,cameraOnlyMpc,selectionEmpty:atlas.selected===null,
          passed:result.arrived&&atlas.selected===null&&result.identity==='null'&&result.messages.some(message=>message.startsWith('This uncertain local position is hidden'))&&Math.abs(cameraOnlyMpc-1e-6)<1e-7};
        break search;
      }
    }
    cases.hiddenLocalRecord=hiddenLocalRecord;
    // Saved views through the real dialog: save the Andromeda view, re-read the list from storage, open it (1.5 s travel), delete it.
    localStorage.removeItem('atlas-saved-views');
    await apply('nearby:m31',atlas.resolvedFor(-1)!.center);const expected=atlas.camera.position.clone(),expectedTarget=atlas.controls.target.clone();
    element('share-button').click();await frame();
    const placeholder=element<HTMLInputElement>('view-name').placeholder;element<HTMLInputElement>('view-name').value='Probe view';element('save-view-button').click();await frame();
    const stored=JSON.parse(localStorage.getItem('atlas-saved-views')??'null');dialog.close();await frame();
    atlas.reset();await frame();
    element('share-button').click();await frame();
    const listed=[...element('saved-views').querySelectorAll('.saved-view-name')].map(item=>item.textContent);
    element('saved-views').querySelector<HTMLElement>('[data-open]')!.click();
    const closedOnOpen=!dialog.open;let opened=false;const deadline=performance.now()+4000;
    while(performance.now()<deadline){await sleep(50);if(rel(atlas.controls.target,expectedTarget)<1e-9&&rel(atlas.camera.position,expected)<1e-9&&!atlas['travel']){opened=true;break}}
    element('share-button').click();await frame();element('saved-views').querySelector<HTMLElement>('[data-delete]')!.click();await frame();
    const afterDelete={rows:element('saved-views').children.length,emptyShown:!element('saved-views-empty').hidden,stored:JSON.parse(localStorage.getItem('atlas-saved-views')??'null')};dialog.close();await frame();
    const savedViews={placeholder,stored,listed,closedOnOpen,opened,afterDelete,passed:stored?.version===1&&stored.views.length===1&&stored.views[0].name==='Probe view'&&decodeView(stored.views[0].hash)!==null&&listed.join()==='Probe view'&&closedOnOpen&&opened&&afterDelete.rows===0&&afterDelete.emptyShown&&afterDelete.stored.views.length===0&&placeholder.startsWith('Andromeda')};
    // Travel: a real wheel event cancels it and the target stays put; an uninterrupted travel ends exactly where the instant call goes.
    atlas.reset();await frame();
    const pending=atlas.visitMilkyWay(2)!;await sleep(600);
    const midway=atlas.controls.target.clone(),midwayCore=midway.distanceTo(atlas.milkyWay.center);
    atlas.canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true,cancelable:true}));
    const resolved=await Promise.race([pending,sleep(100).then(()=>'pending' as const)]);
    await sleep(300);
    // OrbitControls re-derives the target through clampLength every frame, so drift is judged relative to the pose (an ulp at 925 Mpc is 1e-13).
    const cancel={resolved,midwayCoreMpc:midwayCore,driftMpc:atlas.controls.target.distanceTo(midway),passed:resolved===false&&midwayCore>1e-6&&rel(atlas.controls.target,midway)<1e-9};
    await atlas.visitMilkyWay();await frame();const instant={camera:atlas.camera.position.clone(),target:atlas.controls.target.clone()};
    atlas.reset();await frame();
    const arrived=await atlas.visitMilkyWay(1);await frame();
    const complete={arrived,cameraError:rel(atlas.camera.position,instant.camera),targetError:rel(atlas.controls.target,instant.target),passed:arrived===true&&rel(atlas.camera.position,instant.camera)<1e-9&&rel(atlas.controls.target,instant.target)<1e-9};
    // visitCatalog resolves only once the pose matches; stopTravel halts a hop where it is.
    atlas.reset();await frame();
    const entry={id:cache.get(root.id)!.ids[resident.row],node:resident.node,row:resident.row,targetId:resident.targetId};
    const catalogArrived=await atlas.visitCatalog(entry,()=>true,1);
    const catalogTarget=atlas.resolvedFor(entry.id)?.center??new THREE.Vector3(...resident.position);
    const visitCatalog={arrived:catalogArrived,targetError:rel(atlas.controls.target,catalogTarget),selected:atlas.selected?.targetId,passed:catalogArrived===true&&rel(atlas.controls.target,catalogTarget)<1e-9&&atlas.selected?.targetId===resident.targetId};
    atlas.reset();await frame();
    const halted=atlas.visitMilkyWay(2)!;await sleep(500);
    const pose={camera:atlas.camera.position.clone(),target:atlas.controls.target.clone()};
    atlas.stopTravel();const haltResolved=await Promise.race([halted,sleep(100).then(()=>'pending' as const)]);await sleep(300);
    const stop={resolved:haltResolved,cameraDriftMpc:atlas.camera.position.distanceTo(pose.camera),targetDriftMpc:atlas.controls.target.distanceTo(pose.target),travelCleared:!atlas['travel'],
      passed:haltResolved===false&&rel(atlas.camera.position,pose.camera)<1e-9&&rel(atlas.controls.target,pose.target)<1e-9&&!atlas['travel']};
    // A hop must not evict a visible model and never exceeds the DESI pool.
    const removed:{id:number;blend:number}[]=[],remove=atlas['removeModel'];
    atlas['removeModel']=model=>{removed.push({id:model.data.galaxy.id,blend:model.blend.value});remove.call(atlas,model)};
    let peak=atlas.resolvedGalaxies.length;
    try{
      const {position,...identity}=namedFixture??resident;
      const hop=atlas.applyView({target:position,camera:[position[0]+OFFSET.x,position[1]+OFFSET.y,position[2]+OFFSET.z],identity},2);
      const end=performance.now()+2400;while(performance.now()<end){peak=Math.max(peak,atlas.resolvedGalaxies.length);await sleep(100)}
      await hop;
    }finally{atlas['removeModel']=remove}
    const hop={removed,visibleEvictions:removed.filter(item=>item.blend>0).length,peakResident:peak,passed:removed.every(item=>item.blend===0)&&peak<=MODEL_LIMIT};
    const caseList=Object.values(cases) as {passed?:boolean;available?:boolean}[];
    return {roundTrip,cases,savedViews,travel:{cancel,complete,visitCatalog,stop,hop},passed:roundTrip.passed&&caseList.every(item=>item.passed??item.available===false)&&savedViews.passed&&cancel.passed&&complete.passed&&visitCatalog.passed&&stop.passed&&hop.passed};
  }finally{
    atlas.onMessage=onMessage;if(dialog.open)dialog.close();
    if(raw===null)localStorage.removeItem('atlas-saved-views');else localStorage.setItem('atlas-saved-views',raw);
    atlas.clearSelection();atlas.clearHomeSelection();atlas.reset();
  }
}
