import * as THREE from 'three';

// Montañero en 3D hecho con formas sencillas: casco, chaqueta, mochila con cinturón, pantalón, botas y un bastón de trekking.
// Mide ~1,8 unidades; mira hacia +Z. `pose(fase, k)` anima el paso (k = 0 parado, 1 andando).
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, flatShading: true, ...o });
const cap = (r, l, mat) => new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 10), mat);
const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

// palos: 0, 1 o 2 bastones; mochilaTipo: 'grande' | 'media' | 'pequena'
export function crearMontanero({ chaqueta = '#d8362b', pantalon = '#26323f', mochila = '#e8892b', casco = '#f4f1e8', palos = 1, mochilaTipo = 'grande' } = {}) {
  const mt = {
    chaq: M(chaqueta), pant: M(pantalon), moch: M(mochila), cas: M(casco, { roughness: 0.5 }), piel: M('#d6a07a'),
    bota: M('#2b2520'), guante: M('#1f2326'), negro: M('#1b1b1d'), palo: M('#cfd3d8', { metalness: 0.55, roughness: 0.4 }),
    franja: M('#f2f2ee'),
  };
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);

  const hips = new THREE.Group(); hips.position.y = 0.92; body.add(hips);
  hips.add(box(0.34, 0.2, 0.2, mt.pant));
  const torso = new THREE.Group(); torso.position.y = 0.08; hips.add(torso);

  // tronco y hombros
  const chest = cap(0.165, 0.3, mt.chaq); chest.scale.set(1.12, 1, 0.74); chest.position.y = 0.27; torso.add(chest);
  const franja = box(0.37, 0.035, 0.25, mt.franja); franja.position.y = 0.36; torso.add(franja);   // banda reflectante
  const cuello = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.08, 8), mt.piel); cuello.position.y = 0.6; torso.add(cuello);
  // cabeza con casco y gafas
  const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 10), mt.piel); cabeza.position.set(0, 0.72, 0.005); torso.add(cabeza);
  const cas = new THREE.Mesh(new THREE.SphereGeometry(0.128, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), mt.cas); cas.position.set(0, 0.735, 0); cas.scale.set(1, 1, 1.12); torso.add(cas);
  const visera = box(0.2, 0.012, 0.07, mt.cas); visera.position.set(0, 0.762, 0.1); visera.rotation.x = 0.12; torso.add(visera);
  const gafas = box(0.17, 0.03, 0.03, mt.negro); gafas.position.set(0, 0.725, 0.098); torso.add(gafas);

  // mochila: grande (con esterilla), media (con cuerda y piolet) o pequeña de día (con botella)
  const mochi = new THREE.Group(); torso.add(mochi);
  const oscuro = M(new THREE.Color(mochila).multiplyScalar(0.78));
  if (mochilaTipo === 'grande') {
    mochi.position.set(0, 0.28, -0.2); mochi.add(box(0.31, 0.46, 0.19, mt.moch));
    const tapa = box(0.32, 0.09, 0.21, oscuro); tapa.position.y = 0.26; mochi.add(tapa);
    for (const sd of [-1, 1]) { const bl = box(0.07, 0.24, 0.12, oscuro); bl.position.set(sd * 0.19, -0.06, 0); mochi.add(bl); }
    const est = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.34, 10), M('#2c6fa8')); est.rotation.z = Math.PI / 2; est.position.set(0, -0.27, -0.01); mochi.add(est);
  } else if (mochilaTipo === 'media') {
    mochi.position.set(0, 0.3, -0.19); mochi.add(box(0.29, 0.4, 0.17, mt.moch));
    const tapa = box(0.3, 0.07, 0.19, oscuro); tapa.position.y = 0.23; mochi.add(tapa);
    const cuerda = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 6, 14), M('#c0392b')); cuerda.position.set(0, 0.04, -0.1); mochi.add(cuerda);   // cuerda en bandolera
    const piolet = new THREE.Group(); piolet.position.set(0.17, 0.0, -0.02); mochi.add(piolet);
    const mango = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), mt.palo); piolet.add(mango);
    const pico = box(0.12, 0.018, 0.02, mt.palo); pico.position.y = 0.25; piolet.add(pico);
  } else {
    mochi.position.set(0, 0.34, -0.16); mochi.add(box(0.26, 0.34, 0.14, mt.moch));
    const frente = box(0.2, 0.16, 0.05, oscuro); frente.position.set(0, -0.05, 0.09); mochi.add(frente);
    const botella = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8), M('#4aa3d8')); botella.position.set(0.16, -0.08, 0); mochi.add(botella);
  }
  const cinturon = box(0.35, 0.05, 0.25, mt.negro); cinturon.position.set(0, 0.03, -0.01); torso.add(cinturon);
  for (const s of [-1, 1]) { const t = box(0.045, 0.4, 0.03, mt.negro); t.position.set(s * 0.095, 0.38, 0.115); t.rotation.x = -0.06; torso.add(t); }   // tirantes

  // brazos: hombro → codo → mano
  const brazo = (lado) => {
    const sh = new THREE.Group(); sh.position.set(lado * 0.225, 0.5, 0); torso.add(sh);
    const arriba = cap(0.052, 0.2, mt.chaq); arriba.position.y = -0.15; sh.add(arriba);
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
    const abajo = cap(0.044, 0.2, mt.chaq); abajo.position.y = -0.14; el.add(abajo);
    const mano = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 6), mt.guante); mano.position.y = -0.3; el.add(mano);
    return { sh, el, mano };
  };
  const bI = brazo(-1), bD = brazo(1);

  // bastones de trekking (0, 1 o 2): puño, caña con cinta, arandela y punta
  const hacerBaston = (mano) => {
    const g = new THREE.Group(); mano.add(g);
    const puno = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.15, 8), mt.negro); puno.position.y = 0.01; g.add(puno);
    const cana = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1.22, 8), mt.palo); cana.position.y = -0.61; g.add(cana);
    const cinta = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.18, 8), M('#d8362b')); cinta.position.y = -0.2; g.add(cinta);
    const aran = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 12), mt.negro); aran.position.y = -1.1; g.add(aran);
    const punta = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.07, 6), mt.palo); punta.position.y = -1.26; punta.rotation.x = Math.PI; g.add(punta);
    return g;
  };
  const bastonD = palos >= 1 ? hacerBaston(bD.mano) : null, bastonI = palos >= 2 ? hacerBaston(bI.mano) : null;

  // piernas: cadera → rodilla → bota
  const pierna = (lado) => {
    const hip = new THREE.Group(); hip.position.set(lado * 0.092, -0.06, 0); hips.add(hip);
    const muslo = cap(0.078, 0.28, mt.pant); muslo.position.y = -0.22; hip.add(muslo);
    const rod = new THREE.Group(); rod.position.y = -0.43; hip.add(rod);
    const canilla = cap(0.064, 0.3, mt.pant); canilla.position.y = -0.21; rod.add(canilla);
    const bota = box(0.115, 0.1, 0.27, mt.bota); bota.position.set(0, -0.44, 0.05); rod.add(bota);
    const caña = box(0.1, 0.1, 0.12, mt.bota); caña.position.set(0, -0.37, -0.01); rod.add(caña);
    return { hip, rod };
  };
  const pI = pierna(-1), pD = pierna(1);
  root.position.y = 0.03;

  // paso: fase en radianes, k = amplitud (0 parado … 1 andando); inc = inclinación extra del tronco por la pendiente
  function pose(fase, k, inc = 0) {
    const s = Math.sin(fase), c = Math.cos(fase), s2 = Math.sin(fase + Math.PI), c2 = Math.cos(fase + Math.PI);
    pI.hip.rotation.x = -s * 0.52 * k; pD.hip.rotation.x = -s2 * 0.52 * k;
    pI.rod.rotation.x = k * (0.12 + 0.85 * Math.max(0, c)); pD.rod.rotation.x = k * (0.12 + 0.85 * Math.max(0, c2));
    if (bastonI) { bI.sh.rotation.x = s * 0.28 * k - 0.35; bI.el.rotation.x = -0.65; bastonI.rotation.x = -0.42 - s * 0.14 * k - (bI.sh.rotation.x + bI.el.rotation.x); }
    else { bI.sh.rotation.x = s * 0.5 * k; bI.el.rotation.x = -0.35 - 0.25 * k; }
    if (bastonD) { bD.sh.rotation.x = -s * 0.28 * k - 0.35; bD.el.rotation.x = -0.65; bastonD.rotation.x = -0.42 + s * 0.14 * k - (bD.sh.rotation.x + bD.el.rotation.x); }
    else { bD.sh.rotation.x = -s * 0.5 * k; bD.el.rotation.x = -0.35 - 0.25 * k; }
    hips.position.y = 0.92 + Math.abs(c) * 0.026 * k;
    torso.rotation.x = 0.1 + inc * 0.5; torso.rotation.y = s * 0.07 * k;
  }
  pose(0, 0);
  return { group: root, pose, altura: 1.84 };
}
