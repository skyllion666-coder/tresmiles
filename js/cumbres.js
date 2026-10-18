// Piezas de relieve de alta resolución alrededor de cada cumbre activa.
// Dato real: MDT05 del IGN (5 m, CC BY 4.0, © Instituto Geográfico Nacional de España), remuestreado a 6 m (tools/build_cumbres.py).
// El relieve general (~23×31 m) redondea las crestas estrechas (Paso de Mahoma, aristas); la pieza las recupera. Se pide solo al acercarse;
// en el borde se funde con el relieve general y este se recorta debajo (huecos en el shader de terrain.js). geo.heightAt pasa a usarla,
// así que rutas, montañeros, rebecos y árboles se apoyan en la misma superficie.
import * as THREE from 'three';
import { EXAG } from './geo.js';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function crearCumbres({ scene, geo, terrain, movil, alCargar, fijo }) {
  const MAX = movil ? 1 : 3, CARGA = movil ? 5500 : 7500, DESCARGA = movil ? 8000 : 11000, FUNDE = 90, INSET = 4;
  let indice = null, cuenta = 0;
  let ficha = null;
  fetch('data/terrain/cumbres/detalles.json').then((r) => (r.ok ? r.json() : null)).then((j) => { ficha = j; }).catch(() => {});
  const listo = fetch('data/terrain/cumbres/index.json').then((r) => (r.ok ? r.json() : null)).then((j) => { indice = j; }).catch(() => {});
  const piezas = new Map();   // id -> { H, x0, z0, n, paso, mesh, mat, ch, hueco }
  const cargando = new Map();

  const sample = (p, x, z) => {
    const fx = (x - p.x0) / p.paso, fz = (z - p.z0) / p.paso;
    if (fx < 0 || fz < 0 || fx > p.n - 1 || fz > p.n - 1) return undefined;
    const i = Math.min(p.n - 2, Math.floor(fx)), j = Math.min(p.n - 2, Math.floor(fz)), tx = fx - i, tz = fz - j, H = p.H, n = p.n;
    return (H[j * n + i] * (1 - tx) + H[j * n + i + 1] * tx) * (1 - tz) + (H[(j + 1) * n + i] * (1 - tx) + H[(j + 1) * n + i + 1] * tx) * tz;
  };
  const detalles = new Map(), detCarga = new Set();   // id -> detalle local (Paso de Mahoma)
  geo.setExtra((x, z) => {
    for (const d of detalles.values()) { const h = sample(d, x, z); if (h !== undefined) return h; }
    for (const p of piezas.values()) { const h = sample(p, x, z); if (h !== undefined) return h; }
    return undefined;
  });

  async function lee(id) {
    const r = await fetch(`data/terrain/cumbres/${id}.bin.gz`);
    if (!r.ok || typeof DecompressionStream === 'undefined') return null;
    return new Uint16Array(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  }

  async function carga(id) {
    await listo;
    if (piezas.has(id)) return piezas.get(id);
    if (cargando.has(id)) return cargando.get(id);
    const d = indice?.[id]; if (!d) return null;
    const pr = (async () => {
      const raw = await lee(id); if (!raw || raw.length !== d.n * d.n) return null;
      const ch = terrain.chunkEn(d.x0 + (d.n * d.paso) / 2, d.z0 + (d.n * d.paso) / 2); if (!ch) return null;
      const { n, paso, x0, z0 } = d, H = new Float32Array(n * n), hs = geo.hs;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const x = x0 + i * paso, z = z0 + j * paso, base = geo.heightBase(x, z), v = raw[j * n + i];
        const borde = Math.min(i, j, n - 1 - i, n - 1 - j) * paso;
        H[j * n + i] = v ? base + (v * hs - base) * sstep(0, FUNDE, borde) : base;   // sin dato o borde: relieve general
      }
      const m = 1, nm = Math.floor((n - 1) / m) + 1;
      const pos = new Float32Array(nm * nm * 3), nor = new Float32Array(nm * nm * 3), uv = new Float32Array(nm * nm * 2);
      const cw = terrain.meta.chunk * geo.dx, cd = terrain.meta.chunk * geo.dz;
      for (let b = 0; b < nm; b++) for (let a = 0; a < nm; a++) {
        const i = a * m, j = b * m, k = b * nm + a, x = x0 + i * paso, z = z0 + j * paso;
        pos[k * 3] = x; pos[k * 3 + 1] = H[j * n + i]; pos[k * 3 + 2] = z;
        const i0 = Math.max(0, i - m), i1 = Math.min(n - 1, i + m), j0 = Math.max(0, j - m), j1 = Math.min(n - 1, j + m);
        const hx = (H[j * n + i0] - H[j * n + i1]) / ((i1 - i0) * paso), hz = (H[j0 * n + i] - H[j1 * n + i]) / ((j1 - j0) * paso), il = 1 / Math.hypot(hx, 1, hz);
        nor[k * 3] = hx * il; nor[k * 3 + 1] = il; nor[k * 3 + 2] = hz * il;
        uv[k * 2] = (x - ch.x0) / cw; uv[k * 2 + 1] = 1 - (z - ch.z0) / cd;
      }
      const idx = new Uint32Array((nm - 1) * (nm - 1) * 6); let q = 0;
      for (let b = 0; b < nm - 1; b++) for (let a = 0; a < nm - 1; a++) { const v0 = b * nm + a, v1 = v0 + 1, v2 = v0 + nm, v3 = v2 + 1; idx[q++] = v0; idx[q++] = v2; idx[q++] = v1; idx[q++] = v1; idx[q++] = v2; idx[q++] = v3; }
      // faldón: el borde de la pieza baja 60 m para que no se vea ninguna rendija con el relieve general
      const borde = []; for (let a = 0; a < nm; a++) borde.push(a); for (let b = 1; b < nm; b++) borde.push(b * nm + nm - 1); for (let a = nm - 2; a >= 0; a--) borde.push((nm - 1) * nm + a); for (let b = nm - 2; b >= 1; b--) borde.push(b * nm);
      const nb = borde.length, tot = nm * nm + nb, pos2 = new Float32Array(tot * 3), nor2 = new Float32Array(tot * 3), uv2 = new Float32Array(tot * 2), idx2 = new Uint32Array(idx.length + nb * 6);
      pos2.set(pos); nor2.set(nor); uv2.set(uv); idx2.set(idx);
      borde.forEach((v, k) => { const d = nm * nm + k; pos2.set([pos[v * 3], pos[v * 3 + 1] - 60, pos[v * 3 + 2]], d * 3); nor2.set([nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]], d * 3); uv2.set([uv[v * 2], uv[v * 2 + 1]], d * 2); });
      for (let k = 0; k < nb; k++) { const a = borde[k], b = borde[(k + 1) % nb], da = nm * nm + k, db = nm * nm + (k + 1) % nb; idx2.set([a, b, db, a, db, da], idx.length + k * 6); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos2, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor2, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv2, 2));
      g.setIndex(new THREE.BufferAttribute(idx2, 1)); g.computeBoundingSphere();
      const mat = terrain.crearMaterialPieza(ch), mesh = new THREE.Mesh(g, mat); mesh.matrixAutoUpdate = false; mesh.frustumCulled = true;
      const usados = new Set([...piezas.values()].map((p) => p.hueco)); let hueco = 0; while (usados.has(hueco)) hueco++;
      if (hueco > 3) { g.dispose(); mat.dispose(); return null; }
      scene.add(mesh); terrain.hueco(hueco, x0 + INSET, z0 + INSET, x0 + (nm - 1) * m * paso - INSET, z0 + (nm - 1) * m * paso - INSET);
      const p = { id, H, x0, z0, n, paso, mesh, mat, ch, hueco }; piezas.set(id, p);
      alCargar?.({ x0, z0, x1: x0 + (n - 1) * paso, z1: z0 + (n - 1) * paso });
      return p;
    })().catch((e) => { console.warn("cumbres", id, e); return null; }).finally(() => cargando.delete(id));
    cargando.set(id, pr); return pr;
  }

  // — detalle local del Paso de Mahoma: malla de 1,5 m a partir del MDT05 (spline cúbico) + bloques de granito procedurales + cruz de cumbre (OSM) —
  const hash2 = (a, b, s2) => { let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(s2, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const BLOQUE = 3.4;
  function voronoi(x, z) {   // distancia al centro más cercano y al segundo, y el id de la celda
    const gx = Math.floor(x / BLOQUE), gz = Math.floor(z / BLOQUE); let f1 = 9, f2 = 9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = gx + i, cz = gz + j, px = (cx + hash2(cx, cz, 11)) * BLOQUE, pz = (cz + hash2(cx, cz, 12)) * BLOQUE, d = Math.hypot(px - x, pz - z) / BLOQUE;
      if (d < f1) { f2 = f1; f1 = d; id = hash2(cx, cz, 13); } else if (d < f2) f2 = d;
    }
    return [f1, f2, id];
  }
  const distSeg = (x, z, ps) => { let m = 1e9; for (let k = 0; k < ps.length - 1; k++) { const a = ps[k], b = ps[k + 1], vx = b.x - a.x, vz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz || 1))); m = Math.min(m, Math.hypot(x - a.x - vx * t, z - a.z - vz * t)); } return m; };

  async function cargaDetalle(id) {
    if (detalles.has(id) || detCarga.has(id) || !ficha?.[id] || !piezas.has(id)) return;
    const d = ficha[id], pz = piezas.get(id); detCarga.add(id);
    try {
      const r = await fetch(`data/terrain/cumbres/${d.archivo}`);
      if (!r.ok || typeof DecompressionStream === 'undefined') throw new Error('sin datos');
      const raw = new Uint16Array(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()), n = d.n, paso = d.paso, hs = geo.hs;
      if (raw.length !== n * n) throw new Error('tamaño');
      const H = new Float32Array(n * n), sl = new Float32Array(n * n);
      for (let k = 0; k < n * n; k++) H[k] = raw[k] * hs;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const k = j * n + i, gx = (H[j * n + Math.min(n - 1, i + 1)] - H[j * n + Math.max(0, i - 1)]) / (2 * paso * EXAG), gz = (H[Math.min(n - 1, j + 1) * n + i] - H[Math.max(0, j - 1) * n + i]) / (2 * paso * EXAG);
        sl[k] = Math.hypot(gx, gz);   // pendiente física (altura real / distancia)
      }
      const cxm = d.x0 + (n - 1) * paso / 2, czm = d.z0 + (n - 1) * paso / 2, F = new Float32Array(n * n);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const k = j * n + i, x = d.x0 + i * paso, z = d.z0 + j * paso, dc = Math.hypot(x - cxm, z - czm);
        const cr = 1 - sstep(5, 15, distSeg(x, z, d.cresta)), mask = Math.max(sstep(0.35, 0.85, sl[k]) * 0.8, cr) * (1 - sstep(80, 112, dc));
        const [f1, f2, idc] = voronoi(x, z), borde = 1 - sstep(0.02, 0.2, f2 - f1);
        const bloque = ((idc - 0.5) * 2 * 1.15 * (1 - borde) - 0.5 * borde) * EXAG;   // metros reales × exageración vertical
        const base = H[k] + bloque * mask;
        const hb = sample(pz, x, z) ?? base, bd = Math.min(i, j, n - 1 - i, n - 1 - j) * paso;
        F[k] = hb + (base - hb) * sstep(0, 14, bd);
      }
      detalles.set(id, { ...d, H: F });   // a partir de aquí heightAt la usa
      const ch = pz.ch, cw = terrain.meta.chunk * geo.dx, cd = terrain.meta.chunk * geo.dz;
      const pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const k = j * n + i, x = d.x0 + i * paso, z = d.z0 + j * paso;
        pos.set([x, F[k], z], k * 3);
        const hx = (F[j * n + Math.max(0, i - 1)] - F[j * n + Math.min(n - 1, i + 1)]) / (2 * paso), hz = (F[Math.max(0, j - 1) * n + i] - F[Math.min(n - 1, j + 1) * n + i]) / (2 * paso), il = 1 / Math.hypot(hx, 1, hz);
        nor.set([hx * il, il, hz * il], k * 3); uv.set([(x - ch.x0) / cw, 1 - (z - ch.z0) / cd], k * 2);
      }
      const roca = new Float32Array(n * n);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = d.x0 + i * paso, z = d.z0 + j * paso; roca[j * n + i] = Math.max(1 - sstep(4, 12, distSeg(x, z, d.cresta)), sstep(0.5, 0.95, sl[j * n + i])) * (1 - sstep(85, 115, Math.hypot(x - cxm, z - czm))); }
      const idx = []; for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, e = c + 1; idx.push(a, c, b, b, c, e); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('aRoca', new THREE.BufferAttribute(roca, 1)); g.setIndex(idx); g.computeBoundingSphere();
      const mat = terrain.crearMaterialPieza(ch), mesh = new THREE.Mesh(g, mat); mesh.matrixAutoUpdate = false;
      scene.add(mesh);
      // la pieza de 6 m se recorta debajo de esta (menos 14 m del borde, donde ambas coinciden)
      pz.mat.userData.holes.value[0].set(d.x0 + 14, d.z0 + 14, d.x0 + (n - 1) * paso - 14, d.z0 + (n - 1) * paso - 14);
      // bloques de granito sueltos (instanciados) sobre la arista y las paredes
      const col = new THREE.Color(), lista = [];
      const bg = new THREE.BoxGeometry(1, 1, 1, 2, 1, 2); {   // bloque irregular: caja con los vértices desplazados de forma determinista
        const pa = bg.attributes.position; for (let k = 0; k < pa.count; k++) { const hx = hash2(Math.round(pa.getX(k) * 7), Math.round(pa.getY(k) * 7) + k % 3, 31), hz = hash2(Math.round(pa.getZ(k) * 7), Math.round(pa.getY(k) * 5), 32); pa.setXYZ(k, pa.getX(k) + (hx - 0.5) * 0.34, pa.getY(k) + (hz - 0.5) * 0.22, pa.getZ(k) + (hx * hz - 0.25) * 0.4); }
        bg.computeVertexNormals(); }
      const bm = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
      for (let z = d.z0 + 10; z < d.z0 + (n - 1) * paso - 10; z += 3) for (let x = d.x0 + 10; x < d.x0 + (n - 1) * paso - 10; x += 3) {
        const ix = Math.round(x * 3), iz = Math.round(z * 3), dcr = distSeg(x, z, d.cresta), dc = Math.hypot(x - cxm, z - czm);
        const i = Math.round((x - d.x0) / paso), j = Math.round((z - d.z0) / paso), s0 = sl[j * n + i];
        const pr = (dcr < 12 ? 0.42 : 0.10) * (s0 > 0.2 && s0 < 1.1 ? 1 : 0.15) * (1 - sstep(70, 105, dc));
        if (hash2(ix, iz, 21) > pr || lista.length >= 700) continue;
        lista.push({ x: x + (hash2(ix, iz, 22) - 0.5) * 2.4, z: z + (hash2(ix, iz, 23) - 0.5) * 2.4, s: (0.6 + hash2(ix, iz, 24) * 1.4) * 1.05, a: hash2(ix, iz, 25), b: hash2(ix, iz, 26), c: hash2(ix, iz, 27) });
      }
      const inst = new THREE.InstancedMesh(bg, bm, lista.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
      lista.forEach((b, k) => {
        const h = sample(detalles.get(id), b.x, b.z) ?? 0;
        pv.set(b.x, h + b.s * 0.06, b.z); e.set((b.b - 0.5) * 0.7, b.a * 6.28, (b.c - 0.5) * 0.7); q.setFromEuler(e); sv.set(b.s * (1.0 + b.a * 0.9), b.s * (0.55 + b.b * 0.35), b.s * (0.9 + b.c * 0.7));
        inst.setMatrixAt(k, m4.compose(pv, q, sv)); const t2 = 0.78 + b.a * 0.3; inst.setColorAt(k, col.setRGB(0.36 * t2, 0.34 * t2, 0.31 * t2 * (0.95 + b.c * 0.1)));
      });
      inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true; inst.computeBoundingSphere(); scene.add(inst);
      // cruz de cumbre (OSM summit:cross=yes en la cima), de tamaño exagerado para verse
      const cruz = new THREE.Group(), fe = new THREE.MeshLambertMaterial({ color: 0x3b3f44 });
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.3, 0.14), fe); v.position.y = 1.15; const hbx = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.14), fe); hbx.position.y = 1.75; cruz.add(v, hbx);
      cruz.scale.setScalar(3.5); cruz.position.set(d.cruz.x, (sample(detalles.get(id), d.cruz.x, d.cruz.z) ?? 0) - 0.5, d.cruz.z); scene.add(cruz);
      Object.assign(detalles.get(id), { mesh, mat, inst, cruz, pieza: pz });
    } catch (e) { console.warn('detalle', id, e); detalles.delete(id); } finally { detCarga.delete(id); }
  }
  function quitaDetalle(id) {
    const d = detalles.get(id); if (!d) { detalles.delete(id); return; }
    for (const o of [d.mesh, d.inst, d.cruz]) { if (!o) continue; scene.remove(o); o.geometry?.dispose?.(); o.material?.dispose?.(); o.traverse?.((c) => { c.geometry?.dispose?.(); }); }
    d.mat?.dispose(); d.pieza?.mat.userData.holes.value[0].set(1e9, 1e9, 1e9, 1e9); detalles.delete(id);
  }

  function quita(id) {
    quitaDetalle(id);
    const p = piezas.get(id); if (!p) return;
    scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mat.dispose(); terrain.hueco(p.hueco, 1e9, 1e9, 1e9, 1e9); piezas.delete(id);
  }

  return {
    get cargadas() { return [...piezas.keys()]; },
    get detalle() { return [...detalles.keys()]; },
    ficha: () => ficha,
    carga,
    update(cam) {
      for (const p of piezas.values()) if (p.mat.map !== p.ch.mat.map) { p.mat.map = p.ch.mat.map; p.mat.color.set(p.ch.mat.map ? 0xffffff : 0x8a9488); p.mat.needsUpdate = true; }
      if (ficha) for (const [id, d] of Object.entries(ficha)) {
        const dist = Math.hypot(d.x0 + (d.n * d.paso) / 2 - cam.position.x, d.z0 + (d.n * d.paso) / 2 - cam.position.z);
        if (!detalles.has(id) && !detCarga.has(id) && dist < 2200 && piezas.has(id)) cargaDetalle(id);
        else if (detalles.has(id) && dist > 4200 && id !== fijo?.()) quitaDetalle(id);
      }
      if (!indice || ++cuenta % 15) return;
      const cerca = [];
      for (const [id, d] of Object.entries(indice)) {
        const dist = Math.hypot(d.x0 + (d.n * d.paso) / 2 - cam.position.x, d.z0 + (d.n * d.paso) / 2 - cam.position.z);
        if (piezas.has(id)) { if (dist > DESCARGA && id !== fijo?.()) quita(id); } else if (dist < CARGA) cerca.push([dist, id]);
      }
      cerca.sort((a, b) => a[0] - b[0]);
      let n = piezas.size + cargando.size;
      for (const [, id] of cerca) {
        if (n >= MAX) break;
        const d = indice[id], ch = terrain.chunkEn(d.x0 + (d.n * d.paso) / 2, d.z0 + (d.n * d.paso) / 2);
        if (ch && ch.stride === 1) { carga(id); n++; }
      }
    },
  };
}
