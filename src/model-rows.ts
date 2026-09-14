/** Row lookup for a bounded set of resident models in one immutable point chunk.
 * Cache misses too: most models do not occur in any given chunk. */
export class ModelRows{
 private keys:Int32Array;
 private rows:Int32Array;
 constructor(limit:number){this.keys=new Int32Array(limit).fill(-1);this.rows=new Int32Array(limit)}
 get memoryBytes(){return this.keys.byteLength+this.rows.byteLength}
 resolve(ids:Uint32Array,models:readonly number[]):number[]{
  if(models.length>this.keys.length)throw new Error('Model row lookup exceeds residency limit');
  for(let i=0;i<this.keys.length;i++)if(!models.includes(this.keys[i]))this.keys[i]=-1;
  return models.map(id=>{
   let index=this.keys.indexOf(id);
   if(index<0){index=this.keys.indexOf(-1);this.keys[index]=id;this.rows[index]=ids.indexOf(id)}
   return this.rows[index];
  });
 }
}
