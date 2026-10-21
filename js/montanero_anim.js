import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { crearMontanero } from './montanero.js?v=7';

// Montañero con esqueleto y animaciones (models/montanero-anim.glb, hecho en Blender con el maniquí y los clips CC0 de Quaternius: ver tools/modelos/montanero_anim.py).
// Mismo contrato que `crearMontanero`: { group, pose(fase, k, inc, c, vel), altura }. Hasta que el GLB está cargado (y si falla) se ve el montañero de siempre.
// La velocidad `vel` (m/s del montañero) elige el clip: idle → andar (≈1,2 m/s) → trotar (≈5 m/s) → correr (≈7,5 m/s), mezclados y con el ritmo del paso ajustado a la velocidad
// para que los pies no resbalen. c = { agach, manos, cuatro, brazos, giro }: agachado (clip «agachado») y brazos abiertos del funambulista (los brazos vuelven hacia la pose de reposo en T).
const URL_GLB = new URL('../models/montanero-anim.glb', import.meta.url).href;
let carga = null;
const cargaGLB = () => (carga ??= new Promise((res) => new GLTFLoader().load(`${URL_GLB}?v=${window.WEB_V || 0}`, res, undefined, () => res(null))));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const CLIPS = ['idle', 'walk', 'jog', 'sprint', 'agachado', 'agachado_quieto', 'tropiezo', 'voltereta'];
const NOMBRE_CLIP = { Idle_Loop: 'idle', Walk_Loop: 'walk', Jog_Fwd_Loop: 'jog', Sprint_Loop: 'sprint', Crouch_Fwd_Loop: 'agachado', Crouch_Idle_Loop: 'agachado_quieto', Hit_Chest: 'tropiezo', Roll: 'voltereta' };   // nombres de los clips en el GLB

