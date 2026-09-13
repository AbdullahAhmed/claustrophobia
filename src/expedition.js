// Seeded expedition metadata. Only nearby segments become terrain; no level catalogue.
export function planExpedition(seed){
  let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const count=800+Math.floor(random()*120),phase=random()*6.28,points=[];
  let x=0,z=0,distance=0;
  for(let i=0;i<=count;i++){
    const u=i/count,y=u<.8?-10*Math.sin(u/.8*Math.PI):12*(u-.8)/.2;
    const crawl=(u>.15&&u<.24)||(u>.59&&u<.72);
    const chamber=Math.abs(u-.32)<.012||Math.abs(u-.49)<.012||u>.985;
    if(i){const angle=.55*Math.sin(i*.017+phase)+.12*Math.sin(i*.051);x+=Math.sin(angle)*1.5;z+=Math.cos(angle)*1.5;distance+=Math.hypot(x-points[i-1].x,y-points[i-1].y,z-points[i-1].z);}
    points.push({x,y,z,rx:chamber?5:crawl?1.1:1.7,ry:chamber?3:crawl?.5:1.6,w:-4,i,core:true,algae:0,tint:u>.45&&u<.54?4:1,theme:'dry',route:true,distance});
  }
  const campIndex=Math.round(count*.32),galleryIndex=Math.round(count*.49),climbIndex=Math.round(count*.74);
  // Approximation uses actual automatic stance speeds, then allows time for camp and observation.
  let travel=0;for(let i=1;i<points.length;i++)travel+=(points[i].distance-points[i-1].distance)/(points[i].ry<.7?.99:3.3);
  return {points,campIndex,galleryIndex,climbIndex,length:distance,travelSeconds:travel,targetMinutes:[10,15]};
}
export function nearestRouteIndex(plan,p){let best=Infinity,index=0;for(let i=0;i<plan.points.length;i++){const q=plan.points[i],d=(p.x-q.x)**2+(p.y-q.y)**2+(p.z-q.z)**2;if(d<best){best=d;index=i;}}return {index,distance:Math.sqrt(best)};}
export function fallOutcome(height,soft,injured){return soft||height<=3.5?'safe':height>12?'fatal':injured?'severe':'injured';}
