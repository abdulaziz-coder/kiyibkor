export type Landmark={x:number;y:number;z:number;visibility?:number};
export type Point={x:number;y:number;z:number};
export type BodyPose={leftShoulder:Point;rightShoulder:Point;leftHip:Point;rightHip:Point;leftElbow:Point;rightElbow:Point;leftWrist:Point;rightWrist:Point};
export type Fit={size:number;x:number;y:number;angle:number};
export type TrackingState='idle'|'loading'|'searching'|'tracking'|'error';
export const midpoint=(a:Point,b:Point):Point=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2});
export const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
export function poseFromLandmarks(landmarks:Landmark[]):BodyPose|null{
 const required=[11,12,23,24];
 if(required.some(i=>!landmarks[i]||(landmarks[i].visibility??0)<.55||![landmarks[i].x,landmarks[i].y,landmarks[i].z].every(Number.isFinite)))return null;
 const point=(i:number):Point=>({x:landmarks[i].x*800,y:landmarks[i].y*1000,z:Math.max(-250,Math.min(250,landmarks[i].z*800))});
 const shoulderLeft=point(11),shoulderRight=point(12),hipLeft=point(23),hipRight=point(24);
 if(distance(shoulderLeft,shoulderRight)<35||distance(midpoint(shoulderLeft,shoulderRight),midpoint(hipLeft,hipRight))<55)return null;
 const arm=(i:number,fallback:Point)=>landmarks[i]&&(landmarks[i].visibility??0)>.45&&[landmarks[i].x,landmarks[i].y,landmarks[i].z].every(Number.isFinite)?point(i):fallback;
 const elbowLeft=arm(13,{...shoulderLeft,y:shoulderLeft.y+160}),elbowRight=arm(14,{...shoulderRight,y:shoulderRight.y+160});
 return {leftShoulder:shoulderLeft,rightShoulder:shoulderRight,leftHip:hipLeft,rightHip:hipRight,
 leftElbow:elbowLeft,rightElbow:elbowRight,leftWrist:arm(15,{...elbowLeft,y:elbowLeft.y+130}),rightWrist:arm(16,{...elbowRight,y:elbowRight.y+130})};
}
export function smoothPose(previous:BodyPose|null,next:BodyPose,weight=.42):BodyPose{
 if(!previous)return next;
 return Object.fromEntries(Object.entries(next).map(([key,p])=>{const old=previous[key as keyof BodyPose];return[key,{x:old.x+(p.x-old.x)*weight,y:old.y+(p.y-old.y)*weight,z:old.z+(p.z-old.z)*weight}]})) as BodyPose;
}
export function fit2D(pose:BodyPose,adjust:Fit):Fit{
 const shoulders=midpoint(pose.leftShoulder,pose.rightShoulder),hips=midpoint(pose.leftHip,pose.rightHip);
 const width=distance(pose.leftShoulder,pose.rightShoulder)*2;
 const bodyWidth=width*adjust.size/100;
 const left=pose.leftShoulder.x<pose.rightShoulder.x?pose.leftShoulder:pose.rightShoulder;
 const right=left===pose.leftShoulder?pose.rightShoulder:pose.leftShoulder;
 const angle=Math.atan2(right.y-left.y,right.x-left.x)*180/Math.PI;
 return {size:bodyWidth/470*100,x:shoulders.x-400+adjust.x,y:shoulders.y-310-bodyWidth*36/300+adjust.y,angle:angle+adjust.angle};
}
export const demoPose:BodyPose={leftShoulder:{x:292,y:360,z:0},rightShoulder:{x:508,y:360,z:0},leftHip:{x:322,y:665,z:0},rightHip:{x:478,y:665,z:0},leftElbow:{x:255,y:500,z:-8},rightElbow:{x:545,y:500,z:-8},leftWrist:{x:245,y:640,z:-15},rightWrist:{x:555,y:640,z:-15}};