function construye(gltf, { chaqueta = '#b8392e', pantalon = '#2c333b', mochila = '#d9822b', casco = '#e9e6dc', palos = 1, mochilaTipo = 'grande' } = {}) {
  const root = clone(gltf.scene), mats = new Map();
  const col = { chaqueta, pantalon, mochila, casco, mochila2: new THREE.Color(mochila).multiplyScalar(0.62), piel: '#c99273', guante: '#22262a', bota: '#4a3626', lente: '#1d2a36', palo: '#aeb4bb', negro: '#1a1b1d' };   // colores en sRGB, como en el montañero de siempre
  root.traverse((o) => {
    if (!o.isMesh) return; o.castShadow = false; o.frustumCulled = false;
    const m = o.material.clone(); o.material = m;
    if (col[m.name] !== undefined) m.color.set(col[m.name]);
  });
  const tapa = { grande: 'Mochila_grande', media: 'Mochila_media', pequena: 'Mochila_pequena' }[mochilaTipo] ?? 'Mochila_grande';
  const nodo = (n) => root.getObjectByName(n);
  for (const n of ['Mochila_grande', 'Mochila_media', 'Mochila_pequena']) { const o = nodo(n); if (o) o.visible = n === tapa; }
  const t = nodo('Mochila_tapa'); if (t) t.visible = tapa === 'Mochila_grande';
  const bastones = { R: [], L: [] };
  for (const l of ['R', 'L']) for (const s of ['', '_mango', '_punta']) { const o = nodo(`Baston_${l}${s}`); if (o) bastones[l].push(o); }
  const ver = (l, v) => bastones[l].forEach((o) => { o.visible = v; });
  const mixer = new THREE.AnimationMixer(root), acc = {};
  for (const c of gltf.animations) { const n = NOMBRE_CLIP[c.name]; if (!n) continue; const a = mixer.clipAction(c); a.play(); a.setEffectiveWeight(0); a.time = Math.random() * c.duration; acc[n] = a; }
  acc.idle?.setEffectiveWeight(1);
  const w = Object.fromEntries(CLIPS.map((n) => [n, n === 'idle' ? 1 : 0]));
  const brazos = ['DEF-upper_armL', 'DEF-upper_armR', 'DEF-forearmL', 'DEF-forearmR']   // (three quita los puntos de los nombres)
    .map((n) => root.getObjectByName(n)).filter(Boolean).map((b) => ({ b, rest: b.quaternion.clone(), k: /upper/.test(b.name) ? 0.82 : 0.5 }));
  let ultimo = performance.now(), ev = null;   // ev: episodio en curso (caída o tropiezo): lista de fases [clip, segundos]
  for (const n of ['tropiezo', 'voltereta']) if (acc[n]) { acc[n].setLoop(THREE.LoopOnce, 1); acc[n].clampWhenFinished = true; }
  // tropiezo: sacudida y se agacha un momento para recuperar el equilibrio; voltereta: cae y rueda por el suelo hasta volver a ponerse de pie. Devuelve la duración total (s), 0 si no puede.
  const FASES = { tropiezo: [['tropiezo', 0.4], ['agachado_quieto', 1.1]], voltereta: [['voltereta', 1.5], ['idle', 0.5]] };
  function evento(tipo) {
    if (ev || !FASES[tipo] || !acc[FASES[tipo][0][0]]) return 0;
    ev = { fases: FASES[tipo], i: 0, t: 0 }; const a = acc[ev.fases[0][0]]; a.reset(); a.play(); return ev.fases.reduce((x, f) => x + f[1], 0);
  }
  function pose(fase, k, inc = 0, c = null, vel = null) {
    const ahora = performance.now(), dt = clamp((ahora - ultimo) / 1000, 0.001, 0.1); ultimo = ahora;
    let s = vel ?? (k > 0.01 ? 1 + 5 * k : 0);   // sin velocidad explícita (cursor): a ojo desde la amplitud del paso
    const a = clamp(Math.max(c?.agach ?? 0, c?.cuatro ?? 0) * 1.25, 0, 1), br = c?.brazos ?? 0;
    const T = { idle: 0, walk: 0, jog: 0, sprint: 0, agachado: 0, agachado_quieto: 0 };
    if (s < 0.12) T.idle = 1; else if (s < 0.45) { T.walk = (s - 0.12) / 0.33; T.idle = 1 - T.walk; }
    else if (s < 1.9) T.walk = 1; else if (s < 3.0) { T.jog = (s - 1.9) / 1.1; T.walk = 1 - T.jog; }
    else if (s < 5.6) T.jog = 1; else if (s < 6.8) { T.sprint = (s - 5.6) / 1.2; T.jog = 1 - T.sprint; } else T.sprint = 1;
    for (const n of ['idle', 'walk', 'jog', 'sprint']) T[n] *= 1 - a;
    if (s < 0.12) T.agachado_quieto = a; else { const mov = clamp((s - 0.12) / 0.3, 0, 1); T.agachado = a * mov; T.agachado_quieto = a * (1 - mov); }
    if (ev) {   // durante una caída solo suena el clip de la fase en curso
      ev.t += dt; if (ev.t >= ev.fases[ev.i][1]) { ev.t = 0; ev.i++; if (ev.i >= ev.fases.length) ev = null; else { const a = acc[ev.fases[ev.i][0]]; if (a?.loop === THREE.LoopOnce) { a.reset(); a.play(); } } }
      for (const n of CLIPS) T[n] = 0; if (ev) T[ev.fases[ev.i][0]] = 1; else T.idle = 1;
    }
    const ts = { tropiezo: 1, voltereta: 1, idle: 1, walk: clamp(s / 1.15, 0.25, 1.7), jog: clamp(s / 5.0, 0.55, 1.25), sprint: clamp(s / 7.5, 0.8, 1.2), agachado: clamp(s / 0.67, 0.3, 1.6), agachado_quieto: 1 };
    const f = ev ? Math.min(1, dt * 20) : Math.min(1, dt * 8);
    for (const n of CLIPS) { w[n] += (T[n] - w[n]) * f; const ac = acc[n]; if (ac) { ac.setEffectiveWeight(w[n]); ac.setEffectiveTimeScale(ts[n]); } }
    mixer.update(dt);
    if (br > 0.02) for (const q of brazos) q.b.quaternion.slerp(q.rest, br * q.k);   // funambulista: brazos abiertos, como en la pose de reposo (T)
    root.rotation.x = clamp(inc * 0.5, -0.3, 0.4); root.rotation.y = c?.giro ?? 0;
    const libres = (c?.manos ?? 0) > 0.3 || br > 0.3; ver('R', palos >= 1 && !libres); ver('L', palos >= 2 && !libres);
    return 0.9 - 0.3 * a;
  }
  return { root, pose, evento };
}

export function crearMontaneroAnim(opts = {}) {
  const viejo = crearMontanero(opts), group = new THREE.Group(); group.add(viejo.group);
  let nuevo = null;
  cargaGLB().then((g) => { if (!g) return; nuevo = construye(g, opts); group.remove(viejo.group); group.add(nuevo.root); });
  return { group, altura: 1.84, pose: (fase, k, inc, c, vel) => (nuevo ? nuevo.pose(fase, k, inc, c, vel) : viejo.pose(fase, k, inc, c)), evento: (tipo) => (nuevo ? nuevo.evento(tipo) : 0) };
}
