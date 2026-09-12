import * as THREE from 'three';
// This stream never consumes cave-generation or survival randomness.
export function cosmeticRandom(seed=0x7137) { let n=seed>>>0; return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;}; }
export class VFX {
  constructor(scene) {
    this.scene=scene; this.random=cosmeticRandom();this.particles=[];this.limit=280;this.cursor=0;
    this.geometry=new THREE.IcosahedronGeometry(1,0);
    this.material=new THREE.MeshStandardMaterial({color:0xa59a85,roughness:1,transparent:true,opacity:.6,depthWrite:false});
    this.mesh=new THREE.InstancedMesh(this.geometry,this.material,420); this.mesh.count=0;this.mesh.frustumCulled=false;scene.add(this.mesh);
    this.rings=new THREE.InstancedMesh(new THREE.RingGeometry(.86,1,24).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0x91aaa2,transparent:true,opacity:.22,side:THREE.DoubleSide,depthWrite:false}),64);
    this.rings.count=0;this.rings.frustumCulled=false;scene.add(this.rings);this.ripples=[];
    this.dummy=new THREE.Object3D();
  }
  quality(q){this.limit={low:100,standard:280,high:420}[q]||280;}
  emit(kind,x,y,z,count=12) {
    const r=this.random;
    for(let i=0;i<count;i++){
      const dust=kind==='dust', splash=kind==='splash';
      const p={x,y,z,vx:(r()-.5)*(dust?1:2),vy:splash?r()*2:dust?r()*.25:r()*1.3,vz:(r()-.5)*(dust?1:2),age:0,life:dust?2+r()*2:.4+r()*.7,size:dust?.045+r()*.08:.008+r()*.025,dust,splash};
      if(this.particles.length<this.limit)this.particles.push(p);else{this.particles[this.cursor++%this.limit]=p;this.particles.length=this.limit;}
    }
    if(kind==='splash')this.ripple(x,y,z);
  }
  ripple(x,y,z){if(this.ripples.length>=64)this.ripples.shift();this.ripples.push({x,y,z,age:0});}
  update(dt,waterAt) {
    const d=this.dummy;
    this.particles=this.particles.filter(p=>{p.age+=dt;return p.age<p.life;});
    this.mesh.count=this.particles.length;
    this.particles.forEach((p,i)=>{p.vy-=dt*(p.dust?.025:4);p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;d.position.set(p.x,p.y,p.z);const f=p.age/p.life;d.scale.setScalar(p.size*(p.dust?1+f*3:1)*Math.min(1,(1-f)*4));d.rotation.set(f*2,i,f);d.updateMatrix();this.mesh.setMatrixAt(i,d.matrix);});
    this.mesh.instanceMatrix.needsUpdate=true;
    this.ripples=this.ripples.filter(p=>(p.age+=dt)<2);this.rings.count=this.ripples.length;
    this.ripples.forEach((p,i)=>{const wl=waterAt(p.x,p.z);d.position.set(p.x,Number.isFinite(wl)?wl+.025:p.y+.025,p.z);const s=.04+p.age*.38;d.scale.set(s,1,s);d.rotation.set(0,0,0);d.updateMatrix();this.rings.setMatrixAt(i,d.matrix);this.rings.setColorAt(i,new THREE.Color().setScalar((1-p.age/2)*.7));});
    this.rings.instanceMatrix.needsUpdate=true;if(this.rings.instanceColor)this.rings.instanceColor.needsUpdate=true;
  }
  dispose(){for(const m of [this.mesh,this.rings]){this.scene.remove(m);m.geometry.dispose();m.material.dispose();}this.particles=[];this.ripples=[];}
}

// CPU matrices are cheap records. Only nearby regions occupy the bounded GPU pool;
// returning to a region reconstructs its decorations without consuming gameplay RNG.
export class StreamedInstances {
  constructor(scene,geometry,material,capacity){
    this.mesh=new THREE.InstancedMesh(geometry,material,capacity);this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.castShadow=true;scene.add(this.mesh);
    this.records=[];this.capacity=capacity;this.count=0;this.instanceMatrix={needsUpdate:false};this.lastCell='';
  }
  setMatrixAt(i,m){this.records[i]=m.clone();this.lastCell='';}
  update(p,radius=48){const cell=`${Math.floor(p.x/4)},${Math.floor(p.y/4)},${Math.floor(p.z/4)},${this.count}`;if(cell===this.lastCell)return;this.lastCell=cell;
    const near=[];for(const m of this.records){if(!m)continue;const e=m.elements;const dist=(e[12]-p.x)**2+(e[13]-p.y)**2+(e[14]-p.z)**2;if(dist<radius*radius)near.push({m,dist});}
    near.sort((a,b)=>a.dist-b.dist);this.mesh.count=Math.min(this.capacity,near.length);for(let i=0;i<this.mesh.count;i++)this.mesh.setMatrixAt(i,near[i].m);this.mesh.instanceMatrix.needsUpdate=true;
  }
  dispose(){this.mesh.removeFromParent();this.mesh.dispose();this.records=[];}
}
