import {mkdir,readdir,copyFile,access,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(), target=path.join(root,'public','mediapipe');
await mkdir(target,{recursive:true});
const wasm=path.join(root,'node_modules','@mediapipe','tasks-vision','wasm');
for(const file of await readdir(wasm)) if(/\.(wasm|js)$/.test(file)) await copyFile(path.join(wasm,file),path.join(target,file));
const model=path.join(target,'pose_landmarker_lite.task');
try{await access(model)}catch{
 const url='https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
 const response=await fetch(url,{signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw Error('Pose model download failed: '+response.status);
 await writeFile(model+'.tmp',new Uint8Array(await response.arrayBuffer()));await rename(model+'.tmp',model);
}
console.log('Local pose model and WASM assets are ready.');
