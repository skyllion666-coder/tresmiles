import * as THREE from 'three';
import { crearMontaneroAnim as crearMontanero } from './montanero_anim.js?v=7';
import { t as tr } from './i18n.js?v=4';

// Recorrido (track GPX simplificado) dibujado sobre el relieve, con perfil de altura interactivo y vuelo.
export async function cargarRuta(id) {
  const r = await fetch(`data/rutas/${id}.json?dv=${window.DATOS_V || 0}`, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`ruta ${id} ${r.status}`);
  return r.json();
}

const PW = 300, PH = 92, PL = 34, PR = 4, PT = 6, PB = 16; // medidas del perfil (viewBox)

export function crearRuta({ scene, geo, ruta }) {
  const pts = ruta.puntos.map(([lon, lat]) => {
    const q = geo.toXZ(lon, lat);
    return new THREE.Vector3(q.x, geo.heightAt(q.x, q.z) + 24, q.z);
  });
  const dist = ruta.puntos.map((p) => p[3]);
  const bb = pts.reduce((o, p) => ({ x0: Math.min(o.x0, p.x), x1: Math.max(o.x1, p.x), z0: Math.min(o.z0, p.z), z1: Math.max(o.z1, p.z) }), { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 });
  const centro = { x: (bb.x0 + bb.x1) / 2, z: (bb.z0 + bb.z1) / 2 }, extension = Math.hypot(bb.x1 - bb.x0, bb.z1 - bb.z0);
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const tub = 1800, rad = 5;
  let geom = new THREE.TubeGeometry(curve, tub, 11, rad, false);
  // la línea se adelgaza al acercarse: el radio (0,5–11 m) y la altura sobre el relieve (7–24 m) crecen con la distancia a la cámara, calculados por vértice en el shader.
  // La geometría guarda el radio de 11 m; el centro del tubo es posición − normal × 11, así que no hace falta otra línea ni más vértices.
  const mat = new THREE.MeshBasicMaterial({ color: '#ffa930', fog: true, transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 ctr = position - normal * 11.0;
      float dd = distance((modelMatrix * vec4(ctr, 1.0)).xyz, cameraPosition);
      float Rn = clamp(dd * 0.0013, 0.22, 11.0);
      float lift = clamp(dd * 0.0035, 5.0, 24.0);
      transformed = ctr + normal * Rn; transformed.y += lift - 24.0; vDd = dd;`).replace('#include <common>', '#include <common>\nvarying float vDd;');
    // muy cerca, la línea se aclara para no competir con la cuerda y los montañeros
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vDd;').replace('#include <opaque_fragment>', 'diffuseColor.a *= mix(0.35, 1.0, smoothstep(120.0, 700.0, vDd));\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'ruta-fina';
  const mesh = new THREE.Mesh(geom, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.visible = false;
  scene.add(mesh);

  // montañeros: uno que sigue a la cámara en el vuelo o al dedo en el perfil, y un grupo de tres que recorre la ruta.
  // Escala fija del muñeco (mide ~1,8 → ~21 m en el modelo, igual a lo largo de todo el recorrido y a cualquier distancia de la cámara).
  const ESC_M = 16, V0 = 105, GAP_MIN = 26;   // ×16, la misma escala que las cimas hechas en Blender (escalaModelo 16 en detalles.json): todo proporcionado
  const reducido = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mk = (o) => { const m = crearMontanero(o), h = new THREE.Group(); h.add(m.group); h.scale.setScalar(ESC_M); h.visible = false; scene.add(h); return { h, m, fase: Math.random() * 6, yaw: null, alt: 0.92 }; };
  const solo = mk({});
  const equipo = [   // cada uno con su ropa, su mochila y sus bastones (2, 0 y 1); el de en medio es una chica
    mk({ chaqueta: '#b8392e', mochila: '#d9822b', mochilaTipo: 'grande', palos: 2 }),
    mk({ chica: true, chaqueta: '#1aa6a0', mochila: '#e3b341', pantalon: '#2b2f3a', mochilaTipo: 'pequena', palos: 0 }),   // la montañera (coleta)
    mk({ chaqueta: '#c9962a', mochila: '#5a4a7a', pantalon: '#2f3a33', mochilaTipo: 'media', palos: 1 }),
  ];
  // un montañero se cae (tipo: 'tropiezo' | 'voltereta'): sale su animación y todo el grupo se detiene lo que dure
  function caer(i, tipo) {
    const dur = equipo[i].m.evento?.(tipo) ?? 0; if (dur <= 0) return 0;
    est.forEach((q) => { q.pausa = Math.max(q.pausa, dur + 0.6); }); est[i].cdc = 30 + Math.random() * 40; return dur;
  }
  // probabilidad de que la caída sea una voltereta: crece con la pendiente del terreno en ese punto (≈15 % en llano, hasta ≈85 % por encima de 45°)
  function pVoltereta(d) {
    const a = en(d - 8).pos, b = en(d + 8).pos, L = Math.hypot(b.x - a.x, b.z - a.z) || 1, g = Math.abs(geo.heightAt(b.x, b.z) - geo.heightAt(a.x, a.z)) / L;
    return Math.min(0.85, 0.15 + 0.7 * Math.min(1, Math.max(0, (g - 0.2) / 0.8)));
  }
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let cursorOn = false, dEquipo = 0, dCursor = 0, ultimoCursor = -1e9;
  const est = equipo.map(() => ({ d: 0, cd: 2, pausa: 0 }));   // distancia recorrida por cada uno, cuenta atrás hasta su próxima pausa y pausa en curso
  const resetEquipo = () => { est.forEach((q, i) => { q.d = -i * 110; q.cd = 1.5 + i * 0.9; q.pausa = 0; }); dEquipo = 0; };
  resetEquipo();

  // tramo especial (Paso de Mahoma): se define con la geografía (eje de la arista) y se mide sobre el recorrido, no con la cámara
  let paso = null;
  function proy(x, z) {   // distancia (m) al eje de la arista y posición a lo largo de él (0 = antecima, 1 = cruz)
    const cr = paso.cresta; let best = 1e9, bs = 0, acc = 0;
    for (let i = 0; i < cr.length - 1; i++) {
      const a = cr[i], b = cr[i + 1], vx = b.x - a.x, vz = b.z - a.z, l2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / l2)), d = Math.hypot(x - a.x - vx * t, z - a.z - vz * t);
      if (d < best) { best = d; bs = (acc + t * Math.sqrt(l2)) / paso.T; }
      acc += Math.sqrt(l2);
    }
    return { d: best, s: bs };
  }
  function setPaso(cfg) {
    paso = null; if (!cfg || !cfg.cresta?.length) return;
    let T = 0; for (let i = 0; i < cfg.cresta.length - 1; i++) T += Math.hypot(cfg.cresta[i + 1].x - cfg.cresta[i].x, cfg.cresta[i + 1].z - cfg.cresta[i].z);
    paso = { ...cfg, T, zonas: [] };
    let cur = null;
    for (let i = 0; i < pts.length; i++) {
      const inside = proy(pts[i].x, pts[i].z).d < cfg.corredor;
      if (inside) { if (!cur) cur = { d0: dist[i], d1: dist[i] }; else cur.d1 = dist[i]; } else if (cur) { paso.zonas.push(cur); cur = null; }
    }
    if (cur) paso.zonas.push(cur);
    if (!paso.zonas.length) paso = null;
  }
  // aristas y pasos de cualquier ruta: tramos donde se camina más despacio y con otra postura. Las aristas se detectan con el relieve (el terreno cae a ambos lados del track);
  // los pasos difíciles con nombre (setPasosHito) llevan además postura de funambulista y, a ratos, agachados con las manos en la roca.
  let auto = [];   // { d0, d1, n (0-1), fun }
  function calculaAristas() {
    const T = 9, L = 16, flag = new Array(pts.length).fill(0);
    for (let i = 1; i < pts.length - 1; i++) {
      let dx = pts[i + 1].x - pts[i - 1].x, dz = pts[i + 1].z - pts[i - 1].z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const x = pts[i].x, z = pts[i].z, h0 = Math.max(geo.heightAt(x, z), geo.heightAt(x + dz * 6, z - dx * 6), geo.heightAt(x - dz * 6, z + dx * 6));   // el GPS puede ir algo desviado de la arista
      flag[i] = h0 - geo.heightAt(x + dz * L, z - dx * L) > T && h0 - geo.heightAt(x - dz * L, z + dx * L) > T ? 1 : 0;
    }
    auto = auto.filter((z) => z.fun); let cur = null;
    const cierra = () => { if (cur && cur.d1 - cur.d0 >= 30) auto.push({ ...cur, n: 0.6, fun: false }); cur = null; };
    for (let i = 0; i < pts.length; i++) {
      let s = 0; for (let k2 = -4; k2 <= 4; k2++) s += flag[Math.min(pts.length - 1, Math.max(0, i + k2))];
      if (s >= 5) { if (!cur) cur = { d0: dist[i], d1: dist[i] }; else cur.d1 = dist[i]; } else if (cur && dist[i] - cur.d1 > 70) cierra();
    }
    cierra();
  }
  function nivelAuto(d) {
    let n = 0, fun = false, tr = false;
    for (const z of auto) { const fuera = d < z.d0 ? z.d0 - d : d > z.d1 ? d - z.d1 : 0, k2 = (1 - sstep(0, d < z.d0 ? 40 : 60, fuera)) * z.n; if (k2 > n || (z.tr && k2 > 0.01 && k2 >= n - 0.05)) { n = Math.max(n, k2); fun = z.fun; tr = !!z.tr; } }   // la trepada manda sobre el funambulista
    return { n, fun, tr };
  }
  // pasos difíciles con nombre (hitos «paso»): lista de { x, z } en coordenadas del mundo; los que caen a menos de 120 m del recorrido marcan ±45 m de paso de funambulista
  function setPasosHito(lista) {
    auto = auto.filter((z) => !z.fun);
    for (const q of lista) { const c = cercano(q.x, q.z); if (c.metros < 120) auto.push({ d0: c.dist - 45, d1: c.dist + 45, n: 1, fun: true }); }
  }
  // pasos de trepada (hitos «paso» con trepada, chimenea, cadenas o grado I-III): ±45 m de subir con manos y pies, de cara a la roca (clip «trepar»)
  function setTrepadas(lista) {
    auto = auto.filter((z) => !z.tr);
    for (const q of lista) { const c = cercano(q.x, q.z); if (c.metros < 120) auto.push({ d0: c.dist - 45, d1: c.dist + 45, n: 1, fun: true, tr: true }); }
  }
  // hielo y glaciares (ruta.hielo: tramos [d0, d1] en m desde el inicio, de tools/build_hielo.py): se calzan los crampones 40 m antes de entrar y se quitan 40 m después de salir
  const hielo = (ruta.hielo || []).map(([a, b]) => ({ d0: a - 40, d1: b + 40 }));
  const nivelHielo = (d) => (hielo.some((z) => d >= z.d0 && d <= z.d1) ? 1 : 0);
  // intensidad del tramo especial (0 = marcha normal, 1 = en la arista) según la posición sobre el recorrido: sube durante la aproximación y baja tras la salida
  function nivelEn(d) {
    if (!paso) return 0; let n = 0;
    for (const z of paso.zonas) { const fuera = d < z.d0 ? z.d0 - d : d > z.d1 ? d - z.d1 : 0, R = d < z.d0 ? paso.aproximacion : paso.salida; n = Math.max(n, 1 - sstep(0, R, fuera)); }
    return n;
  }
  function postura(d, i, tt) {
    const n = nivelEn(d);
    if (n < 0.01) {   // fuera del Paso de Mahoma: aristas y pasos detectados
      const a = nivelAuto(d); if (a.n < 0.01) return { n: 0, c: null };
      if (a.tr) return { n: a.n, r: a.n, c: { trepa: sstep(0.15, 0.85, a.n), giro: 0.05 * Math.sin(tt * 0.6 + i * 1.7) * a.n } };
      const g = a.fun ? sstep(0.2, 0.8, 0.5 + 0.5 * Math.sin(tt * 0.35 + i * 2.3 + d * 0.02)) : 0;   // en los pasos marcados, a ratos agachados con las manos en la roca
      return { n: a.n, r: a.fun ? a.n : 0, c: { brazos: sstep(0.2, 0.9, a.n) * (1 - g), agach: (a.fun ? 0.15 + 0.6 * g : 0.12) * sstep(0.1, 0.8, a.n), manos: g * sstep(0.3, 0.9, a.n) * 0.9, giro: 0.1 * Math.sin(tt * 0.8 + i * 1.7) * a.n } };
    }
    const pos = en(d).pos, pr = proy(pos.x, pos.z), w = 0.08, [a, b] = paso.central;
    let cu = 0; if (n > 0.8 && pr.d < paso.corredor * 1.3) cu = sstep(a - w, a + w, pr.s) * (1 - sstep(b - w, b + w, pr.s)) * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(tt * 0.55 + i * 2.3)));
    return { n, c: { agach: sstep(0.08, 0.7, n) * 0.8, manos: sstep(0.4, 0.95, n), cuatro: cu * sstep(0.8, 1, n), giro: 0.12 * Math.sin(tt * 0.7 + i * 1.7) * n } };
  }
  function colocar(p, d, lat, andando, pos = null, vrel = 1, vel = null) {
    const hi = nivelHielo(d);
    const w = pos ? 8 + (40 - 8) * (1 - pos.n) : 40;
    const a = en(d), b = en(d + w), c = en(d - w);
    let dx = b.pos.x - c.pos.x, dz = b.pos.z - c.pos.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const l = lat * (pos ? 1 - pos.n : 1), x = a.pos.x + dz * l, z = a.pos.z - dx * l;
    p.h.position.set(x, geo.heightAt(x, z) + 1.2, z);   // los pies sobre el relieve (la línea de la ruta queda aparte, por encima)
    const yaw = Math.atan2(dx, dz); p.yaw = p.yaw == null ? yaw : p.yaw + Math.atan2(Math.sin(yaw - p.yaw), Math.cos(yaw - p.yaw)) * 0.2; p.h.rotation.y = p.yaw;   // mira hacia donde avanza el recorrido
    if (pos?.c?.trepa) { const b2 = en(d + 25), c2 = en(d - 25); pos.c.pend = Math.atan2(b2.pos.y - c2.pos.y, Math.hypot(b2.pos.x - c2.pos.x, b2.pos.z - c2.pos.z) || 1); }   // pendiente del tramo (±25 m): el que trepa se tumba hacia la roca lo que haga falta; si baja, destrepa
    p.alt = p.m.pose(p.fase, andando ? Math.min(1, 0.35 + 0.65 * vrel) : 0, Math.max(-0.6, Math.min(0.8, (b.pos.y - c.pos.y) / (L * 1.0))) * 0.4, pos?.c, andando ? vel : 0, hi);
  }
  // cuerda entre montañeros consecutivos: tubo fino de 4 caras que se rehace cada fotograma a partir de sus cinturas (curva con holgura, sin física)
  const NS = 12, cuerdaMat = new THREE.MeshBasicMaterial({ color: '#c0392b', fog: true, transparent: true, opacity: 0 });
  const cuerdas = [0, 1].map(() => {
    const g = new THREE.BufferGeometry(), v = new Float32Array((NS + 1) * 4 * 3), id = [];
    for (let j = 0; j < NS; j++) for (let k2 = 0; k2 < 4; k2++) { const a = j * 4 + k2, b = j * 4 + (k2 + 1) % 4, c = a + 4, d = b + 4; id.push(a, c, b, b, c, d); }
    g.setAttribute('position', new THREE.BufferAttribute(v, 3)); g.setIndex(id);
    const m = new THREE.Mesh(g, cuerdaMat.clone()); m.frustumCulled = false; m.visible = false; m.renderOrder = 3; scene.add(m); return m;
  });
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3(), _t = new THREE.Vector3(), _h = new THREE.Vector3(), _v = new THREE.Vector3();
  function cuerda(m, p1, p2, op, tt, i) {
    if (op < 0.03) { m.visible = false; return; }
    _a.copy(p1.h.position); _a.y += p1.alt * ESC_M * 0.98; _b.copy(p2.h.position); _b.y += p2.alt * ESC_M * 0.98;
    const dd = _a.distanceTo(_b), Lr = Math.max(dd + 4, 30) * (1 + 0.04 * Math.sin(tt * 0.9 + i * 1.9)), sag = Math.min(10, Math.sqrt(0.375 * Lr * Math.max(0, Lr - dd))), r = 0.28 * Math.max(0.35, op);
    const pos = m.geometry.attributes.position.array;
    for (let j = 0; j <= NS; j++) {
      const u = j / NS; _p.lerpVectors(_a, _b, u); _p.y -= sag * 4 * u * (1 - u);
      const g = geo.heightAt(_p.x, _p.z) + 0.8; if (_p.y < g) _p.y = g;   // no atraviesa el terreno
      _t.subVectors(_b, _a).normalize(); _h.crossVectors(_t, new THREE.Vector3(0, 1, 0)).normalize(); _v.crossVectors(_h, _t).normalize();
      pos.set([_p.x + _h.x * r, _p.y + _h.y * r, _p.z + _h.z * r, _p.x + _v.x * r, _p.y + _v.y * r, _p.z + _v.z * r, _p.x - _h.x * r, _p.y - _h.y * r, _p.z - _h.z * r, _p.x - _v.x * r, _p.y - _v.y * r, _p.z - _v.z * r], j * 12);
    }
    m.geometry.attributes.position.needsUpdate = true; m.geometry.computeBoundingSphere(); m.material.opacity = sstep(0.1, 0.8, op); m.visible = true;
  }
  const ver = () => { solo.h.visible = activo && cursorOn; for (const p of equipo) p.h.visible = activo && !cursorOn && !reducido; if (!(activo && !cursorOn && !reducido)) for (const c of cuerdas) c.visible = false; };

  let k = 1, activo = false, t0 = 0;
  const set = () => geom.setDrawRange(0, Math.floor(k * tub) * rad * 6);
  set();

  // posición y altitud a una distancia (m) del inicio
  function en(d) {
    d = Math.min(ruta.distancia, Math.max(0, d));
    let lo = 0, hi = dist.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (dist[m] <= d) lo = m; else hi = m; }
    const span = dist[hi] - dist[lo] || 1, t = (d - dist[lo]) / span;
    return { pos: pts[lo].clone().lerp(pts[hi], t), ele: ruta.puntos[lo][2] + (ruta.puntos[hi][2] - ruta.puntos[lo][2]) * t, dist: d };
  }
  // punto de la ruta más cercano a una posición (x, z): para situar un hito en el recorrido
  function cercano(x, z) {
    let best = 1e18, bi = 0;
    for (let i = 0; i < pts.length; i++) { const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2; if (d < best) { best = d; bi = i; } }
    return { metros: Math.sqrt(best), dist: dist[bi], ele: ruta.puntos[bi][2] };
  }

  // todas las veces que el recorrido pasa a menos de `radio` m de un punto (subida y bajada), en orden
  function pasos(x, z, radio = 220) {
    const out = []; let cur = null;
    for (let i = 0; i < pts.length; i++) {
      const m = Math.hypot(pts[i].x - x, pts[i].z - z);
      if (m > radio) { if (cur) { out.push(cur); cur = null; } continue; }
      if (!cur) cur = { metros: m, dist: dist[i] }; else if (m < cur.metros) { cur.metros = m; cur.dist = dist[i]; }
    }
    if (cur) out.push(cur);
    // pasadas casi seguidas (vueltas del track, GPS) cuentan como una sola
    return out.reduce((a, c) => { const u = a[a.length - 1]; if (u && c.dist - u.dist < 1500) { if (c.metros < u.metros) { u.metros = c.metros; u.dist = c.dist; } } else a.push({ ...c }); return a; }, []);
  }

  calculaAristas();
  const lo = Math.floor(ruta.min / 100) * 100, hi = Math.ceil(ruta.max / 100) * 100;
  const X = (m) => PL + (m / ruta.distancia) * (PW - PL - PR), Y = (e) => PT + (1 - (e - lo) / (hi - lo)) * (PH - PT - PB);
  const fmtKm = (m) => (m / 1000).toFixed(1).replace('.', ',');

  // el relieve cambió en una zona (se cargó o se quitó el detalle de una cima): la línea vuelve a ir a su altura sobre el suelo
  function reajusta({ x0, z0, x1, z1 }) {
    if (bb.x1 < x0 || bb.x0 > x1 || bb.z1 < z0 || bb.z0 > z1) return;
    let cambio = 0;
    for (const p of pts) if (p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1) { const y = geo.heightAt(p.x, p.z) + 24; cambio = Math.max(cambio, Math.abs(y - p.y)); p.y = y; }
    if (cambio < 1) return;
    curve.updateArcLengths();
    const g = new THREE.TubeGeometry(curve, tub, 11, rad, false); g.setDrawRange(geom.drawRange.start, geom.drawRange.count);
    mesh.geometry = g; geom.dispose(); geom = g;
  }

  return {
    ruta, centro, extension, en, cercano, pasos, reajusta,
    mostrar(v, { animar = true } = {}) {
      activo = v; mesh.visible = v; ver();
      if (v) { k = animar ? 0 : 1; t0 = performance.now(); set(); resetEquipo(); }
    },
    get visible() { return activo; },
    update(dt = 0.016) {
      if (activo && k < 1) { k = Math.min(1, (performance.now() - t0) / 4500); set(); }
      if (!activo) return;
      const tt = performance.now() / 1000;
      if (cursorOn) {
        const anda = performance.now() - ultimoCursor < 250; const pp = postura(dCursor, 0, tt);
        if (anda) solo.fase += dt * 11 * (1 - 0.7 * pp.n); colocar(solo, dCursor, 0, anda, pp, 1 - 0.7 * pp.n, 3.4 * (1 - 0.7 * pp.n));
      } else if (!reducido) {
        // cada uno avanza a su ritmo: lento en el tramo especial (con pausas), sin adelantar al de delante y manteniendo al menos GAP_MIN m
        est.forEach((q, i) => {
          const n = nivelEn(q.d); let v = V0 * (1 - 0.94 * n) * (1 - 0.62 * nivelHielo(q.d));   // sobre el hielo, con crampones y piolet, bastante más despacio
         
          const au = n < 0.01 ? nivelAuto(q.d) : { n: 0, fun: false }, na = au.n; v *= au.fun ? 1 - 0.92 * na : 1 - 1.25 * na;   // aristas (≈25 % del ritmo) y pasos difíciles (≈8 %): muy despacio y con pausas
          if (q.pausa > 0 && n <= 0.7 && na <= 0.7) { q.pausa -= dt; v = 0; }
          if (n > 0.7 || na > 0.7) { q.cd -= dt; if (q.pausa > 0) { q.pausa -= dt; v = 0; } else if (q.cd <= 0) { q.pausa = 0.7 + Math.random() * 0.8; q.cd = 2.5 + Math.random() * 2.5; } }
          // caídas: solo en aristas y pasos difíciles, de vez en cuando; el que cae y los demás (la cuerda) se paran mientras dura
          q.cdc = (q.cdc ?? 6 + Math.random() * 14) - dt;
          if (q.cdc <= 0 && q.pausa <= 0 && Math.max(n, na) > 0.4 && Math.random() < dt * 0.09 * Math.max(n, na)) caer(i, Math.random() < pVoltereta(q.d) ? 'voltereta' : 'tropiezo');   // en pendiente fuerte, más volteretas; en suave, tropiezos
          q.d += v * dt; q.v = v;
          if (i > 0) { const lim = est[i - 1].d - GAP_MIN; if (q.d > lim) { q.d = lim; q.v = est[i - 1].v ?? v; } }
        });
        if (est[0].d > ruta.distancia + 500) resetEquipo();
        const pp = [];
        equipo.forEach((p, i) => {
          const d = est[i].d, dc = Math.max(0, Math.min(ruta.distancia, d)), po = postura(dc, i, tt), vr = (est[i].v ?? V0) / V0; pp.push({ po, dc });
          p.fase += dt * (2 + 8 * vr); colocar(p, dc, [0, 34, -34][i], d > 0 && d < ruta.distancia && vr > 0.01, po, vr, (est[i].v ?? V0) / ESC_M);
        });
        for (let i = 0; i < 2; i++) { const o = Math.min(pp[i].po.r ?? pp[i].po.n, pp[i + 1].po.r ?? pp[i + 1].po.n); cuerda(cuerdas[i], equipo[i], equipo[i + 1], est[i].d > 0 && est[i + 1].d > 0 && est[i].d < ruta.distancia && est[i + 1].d < ruta.distancia ? o : 0, tt, i); }
      }
    },
    // en la vista de detalle (cámara a pocas decenas de metros) el tubo de 11 m de radio taparía la pantalla: se vuelve translúcido
    delgada(v) { mesh.material.opacity = v ? 0.5 : 0.92; },
    // tamaño fijo (ESC_M) a cualquier distancia, igual que los modelos de las cimas, para que guarden la proporción
    escalar() { for (const p of [...equipo, solo]) if (p.h.visible) p.h.scale.setScalar(ESC_M); },
    setPaso, setPasosHito, setTrepadas, caer, _est: est, _auto: () => auto,
    posiciones: () => ({ solo: solo.h.position.clone(), equipo: equipo.map((p) => p.h.position.clone()) }),
    cursor(d) {
      if (d == null || !activo) { cursorOn = false; ver(); return; }
      if (Math.abs(d - dCursor) > 0.5) ultimoCursor = performance.now();
      dCursor = d; cursorOn = true; ver(); colocar(solo, d, 0, false);
    },
    perfil() {
      const lin = ruta.puntos.map((p) => `${X(p[3]).toFixed(1)},${Y(p[2]).toFixed(1)}`).join(' ');
      return `<svg viewBox="0 0 ${PW} ${PH}" class="perfil" role="img" aria-label="${tr('Perfil de altura de la ruta, de {a} a {b} metros en {k} kilómetros. Desliza el dedo para ver un punto concreto en el mapa.', { a: ruta.min, b: ruta.max, k: fmtKm(ruta.distancia) })}">
        <line x1="${PL}" x2="${PW - PR}" y1="${Y(hi)}" y2="${Y(hi)}" class="g"/><line x1="${PL}" x2="${PW - PR}" y1="${Y(lo)}" y2="${Y(lo)}" class="g"/>
        <polygon points="${X(0)},${Y(lo)} ${lin} ${X(ruta.distancia)},${Y(lo)}" class="a"/><polyline points="${lin}" class="l"/>
        <text x="${PL - 4}" y="${Y(hi) + 3}" text-anchor="end">${hi}</text><text x="${PL - 4}" y="${Y(lo) + 3}" text-anchor="end">${lo}</text>
        <text x="${PL}" y="${PH - 3}">0 km</text><text x="${PW - PR}" y="${PH - 3}" text-anchor="end">${fmtKm(ruta.distancia)} km</text>
        <g class="cur" visibility="hidden"><line class="cl" y1="${PT}" y2="${PH - PB}"/><circle r="3" class="cp"/><text class="ct" y="${PT + 7}"></text></g></svg>`;
    },
    // distancia (m) bajo el puntero, a partir de la posición en el SVG del perfil
    distanciaEn(svg, clientX) {
      const r = svg.getBoundingClientRect(); const x = ((clientX - r.left) / r.width) * PW;
      return Math.min(ruta.distancia, Math.max(0, ((x - PL) / (PW - PL - PR)) * ruta.distancia));
    },
    marcarPerfil(svg, d) {
      const g = svg.querySelector('.cur'); if (!g) return;
      if (d == null) { g.setAttribute('visibility', 'hidden'); return; }
      const e = en(d), x = X(d), y = Y(e.ele);
      g.setAttribute('visibility', 'visible');
      g.querySelector('.cl').setAttribute('x1', x); g.querySelector('.cl').setAttribute('x2', x);
      g.querySelector('.cp').setAttribute('cx', x); g.querySelector('.cp').setAttribute('cy', y);
      const t = g.querySelector('.ct'); t.textContent = `${fmtKm(d)} km · ${Math.round(e.ele)} m`;
      const izq = x > PW * 0.62; t.setAttribute('x', izq ? x - 5 : x + 5); t.setAttribute('text-anchor', izq ? 'end' : 'start');
    },
  };
}
