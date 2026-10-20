import * as THREE from 'three';

// Montañero en 3D (versión 2): proporciones adultas (cabeza ~1/7,5 de la altura), tronco y extremidades afinados, ropa técnica
// por capas (chaqueta con capucha y cremallera, pantalón con rodilleras, polainas), casco con correa, gafas envolventes,
// mochila redondeada con tapa, cinturón y correas, botas con suela y bastones. Sombreado suave, sin aristas de «juguete».
// Mide ~1,8 unidades; mira hacia +Z. `pose(fase, k, inc, c)` anima el paso y las posturas de arista.
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, ...o });
const mesh = (g, m) => new THREE.Mesh(g, m);
const cap = (r, l, mat) => mesh(new THREE.CapsuleGeometry(r, l, 6, 14), mat);
const cono = (r1, r2, h, mat, seg = 14) => mesh(new THREE.CylinderGeometry(r2, r1, h, seg, 1), mat);   // r1 abajo, r2 arriba
// caja con esquinas redondeadas (sin dependencias): se proyectan los vértices de una caja subdividida sobre una caja «inflada»
function rbox(w, h, d, r, seg = 3) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    v.sub(c); if (v.lengthSq() > 1e-9) v.setLength(r); v.add(c); p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); return g;
}
const box = (w, h, d, mat, r = 0.02) => mesh(rbox(w, h, d, Math.min(r, w / 2, h / 2, d / 2)), mat);
const oscurece = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

