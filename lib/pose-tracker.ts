import type {PoseLandmarker} from '@mediapipe/tasks-vision';
import {BodyPose,poseFromLandmarks,smoothPose} from './body-fit';
export class PoseTracker{
 private model:PoseLandmarker|null=null;
 private closed=false;
 private previous:BodyPose|null=null;
 private input:HTMLCanvasElement;
 private context:CanvasRenderingContext2D;
 constructor(){this.input=document.createElement('canvas');this.input.width=400;this.input.height=500;this.context=this.input.getContext('2d')!}
 async initialize(){
  const {FilesetResolver,PoseLandmarker}=await import('@mediapipe/tasks-vision');
  if(this.closed)return;
  const vision=await FilesetResolver.forVisionTasks('/mediapipe');
  // CPU delegate keeps pose inference separate from the garment's WebGL context.
  const model=await PoseLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:'/mediapipe/pose_landmarker_lite.task',delegate:'CPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.55,minPosePresenceConfidence:.55,minTrackingConfidence:.6});
  if(this.closed){model.close();return}this.model=model;
 }
 detect(frame:HTMLCanvasElement,timestamp:number):BodyPose|null{
  if(!this.model)return null;
  this.context.drawImage(frame,0,0,400,500);
  const result=this.model.detectForVideo(this.input,timestamp);
  const pose=poseFromLandmarks(result.landmarks[0]||[]);
  if(!pose){this.previous=null;return null}
  this.previous=smoothPose(this.previous,pose);return this.previous;
 }
 reset(){this.previous=null}
 close(){this.closed=true;this.model?.close();this.model=null}
}
