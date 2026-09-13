// Rendering attachments must never interpret an unloaded collision chunk as rock.
export function surfaceProbe(sample, ready) {
  const value=(x,y,z)=>ready(x,y,z)?sample(x,y,z):null;
  function trace(x,y,z,dx,dy,dz,max,skipInitialRock=false) {
    let prior=value(x,y,z); if(prior===null)return null;
    let air=prior<-.04;
    if(!air&&!skipInitialRock)return null;
    for(let t=.1;t<=max;t+=.1){
      const v=value(x+dx*t,y+dy*t,z+dz*t);if(v===null)return null;
      if(v<-.04){air=true;continue;}
      if(!air)continue;
      let lo=t-.1,hi=t;
      for(let i=0;i<6;i++){const mid=(lo+hi)/2,m=value(x+dx*mid,y+dy*mid,z+dz*mid);if(m===null)return null;if(m<-.04)lo=mid;else hi=mid;}
      return {x:x+dx*hi,y:y+dy*hi,z:z+dz*hi};
    }return null;
  }
  function supported(a){
    const inside=value(a.x-a.nx*.18,a.y-a.ny*.18,a.z-a.nz*.18);
    const outside=value(a.x+a.nx*.18,a.y+a.ny*.18,a.z+a.nz*.18);
    return inside!==null&&outside!==null&&inside>-.04&&outside<-.04;
  }
  return {trace,supported};
}
