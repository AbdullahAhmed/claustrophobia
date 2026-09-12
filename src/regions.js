import * as THREE from 'three';
// Releases GPU allocations outside the active region. The lightweight source
// geometry stays in CPU memory so the same decoration can be reconstructed.
export class RegionGeometry {
  constructor(){this.items=[];this.placeholder=new THREE.BufferGeometry();}
  track(mesh,origin=mesh.position){this.items.push({mesh,origin:origin.clone(),source:mesh.geometry.clone(),resident:true});}
  update(position,radius=48){for(const item of this.items){const near=item.origin.distanceToSquared(position)<radius*radius;if(near===item.resident)continue;item.resident=near;if(near)item.mesh.geometry=item.source.clone();else{item.mesh.geometry.dispose();item.mesh.geometry=this.placeholder;}item.mesh.visible=near;}}
  dispose(){for(const item of this.items){if(item.resident)item.mesh.geometry.dispose();item.source.dispose();item.mesh.removeFromParent();}this.items=[];this.placeholder.dispose();}
}
