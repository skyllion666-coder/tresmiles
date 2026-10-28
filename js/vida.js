import * as THREE from 'three';

// Vida del mapa: agua de los ibones, aves planeando y sonido ambiental generado en el navegador.
// Contornos de lagos: © colaboradores de OpenStreetMap (ODbL), ver «Acerca de».

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

// — agua —
// Cada ibón es una malla en rejilla con la distancia a la orilla en cada vértice (aD.x, en m; negativa fuera) y la mayor
// distancia del ibón (aD.y). Con ella el shader recorta el contorno suave, aclara el agua somera junto a la orilla
// (turquesa sobre el fondo de piedra) y la oscurece hacia el centro; encima, ondas de viento, reflejo del cielo y del sol.
const waterMat = () => new THREE.ShaderMaterial({
  fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uT: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color('#fff3dc') },
    uSky: { value: new THREE.Color('#a9c8dc') },
  }]),
  vertexShader: `attribute vec2 aD; varying vec3 vW; varying vec2 vD;
    #include <fog_pars_vertex>
    void main(){ vD = aD; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: `varying vec3 vW; varying vec2 vD; uniform float uT; uniform vec3 uSunDir, uSunCol, uSky;
    #include <fog_pars_fragment>
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y); }
    // altura de las ondas: dos trenes que se cruzan con el viento y un rizado fino
    float olas(vec2 q){
      return noise(q * 0.045 + vec2(uT * 0.10, uT * 0.04)) * 0.6 + noise(q * 0.11 - vec2(uT * 0.05, uT * 0.13)) * 0.3
           + noise(q * 0.31 + vec2(uT * 0.21, -uT * 0.17)) * 0.1;
    }
    void main(){
      float d = vD.x, dm = max(vD.y, 0.5);
      if (d <= 0.0) discard;
      vec2 q = vW.xz;
      vec3 V = normalize(cameraPosition - vW);
      float lejos = length(cameraPosition - vW);
      // de lejos se apagan las ondas finas (sin parpadeo)
      float amp = 2.2 * (1.0 - smoothstep(2500.0, 14000.0, lejos));
      float e = 1.5, h0 = olas(q);
      vec3 N = normalize(vec3((h0 - olas(q + vec2(e, 0.0))) * amp, 1.0, (h0 - olas(q + vec2(0.0, e))) * amp));
      float f = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
      // profundidad aparente: somera junto a la orilla, honda en el centro
      float hondo = smoothstep(0.0, min(dm, 9.0 + dm * 0.35), d);
      vec3 somera = vec3(0.36, 0.60, 0.55), media = vec3(0.07, 0.36, 0.42), honda = vec3(0.03, 0.15, 0.24);
      vec3 agua = mix(somera, media, smoothstep(0.0, 0.45, hondo));
      agua = mix(agua, honda, smoothstep(0.45, 1.0, hondo));
      agua *= 0.75 + 0.35 * clamp(uSunDir.y * 1.6, 0.0, 1.0);
      vec3 cielo = mix(uSky, vec3(1.0), 0.15 * (1.0 - V.y));
      vec3 col = mix(agua, cielo, clamp(f * 1.15, 0.0, 0.85));
      // brillo del sol sobre las ondas y destellos sueltos
      vec3 R = reflect(-uSunDir, N);
      float g = pow(max(dot(R, V), 0.0), 220.0) * 3.0 + pow(max(dot(R, V), 0.0), 30.0) * 0.18;
      float tw = step(0.96, hash(floor(q * 0.4))) * pow(0.5 + 0.5 * sin(uT * 2.3 + hash(floor(q * 0.4) + 3.0) * 40.0), 8.0);
      col += uSunCol * (g + tw * 0.45 * (1.0 - smoothstep(1500.0, 6000.0, lejos))) * smoothstep(-0.1, 0.3, uSunDir.y);
      // orilla: una raya clara de espuma muy fina que respira, y el borde se funde con la piedra
      float espuma = (1.0 - smoothstep(0.4, 2.2, d)) * (0.55 + 0.45 * noise(q * 0.25 + uT * 0.3));
      col = mix(col, vec3(0.86, 0.90, 0.88), espuma * 0.35 * (1.0 - smoothstep(800.0, 4000.0, lejos)));
      float alfa = smoothstep(0.0, clamp(dm * 0.25, 0.6, 3.0), d) * mix(0.82, 1.0, hondo);
      alfa *= 1.0 - smoothstep(9000.0, 20000.0, lejos);   // los ibones muy lejanos se apagan: con la profundidad tan repartida a esa distancia se colaban tras las crestas
      if (alfa < 0.01) discard;
      gl_FragColor = vec4(col, alfa);
      #include <fog_fragment>
    }`,
});

// distancia con signo de (x, z) al polígono (positiva dentro)
function distOrilla(pts, x, z) {
  let dmin = Infinity, dentro = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[j], b = pts[i];
    if ((b.z > z) !== (a.z > z) && x < ((a.x - b.x) * (z - b.z)) / (a.z - b.z) + b.x) dentro = !dentro;
    const ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2));
    const dx = a.x + t * ex - x, dz = a.z + t * ez - z, d2 = dx * dx + dz * dz;
    if (d2 < dmin) dmin = d2;
  }
  return dentro ? Math.sqrt(dmin) : -Math.sqrt(dmin);
}

// rejilla del ibón: solo las celdas con alguna esquina dentro; el contorno exacto lo recorta el shader
function mallaIbon(pts, y, out) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  const lado = Math.min(x1 - x0, z1 - z0);
  let c = Math.max(2, Math.min(40, lado / 8));
  c = Math.max(c, (x1 - x0) / 140, (z1 - z0) / 140);
  x0 -= c; z0 -= c;
  const nx = Math.ceil((x1 + c - x0) / c) + 1, nz = Math.ceil((z1 + c - z0) / c) + 1;
  const sd = new Float32Array(nx * nz);
  let dm = 0;
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { const v = distOrilla(pts, x0 + i * c, z0 + k * c); sd[k * nx + i] = v; if (v > dm) dm = v; }
  const idx = new Int32Array(nx * nz).fill(-1);
  const vert = (i, k) => {
    const n = k * nx + i;
    if (idx[n] < 0) { idx[n] = out.pos.length / 3; out.pos.push(x0 + i * c, y, z0 + k * c); out.d.push(sd[n], dm); }
    return idx[n];
  };
  for (let k = 0; k < nz - 1; k++) for (let i = 0; i < nx - 1; i++) {
    const n = k * nx + i;
    if (Math.max(sd[n], sd[n + 1], sd[n + nx], sd[n + nx + 1]) <= 0) continue;
    const a = vert(i, k), b = vert(i + 1, k), cc = vert(i + 1, k + 1), d = vert(i, k + 1);
    out.ind.push(a, d, b, b, d, cc);
  }
}

// Los ibones se dibujan por bloques, cuando ya hay alturas suficientes (nivel 2 o mejor) en el bloque: `construirBloque(i, j)`.
// Todos los ibones de un bloque van en una sola malla.
export async function crearLagos({ scene, geo, url, meta }) {
  const data = await fetch(`${url}?dv=${window.DATOS_V || 0}`, { cache: 'no-cache' }).then((r) => r.json());
  const mat = waterMat(), CH = meta.chunk;
  const porBloque = new Map(), etiquetados = new Set(), nombrados = [];
  const todos = [];   // contorno de cada ibón (para que los rebecos encuentren una orilla donde beber)
  let n = 0;
  for (const l of data) {
    const pts = l.poly.map(([lon, lat]) => geo.toXZ(lon, lat));
    if (pts.some((p) => !geo.dentro(p.x, p.z, 100))) continue;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
    const i = Math.min(meta.nci - 1, Math.max(0, Math.floor((cx + geo.W / 2) / geo.dx / CH))), j = Math.min(meta.ncj - 1, Math.max(0, Math.floor((cz + geo.oz) / geo.dz / CH)));
    const k = `${i}_${j}`; if (!porBloque.has(k)) porBloque.set(k, { lista: [], hecho: false });
    porBloque.get(k).lista.push({ l, pts, cx, cz });
    todos.push({ pts, cx, cz, area: l.area });
  }
  function construirBloque(i, j) {
    const b = porBloque.get(`${i}_${j}`); if (!b || b.hecho) return [];
    b.hecho = true; const nuevos = [], out = { pos: [], d: [], ind: [] };
    for (const { l, pts, cx, cz } of b.lista) {
      const y = median(pts.map((p) => geo.heightAt(p.x, p.z))) + 4;
      mallaIbon(pts, y, out); n++;
      if (l.nombre && (l.area >= 2500 || l.etiqueta) && !etiquetados.has(l.nombre)) {
        etiquetados.add(l.nombre);
        const e = { nombre: l.nombre, x: cx, y: y + 6, z: cz, area: l.area }; nombrados.push(e); nuevos.push(e);
      }
    }
    if (out.ind.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
      g.setAttribute('aD', new THREE.Float32BufferAttribute(out.d, 2));
      g.setIndex(out.ind);
      const m = new THREE.Mesh(g, mat);
      m.renderOrder = 1; m.frustumCulled = false;
      scene.add(m);
    }
    return nuevos;
  }
  const _c = new THREE.Color(), AZUL = new THREE.Color('#a9c8dc');
  return {
    get count() { return n; }, nombrados, construirBloque,
    // ibón más cercano a (x, z) dentro de `radio` m y de al menos `areaMin` m²: su contorno y el vértice de la orilla más próximo
    orillaCerca(x, z, radio, areaMin = 0) {
      let mejor = null, md = radio * radio;
      for (const L of todos) {
        if (L.area < areaMin || Math.abs(L.cx - x) > radio + 2000 || Math.abs(L.cz - z) > radio + 2000) continue;
        L.pts.forEach((p, i) => { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < md) { md = d; mejor = { pts: L.pts, cx: L.cx, cz: L.cz, i }; } });
      }
      return mejor;
    },
    // el cielo reflejado se tiñe con el color del sol cuando está bajo (mañana y tarde)
    setSol(dir, col) {
      const u = mat.uniforms; u.uSunDir.value.copy(dir).normalize(); u.uSunCol.value.set(col);
      const bajo = 1 - Math.min(1, Math.max(0, (u.uSunDir.value.y - 0.2) / 0.5));
      u.uSky.value.copy(AZUL).lerp(_c.set(col), 0.35 * bajo);
    },
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
const NIVEL_MUSICA = 0.64;   // música de fondo al 64 % del nivel original (-25 % y luego -15 % más)
export function crearSonido() {
  let ctx = null, master, windGain, waterGain, windF, musicGain, on = false, alturaAct = 0, timerAves = null, esperando = false, analizador = null, bufRuido = null, fxGain = null, ultimoFx = 0;
  const ruido = (c) => {
    const len = c.sampleRate * 4, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22; }
    return buf;
  };
  function montar() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    analizador = ctx.createAnalyser(); analizador.fftSize = 2048; master.connect(analizador);
    const buf = ruido(ctx); bufRuido = buf;
    const fuente = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 3); return s; };
    // viento: ruido rosa filtrado, con ráfagas lentas
    windF = ctx.createBiquadFilter(); windF.type = 'bandpass'; windF.frequency.value = 420; windF.Q.value = 0.6;
    windGain = ctx.createGain(); windGain.gain.value = 0.03;
    const windMod = ctx.createGain(); windMod.gain.value = 0.75;
    fuente().connect(windF).connect(windMod).connect(windGain).connect(master);
    const lfo = (rate, depth, target) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = rate; g.gain.value = depth; o.connect(g).connect(target); o.start(); };
    lfo(0.11, 0.25, windMod.gain); lfo(0.07, 160, windF.frequency);
    // agua: ruido más agudo y suave
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 2100; wf.Q.value = 0.8;
    waterGain = ctx.createGain(); waterGain.gain.value = 0;
    const waterMod = ctx.createGain(); waterMod.gain.value = 0.5;
    fuente().connect(wf).connect(waterMod).connect(waterGain).connect(master);
    lfo(0.35, 0.32, waterMod.gain); lfo(0.13, 0.18, waterMod.gain);
    // música de fondo: bucle propio (instrumentos de VSCO-2 CE, CC0)
    musicGain = ctx.createGain(); musicGain.gain.value = NIVEL_MUSICA; musicGain.connect(master);
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
  // efectos de interfaz: tonos sinusoidales muy breves, con el mismo volumen bajo; solo suenan si el sonido está activado y el audio en marcha
  function tono(t, f0, f1, dur, vol, tipo = 'sine') {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = tipo; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(fxGain); o.start(t); o.stop(t + dur + 0.03);
  }
  const FX = {
    seleccion: (t) => { tono(t, 880, 880, 0.16, 0.10); tono(t, 1320, 1320, 0.11, 0.035); },
    activar: (t) => { tono(t, 620, 620, 0.09, 0.09); tono(t + 0.07, 930, 930, 0.12, 0.09); },
    desactivar: (t) => { tono(t, 840, 840, 0.09, 0.08); tono(t + 0.07, 560, 560, 0.12, 0.08); },
    abrir: (t) => tono(t, 520, 780, 0.12, 0.09),
    cerrar: (t) => tono(t, 740, 480, 0.12, 0.08),
    toque: (t) => tono(t, 700, 760, 0.09, 0.08),
    inicio: (t) => { tono(t, 520, 520, 0.14, 0.08); tono(t + 0.09, 780, 780, 0.17, 0.07); },
    ficha: (t) => {   // un pequeño soplo de aire (ruido filtrado que sube) con una nota suave encima
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = bufRuido; f.type = 'bandpass'; f.Q.value = 0.9; f.frequency.setValueAtTime(380, t); f.frequency.exponentialRampToValueAtTime(1500, t + 0.34);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      s.connect(f).connect(g).connect(fxGain); s.start(t, Math.random() * 3); s.stop(t + 0.42);
      tono(t + 0.05, 740, 988, 0.2, 0.07);
    },
  };
  // ducking: la música baja un 40 % en ~30 ms mientras suena el efecto y recupera su nivel en ~0,7 s; si llegan más pulsaciones, parte del valor actual (sin saltos)
  function baja(dur) {
    if (!musicGain) return;
    const g = musicGain.gain, t = ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.setTargetAtTime(NIVEL_MUSICA * 0.6, t, 0.02);
    g.setTargetAtTime(NIVEL_MUSICA, t + dur, 0.22);
  }
  // llamada del quebrantahuesos (grabación de adalaves, YouTube): se carga la primera vez que hace falta; sonido más bajo y apagado cuanto más lejos esté el ave
  let llamadaBuf = null, llamadaCarga = false, ultimaLlamada = 0;
  function llamada(dist, pan) {
    try {
      if (!on || !ctx || ctx.state !== 'running' || document.hidden) return false;
      if (!llamadaBuf) {
        if (!llamadaCarga) { llamadaCarga = true; fetch('audio/quebrantahuesos.mp3').then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((b) => { llamadaBuf = b; }).catch(() => {}); }
        return false;
      }
      const t = ctx.currentTime + 0.02, k = Math.max(0, 1 - dist / 16000);
      const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), pn = ctx.createStereoPanner();
      src.buffer = llamadaBuf; lp.type = 'lowpass'; lp.frequency.value = 2500 + 9000 * k * k; pn.pan.value = Math.max(-0.8, Math.min(0.8, pan));
      g.gain.value = 0.12 + 0.75 * k * k;
      src.connect(lp).connect(g).connect(pn).connect(master); src.start(t);
      src.onended = () => { try { src.disconnect(); pn.disconnect(); } catch (e) { /* ya desconectado */ } };
      ultimaLlamada = performance.now(); return true;
    } catch (e) { return false; }
  }
  function fx(tipo) {
    try {
      if (!on || !ctx || ctx.state !== 'running' || !FX[tipo] || document.hidden) return;
      const ahora = performance.now();
      if (ahora - ultimoFx < 110) return;   // una acción, un sonido: las llamadas casi simultáneas se descartan
      ultimoFx = ahora;
      if (!fxGain) { fxGain = ctx.createGain(); fxGain.gain.value = 1.9; fxGain.connect(ctx.destination); }
      FX[tipo](ctx.currentTime + 0.01);
      baja(tipo === 'ficha' ? 0.5 : 0.3);
    } catch (e) { /* sin audio: la web sigue igual */ }
  }
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else if (on) ctx.resume(); });
  return {
    get on() { return on; },
    fx, llamada,
    get msUltimaLlamada() { return ultimaLlamada; },
    get nivel() { if (!analizador) return 0; const d = new Float32Array(analizador.fftSize); analizador.getFloatTimeDomainData(d); return Math.sqrt(d.reduce((a, x) => a + x * x, 0) / d.length); },
    get estado() { return ctx ? ctx.state : 'sin iniciar'; },
    async set(v) {
      on = v;
      if (v) {
        if (!ctx) montar();
        master.gain.setTargetAtTime(0.5, ctx.currentTime, 0.6);
        // sin gesto previo el navegador deja el audio en pausa: se reanuda con la primera interacción
        ctx.resume().catch(() => {});
        if (ctx.state !== 'running' && !esperando) {
          esperando = true;
          const evs = ['pointerdown', 'mousedown', 'click', 'keydown', 'touchstart', 'touchend'];
          const ya = () => {
            if (!on || !ctx) { esperando = false; evs.forEach((e) => removeEventListener(e, ya, true)); return; }
            ctx.resume().then(() => { if (ctx.state === 'running') { esperando = false; evs.forEach((e) => removeEventListener(e, ya, true)); } }).catch(() => {});
          };
          evs.forEach((e) => addEventListener(e, ya, true));
        }
      }
      else if (ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    },
    // altura: m sobre el terreno; lago: distancia en m al ibón más cercano
    update(alturaSobreSuelo, lago) {
      if (!ctx || !on) return;
      alturaAct = alturaSobreSuelo;
      const alto = Math.min(1, alturaSobreSuelo / 9000);
      windGain.gain.setTargetAtTime(0.03 + 0.09 * alto, ctx.currentTime, 0.5);
      waterGain.gain.setTargetAtTime(0.012 * Math.max(0, 1 - lago / 3500) * (1 - alto * 0.6), ctx.currentTime, 0.4);
    },
  };
}
