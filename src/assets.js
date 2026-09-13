import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const ASSET_NAMES=['torch','glove','skull','longbone','rib','pack','battery','cells','kit','sticks','rope','anchor','bat','olm','crosser','crystal','sleepingbag','stove','suit'];
export class Assets {
  constructor(){this.models=new Map();this.geometries=new Map();}
  async load(progress=()=>{}){
    const loader=new GLTFLoader();let done=0;
    await Promise.all(ASSET_NAMES.map(async name=>{const gltf=await loader.loadAsync(new URL(`../assets/models/${name}.glb`,import.meta.url).href);this.models.set(name,gltf.scene);progress(++done,ASSET_NAMES.length);}));
  }
  model(name){const source=this.models.get(name);if(!source)throw new Error(`Missing model: ${name}`);const model=source.clone(true);model.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}});return model;}
  geometry(name){
    if(this.geometries.has(name))return this.geometries.get(name);
    const source=this.models.get(name);source.updateMatrixWorld(true);const parts=[];
    source.traverse(m=>{if(!m.isMesh)return;let g=m.geometry.clone().applyMatrix4(m.matrixWorld);if(g.index)g=g.toNonIndexed();for(const key of Object.keys(g.attributes))if(!['position','normal'].includes(key))g.deleteAttribute(key);const colors=new Float32Array(g.attributes.position.count*3),c=m.material.color;for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;}g.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(g);});
    const geometry=mergeGeometries(parts);for(const g of parts)g.dispose();this.geometries.set(name,geometry);return geometry;
  }
}
export const assets=new Assets();
