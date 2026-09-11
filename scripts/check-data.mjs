import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve('public');
try{
 const catalog=JSON.parse(await readFile(path.join(root,'data/catalog.json'),'utf8'));
 const manifestPath=path.join(root,catalog.manifest);
 const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
 if(manifest.version!==1||!manifest.count||!manifest.nodes?.length)throw new Error('Invalid manifest');
 for(const node of manifest.nodes){
  for(const kind of ['points','metadata']){
   const asset=node[kind],file=path.resolve(path.dirname(manifestPath),asset.url);
   if(!file.startsWith(root+path.sep))throw new Error('Asset is outside public directory');
   if((await stat(file)).size!==asset.bytes)throw new Error(`Missing or incomplete asset: ${asset.url}`);
  }
 }
 console.log(`Verified ${manifest.count.toLocaleString()} galaxies in ${manifest.nodes.length} spatial chunks (${manifest.subset?'development subset':'full accepted catalog'}).`);
}catch(error){
 console.error(`Data is not ready: ${error.message}\nRun npm run data:bootstrap for a small real-data preview, or npm run data:download followed by npm run data:prepare for the full catalog.`);
 process.exitCode=1;
}
