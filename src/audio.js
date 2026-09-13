// Karst — audio engine. Real CC0 recordings (see sounds/CREDITS.md) through Web Audio:
// positional one-shots, looped layers, three synthesized cave reverbs crossfaded by how open the space is,
// and a lowpass that closes over everything when your head goes under.
export class Sfx {
  constructor(base = 'sounds/out/') {
    this.base = base; this.buffers = {}; this.manifest = {}; this.ready = false; this.last = {}; this.rotating=new Set();
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.9;   // set from settings
    this.lpf = c.createBiquadFilter(); this.lpf.type = 'lowpass'; this.lpf.frequency.value = 20000; this.lpf.Q.value = 0.5;
    this.bus = c.createGain();
    this.bus.connect(this.lpf); this.lpf.connect(this.master); this.master.connect(c.destination);
    // reverb: one send bus feeding three rooms, mixed by openness
    this.revIn = c.createGain();
    this.rooms = [this.makeRoom(0.45, 0.2), this.makeRoom(1.6, 0.35), this.makeRoom(4.2, 0.55)];
    for (const r of this.rooms) { this.revIn.connect(r.conv); r.conv.connect(r.gain); r.gain.connect(this.bus); }
    this.rooms[1].gain.gain.value = 1;
    this.underwater = false;
  }
  makeRoom(seconds, tailTone) {
    const c = this.ctx, sr = c.sampleRate, n = Math.floor(sr * seconds), ir = c.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch); let y = 0; const pre = Math.floor(sr * (0.008 + 0.012 * ch));
      for (let i = pre; i < n; i++) {
        const t = (i - pre) / sr, env = Math.exp(-6.9 * t / seconds);
        const a = 0.9 - tailTone * Math.min(1, t / seconds);          // highs die first
        y += a * ((Math.random() * 2 - 1) - y);
        d[i] = y * env * (i - pre < sr * 0.02 ? 1.6 : 1);               // a little early-reflection punch
      }
    }
    const conv = c.createConvolver(); conv.buffer = ir;
    const gain = c.createGain(); gain.gain.value = 0;
    return { conv, gain };
  }
  async load() {
    const man = await (await fetch(this.base + 'manifest.json')).json();
    this.manifest = man;
    const names = [...new Set(Object.values(man).flat())];
    await Promise.all(names.map(async f => {
      try {
        const ab = await (await fetch(this.base + f)).arrayBuffer();
        this.buffers[f] = await this.ctx.decodeAudioData(ab);
      } catch (e) { console.warn('sound failed', f, e); }
    }));
    this.ready = true;
  }
  resume() { if (this.ctx.state !== 'running') this.ctx.resume(); }
  pick(key) {
    const list = this.manifest[key]; if (!list || !list.length) return null;
    let f = list[Math.floor(Math.random() * list.length)];
    if (list.length > 1 && f === this.last[key]) f = list[(list.indexOf(f) + 1) % list.length];
    this.last[key] = f;
    return this.buffers[f] || null;
  }
  // One-shot. opts: {x,y,z} for positional, vol, rate, wet (0..1 reverb send), loop
  play(key, o = {}) {
    if (!this.ready) return null;
    const buf = this.pick(key); if (!buf) return null;
    const c = this.ctx, src = c.createBufferSource(); src.buffer = buf; src.loop = !!o.loop;
    src.playbackRate.value = (o.rate || 1) * (o.vary ? 1 + (Math.random() - 0.5) * o.vary : 1);
    const g = c.createGain(); g.gain.value = o.vol === undefined ? 1 : o.vol;
    src.connect(g);
    let out = g, pan = null;
    if (o.x !== undefined && Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.z)) {
      pan = c.createPanner(); pan.panningModel = o.hrtf === false ? 'equalpower' : 'HRTF';
      pan.distanceModel = 'inverse'; pan.refDistance = 1; pan.maxDistance = 80; pan.rolloffFactor = o.rolloff || 1.1;
      pan.positionX.value = o.x; pan.positionY.value = o.y; pan.positionZ.value = o.z;
      g.connect(pan); out = pan;
    }
    out.connect(this.bus);
    if (o.wet) { const w = c.createGain(); w.gain.value = o.wet; out.connect(w); w.connect(this.revIn); }
    if(o.loop&&o.offset===undefined)o.offset=Math.random()*buf.duration*.2;
    if (o.offset && o.dur) src.start(0, o.offset, o.dur); else src.start(0, o.offset || 0);
    const h = { src, gain: g, pan,
      stop(t = 0.05) { try { g.gain.setTargetAtTime(0, c.currentTime, t / 3); src.stop(c.currentTime + t + 0.05); } catch (e) {} },
      setVol(v, t = 0.3) { g.gain.setTargetAtTime(v, c.currentTime, t / 3); },
      setRate(r, t = 0.3) { src.playbackRate.setTargetAtTime(r, c.currentTime, t / 3); },
      setPos(x, y, z) { if (pan && Number.isFinite(x + y + z)) { pan.positionX.value = x; pan.positionY.value = y; pan.positionZ.value = z; } } };
    return h;
  }
  loop(key,o={}) {
    // Crossfade different takes/offsets before a sample wraps. Simulation time respects pause.
    const engine=this,state={key,o:{...o},vol:o.vol??0,rate:o.rate??1,left:0,current:null};
    const rotate=()=>{const prior=state.current;state.current=engine.play(key,{...state.o,rate:state.rate,loop:true,vol:0});if(!state.current)return;
      const duration=state.current.src.buffer.duration;
      // Start offsets are selected in play; rotate well before the shortest remaining loop.
      state.left=Math.max(.2,Math.min(24,duration*.65))*(.75+Math.random()*.2);state.current.setVol(state.vol,.8);prior?.stop(.8);};
    state.rotate=rotate;this.rotating.add(state);rotate();
    return {setVol(v,t=.5){state.vol=v;state.current?.setVol(v,t);},setRate(v,t=.5){state.rate=v;state.current?.setRate(v,t);},setPos(x,y,z){Object.assign(state.o,{x,y,z});state.current?.setPos(x,y,z);},stop(t=.1){engine.rotating.delete(state);state.current?.stop(t);}};
  }
  tick(dt){for(const s of this.rotating){s.left-=dt;if(s.left<=0)s.rotate();}}
  setListener(x, y, z, fx, fy, fz) {
    const L = this.ctx.listener;
    if (L.positionX) {
      L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z;
      L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(x, y, z); L.setOrientation(fx, fy, fz, 0, 1, 0); }
  }
  // open: mean free path in metres. <2.5 dead and close, ~5 a passage, >10 a chamber, 20+ a cavern
  setSpace(open) {
    const t = this.ctx.currentTime, k = 0.4;
    const tight = 1 - Math.min(1, Math.max(0, (open - 1.5) / 3));
    const big = Math.min(1, Math.max(0, (open - 6) / 10));
    const mid = 1 - Math.max(tight, big);
    const scale = this.underwater ? 0.15 : 1;
    this.rooms[0].gain.gain.setTargetAtTime(0.5 * tight * scale, t, k);
    this.rooms[1].gain.gain.setTargetAtTime(0.9 * mid * scale, t, k);
    this.rooms[2].gain.gain.setTargetAtTime(1.3 * big * scale, t, k);
  }
  setUnderwater(u) {
    if (u === this.underwater) return; this.underwater = u;
    this.lpf.frequency.setTargetAtTime(u ? 380 : 20000, this.ctx.currentTime, 0.08);
  }
}
