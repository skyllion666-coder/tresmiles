// Piezas de relieve de alta resolución alrededor de cada cumbre activa.
// Dato real: MDT05 del IGN (5 m, CC BY 4.0, © Instituto Geográfico Nacional de España), remuestreado a 6 m (tools/build_cumbres.py).
// El relieve general (~23×31 m) redondea las crestas estrechas (Paso de Mahoma, aristas); la pieza las recupera. Se pide solo al acercarse;
// en el borde se funde con el relieve general y este se recorta debajo (huecos en el shader de terrain.js). geo.heightAt pasa a usarla,
// así que rutas, montañeros, rebecos y árboles se apoyan en la misma superficie.
import * as THREE from 'three';
import { EXAG } from './geo.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const modelos = new Map();   // url -> Promise<gltf>
const cargaModelo = (url) => { if (!modelos.has(url)) modelos.set(url, new Promise((res) => new GLTFLoader().load(url, res, undefined, () => res(null)))); return modelos.get(url); };

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function crearCumbres({ scene, geo, terrain, movil, alCargar, fijo }) {
  const MAX = movil ? 1 : 3, CARGA = movil ? 5500 : 7500, DESCARGA = movil ? 8000 : 11000, FUNDE = 90, INSET = 4;
  let indice = null, cuenta = 0;
  let ficha = null;
  const fichaListo = fetch(`data/terrain/cumbres/detalles.json?v=${window.WEB_V || 0}`).then((r) => (r.ok ? r.json() : null)).then((j) => { ficha = j; return j; }).catch(() => null);
  const listo = fetch(`data/terrain/cumbres/index.json?v=${window.WEB_V || 0}`).then((r) => (r.ok ? r.json() : null)).then((j) => { indice = j; }).catch(() => {});
  const piezas = new Map();   // id -> { H, x0, z0, n, paso, mesh, mat, ch, hueco }
  const cargando = new Map();

  const sample = (p, x, z) => {
    const fx = (x - p.x0) / p.paso, fz = (z - p.z0) / p.paso;
    if (fx < 0 || fz < 0 || fx > p.n - 1 || fz > p.n - 1) return undefined;
    const i = Math.min(p.n - 2, Math.floor(fx)), j = Math.min(p.n - 2, Math.floor(fz)), tx = fx - i, tz = fz - j, H = p.H, n = p.n;
    return (H[j * n + i] * (1 - tx) + H[j * n + i + 1] * tx) * (1 - tz) + (H[(j + 1) * n + i] * (1 - tx) + H[(j + 1) * n + i + 1] * tx) * tz;
  };
  function aplicaOrto(mat, tex, ch, pb) {
    mat.map = tex; mat.color.set(0xffffff); mat.needsUpdate = true;
    const u = mat.userData; u.orto.value = 1; u.sat.value = ch.mat.map;
    if (pb) u.pb.value.set(pb[0], pb[1], pb[2], pb[3]);
  }
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
      const lado = (nm - 1) * m * paso;
      // ortofoto del PNOA (IGN, 25–50 cm, CC BY 4.0) sobre la pieza: sustituye al satélite de 10 m dentro de ella (tools/build_orto.py)
      const archivoOrto = /[?&]sinorto/.test(location.search) ? null : movil ? d.ortoM : d.orto;
      if (archivoOrto) new THREE.TextureLoader().load(`data/terrain/cumbres/${archivoOrto}?v=${window.WEB_V || 0}`, (tex) => {
        if (piezas.get(id) !== p) { tex.dispose(); return; }
        const pw = (nm - 1) * m * paso;   // lado de la pieza (m)
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(8, terrain.aniso ?? 4); tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.repeat.set(cw / pw, cd / pw); tex.offset.set((ch.x0 - x0) / pw, (pw - (ch.z0 - z0) - cd) / pw);   // de las coordenadas del bloque a las de la ortofoto
        aplicaOrto(mat, tex, ch, [x0, z0, x0 + lado, z0 + lado]); p.orto = tex;   // con fundido hacia el satélite en el borde de la pieza
        const dt = detalles.get(id); if (dt?.mat) aplicaOrto(dt.mat, tex, ch, null);   // el detalle de 1 m lleva la misma ortofoto (sin fundido: su borde cae dentro de la pieza)
      }, undefined, () => {});
      alCargar?.({ x0, z0, x1: x0 + (n - 1) * paso, z1: z0 + (n - 1) * paso });
      return p;
    })().catch((e) => { console.warn("cumbres", id, e); return null; }).finally(() => cargando.delete(id));
    cargando.set(id, pr); return pr;
  }

  // — detalle local del Paso de Mahoma: malla de 1,5 m a partir del MDT05 (spline cúbico) + bloques de granito procedurales + cruz de cumbre (OSM) —
  const hash2 = (a, b, s2) => { let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(s2, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  // roca diaclasada: la superficie se divide en bloques (celdas de Voronoi a dos escalas); cada bloque es un plano inclinado con su propia altura y entre ellos
  // quedan juntas (fracturas) más hundidas. Todo es desplazamiento de la propia malla, así que los bloques forman parte de la cresta y no flotan.
  function voronoi(x, z, S) {
    const gx = Math.floor(x / S), gz = Math.floor(z / S); let f1 = 9, f2 = 9, id = 0, cx1 = 0, cz1 = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = gx + i, cz = gz + j, px = (cx + 0.15 + hash2(cx, cz, 11) * 0.7) * S, pz = (cz + 0.15 + hash2(cx, cz, 12) * 0.7) * S, d = Math.hypot(px - x, pz - z) / S;
      if (d < f1) { f2 = f1; f1 = d; id = hash2(cx, cz, 13); cx1 = px; cz1 = pz; } else if (d < f2) f2 = d;
    }
    return [f1, f2, id, cx1, cz1];
  }
  function granito(x, z) {
    let h = 0;
    for (const [S, amp, w, sd] of [[9, 1.4, 0.55, 0], [3.6, 0.6, 0.45, 5]]) {
      const [f1, f2, id, cx, cz] = voronoi(x, z, S), tx = (hash2(Math.round(id * 1e4), 3, 41 + sd) - 0.5) * 0.9, tz = (hash2(Math.round(id * 1e4), 5, 43 + sd) - 0.5) * 0.9;
      const junta = 1 - sstep(0.015, 0.1 + 0.03 * id, f2 - f1);   // diaclasa: más estrecha en unos bloques que en otros
      h += w * ((id - 0.5) * 2 * amp + tx * (x - cx) + tz * (z - cz) - 0.55 * junta * (S / 4));
    }
    return h;
  }
  function caliza(x, z, hr) {   // caliza: peldaños de estratificación (sierra en altura, algo ondulados) y diaclasas más separadas
    const per = 2.4, f = ((hr + 7 * Math.sin(x * 0.05) + 5 * Math.sin(z * 0.04)) / per), fr = f - Math.floor(f);
    const [f1, f2, id] = voronoi(x, z, 6.5), junta = 1 - sstep(0.012, 0.07, f2 - f1);
    return (fr - 0.5) * 1.3 - 0.9 * junta + (id - 0.5) * 0.6;
  }
  function bloques(x, z, estilo, hr) {   // metros reales de desplazamiento de la roca en (x, z)
    if (estilo === 'caliza') return caliza(x, z, hr);
    if (estilo === 'neutra') return 0.5 * granito(x, z) + 0.5 * caliza(x, z, hr);
    if (estilo === 'oscura') return granito(x, z) * 1.25;   // bloques angulosos más marcados (arista del Posets en las fotos)
    return granito(x, z);
  }
  const distSeg = (x, z, ps) => { let m = 1e9; for (let k = 0; k < ps.length - 1; k++) { const a = ps[k], b = ps[k + 1], vx = b.x - a.x, vz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz || 1))); m = Math.min(m, Math.hypot(x - a.x - vx * t, z - a.z - vz * t)); } return m; };

  async function cargaDetalle(id) {
    if (detalles.has(id) || detCarga.has(id) || !ficha?.[id] || !piezas.has(id)) return;
    const d = ficha[id], pz = piezas.get(id); detCarga.add(id);
    try {
      const r = await fetch(`data/terrain/cumbres/${d.archivo}?v=${window.WEB_V || 0}`);
      if (!r.ok || typeof DecompressionStream === 'undefined') throw new Error('sin datos');
      const raw = new Uint16Array(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()), n = d.n, paso = d.paso, hs = geo.hs;
      if (raw.length !== n * n) throw new Error('tamaño');
      const H = new Float32Array(n * n), sl = new Float32Array(n * n);
      for (let k = 0; k < n * n; k++) H[k] = raw[k] * hs;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const k = j * n + i, gx = (H[j * n + Math.min(n - 1, i + 1)] - H[j * n + Math.max(0, i - 1)]) / (2 * paso * EXAG), gz = (H[Math.min(n - 1, j + 1) * n + i] - H[Math.max(0, j - 1) * n + i]) / (2 * paso * EXAG);
        sl[k] = Math.hypot(gx, gz);   // pendiente física (altura real / distancia)
      }
      // sin eje de arista (otras cimas): la cima y las crestas se detectan por convexidad del propio MDT05 (el punto está más alto que su entorno a 6 m)
      const cvx = new Float32Array(n * n);
      if (!d.cresta) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const m6 = (H[j * n + Math.max(0, i - 6)] + H[j * n + Math.min(n - 1, i + 6)] + H[Math.max(0, j - 6) * n + i] + H[Math.min(n - 1, j + 6) * n + i]) / 4;
        cvx[j * n + i] = sstep(0.8, 4, (H[j * n + i] - m6) / EXAG);
      }
      const cxm = d.x0 + (n - 1) * paso / 2, czm = d.z0 + (n - 1) * paso / 2, F = new Float32Array(n * n);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const k = j * n + i, x = d.x0 + i * paso, z = d.z0 + j * paso, dc = Math.hypot(x - cxm, z - czm);
        const cr = d.cresta ? 1 - sstep(5, 15, distSeg(x, z, d.cresta)) : cvx[k], mask = Math.max(sstep(0.35, 0.85, sl[k]) * 0.8, cr) * (1 - sstep(50, 112, dc));
        const base = H[k] + bloques(x, z, d.roca, H[k] / EXAG) * EXAG * mask * (1 + 1.1 * cr);   // más relieve de bloques sobre la propia arista   // metros reales × exageración vertical
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
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = d.x0 + i * paso, z = d.z0 + j * paso; roca[j * n + i] = Math.max(d.cresta ? 1 - sstep(4, 12, distSeg(x, z, d.cresta)) : cvx[j * n + i], sstep(0.5, 0.95, sl[j * n + i]), d.rocaMin ?? 0) * (1 - sstep(40, 108, Math.hypot(x - cxm, z - czm))); }
      const idx = []; for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, e = c + 1; idx.push(a, c, b, b, c, e); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('aRoca', new THREE.BufferAttribute(roca, 1)); g.setIndex(idx); g.computeBoundingSphere();
      const mat = terrain.crearMaterialPieza(ch, d.roca), mesh = new THREE.Mesh(g, mat); mesh.matrixAutoUpdate = false;
      if (pz.orto) aplicaOrto(mat, pz.orto, ch, null);
      scene.add(mesh);
      // la pieza de 6 m se recorta debajo de esta (menos 14 m del borde, donde ambas coinciden)
      pz.mat.userData.holes.value[0].set(d.x0 + 14, d.z0 + 14, d.x0 + (n - 1) * paso - 14, d.z0 + (n - 1) * paso - 14);
      // algunos bloques mayores medio enterrados (3 formas distintas, tamaños y giros variados) en las zonas de pendiente suave junto a la arista
      const col = new THREE.Color(), forma = [0, 1, 2].map((v) => {
        const g = new THREE.IcosahedronGeometry(1, 1), pa = g.attributes.position, plano = d.roca === 'caliza' ? 0.55 : d.roca === 'oscura' ? 0.85 : 1;
        for (let q = 0; q < pa.count; q++) { const k2 = hash2(Math.round(pa.getX(q) * 9), Math.round(pa.getY(q) * 9) + v * 7, Math.round(pa.getZ(q) * 9) + 50); const f = 0.78 + k2 * 0.4; pa.setXYZ(q, pa.getX(q) * f * (1 + v * 0.18) * (plano < 1 ? 1.3 : 1), pa.getY(q) * f * (0.7 - v * 0.08) * plano, pa.getZ(q) * f * (plano < 1 ? 1.2 : 1)); }
        g.computeVertexNormals(); return g;
      }), listas = [[], [], []];
      const cb = { granito: [0.40, 0.375, 0.34], caliza: [0.60, 0.575, 0.53], neutra: [0.5, 0.48, 0.45], oscura: [0.17, 0.16, 0.15] }[d.roca] ?? [0.4, 0.375, 0.34];
      const bm = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
      for (let z = d.z0 + 8; z < d.z0 + (n - 1) * paso - 8; z += 4) for (let x = d.x0 + 8; x < d.x0 + (n - 1) * paso - 8; x += 4) {
        const ix = Math.round(x * 3), iz = Math.round(z * 3), dcr = d.cresta ? distSeg(x, z, d.cresta) : 99, dc = Math.hypot(x - cxm, z - czm);
        const i = Math.round((x - d.x0) / paso), j = Math.round((z - d.z0) / paso), s0 = sl[j * n + i];
        const pr = (d.cresta ? (dcr < 10 ? 0.22 : dcr < 24 ? 0.07 : 0.015) : 0.02 + 0.2 * cvx[j * n + i]) * (d.roca === 'caliza' ? 2.2 : d.roca === 'oscura' ? 0.9 : 1) * (s0 < 0.9 ? 1 : 0.1) * (1 - sstep(70, 95, dc));
        if (hash2(ix, iz, 21) > pr) continue;
        const sz = (0.9 + Math.pow(hash2(ix, iz, 24), 2.2) * 3.4) * (d.roca === 'oscura' ? 0.55 : 1);   // muchos pequeños, pocos grandes
        listas[Math.floor(hash2(ix, iz, 28) * 3)].push({ x: x + (hash2(ix, iz, 22) - 0.5) * 3, z: z + (hash2(ix, iz, 23) - 0.5) * 3, s: sz, a: hash2(ix, iz, 25), b: hash2(ix, iz, 26), c: hash2(ix, iz, 27) });
      }
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3(), insts = [];
      listas.forEach((lista, f) => {
        if (!lista.length) return;
        const inst = new THREE.InstancedMesh(forma[f], bm, lista.length);
        lista.forEach((b, k) => {
          const h = sample(detalles.get(id), b.x, b.z) ?? 0;
          pv.set(b.x, h + b.s * (d.roca === 'oscura' ? -0.15 : 0.1), b.z); e.set((b.b - 0.5) * 0.9, b.a * 6.28, (b.c - 0.5) * 0.9); q.setFromEuler(e); sv.set(b.s * (0.9 + b.a * 0.7), b.s * (0.5 + b.b * 0.4), b.s * (0.8 + b.c * 0.8));
          inst.setMatrixAt(k, m4.compose(pv, q, sv)); const t2 = 0.72 + b.a * 0.34; inst.setColorAt(k, col.setRGB(cb[0] * t2, cb[1] * t2, cb[2] * t2 * (0.92 + b.c * 0.14)));
        });
        inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true; inst.computeBoundingSphere(); scene.add(inst); insts.push(inst);
      });
      let cruz = null;
      if (d.cruz && !d.modelo) {   // cruz sencilla solo si no hay modelo de la cima hecho en Blender
      // cruz de cumbre (OSM summit:cross=yes en la cima): ~32 m de alto en el modelo (escala 14), 1,5 veces un montañero (21 m) y cuatro veces el tamaño anterior
      cruz = new THREE.Group(); const fe = new THREE.MeshLambertMaterial({ color: 0xc9cdd1, emissive: 0x2a2d30 })   // metal claro: se ve contra el cielo y la roca oscura;
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.3, 0.1), fe); v.position.y = 1.15; const hbx = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.1), fe); hbx.position.y = 1.75; cruz.add(v, hbx);
      cruz.scale.setScalar(14); cruz.position.set(d.cruz.x, (sample(detalles.get(id), d.cruz.x, d.cruz.z) ?? 0) - 0.5, d.cruz.z); scene.add(cruz);
      }
      // elementos de cumbre modelados en Blender a partir de fotografías (p. ej. Monte Perdido: vértice roto y mojón con buzón)
      const extras = [];
      if (d.modelo && d.elementos?.length) {
        const gl = await cargaModelo(`${d.modelo}?v=${window.WEB_V || 0}`);   // la versión de la web evita modelos viejos en caché
        if (gl && detalles.has(id)) {
          const S = d.escalaModelo ?? 1, an = d.elementos.find((e) => e.ancla) ?? d.elementos[0];
          for (const e of d.elementos) {
            const src = gl.scene.getObjectByName(e.nodo); if (!src) continue;
            const o = src.clone(true); o.position.set(0, 0, 0); const Se = e.escala ?? S; o.scale.setScalar(Se); o.rotation.set(0, e.giro ?? 0, 0);
            let px = e.x, pz2 = e.z;
            if (e !== an) { const vx = e.x - an.x, vz = e.z - an.z, L = Math.hypot(vx, vz) || 1; px = an.x + (vx / L) * (d.separacion ?? L); pz2 = an.z + (vz / L) * (d.separacion ?? L); }
            // se apoya en el punto más bajo de su huella (radio real × escala), sin hundirse más de un cuarto de metro (a escala) bajo el centro
            const R0 = (e.huella ?? 0.6) * Se, hc = sample(detalles.get(id), px, pz2) ?? geo.heightAt(px, pz2); let y = hc;
            for (const [ox, oz] of [[R0, 0], [-R0, 0], [0, R0], [0, -R0]]) y = Math.min(y, sample(detalles.get(id), px + ox, pz2 + oz) ?? geo.heightAt(px + ox, pz2 + oz));
            y = Math.max(y, hc - 0.25 * Se * EXAG);
            o.position.set(px, y - 0.04 * Se, pz2); o.traverse((c) => { if (c.isMesh) c.frustumCulled = true; });
            scene.add(o); extras.push(o);
          }
        }
      }
      Object.assign(detalles.get(id), { mesh, mat, insts, cruz, extras, pieza: pz });
    } catch (e) { console.warn('detalle', id, e); detalles.delete(id); } finally { detCarga.delete(id); }
  }
  function quitaDetalle(id) {
    const d = detalles.get(id); if (!d) { detalles.delete(id); return; }
    for (const o of [d.mesh, ...(d.insts ?? []), d.cruz, ...(d.extras ?? [])]) { if (!o) continue; scene.remove(o); o.geometry?.dispose?.(); o.material?.dispose?.(); o.traverse?.((c) => { c.geometry?.dispose?.(); }); }
    d.mat?.dispose(); d.pieza?.mat.userData.holes.value[0].set(1e9, 1e9, 1e9, 1e9); detalles.delete(id);
  }

  function quita(id) {
    quitaDetalle(id);
    const p = piezas.get(id); if (!p) return;
    scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mat.dispose(); p.orto?.dispose(); terrain.hueco(p.hueco, 1e9, 1e9, 1e9, 1e9); piezas.delete(id);
  }

  return {
    get cargadas() { return [...piezas.keys()]; },
    get cruz() { const d = detalles.get('aneto'), o = d?.cruz ?? d?.extras?.[0]; return o ? { x: o.position.x, y: o.position.y, z: o.position.z, s: o.scale.x, visible: o.visible } : null; },
    get detalle() { return [...detalles.keys()]; },
    ficha: () => ficha, fichaListo,
    carga,
    update(cam) {
      // (con ortofoto la pieza lleva su propia textura: no se le devuelve la del bloque)
      for (const p of piezas.values()) if (p.orto) p.mat.userData.sat.value = p.ch.mat.map;   // el satélite del bloque cambia de resolución al acercarse
      for (const p of piezas.values()) if (!p.orto && p.mat.map !== p.ch.mat.map) { p.mat.map = p.ch.mat.map; p.mat.color.set(p.ch.mat.map ? 0xffffff : 0x8a9488); p.mat.needsUpdate = true; }
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
