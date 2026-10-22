import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { crearMontanero } from './montanero.js?v=7';

// Montañero con esqueleto y animaciones (models/montanero-anim.glb, hecho en Blender con el maniquí y los clips CC0 de Quaternius: ver tools/modelos/montanero_anim.py).
// Mismo contrato que `crearMontanero`: { group, pose(fase, k, inc, c, vel, hielo), altura } (hielo > 0,5: crampones puestos, piolet en la mano y bastones guardados; si no, crampones en la mochila). Hasta que el GLB está cargado (y si falla) se ve el montañero de siempre.
// La velocidad `vel` (m/s del montañero) elige el clip: idle → andar (≈1,2 m/s) → trotar (≈5 m/s) → correr (≈7,5 m/s), mezclados y con el ritmo del paso ajustado a la velocidad
// para que los pies no resbalen. c = { agach, manos, cuatro, brazos, giro }: agachado (clip «agachado») y brazos abiertos del funambulista (los brazos vuelven hacia la pose de reposo en T).
const URL_GLB = { chico: new URL('../models/montanero-anim.glb', import.meta.url).href, chica: new URL('../models/montanera-anim.glb', import.meta.url).href };   // la montañera: mismo esqueleto y clips, otro cuerpo, pelo y coleta (tools/modelos/montanero_anim.py --chica)
const carga = {};
const cargaGLB = (tipo = 'chico') => (carga[tipo] ??= new Promise((res) => new GLTFLoader().load(`${URL_GLB[tipo]}?v=${window.WEB_V || 0}`, res, undefined, () => res(null))));
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const CLIPS = ['idle', 'walk', 'jog', 'sprint', 'agachado', 'agachado_quieto', 'tropiezo', 'voltereta'];
const NOMBRE_CLIP = { Idle_Loop: 'idle', Walk_Loop: 'walk', Jog_Fwd_Loop: 'jog', Sprint_Loop: 'sprint', Crouch_Fwd_Loop: 'agachado', Crouch_Idle_Loop: 'agachado_quieto', Hit_Chest: 'tropiezo', Roll: 'voltereta' };   // nombres de los clips en el GLB