// palos: 0, 1 o 2 bastones; mochilaTipo: 'grande' | 'media' | 'pequena'
export function crearMontanero({ chaqueta = '#b8392e', pantalon = '#2c333b', mochila = '#d9822b', casco = '#e9e6dc', palos = 1, mochilaTipo = 'grande' } = {}) {
  const mt = {
    chaq: M(chaqueta, { roughness: 0.62 }), chaq2: M(oscurece(chaqueta, 0.62), { roughness: 0.7 }), pant: M(pantalon, { roughness: 0.85 }), pant2: M(oscurece(pantalon, 0.7)),
    moch: M(mochila, { roughness: 0.7 }), moch2: M(oscurece(mochila, 0.7)), cas: M(casco, { roughness: 0.35 }), piel: M('#c99273', { roughness: 0.6 }),
    bota: M('#4a3626', { roughness: 0.75 }), suela: M('#151515', { roughness: 0.9 }), guante: M('#22262a'), negro: M('#1a1b1d'),
    cinta: M('#2a2d31', { roughness: 0.6 }), lente: M('#1d2a36', { roughness: 0.15, metalness: 0.3 }), palo: M('#aeb4bb', { roughness: 0.35, metalness: 0.3 }), refl: M('#e8e6df'),
  };
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const hips = new THREE.Group(); hips.position.y = 0.92; body.add(hips);
  const pelvis = mesh(new THREE.SphereGeometry(1, 16, 10), mt.pant); pelvis.scale.set(0.165, 0.11, 0.115); pelvis.position.y = 0.0; hips.add(pelvis);
  const torso = new THREE.Group(); torso.position.y = 0.06; hips.add(torso);

  // tronco: perfil torneado (cintura estrecha, pecho, hombros) aplanado de delante atrás
  const perfil = [[0.0, -0.06], [0.158, -0.05], [0.15, 0.04], [0.162, 0.16], [0.182, 0.3], [0.18, 0.4], [0.145, 0.47], [0.078, 0.52], [0.0, 0.53]].map(([r, y]) => new THREE.Vector2(r, y));
  const tronco = mesh(new THREE.LatheGeometry(perfil, 20), mt.chaq); tronco.scale.z = 0.74; torso.add(tronco);
  const bajo = mesh(new THREE.CylinderGeometry(0.155, 0.16, 0.06, 20, 1, true), mt.chaq2); bajo.scale.z = 0.72; bajo.position.y = -0.04; torso.add(bajo);   // bajo de la chaqueta
  const cremallera = box(0.012, 0.5, 0.01, mt.negro, 0.004); cremallera.position.set(0, 0.24, 0.126); cremallera.rotation.x = -0.05; torso.add(cremallera);
  for (const s of [-1, 1]) { const bol = box(0.07, 0.09, 0.012, mt.chaq2, 0.006); bol.position.set(s * 0.1, 0.25, 0.122); torso.add(bol); }   // bolsillos de pecho
  const cuello = mesh(new THREE.CylinderGeometry(0.068, 0.078, 0.09, 16), mt.chaq2); cuello.position.y = 0.535; torso.add(cuello);   // cuello alto de la chaqueta
  const capucha = mesh(new THREE.SphereGeometry(0.1, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mt.chaq2); capucha.scale.set(1.15, 0.55, 0.9); capucha.position.set(0, 0.5, -0.07); capucha.rotation.x = 0.5; torso.add(capucha);
  const nuca = mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.06, 12), mt.piel); nuca.position.y = 0.6; torso.add(nuca);
  // cabeza con casco de escalada, correa y gafas
  const cabeza = mesh(new THREE.SphereGeometry(0.088, 18, 14), mt.piel); cabeza.scale.set(0.92, 1.05, 1); cabeza.position.set(0, 0.69, 0.008); torso.add(cabeza);
  const nariz = mesh(new THREE.SphereGeometry(0.018, 8, 6), mt.piel); nariz.scale.set(0.8, 1, 1.2); nariz.position.set(0, 0.675, 0.095); torso.add(nariz);
  const cas = mesh(new THREE.SphereGeometry(0.106, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), mt.cas); cas.scale.set(0.96, 0.95, 1.1); cas.position.set(0, 0.705, -0.004); torso.add(cas);
  const casOsc = M(oscurece(casco, 0.72), { roughness: 0.4 });
  for (const s of [-1, 1]) { const ven = box(0.014, 0.012, 0.06, casOsc, 0.005); ven.position.set(s * 0.04, 0.8, -0.03); torso.add(ven); }   // rejillas del casco (discretas, hacia atrás)
  const correa = mesh(new THREE.TorusGeometry(0.084, 0.006, 6, 20, Math.PI), mt.cinta); correa.position.set(0, 0.7, 0.01); correa.rotation.set(0, Math.PI / 2, Math.PI); torso.add(correa);
  const gafas = mesh(new THREE.CylinderGeometry(0.094, 0.094, 0.032, 18, 1, true, -1.1, 2.2), mt.lente); gafas.position.set(0, 0.71, 0.0); torso.add(gafas);
  // la cabeza va en su propio grupo (pivote en el cuello) para poder mirar al frente aunque el tronco se incline
  const cab = new THREE.Group(); cab.position.y = 0.6; torso.add(cab);
  for (const o of [nuca, cabeza, nariz, cas, correa, gafas, ...torso.children.filter((c) => c.material === casOsc)]) { torso.remove(o); o.position.y -= 0.6; cab.add(o); }

  // mochila redondeada: grande (con esterilla), media (con cuerda y piolet) o pequeña (con botella)
  const mochi = new THREE.Group(); torso.add(mochi);
  const [mw, mh, md, my] = mochilaTipo === 'grande' ? [0.3, 0.52, 0.2, 0.28] : mochilaTipo === 'media' ? [0.28, 0.44, 0.18, 0.3] : [0.25, 0.36, 0.14, 0.33];
  mochi.position.set(0, my, -0.115 - md / 2);
  mochi.add(box(mw, mh, md, mt.moch, 0.06));
  const tapa = box(mw * 1.02, 0.1, md * 1.06, mt.moch2, 0.04); tapa.position.y = mh / 2 - 0.02; mochi.add(tapa);
  const frontal = box(mw * 0.7, mh * 0.45, 0.03, mt.moch2, 0.02); frontal.position.set(0, -mh * 0.12, -md / 2 - 0.005); mochi.add(frontal);
  for (const s of [-1, 1]) { const c = box(0.012, mh * 0.8, 0.012, mt.cinta, 0.005); c.position.set(s * mw * 0.32, 0, -md / 2 - 0.01); mochi.add(c); }   // cintas de compresión
  if (mochilaTipo === 'grande') { const est = mesh(new THREE.CylinderGeometry(0.055, 0.055, mw * 1.1, 14), M('#2f6a8c')); est.rotation.z = Math.PI / 2; est.position.set(0, -mh / 2 - 0.02, 0.0); mochi.add(est); }
  else if (mochilaTipo === 'media') {
    const cuerda = mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 18), M('#b03a2e')); cuerda.position.set(0, 0.02, -md / 2 - 0.03); cuerda.scale.y = 0.8; mochi.add(cuerda);
    const piolet = new THREE.Group(); piolet.position.set(mw / 2 + 0.01, -0.02, -0.02); mochi.add(piolet);
    piolet.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.5, 8), mt.palo)); const pico = box(0.13, 0.016, 0.02, mt.palo, 0.006); pico.position.y = 0.25; piolet.add(pico);
  } else { const bot = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 12), M('#3f8fbf')); bot.position.set(mw / 2 + 0.02, -0.06, 0); mochi.add(bot); }
  // correas al hombro y cinturón de cadera
  for (const s of [-1, 1]) {   // tirante: baja por delante del pecho, pasa sobre el hombro y llega a la mochila
    const del = box(0.04, 0.3, 0.014, mt.cinta, 0.006); del.position.set(s * 0.085, 0.33, 0.118); del.rotation.set(-0.12, 0, s * 0.06); torso.add(del);
    const hom = box(0.045, 0.014, 0.2, mt.cinta, 0.006); hom.position.set(s * 0.09, 0.47, 0.0); hom.rotation.x = 0.1; torso.add(hom);
    const ajuste = box(0.03, 0.03, 0.02, mt.negro, 0.006); ajuste.position.set(s * 0.085, 0.2, 0.124); torso.add(ajuste);
  }
  const pectoral = box(0.15, 0.014, 0.01, mt.cinta, 0.005); pectoral.position.set(0, 0.36, 0.128); torso.add(pectoral);
  const cint = mesh(new THREE.TorusGeometry(0.16, 0.02, 6, 24), mt.cinta); cint.rotation.x = Math.PI / 2; cint.scale.y = 0.72; cint.position.y = 0.03; torso.add(cint);

  // brazos: hombro → codo → mano (enguantada)
  const brazo = (lado) => {
    const sh = new THREE.Group(); sh.position.set(lado * 0.2, 0.44, 0); torso.add(sh);
    const hombro = mesh(new THREE.SphereGeometry(0.058, 12, 10), mt.chaq); sh.add(hombro);
    const arriba = cono(0.048, 0.06, 0.26, mt.chaq); arriba.position.y = -0.14; sh.add(arriba);
    const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
    el.add(mesh(new THREE.SphereGeometry(0.046, 10, 8), mt.chaq));
    const abajo = cono(0.041, 0.05, 0.23, mt.chaq); abajo.position.y = -0.12; el.add(abajo);
    const puno = mesh(new THREE.CylinderGeometry(0.042, 0.04, 0.035, 12), mt.chaq2); puno.position.y = -0.23; el.add(puno);
    const mano = box(0.06, 0.085, 0.04, mt.guante, 0.018); mano.position.y = -0.29; el.add(mano);
    return { sh, el, mano };
  };
  const bI = brazo(-1), bD = brazo(1);
  const hacerBaston = (mano) => {   // bastón telescópico: puño, cinta, tramos, arandela y punta
    const g = new THREE.Group(); mano.add(g);
    const puno = mesh(new THREE.CylinderGeometry(0.02, 0.017, 0.14, 10), mt.negro); g.add(puno);
    const t1 = mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.6, 8), mt.palo); t1.position.y = -0.37; g.add(t1);
    const t2 = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.62, 8), mt.palo); t2.position.y = -0.95; g.add(t2);
    const ar = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 12), mt.negro); ar.position.y = -1.18; g.add(ar);
    const pt = mesh(new THREE.ConeGeometry(0.009, 0.06, 6), mt.negro); pt.position.y = -1.27; pt.rotation.x = Math.PI; g.add(pt);
    return g;
  };
  const bastonD = palos >= 1 ? hacerBaston(bD.mano) : null, bastonI = palos >= 2 ? hacerBaston(bI.mano) : null;

  // piernas: cadera → rodilla → bota, con polainas y botas de montaña
  const pierna = (lado) => {
    const hip = new THREE.Group(); hip.position.set(lado * 0.088, -0.04, 0); hips.add(hip);
    const muslo = cono(0.062, 0.082, 0.42, mt.pant); muslo.position.y = -0.21; hip.add(muslo);
    const rod = new THREE.Group(); rod.position.y = -0.43; hip.add(rod);
    rod.add(mesh(new THREE.SphereGeometry(0.058, 12, 10), mt.pant2));   // rodillera
    const canilla = cono(0.048, 0.06, 0.26, mt.pant); canilla.position.y = -0.14; rod.add(canilla);
    const polaina = cono(0.052, 0.05, 0.12, mt.pant2); polaina.position.y = -0.31; rod.add(polaina);
    const bota = box(0.1, 0.1, 0.24, mt.bota, 0.035); bota.position.set(0, -0.405, 0.045); rod.add(bota);
    const suela = box(0.108, 0.03, 0.255, mt.suela, 0.012); suela.position.set(0, -0.455, 0.048); rod.add(suela);
    return { hip, rod };
  };
  const pI = pierna(-1), pD = pierna(1);
  root.position.y = 0.03;
  root.traverse((o) => { if (o.isMesh) o.castShadow = false; });

  // paso: fase en radianes, k = amplitud (0 parado … 1 andando); inc = inclinación extra del tronco por la pendiente.
  // c (opcional) = postura de arista: { agach, manos, cuatro, brazos (funambulista), giro } de 0 a 1. Las piernas se resuelven con una cinemática de dos huesos para que los pies sigan en el suelo al agacharse.
  const L1 = 0.43, L2 = 0.44;
  function pose(fase, k, inc = 0, c = null) {
    const ag = c?.agach ?? 0, mn = c?.manos ?? 0, cu = c?.cuatro ?? 0, br = c?.brazos ?? 0, a = Math.max(ag, cu);
    const s = Math.sin(fase), co = Math.cos(fase), s2 = Math.sin(fase + Math.PI), c2 = Math.cos(fase + Math.PI);
    const alt = 0.92 - 0.26 * ag - 0.2 * cu, D = Math.max(0.3, alt - 0.06 - 0.09);
    const phi = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2)))), bf = a > 0 ? Math.PI - phi : 0, af = bf * 0.5, kk = k * (1 - a * 0.55 - 0.3 * br);
    pI.hip.rotation.x = -s * 0.52 * kk - af * a; pD.hip.rotation.x = -s2 * 0.52 * kk - af * a;
    pI.rod.rotation.x = kk * (0.12 + 0.85 * Math.max(0, co)) + bf * a; pD.rod.rotation.x = kk * (0.12 + 0.85 * Math.max(0, c2)) + bf * a;
    const p = 0.1 + inc * 0.5 + 0.55 * ag + 0.6 * cu;   // inclinación del tronco hacia delante
    // brazos: con bastones al andar; con las manos libres (apoyadas en la roca, alternando) en la arista
    const al = 0.5 + 0.38 * Math.sin(fase * 0.5), ar = 0.5 + 0.38 * Math.sin(fase * 0.5 + Math.PI);
    const libre = (sh, el, alc, lado) => { sh.rotation.x = -(p + alc * (0.7 + 0.5 * cu)); sh.rotation.z = lado * 0.12; el.rotation.x = -0.2 - 0.25 * (1 - alc); };
    const arm = (b, bast, sg, sw) => {
      if (mn > 0.02) {
        const nor = { x: 0, el: 0 };
        if (bast) { nor.x = sg * s * 0.28 * k - 0.35; nor.el = -0.65; } else { nor.x = sg * s * 0.5 * k; nor.el = -0.35 - 0.25 * k; }
        libre(b.sh, b.el, sg > 0 ? ar : al, sg);
        b.sh.rotation.x = nor.x * (1 - mn) + b.sh.rotation.x * mn; b.el.rotation.x = nor.el * (1 - mn) + b.el.rotation.x * mn;
      } else b.sh.rotation.z = 0;
    };
    if (bastonI) { bI.sh.rotation.x = s * 0.28 * k - 0.35; bI.el.rotation.x = -0.65; bastonI.rotation.x = -0.42 - s * 0.14 * k - (bI.sh.rotation.x + bI.el.rotation.x); }
    else { bI.sh.rotation.x = s * 0.5 * k; bI.el.rotation.x = -0.35 - 0.25 * k; }
    if (bastonD) { bD.sh.rotation.x = -s * 0.28 * k - 0.35; bD.el.rotation.x = -0.65; bastonD.rotation.x = -0.42 + s * 0.14 * k - (bD.sh.rotation.x + bD.el.rotation.x); }
    else { bD.sh.rotation.x = -s * 0.5 * k; bD.el.rotation.x = -0.35 - 0.25 * k; }
    arm(bI, bastonI, 1, 1); arm(bD, bastonD, -1, -1);
    if (br > 0.02) {   // funambulista: brazos abiertos a los lados (algo adelantados y con el codo flexionado) para guardar el equilibrio en la arista
      for (const [b, sg] of [[bI, 1], [bD, -1]]) { b.sh.rotation.z = -sg * (0.12 + 1.15 * br) + b.sh.rotation.z * (1 - br); b.sh.rotation.x = b.sh.rotation.x * (1 - br) - 0.12 * br; b.el.rotation.x = b.el.rotation.x * (1 - br) - 0.18 * br; }
    }
    if (bastonI) bastonI.visible = mn < 0.3 && br < 0.3; if (bastonD) bastonD.visible = mn < 0.3 && br < 0.3;   // en la arista se guardan los bastones: las manos van libres
    hips.position.y = alt + Math.abs(co) * 0.026 * kk;
    torso.rotation.x = p; torso.rotation.y = s * 0.07 * kk + (c?.giro ?? 0);
    cab.rotation.x = -Math.max(0, p - 0.15) * 0.75;   // al inclinarse, levanta la cabeza para mirar adelante
    return alt;   // altura de la cadera (para atar la cuerda)
  }
  pose(0, 0);
  return { group: root, pose, altura: 1.84 };
}
