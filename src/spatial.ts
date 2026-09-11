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

/** Return ancestor fallbacks until every needed child has usable coverage. */
export function coveredFrontier(root: string, nodes: Map<string, SpatialNode>, desired: Set<string>, required: Set<string>, loaded: (id:string)=>boolean): string[] {
  const visit=(id:string):string[]|null=>{
    if(!required.has(id))return [];
    if(desired.has(id))return loaded(id)?[id]:null;
    const children=nodes.get(id)!.children.filter(c=>required.has(c));
    const parts=children.map(visit);
    if(parts.every(p=>p!==null))return parts.flatMap(p=>p!);
    return loaded(id)?[id]:null;
  };
  return visit(root)??[];
}
