import type { SpatialNode } from './types';

export interface FrontierOptions {
  root: string; nodes: Map<string, SpatialNode>; mode: 'adaptive'|'full'; budget: number;
  visible: (node: SpatialNode)=>boolean; projectedSize: (node: SpatialNode)=>number;
}
/** A non-overlapping frontier of real source points. No density reconstruction. */
export function chooseFrontier(options: FrontierOptions): string[] {
  const {root,nodes,visible,projectedSize,mode,budget}=options;
  const first=nodes.get(root)!;
  if(!visible(first)) return [];
  if(mode==='full'){
    const result:string[]=[];
    const visit=(id:string)=>{const node=nodes.get(id)!;if(!visible(node))return;if(!node.children.length)result.push(id);else node.children.forEach(visit)};
    visit(root);return result;
  }
  const frontier=new Set([root]);
  let cost=first.storedCount;
  const candidates=[first];
  while(candidates.length){
    candidates.sort((a,b)=>projectedSize(b)-projectedSize(a));
    const node=candidates.shift()!;
    if(!node.children.length || projectedSize(node)<130)continue;
    const children=node.children.map(id=>nodes.get(id)!).filter(visible);
    const nextCost=cost-node.storedCount+children.reduce((n,c)=>n+c.storedCount,0);
    if(nextCost>budget)continue;
    frontier.delete(node.id);cost=nextCost;
    for(const child of children){frontier.add(child.id);candidates.push(child)}
  }
  return [...frontier];
}

/**
 * Draw every loaded required node whose ancestors are loaded. Ancestors stay drawn and each
 * node adds only the rows they lack (`sharedPrefix`), so refining or coarsening never removes a
 * point already on screen. `surface` is the non-overlapping coverage: a parent stands in for its
 * children until every required child has loaded.
 */
export function layeredFrontier(root: string, nodes: Map<string, SpatialNode>, required: Set<string>, loaded: (id:string)=>boolean) {
  const layers:string[]=[];
  const visit=(id:string):string[]|null=>{
    if(!required.has(id)||!loaded(id))return null;
    layers.push(id);
    const parts=nodes.get(id)!.children.filter(c=>required.has(c)).map(visit);
    return parts.length&&parts.every(p=>p!==null)?parts.flatMap(p=>p!):[id];
  };
  const surface=visit(root)??[];
  return {layers,surface};
}

/**
 * Every node stores its rows in one global hash order, so an ancestor's rows inside a node are
 * exactly a prefix of that node's rows. One merge walk returns the prefix length.
 */
export function sharedPrefix(rows: Uint32Array, ancestor: Uint32Array): number {
  let j=0;
  for(let i=0;i<rows.length;i++){
    while(j<ancestor.length&&ancestor[j]!==rows[i])j++;
    if(j++===ancestor.length)return i;
  }
  return rows.length;
}