function construye(gltf, { chaqueta = '#b8392e', pantalon = '#2c333b', mochila = '#d9822b', casco = '#e9e6dc', palos = 1, mochilaTipo = 'grande', chica = false } = {}) {
  const root = clone(gltf.scene), mats = new Map();
  const col = { chaqueta, pantalon, mochila, casco, mochila2: new THREE.Color(mochila).multiplyScalar(0.62), pelo: '#4b2f1c', cinta: '#f0c63e', piel: '#c99273', guante: '#22262a', bota: '#4a3626', lente: '#1d2a36', palo: '#aeb4bb', negro: '#1a1b1d' };   // colores en sRGB, como en el montañero de siempre
  root.traverse((o) => {
    if (!o.isMesh) return; o.castShadow = false; o.frustumCulled = false;
    const m = o.material.clone(); o.material = m;
    if (col[m.name] !== undefined) m.color.set(col[m.name]);
  });
  const tapa = { grande: 'Mochila_grande', media: 'Mochila_media', pequena: 'Mochila_pequena' }[mochilaTipo] ?? 'Mochila_grande';
  const nodo = (n) => root.getObjectByName(n);
  for (const n of ['Mochila_grande', 'Mochila_media', 'Mochila_pequena']) { const o = nodo(n); if (o) o.visible = n === tapa; }
  const t = nodo('Mochila_tapa'); if (t) t.visible = tapa === 'Mochila_grande';
  // crampones: recogidos en la espalda de la mochila (Crampones_<tipo>) o puestos en las botas (Crampon_L/R_*), según `hielo` (0-1; se cambian al pasar de 0,5)
  const enMochila = ['', '_correas'].map((x) => nodo(`Crampones_${mochilaTipo}${x}`)).filter(Boolean);
  for (const n of ['grande', 'media', 'pequena']) if (n !== mochilaTipo) for (const x of ['', '_correas']) { const o = nodo(`Crampones_${n}${x}`); if (o) o.visible = false; }
  const enBotas = ['L', 'R'].flatMap((l) => ['punta', 'talon', 'correas'].map((x) => nodo(`Crampon_${l}_${x}`))).filter(Boolean);
  const piolet = ['Piolet', 'Piolet_cabeza', 'Piolet_punta'].map(nodo).filter(Boolean);   // en el hielo: crampones puestos, bastones guardados y piolet en la mano
  let conHielo = null;
  const ponCrampones = (si) => { if (si === conHielo) return; conHielo = si; for (const o of piolet) o.visible = si; for (const o of enMochila) o.visible = !si; for (const o of enBotas) o.visible = si; };
  ponCrampones(false);
  for (const l of ['R', 'L']) for (const s of ['', '_mango', '_punta']) { const o = nodo(`Baston_${l}${s}`); if (o) o.visible = false; }   // los bastones del GLB van rígidos a la mano: se dibujan aparte para clavarlos en el suelo
  const matPalo = new THREE.MeshStandardMaterial({ color: col.palo, roughness: 0.35, metalness: 0.4 }), matNegro = new THREE.MeshStandardMaterial({ color: col.negro, roughness: 0.8 });
  const LB = 1.12;   // largo del bastón (m)
  const bastones = {};
  for (const l of ['R', 'L']) {
    const g = new THREE.Group(), y0 = -LB + 0.09;   // el agarre en y = 0.09 y la punta en y = -LB + 0.09 (y local del grupo = a lo largo del bastón)
    const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, LB, 8), matPalo); palo.position.y = y0 + LB / 2;
    const mango = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.13, 8), matNegro); mango.position.y = 0.09 - 0.0;
    const punta = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 0.05, 8), matNegro); punta.position.y = y0 + 0.03;
    g.add(palo, mango, punta); g.visible = false; g.frustumCulled = false; root.add(g); bastones[l] = g;
  }
  const mano = { R: root.getObjectByName('DEF-handR'), L: root.getObjectByName('DEF-handL') };
  const cadena = { R: ['DEF-upper_armR', 'DEF-forearmR', 'DEF-handR'].map((n) => root.getObjectByName(n)), L: ['DEF-upper_armL', 'DEF-forearmL', 'DEF-handL'].map((n) => root.getObjectByName(n)) };
  const caderas = root.getObjectByName('DEF-hips'); let faseM = 0;
  if (chica) root.scale.setScalar(0.93);   // 1,70 m
  const coleta = ['Coleta1', 'Coleta2'].map((n) => root.getObjectByName(n)).filter(Boolean).map((b) => ({ b, rest: b.quaternion.clone() })); let faseC = 0;
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
  // apoyo de las manos (cuerpo a tierra en los pasos de trepada): cada mano busca un punto de la roca por delante con una cadena de dos huesos (hombro-codo-mano)
  const V = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), t: new THREE.Vector3(), e: new THREE.Vector3(), d1: new THREE.Vector3(), d2: new THREE.Vector3(), pol: new THREE.Vector3() };
  const Q = { w: new THREE.Quaternion(), p: new THREE.Quaternion(), r: new THREE.Quaternion() };
  function giraHacia(hueso, desde, hacia, peso) {   // gira el hueso (en el mundo) para que la dirección `desde` pase a `hacia`; peso 0-1 mezcla con la pose actual
    Q.r.setFromUnitVectors(desde, hacia); hueso.getWorldQuaternion(Q.w); hueso.parent.getWorldQuaternion(Q.p).invert();
    const orig = hueso.quaternion.clone(); hueso.quaternion.copy(Q.p.multiply(Q.r.multiply(Q.w))); hueso.quaternion.slerpQuaternions(orig, hueso.quaternion, peso); hueso.updateMatrixWorld(true);
  }
  function alcanza([hombro, codo, muneca], objetivo, polo, peso) {
    hombro.getWorldPosition(V.a); codo.getWorldPosition(V.b); muneca.getWorldPosition(V.c);
    const l1 = V.a.distanceTo(V.b), l2 = V.b.distanceTo(V.c); V.t.copy(objetivo).sub(V.a);
    const dist = clamp(V.t.length(), Math.abs(l1 - l2) + 0.02, (l1 + l2) * 0.995); V.t.normalize();
    const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
    V.pol.copy(polo).addScaledVector(V.t, -polo.dot(V.t)).normalize();
    V.e.copy(V.a).addScaledVector(V.t, a).addScaledVector(V.pol, h);   // codo deseado
    V.d1.copy(V.b).sub(V.a).normalize(); V.d2.copy(V.e).sub(V.a).normalize(); giraHacia(hombro, V.d1, V.d2, peso);
    codo.getWorldPosition(V.b); muneca.getWorldPosition(V.c); V.d1.copy(V.c).sub(V.b).normalize();
    V.d2.copy(V.a).addScaledVector(V.t, dist).sub(V.b).normalize(); giraHacia(codo, V.d1, V.d2, peso);
  }
  const AX = new THREE.Vector3(), OBJ = new THREE.Vector3(), POLO = new THREE.Vector3(), PH = new THREE.Vector3(), PH2 = new THREE.Vector3(), prevMano = { R: new THREE.Vector3(), L: new THREE.Vector3() };
  function pose(fase, k, inc = 0, c = null, vel = null, hielo = 0) {
    ponCrampones(hielo > 0.5);
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
    if (coleta.length) {   // coleta: se balancea de delante atrás con el paso (más al ir deprisa, y se echa hacia atrás), la punta un poco retrasada; el eje es el lateral del cuerpo
      faseC += dt * (s > 0.12 ? 6.283 * (0.8 + 0.32 * Math.min(s, 6)) : 0.6);
      const amp = s > 0.12 ? 0.1 + 0.035 * Math.min(s, 6) : 0.03, cola = 0.05 + 0.04 * Math.min(s, 6);
      root.updateMatrixWorld(true); AX.set(1, 0, 0).transformDirection(root.matrixWorld);
      coleta.forEach(({ b, rest }, i) => {
        const ang = cola + amp * (i ? 1.35 : 0.8) * Math.sin(faseC - 0.9 * i);
        b.parent.getWorldQuaternion(Q.p); Q.r.setFromAxisAngle(AX, ang); b.quaternion.copy(Q.p).invert().multiply(Q.r).multiply(Q.p).multiply(rest); b.updateMatrixWorld(true);
      });
    }
    if (br > 0.02) for (const q of brazos) q.b.quaternion.slerp(q.rest, br * q.k);   // funambulista: brazos abiertos, como en la pose de reposo (T)
    const mn = clamp(((c?.manos ?? 0) - 0.3) / 0.5, 0, 1) * (1 - clamp(br * 2, 0, 1)) * (ev ? 0 : 1);   // 0-1: las manos buscan agarres en la roca
    const lean = clamp(inc * 0.5, -0.3, 0.4) + 0.38 * mn;
    root.rotation.x = lean; root.rotation.y = c?.giro ?? 0;
    root.updateMatrixWorld(true);
    if (mn > 0.01) {   // agarres: cada mano alterna alcanzar un saliente delante y algo más alto; el codo se abre hacia fuera
      faseM += dt * (s > 0.12 ? 2.4 : 0.5);
      caderas.getWorldPosition(PH); root.worldToLocal(PH);
      for (const l of ['R', 'L']) {
        const sg = l === 'R' ? -1 : 1, alt = 0.5 + 0.5 * Math.sin(faseM + (l === 'R' ? 0 : Math.PI));
        OBJ.set(sg * 0.26, 0.22 + 0.2 * alt, PH.z + 0.52 + 0.08 * alt); root.localToWorld(OBJ); POLO.set(sg * 1, -0.2, -0.3).transformDirection(root.matrixWorld);
        alcanza(cadena[l], OBJ, POLO, mn);
      }
    }
    // bastones: el agarre en la mano y la punta clavada en el suelo por detrás; al adelantar la mano, la punta se despega
    const libres = (c?.manos ?? 0) > 0.3 || br > 0.3;
    for (const l of ['R', 'L']) {
      const g = bastones[l], ok = (l === 'R' ? palos >= 1 : palos >= 2) && !libres && !conHielo; g.visible = ok; if (!ok || !mano[l]) { prevMano[l].set(0, 0, 0); continue; }
      mano[l].getWorldPosition(PH2); root.worldToLocal(PH2);
      const vz = prevMano[l].lengthSq() ? (PH2.z - prevMano[l].z) / dt : 0; prevMano[l].copy(PH2);   // velocidad de la mano hacia delante (m/s, en el sistema del montañero)
      const alto = Math.max(PH2.y + 0.04, 0.5), d = Math.sqrt(Math.max(LB * LB - alto * alto, 0.05)), lift = clamp(vz / (0.9 + s * 0.5), 0, 1) * 0.16;
      OBJ.set(PH2.x + (l === 'R' ? -0.06 : 0.06), lift, PH2.z - d);   // punta (en el sistema del montañero)
      POLO.set(PH2.x, PH2.y + 0.04, PH2.z).sub(OBJ).normalize();
      g.position.set(PH2.x, PH2.y + 0.04 - 0.09 * POLO.y, PH2.z - 0.09 * POLO.z); g.quaternion.setFromUnitVectors(UP, POLO);
    }
    return 0.9 - 0.3 * a - 0.1 * mn;
  }
  return { root, pose, evento };
}

export function crearMontaneroAnim(opts = {}) {
  const viejo = crearMontanero(opts), group = new THREE.Group(); group.add(viejo.group);
  let nuevo = null;
  cargaGLB(opts.chica ? 'chica' : 'chico').then((g) => { if (!g) return; nuevo = construye(g, opts); group.remove(viejo.group); group.add(nuevo.root); });
  return { group, altura: opts.chica ? 1.71 : 1.84, pose: (fase, k, inc, c, vel, hielo) => (nuevo ? nuevo.pose(fase, k, inc, c, vel, hielo) : viejo.pose(fase, k, inc, c)), evento: (tipo) => (nuevo ? nuevo.evento(tipo) : 0) };
}
