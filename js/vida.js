import * as THREE from 'three';

// Vida del mapa: agua de los ibones, aves planeando y sonido ambiental generado en el navegador.
// Contornos de lagos: © colaboradores de OpenStreetMap (ODbL), ver «Acerca de».

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

// — agua —
const waterMat = () => new THREE.ShaderMaterial({
  fog: true, transparent: false, side: THREE.DoubleSide,
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uT: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color('#fff3dc') },
  }]),
  vertexShader: `varying vec3 vW;
    #include <fog_pars_vertex>
    void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: `varying vec3 vW; uniform float uT; uniform vec3 uSunDir, uSunCol;
    #include <fog_pars_fragment>
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    void main(){
      vec2 q = vW.xz;
      float a = sin(dot(q, vec2(0.11, 0.07)) + uT * 0.9) + sin(dot(q, vec2(-0.09, 0.13)) - uT * 1.2) + sin(dot(q, vec2(0.05, -0.17)) + uT * 0.7);
      float b = cos(dot(q, vec2(0.11, 0.07)) + uT * 0.9) * 0.11 + cos(dot(q, vec2(-0.05, 0.17)) - uT * 0.7) * 0.07;
      vec3 N = normalize(vec3(b * 0.9 + a * 0.012, 1.0, a * 0.014 - b * 0.5));
      vec3 V = normalize(cameraPosition - vW);
      float f = pow(1.0 - max(dot(N, V), 0.0), 3.0);
      vec3 deep = vec3(0.10, 0.31, 0.38), sky = vec3(0.62, 0.78, 0.88);
      vec3 col = mix(deep, sky, clamp(0.2 + f * 1.1, 0.0, 1.0));
      vec3 R = reflect(-uSunDir, N);
      float g = pow(max(dot(R, V), 0.0), 90.0);
      vec2 cell = floor(q * 0.35);
      float tw = step(0.93, hash(cell)) * pow(0.5 + 0.5 * sin(uT * 2.3 + hash(cell + 3.0) * 40.0), 6.0);
      col += uSunCol * (g * 1.4 + tw * 0.55 * smoothstep(0.0, 0.6, uSunDir.y + 0.35));
      gl_FragColor = vec4(col, 1.0);
      #include <fog_fragment>
    }`,
});

export async function crearLagos({ scene, geo, url }) {
  const data = await fetch(url).then((r) => r.json());
  const mat = waterMat();
  const porNombre = new Map();
  let n = 0;
  for (const l of data) {
    const pts = l.poly.map(([lon, lat]) => geo.toXZ(lon, lat));
    if (pts.some((p) => Math.abs(p.x) > geo.W / 2 - 100 || Math.abs(p.z) > geo.D / 2 - 100)) continue;
    const y = median(pts.map((p) => geo.heightAt(p.x, p.z))) + 4;
    const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.z)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(g, mat);
    m.position.y = y; m.renderOrder = 1; m.frustumCulled = false;
    scene.add(m); n++;
    if (l.nombre) {
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
      const prev = porNombre.get(l.nombre);
      if (!prev || l.area > prev.area) porNombre.set(l.nombre, { nombre: l.nombre, x: cx, y: y + 6, z: cz, area: l.area });
    }
  }
  const nombrados = [...porNombre.values()].filter((l) => l.area >= 2500);
  return {
    count: n, nombrados,
    setSol(dir, col) { mat.uniforms.uSunDir.value.copy(dir).normalize(); mat.uniforms.uSunCol.value.set(col); },
    update(t) { mat.uniforms.uT.value = t; },
  };
}

// — aves —
function crearAve({ envergadura, color }) {
  const S = envergadura / 2;
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: true });
  const ala = (lado) => {
    const g = new THREE.BufferGeometry();
    const v = new Float32Array([0, 0, -S * 0.2, 0, 0, S * 0.28, lado * S, 0, S * 0.12, lado * S, 0, -S * 0.02]);
    g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return new THREE.Mesh(g, mat);
  };
  const cuerpo = new THREE.Mesh(new THREE.ConeGeometry(S * 0.07, S * 0.7, 5).rotateX(-Math.PI / 2), mat);
  const cola = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([-S * 0.1, 0, S * 0.28, S * 0.1, 0, S * 0.28, 0, 0, S * 0.62]), 3)), mat);
  const izq = ala(-1), der = ala(1);
  const g = new THREE.Group(); g.add(cuerpo, cola, izq, der);
  g.userData = { izq, der };
  return g;
}

export function crearAves({ scene, geo, centro }) {
  const defs = [
    { env: 105, col: '#2a2926', rx: 2300, rz: 1500, vel: 0.055, fase: 0, alt: 520, rot: 0.4 },
    { env: 100, col: '#34302b', rx: 3300, rz: 2200, vel: -0.04, fase: 2.1, alt: 760, rot: -0.7 },
    { env: 120, col: '#6d6354', rx: 1900, rz: 1300, vel: 0.07, fase: 4.0, alt: 380, rot: 1.2 },
    { env: 118, col: '#756a5a', rx: 2700, rz: 1900, vel: -0.05, fase: 1.0, alt: 640, rot: 0.1 },
    { env: 112, col: '#665c4e', rx: 1500, rz: 1100, vel: 0.08, fase: 5.2, alt: 300, rot: -0.3 },
  ];
  const aves = defs.map((d) => { const a = crearAve({ envergadura: d.env, color: d.col }); scene.add(a); return { a, d }; });
  const pos = (d, t) => {
    const ang = d.fase + t * d.vel;
    const lx = Math.cos(ang) * d.rx, lz = Math.sin(ang) * d.rz, c = Math.cos(d.rot), s = Math.sin(d.rot);
    const x = centro.x + lx * c - lz * s, z = centro.z + lx * s + lz * c;
    return { x, z, y: geo.heightAt(x, z) + d.alt * (0.55 + 0.45 * Math.sin(t * 0.11 + d.fase * 1.7)) + 160 };
  };
  return {
    aves,
    update(t) {
      for (const { a, d } of aves) {
        const p = pos(d, t), q = pos(d, t + 0.4);
        a.position.set(p.x, p.y, p.z);
        const dir = new THREE.Vector3(q.x - p.x, q.y - p.y, q.z - p.z);
        a.rotation.set(0, Math.atan2(-dir.x, -dir.z), 0, 'YXZ');
        a.rotateZ(-Math.sign(d.vel) * 0.28);
        const aleteo = 0.12 + 0.07 * Math.sin(t * 0.9 + d.fase * 3) + 0.05 * Math.sin(t * 2.3 + d.fase);
        a.userData.izq.rotation.z = -aleteo; a.userData.der.rotation.z = aleteo;
      }
    },
  };
}

// — sonido ambiental (viento y agua), generado con Web Audio: sin archivos ni licencias —
export function crearSonido() {
  let ctx = null, master, windGain, waterGain, windF, musicGain, on = false, alturaAct = 0, timerAves = null;
  const ruido = (c) => {
    const len = c.sampleRate * 4, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22; }
    return buf;
  };
  function montar() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    const buf = ruido(ctx);
    const fuente = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 3); return s; };
    // viento: ruido rosa filtrado, con ráfagas lentas
    windF = ctx.createBiquadFilter(); windF.type = 'bandpass'; windF.frequency.value = 420; windF.Q.value = 0.6;
    windGain = ctx.createGain(); windGain.gain.value = 0.5;
    fuente().connect(windF).connect(windGain).connect(master);
    const lfo = (rate, depth, target) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = rate; g.gain.value = depth; o.connect(g).connect(target); o.start(); };
    lfo(0.11, 0.28, windGain.gain); lfo(0.07, 160, windF.frequency);
    // agua: ruido más agudo y suave
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 2100; wf.Q.value = 0.8;
    waterGain = ctx.createGain(); waterGain.gain.value = 0;
    fuente().connect(wf).connect(waterGain).connect(master);
    lfo(0.35, 0.02, waterGain.gain);
    // música de fondo: bucle propio (instrumentos de VSCO-2 CE, CC0)
    musicGain = ctx.createGain(); musicGain.gain.value = 1.0; musicGain.connect(master);
    fetch('audio/ambiente.mp3').then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((buf) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(musicGain); s.start();
    }).catch(() => {});
    programaAve();
  }
  // pájaros sintetizados: tres cantos distintos, más frecuentes cerca del suelo
  function canto(tipo, t0, pan) {
    const out = ctx.createGain(), p = ctx.createStereoPanner(); p.pan.value = pan; out.connect(p).connect(master);
    const nota = (t, f0, f1, dur, vol) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
    };
    const base = 2600 + Math.random() * 1800;
    if (tipo === 0) for (let i = 0; i < 4 + (Math.random() * 4 | 0); i++) nota(t0 + i * 0.13, base, base * 1.35, 0.09, 0.05);                 // trino
    else if (tipo === 1) { nota(t0, base * 0.8, base * 1.3, 0.16, 0.06); nota(t0 + 0.24, base * 1.3, base * 0.9, 0.22, 0.05); }           // dos notas
    else for (let i = 0; i < 6; i++) nota(t0 + i * 0.11, base * (1.25 - i * 0.06), base * (1.15 - i * 0.07), 0.1, 0.045);                // descendente
    setTimeout(() => out.disconnect(), 2500);
  }
  function programaAve() {
    clearTimeout(timerAves);
    const espera = 3500 + Math.random() * 9000 + Math.min(1, alturaAct / 3000) * 14000;
    timerAves = setTimeout(() => {
      if (on && ctx && ctx.state === 'running' && alturaAct < 6000) canto((Math.random() * 3) | 0, ctx.currentTime + 0.05, Math.random() * 1.6 - 0.8);
      programaAve();
    }, espera);
  }
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else if (on) ctx.resume(); });
  return {
    get on() { return on; },
    async set(v) {
      on = v;
      if (v) { if (!ctx) montar(); await ctx.resume(); master.gain.setTargetAtTime(0.5, ctx.currentTime, 0.6); }
      else if (ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    },
    // altura: m sobre el terreno; lago: distancia en m al ibón más cercano
    update(alturaSobreSuelo, lago) {
      if (!ctx || !on) return;
      alturaAct = alturaSobreSuelo;
      const alto = Math.min(1, alturaSobreSuelo / 9000);
      windGain.gain.setTargetAtTime(0.12 + 0.35 * alto, ctx.currentTime, 0.5);
      waterGain.gain.setTargetAtTime(0.025 * Math.max(0, 1 - lago / 3500) * (1 - alto * 0.6), ctx.currentTime, 0.4);
    },
  };
}
