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
  const listo = fetch('data/terrain/cumbres/index.json').then((r) => (r.ok ? r.json() : null)).then((j) => { indice = j; }).catch(() => {});
  const piezas = new Map();   // id -> { H, x0, z0, n, paso, mesh, mat, ch, hueco }
  const cargando = new Map();

  const sample = (p, x, z) => {
    const fx = (x - p.x0) / p.paso, fz = (z - p.z0) / p.paso;
    if (fx < 0 || fz < 0 || fx > p.n - 1 || fz > p.n - 1) return undefined;
    const i = Math.min(p.n - 2, Math.floor(fx)), j = Math.min(p.n - 2, Math.floor(fz)), tx = fx - i, tz = fz - j, H = p.H, n = p.n;
    return (H[j * n + i] * (1 - tx) + H[j * n + i + 1] * tx) * (1 - tz) + (H[(j + 1) * n + i] * (1 - tx) + H[(j + 1) * n + i + 1] * tx) * tz;
  };
  geo.setExtra((x, z) => { for (const p of piezas.values()) { const h = sample(p, x, z); if (h !== undefined) return h; } return undefined; });

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

  function quita(id) {
    const p = piezas.get(id); if (!p) return;
    scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mat.dispose(); terrain.hueco(p.hueco, 1e9, 1e9, 1e9, 1e9); piezas.delete(id);
  }

  return {
    get cargadas() { return [...piezas.keys()]; },
    carga,
    update(cam) {
      for (const p of piezas.values()) if (p.mat.map !== p.ch.mat.map) { p.mat.map = p.ch.mat.map; p.mat.color.set(p.ch.mat.map ? 0xffffff : 0x8a9488); p.mat.needsUpdate = true; }
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
