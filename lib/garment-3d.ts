import * as THREE from 'three';
import {BodyPose,Fit,midpoint,distance,Point} from './body-fit';
import {Garment} from './garments';

const RINGS=20,SIDES=32;
const vector=(p:Point)=>new THREE.Vector3(p.x,1000-p.y,-p.z);
function tubeGeometry(){
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array((RINGS+1)*(SIDES+1)*3),3));
 const indices:number[]=[];
 for(let j=0;j<RINGS;j++)for(let i=0;i<SIDES;i++){const a=j*(SIDES+1)+i,b=a+SIDES+1;indices.push(a,b,a+1,a+1,b,b+1)}
 geometry.setIndex(indices);return geometry;
}
function fillTube(geometry:THREE.BufferGeometry,sample:(t:number,theta:number)=>THREE.Vector3){
 const buffer=geometry.getAttribute('position') as THREE.BufferAttribute;
 for(let j=0;j<=RINGS;j++)for(let i=0;i<=SIDES;i++){const p=sample(j/RINGS,i/SIDES*Math.PI*2);buffer.setXYZ(j*(SIDES+1)+i,p.x,p.y,p.z)}
 buffer.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();
}
export class Garment3D{
 private renderer:THREE.WebGLRenderer;
 private scene=new THREE.Scene();
 private camera=new THREE.OrthographicCamera(0,800,1000,0,.1,4000);
 private material=new THREE.MeshStandardMaterial({color:'#e8e1ce',roughness:.95,metalness:0,side:THREE.DoubleSide});
 private torso=new THREE.Mesh(tubeGeometry(),this.material);
 private sleeves=[new THREE.Mesh(tubeGeometry(),this.material),new THREE.Mesh(tubeGeometry(),this.material)];
 private seamMaterial=new THREE.LineBasicMaterial({color:'#5b5548',transparent:true,opacity:.28});
 private seam=new THREE.Line(new THREE.BufferGeometry(),this.seamMaterial);
 private collar=new THREE.LineLoop(new THREE.BufferGeometry(),this.seamMaterial);
 private group=new THREE.Group();
 constructor(){
  this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
  this.renderer.setSize(800,1000,false);this.renderer.setPixelRatio(1);this.renderer.setClearColor(0x000000,0);
  this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.camera.position.set(0,0,1500);
  this.scene.add(new THREE.HemisphereLight(0xffffff,0x777c67,1.65));
  const key=new THREE.DirectionalLight(0xffffff,1.6);key.position.set(-200,1300,900);this.scene.add(key);
  const fill=new THREE.DirectionalLight(0xe0e8ff,.75);fill.position.set(1000,400,600);this.scene.add(fill);
  this.group.add(this.torso,...this.sleeves,this.seam,this.collar);this.scene.add(this.group);
 }
 render(ctx:CanvasRenderingContext2D,pose:BodyPose,garment:Garment,fit:Fit,time:number,demo=false){
  this.material.color.set(garment.color);
  const shoulder=vector(midpoint(pose.leftShoulder,pose.rightShoulder)),hip=vector(midpoint(pose.leftHip,pose.rightHip));
  // Use spatial breadth before projection: a side-on body must not be foreshortened twice.
  const projectedShoulders=distance(pose.leftShoulder,pose.rightShoulder),projectedHips=distance(pose.leftHip,pose.rightHip);
  const shoulderWidth=Math.min(projectedShoulders*2.5,vector(pose.leftShoulder).distanceTo(vector(pose.rightShoulder)));
  const hipWidth=Math.min(projectedHips*2.5,vector(pose.leftHip).distanceTo(vector(pose.rightHip)));
  const horizontal=vector(pose.rightShoulder).sub(vector(pose.leftShoulder)).normalize();
  if(horizontal.x<0)horizontal.negate();
  const up=shoulder.clone().sub(hip).normalize();
  const front=new THREE.Vector3().crossVectors(horizontal,up).normalize();if(front.z<0)front.negate();
  const length=shoulder.distanceTo(hip),bottom=hip.clone().addScaledVector(up,-length*.08),top=shoulder.clone().addScaledVector(up,shoulderWidth*.15);
  const center=top.clone().lerp(bottom,.5),scale=fit.size/100;
  const manual=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-fit.angle*Math.PI/180);
  const turn=new THREE.Quaternion().setFromAxisAngle(up,demo?Math.sin(time/2200)*.4:0);
  const transform=(p:THREE.Vector3)=>p.sub(center).multiplyScalar(scale).applyQuaternion(manual).applyQuaternion(turn).add(center).add(new THREE.Vector3(fit.x,-fit.y,0));
  const surface=(t:number,theta:number)=>{
   const c=top.clone().lerp(bottom,t);
   let radius:number;
   if(t<.13)radius=THREE.MathUtils.lerp(shoulderWidth*.22,shoulderWidth*.62,t/.13);
   else radius=THREE.MathUtils.lerp(shoulderWidth*.62,Math.max(hipWidth*.72,shoulderWidth*.51),(t-.13)/.87);
   const folds=1+Math.sin(theta*7+t*4)*.012*Math.sin(t*Math.PI);
   const depth=shoulderWidth*(t<.13?.13:.27)*folds;
   return c.addScaledVector(horizontal,Math.cos(theta)*radius*folds).addScaledVector(front,Math.sin(theta)*depth);
  };
  fillTube(this.torso.geometry,(t,theta)=>transform(surface(t,theta)));
  const long=garment.shape!=='tee';
  const armSets=[[pose.leftShoulder,pose.leftElbow,pose.leftWrist],[pose.rightShoulder,pose.rightElbow,pose.rightWrist]];
  armSets.forEach(([s,e,w],index)=>{
   const start=vector(s),elbow=vector(e),end=long?vector(w):start.clone().lerp(elbow,.48);
   const axis=end.clone().sub(start).normalize();
   const across=new THREE.Vector3().crossVectors(axis,new THREE.Vector3(0,0,1)).normalize();
   if(across.lengthSq()<.1)across.set(1,0,0);
   const depth=new THREE.Vector3().crossVectors(axis,across).normalize();
   fillTube(this.sleeves[index].geometry,(t,theta)=>{
    const c=long?(t<.5?start.clone().lerp(elbow,t*2):elbow.clone().lerp(end,(t-.5)*2)):start.clone().lerp(end,t);
    const radius=shoulderWidth*THREE.MathUtils.lerp(.22,long?.115:.19,t);
    return transform(c.addScaledVector(across,Math.cos(theta)*radius).addScaledVector(depth,Math.sin(theta)*radius));
   });
  });
  this.seam.visible=garment.shape==='shirt'||garment.shape==='cardigan';
  if(this.seam.visible){const points=Array.from({length:24},(_,i)=>transform(surface(.15+i/23*.85,Math.PI/2).addScaledVector(front,1)));this.seam.geometry.dispose();this.seam.geometry=new THREE.BufferGeometry().setFromPoints(points)}
  this.collar.geometry.dispose();this.collar.geometry=new THREE.BufferGeometry().setFromPoints(Array.from({length:48},(_,i)=>transform(surface(0,i/48*Math.PI*2))));
  this.renderer.render(this.scene,this.camera);ctx.drawImage(this.renderer.domElement,0,0);
 }
 dispose(){this.torso.geometry.dispose();this.sleeves.forEach(s=>s.geometry.dispose());this.seam.geometry.dispose();this.collar.geometry.dispose();this.seamMaterial.dispose();this.material.dispose();this.renderer.dispose();this.renderer.forceContextLoss()}
}
