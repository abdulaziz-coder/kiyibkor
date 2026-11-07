import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demoPose,poseFromLandmarks,smoothPose,fit2D} from '../lib/body-fit.ts';
test('requires confident shoulders and hips; rejects non-finite or narrow detections',()=>{
 const points=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));
 points[11]={x:.3,y:.3,z:0,visibility:1};points[12]={x:.7,y:.3,z:0,visibility:1};
 points[23]={x:.35,y:.65,z:0,visibility:1};points[24]={x:.65,y:.65,z:0,visibility:1};
 assert.ok(poseFromLandmarks(points));points[11].visibility=.1;assert.equal(poseFromLandmarks(points),null);
 points[11].visibility=1;points[11].x=NaN;assert.equal(poseFromLandmarks(points),null);
 assert.equal(poseFromLandmarks([]),null);
});
test('converts normalized pose to the same 800x1000 canvas coordinate system',()=>{
 const points=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));
 points[11].x=.3;points[12].x=.7;points[11].y=points[12].y=.3;
 points[23].x=.35;points[24].x=.65;points[23].y=points[24].y=.65;
 const body=poseFromLandmarks(points)!;assert.equal(body.leftShoulder.x,240);assert.equal(body.rightHip.y,650);
});
test('automatic 2D fit follows body motion and scale, retaining fine adjustments',()=>{
 const first=fit2D(demoPose,{size:100,x:0,y:0,angle:0});
 const shifted=Object.fromEntries(Object.entries(demoPose).map(([k,p])=>[k,{...p,x:p.x+80,y:p.y+30}])) as typeof demoPose;
 const second=fit2D(shifted,{size:100,x:0,y:0,angle:0});
 assert.equal(second.x-first.x,80);assert.equal(second.y-first.y,30);
 const adjusted=fit2D(demoPose,{size:120,x:15,y:20,angle:5});
 assert.equal(adjusted.x-first.x,15);assert.equal(adjusted.angle,5);assert.ok(adjusted.size>first.size);
});
test('smoothing damps jitter without losing depth',()=>{
 const next=structuredClone(demoPose);next.leftShoulder={x:392,y:460,z:100};
 const smooth=smoothPose(demoPose,next,.5);assert.deepEqual(smooth.leftShoulder,{x:342,y:410,z:50});
 assert.deepEqual(smoothPose(null,next),next);
});
