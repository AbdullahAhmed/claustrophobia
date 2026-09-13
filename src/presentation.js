import * as THREE from 'three';

export const BUILD = '0.3.0-demo';
export const visualDefaults = { quality: 'standard', tape: 'subtle', motion: 1, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, brightness: 1 };
export function normalizeVisuals(s) {
  for (const [key, fallback] of Object.entries(visualDefaults)) if (s[key] === undefined) s[key] = fallback;
  if (!['low','standard','high'].includes(s.quality)) s.quality = 'standard';
  if (!['off','subtle','full'].includes(s.tape)) s.tape = 'subtle';
  s.motion = THREE.MathUtils.clamp(Number(s.motion) || 0, 0, 1);
  s.brightness = THREE.MathUtils.clamp(Number(s.brightness) || 1, .7, 1.5);
  s.reduced = !!s.reduced;
  return s;
}
// Only the world passes through this shader. Text, notebook and controls remain DOM overlays.
export class Presentation {
  constructor(renderer) {
    this.renderer = renderer; this.settings = {...visualDefaults};
    this.target = new THREE.WebGLRenderTarget(1, 1, {depthBuffer: true,type:THREE.HalfFloatType});
    this.uniforms = {frame: {value: this.target.texture}, time: {value: 0}, strength: {value: .28}, motion: {value: 1}, resolution: {value: new THREE.Vector2(1,1)}};
    this.material = new THREE.ShaderMaterial({depthTest:false,depthWrite:false, uniforms:this.uniforms,
      vertexShader:`varying vec2 uv0; void main(){uv0=uv;gl_Position=vec4(position.xy,0.,1.);}`,
      fragmentShader:`uniform sampler2D frame; uniform float time,strength,motion; uniform vec2 resolution; varying vec2 uv0;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        void main(){
          vec2 p=uv0; float s=strength; float tick=floor(time*24.);
          float edge=pow(abs(p.y-.5)*2.,8.);
          float tracking=step(.985,hash(vec2(floor(time*.5),4.)))*exp(-pow((p.y-fract(time*.17))*55.,2.));
          p.x+=(sin(p.y*47.+time*.4)*edge*.0015+tracking*.004)*s*motion;
          vec2 shift=vec2((.7+edge)*s/resolution.x,0.);
          vec3 col=vec3(texture2D(frame,clamp(p+shift,0.,1.)).r,texture2D(frame,p).g,texture2D(frame,clamp(p-shift,0.,1.)).b);
          float l=dot(col,vec3(.299,.587,.114)); col=mix(col,vec3(l),s*.13);
          col+=(hash(floor(p*resolution*.65)+tick)-.5)*.018*s;
          col*=1.-s*.026*(.5+.5*sin(p.y*resolution.y*3.14159));
          col*=1.-s*.12*pow(length(p-.5)*1.4,3.);
          gl_FragColor=vec4(max(col,0.),1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`});
    this.scene=new THREE.Scene(); this.camera=new THREE.Camera();
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material); this.quad.frustumCulled=false; this.scene.add(this.quad);
  }
  apply(s) {
    this.settings={...normalizeVisuals(s)};
    const r=this.renderer;
    r.setPixelRatio(Math.min(devicePixelRatio, s.quality==='low'?1:s.quality==='high'?2:1.5));
    r.shadowMap.enabled=s.quality!=='low'; r.toneMappingExposure=s.brightness;
    this.uniforms.strength.value={off:0,subtle:.28,full:.8}[s.tape];
    this.uniforms.motion.value=s.reduced?0:1;
  }
  render(scene,camera,seconds=0) {
    const r=this.renderer, size=r.getDrawingBufferSize(new THREE.Vector2());r.info.autoReset=false;r.info.reset();
    if(this.target.width!==size.x||this.target.height!==size.y){this.target.setSize(size.x,size.y);this.uniforms.resolution.value.copy(size);}
    this.uniforms.time.value=this.settings.reduced?0:seconds;
    if(this.settings.tape==='off'){r.setRenderTarget(null);r.render(scene,camera);return;}
    r.setRenderTarget(this.target);r.render(scene,camera);r.setRenderTarget(null);r.render(this.scene,this.camera);
  }
  dispose(){this.target.dispose();this.quad.geometry.dispose();this.material.dispose();}
}
