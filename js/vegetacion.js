// Arbolado del relieve: los árboles salen donde ESA WorldCover 2021 (10 m, CC BY 4.0) marca «arbolado», sobre el relieve real.
// Dato real: la clase de cobertura de cada celda y la altura/pendiente del relieve. Aproximación visual: el tipo de árbol (frondosa o conifera) según
// la altitud y la orientación, su posición exacta dentro de la celda y el tamaño (exagerado ×5–9 para que se vea a distancia); no son árboles medidos.
// Se genera por parcelas solo cerca de la cámara (dos anillos de detalle), con InstancedMesh y geometrías compartidas.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EXAG } from './geo.js';

const PS = 64;   // celdas por lado de una parcela
const hash = (a, b, s) => { let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(s, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ruido = (x, z, s) => {   // ruido de valor suave de baja frecuencia (claros y masas de bosque)
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, s), b = hash(ix + 1, iz, s), c = hash(ix, iz + 1, s), d = hash(ix + 1, iz + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

function pintaVertices(g, bajo, alto) {
  g = g.index ? g.toNonIndexed() : g;
  const p = g.attributes.position, col = new Float32Array(p.count * 3), lo = new THREE.Color(bajo), hi = new THREE.Color(alto), c = new THREE.Color();
  let ymin = 1e9, ymax = -1e9; for (let i = 0; i < p.count; i++) { ymin = Math.min(ymin, p.getY(i)); ymax = Math.max(ymax, p.getY(i)); }
  for (let i = 0; i < p.count; i++) { c.copy(lo).lerp(hi, (p.getY(i) - ymin) / (ymax - ymin || 1)); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); return g;
}
function geoConifera() {   // abeto / pino: cuatro conos apilados (copa más esbelta y con escalones), base en y = 0, altura 1
  const cono = (r, h, y) => new THREE.ConeGeometry(r, h, 7, 1, true).translate(0, y + h / 2, 0);
  return pintaVertices(mergeGeometries([cono(0.5, 0.4, 0.05), cono(0.41, 0.38, 0.27), cono(0.31, 0.34, 0.5), cono(0.2, 0.3, 0.72)].map((g) => g.toNonIndexed())), 0x15281d, 0x3a5c3c);
}
function geoFrondosa() {   // haya / roble: copa de tres lóbulos irregulares sobre un tronco corto
  const lobulo = (r, x, y, z, sy = 0.85) => new THREE.IcosahedronGeometry(r, 0).scale(1, sy, 1).translate(x, y, z);
  const copa = mergeGeometries([lobulo(0.42, 0, 0.62, 0), lobulo(0.3, 0.22, 0.5, 0.12, 0.8), lobulo(0.28, -0.2, 0.55, -0.14, 0.8)]);
  const tronco = new THREE.CylinderGeometry(0.05, 0.07, 0.34, 5).translate(0, 0.17, 0);
  return mergeGeometries([pintaVertices(tronco, 0x4a3b2c, 0x4a3b2c), pintaVertices(copa, 0x2c4525, 0x587339)]);
}

export function crearVegetacion({ scene, geo, meta, terrain, movil }) {
  const R0 = movil ? 1800 : 2600, R1 = movil ? 4300 : 7000, MAXN = movil ? 12000 : 36000;
  const matriz = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const gC = geoConifera(), gF = geoFrondosa();
  const parcelas = new Map();   // clave -> { nivel, meshes, n }
  let total = 0, cuenta = 0, cola = [];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _up = new THREE.Vector3(0, 1, 0);

  function quita(k) {
    const pc = parcelas.get(k); if (!pc) return;
    for (const m of pc.meshes) { scene.remove(m); m.dispose(); }
    total -= pc.n; parcelas.delete(k);
  }

  async function construye(ch, pi, pj, nivel, k) {
    const cob = await terrain.cobertura(ch);
    if (!cob || ch.stride !== 1 || parcelas.get(k)?.nivel === nivel) return;
    const { dx, dz } = geo, g = nivel === 0 ? (movil ? 2 : 1) : (movil ? 3 : 3), prob = nivel === 0 ? (movil ? 0.8 : 0.78) : 0.7;   // con árboles el doble de grandes, algo menos densos
    const mult = (nivel === 0 ? (movil ? 3 : 2.5) : 4.4) * 2;   // árboles al doble de tamaño (20-10-2026)
    const cC = [], cF = [], colC = [], colF = [];
    const gi0 = ch.t.i * 512 + pi * PS, gj0 = ch.t.j * 512 + pj * PS;
    for (let lz = 0; lz < PS; lz += g) for (let lx = 0; lx < PS; lx += g) {
      const cx = pi * PS + lx + (g >> 1), cz = pj * PS + lz + (g >> 1);
      if (cx > 511 || cz > 511) continue;
      if (cob[cz * 512 + cx] !== 1) continue;
      const ai = gi0 + lx, aj = gj0 + lz;
      const dens = sstep(0.22, 0.52, ruido(ai / 14, aj / 14, 3)) * 0.85 + 0.15;   // masas de bosque y claros
      if (hash(ai, aj, 1) > prob * dens) continue;
      const x = ch.x0 + (pi * PS + lx + hash(ai, aj, 2) * g) * dx, zz = ch.z0 + (pj * PS + lz + hash(ai, aj, 3) * g) * dz;
      const y = geo.heightAt(x, zz), alt = y / EXAG;
      const hx = geo.heightAt(x + dx, zz) - geo.heightAt(x - dx, zz), hz = geo.heightAt(x, zz + dz) - geo.heightAt(x, zz - dz);
      if (Math.hypot(hx / (2 * dx), hz / (2 * dz)) > 1.1) continue;   // no en paredes
      const lim = sstep(2250, 1750, alt);   // adelgaza hacia el límite del bosque
      if (hash(ai, aj, 4) > lim) continue;
      const norte = hz > 0 ? 1 : 0;   // z hacia el sur: altura creciente hacia el sur = ladera que mira al norte (umbría)
      const pF = Math.max(0, sstep(1750, 900, alt) * (norte ? 1.15 : 0.7));
      const fr = hash(ai, aj, 5) < pF;
      const h = (9 + hash(ai, aj, 6) * 9) * mult * (0.55 + 0.45 * lim) * (fr ? 0.85 : 1), w = h * (fr ? 0.72 : 0.5);
      _p.set(x, y - 1.5 * mult, zz); _q.setFromAxisAngle(_up, hash(ai, aj, 7) * 6.283); _s.set(w, h, w);
      _m.compose(_p, _q, _s);
      const t = 0.78 + hash(ai, aj, 8) * 0.4, v = hash(ai, aj, 9); _c.setRGB(t * (0.94 + v * 0.14), t * (0.96 + (1 - v) * 0.1), t * 0.93);   // cada árbol con su tono
      (fr ? cF : cC).push(..._m.elements); (fr ? colF : colC).push(_c.r, _c.g, _c.b);
    }
    quita(k);
    const meshes = []; let n = 0;
    for (const [arr, col, gg] of [[cC, colC, gC], [cF, colF, gF]]) {
      const cnt = arr.length / 16; if (!cnt) continue;
      const m = new THREE.InstancedMesh(gg, matriz, cnt);
      m.instanceMatrix.array.set(arr); m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(col), 3);
      m.matrixAutoUpdate = false; m.computeBoundingSphere(); scene.add(m); meshes.push(m); n += cnt;
    }
    parcelas.set(k, { nivel, meshes, n, cx: ch.x0 + (pi + 0.5) * PS * geo.dx, cz: ch.z0 + (pj + 0.5) * PS * geo.dz }); total += n;
  }

  return {
    get arboles() { return total; },
    // una pieza de alta resolución cambia la superficie: las parcelas que la tocan se regeneran
    refrescar(rc) { for (const [k, pc] of [...parcelas]) if (pc.cx > rc.x0 - 1200 && pc.cx < rc.x1 + 1200 && pc.cz > rc.z0 - 1200 && pc.cz < rc.z1 + 1200) quita(k); },
    get parcelas() { return parcelas.size; },
    // cada pocos fotogramas: decide qué parcelas necesitan cada nivel; un máximo de una construcción por llamada
    update(cam) {
      if (++cuenta % 10 === 0 || !cola.length) {
        if (cuenta % 10 === 0) {
          cola = [];
          for (const ch of terrain.chunks) {
            if (ch.dist > R1 + 1500 || ch.stride !== 1) continue;
            for (let pj = 0; pj < 8; pj++) for (let pi = 0; pi < 8; pi++) {
              const x = ch.x0 + (pi + 0.5) * PS * geo.dx, z = ch.z0 + (pj + 0.5) * PS * geo.dz, k = `${ch.id}_${pi}_${pj}`;
              const d = Math.hypot(x - cam.position.x, z - cam.position.z), ya = parcelas.get(k);
              const lim0 = R0 * (ya?.nivel === 0 ? 1.12 : 1), lim1 = R1 * (ya ? 1.1 : 1);
              const nivel = d < lim0 ? 0 : d < lim1 ? 1 : -1;
              if (nivel < 0) { if (ya) quita(k); continue; }
              if (!ya || ya.nivel !== nivel) cola.push({ ch, pi, pj, nivel, k, d });
            }
          }
          cola.sort((a, b) => a.d - b.d);
        }
      }
      if (cola.length && total < MAXN) { const j = cola.shift(); construye(j.ch, j.pi, j.pj, j.nivel, j.k).catch(() => {}); }
    },
  };
}
