import {defineConfig} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

export default defineConfig({
 plugins:[{
  name:'atlas-local-validation',
  configureServer(server){
   server.middlewares.use('/__atlas_validation',(request,response,next)=>{
    if(request.method!=='POST'){next();return}
    let data='';
    request.on('data',chunk=>{data+=chunk;if(data.length>65536)request.destroy()});
    request.on('end',()=>{void(async()=>{
     try{const report=JSON.parse(data);const name=String(report.runId??'latest').replace(/[^a-z0-9-]/g,'').slice(0,80)||'latest';await mkdir('.cache',{recursive:true});await writeFile(path.join('.cache',`validation-${name}.json`),JSON.stringify(report,null,2));response.writeHead(200,{'Content-Type':'application/json'});response.end('{"saved":true}')}
     catch{response.writeHead(400);response.end('Invalid validation report')}
    })()});
   });
  },
 }],
});
