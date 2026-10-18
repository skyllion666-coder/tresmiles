// Copia de js/terrain.js solo para generar el vídeo: sin el límite de 8 texturas finas simultáneas (la web real no se toca).
import * as THREE from 'three';
import { EXAG } from '../../js/geo.js';

const SKIRT = 160; // faldón bajo los bordes de cada bloque para ocultar grietas entre niveles de detalle
const MAX_HI = 18;  // texturas de alta resolución simultáneas
const MAX_DESCARGAS = 4;   // alturas que se piden a la vez

// Relieve por bloques de 512 celdas con nivel de detalle según la distancia a la cámara.
export class Terrain {
  constructor({ scene, meta, store, geo, renderer, base }) {
    this.meta = meta; this.store = store; this.geo = geo; this.base = base;
    this.group = new THREE.Group(); scene.add(this.group);
    this.loader = new THREE.TextureLoader();
    this.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.cache = new Map(); // `${id}:${stride}` -> geometría
    this.chunks = meta.tiles.map((t) => this._makeChunk(t));
    this.ready = Promise.all(this.chunks.map((c) => c.loPromise));
  }

  _tex(path) {
    return new Promise((res) => {
      this.loader.load(`${this.base}/${path}`, (t) => {
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = this.aniso; res(t);
      }, undefined, () => res(null));
    });
  }

  _makeChunk(t) {
    const { chunk: CH } = this.meta, { dx, dz, W, D } = this.geo;
    const x0 = t.i * CH * dx - W / 2, z0 = t.j * CH * dz - D / 2;
    const mat = new THREE.MeshLambertMaterial({ color: 0x8a9488, side: THREE.DoubleSide });
    const c = {
      id: `${t.i}_${t.j}`, t, mat, mesh: null, stride: 0, wantStride: 8,
      x0, z0, x1: x0 + CH * dx, z1: z0 + CH * dz,
      lo: null, hi: null, hiLoading: false,
    };
    c.loPromise = this._tex(`lo/${t.f}`).then((tex) => { c.lo = tex; if (!c.hi) { mat.map = tex; mat.color.set(0xffffff); mat.needsUpdate = true; } });
    return c;
  }

  _geometry(c, s) {
    const key = `${c.id}:${s}`;
    let g = this.cache.get(key);
    if (g) { this.cache.delete(key); this.cache.set(key, g); return g; }
    const { chunk: CH } = this.meta, { dx, dz } = this.geo;
    const hs = this.meta.hscale * EXAG;
    const n = CH / s, vn = n + 1, nGrid = vn * vn, nTot = nGrid + 4 * vn;
    const arr = this.store.cell(c.t.i, c.t.j)[s], dim = n + 3;   // nivel con 1 muestra de margen por lado
    const pos = new Float32Array(nTot * 3), nor = new Float32Array(nTot * 3), uv = new Float32Array(nTot * 2);
    for (let gz = 0; gz < vn; gz++) for (let gx = 0; gx < vn; gx++) {
      const k = gz * vn + gx, q0 = (gz + 1) * dim + gx + 1;
      pos[k * 3] = c.x0 + gx * s * dx; pos[k * 3 + 1] = arr[q0] * hs; pos[k * 3 + 2] = c.z0 + gz * s * dz;
      const nx = (arr[q0 - 1] - arr[q0 + 1]) * hs / (2 * s * dx);
      const nz = (arr[q0 - dim] - arr[q0 + dim]) * hs / (2 * s * dz);
      const il = 1 / Math.hypot(nx, 1, nz);
      nor[k * 3] = nx * il; nor[k * 3 + 1] = il; nor[k * 3 + 2] = nz * il;
      uv[k * 2] = gx / n; uv[k * 2 + 1] = 1 - gz / n;
    }
    // faldones: copia de cada borde, más bajo
    const edge = [(i) => i, (i) => n * vn + i, (i) => i * vn, (i) => i * vn + n]; // arriba, abajo, izquierda, derecha
    const idx = new Uint32Array(n * n * 6 + 4 * n * 6);
    let q = 0;
    for (let gz = 0; gz < n; gz++) for (let gx = 0; gx < n; gx++) {
      const a = gz * vn + gx, b = a + 1, cc = a + vn, d = cc + 1;
      idx[q++] = a; idx[q++] = cc; idx[q++] = b; idx[q++] = b; idx[q++] = cc; idx[q++] = d;
    }
    edge.forEach((f, e) => {
      const base = nGrid + e * vn;
      for (let i = 0; i < vn; i++) {
        const src = f(i), dst = base + i;
        pos[dst * 3] = pos[src * 3]; pos[dst * 3 + 1] = pos[src * 3 + 1] - SKIRT; pos[dst * 3 + 2] = pos[src * 3 + 2];
        nor[dst * 3] = nor[src * 3]; nor[dst * 3 + 1] = nor[src * 3 + 1]; nor[dst * 3 + 2] = nor[src * 3 + 2];
        uv[dst * 2] = uv[src * 2]; uv[dst * 2 + 1] = uv[src * 2 + 1];
      }
      for (let i = 0; i < n; i++) {
        const a = f(i), b = f(i + 1), sa = base + i, sb = base + i + 1;
        idx[q++] = a; idx[q++] = b; idx[q++] = sb; idx[q++] = a; idx[q++] = sb; idx[q++] = sa;
      }
    });
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    this.cache.set(key, g);
    return g;
  }

  _trim() {
    const inUse = new Set(this.chunks.filter((c) => c.mesh).map((c) => `${c.id}:${c.stride}`));
    for (const [k, g] of this.cache) {
      if (this.cache.size <= 18) break;
      if (!inUse.has(k)) { g.dispose(); this.cache.delete(k); }
    }
  }

  // Llamar cada fotograma. `budget` = geometrías que se pueden construir en este fotograma.
  update(cam, budget = 2) {
    const px = cam.position.x, py = cam.position.y, pz = cam.position.z, st = this.store;
    const pending = [], faltan = [];
    for (const c of this.chunks) {
      const ddx = Math.max(c.x0 - px, 0, px - c.x1), ddz = Math.max(c.z0 - pz, 0, pz - c.z1);
      const d = Math.hypot(ddx, ddz, Math.max(0, py - 3500));
      c.dist = d;
      c.wantStride = d < 8000 ? 1 : d < 18000 ? 2 : d < 40000 ? 4 : 8;
      // se dibuja con el nivel pedido si ya está cargado; si no, con el más cercano más grueso que haya (siempre existe el 8)
      c.use = [1, 2, 4, 8].find((s) => s >= c.wantStride && st.has(c.t.i, c.t.j, s));
      if (c.use !== c.stride) pending.push(c);
      if (!st.has(c.t.i, c.t.j, c.wantStride)) faltan.push(c);
      // textura de alta resolución solo cerca
      if (d < 22000 && !c.hi && !c.hiLoading && this.chunks.filter((k) => k.hi || k.hiLoading).length < MAX_HI) {
        c.hiLoading = true;
        this._tex(`hi/${c.t.f}`).then((t) => { c.hiLoading = false; if (t) { c.hi = t; c.mat.map = t; c.mat.needsUpdate = true; } });
      } else if (d > 40000 && c.hi) {
        c.mat.map = c.lo; c.mat.needsUpdate = true; c.hi.dispose(); c.hi = null;
      }
    }
    // pide las alturas que faltan, las más cercanas primero
    faltan.sort((a, b) => a.dist - b.dist);
    for (const c of faltan) { if (st.activas >= MAX_DESCARGAS) break; st.load(c.t.i, c.t.j, c.wantStride); }
    pending.sort((a, b) => a.dist - b.dist);
    for (const c of pending.slice(0, budget)) {
      const g = this._geometry(c, c.use);
      if (!c.mesh) { c.mesh = new THREE.Mesh(g, c.mat); c.mesh.matrixAutoUpdate = false; c.mesh.updateMatrix(); this.group.add(c.mesh); }
      else c.mesh.geometry = g;
      c.stride = c.use;
    }
    if (pending.length) this._trim();
  }

  // carga el nivel s de las alturas en los bloques que cruzan los puntos dados [{x, z}] (rutas, ibones…) y espera a tenerlo
  asegurar(puntos, s = 1) {
    const { chunk: CH } = this.meta, { dx, dz, W, D } = this.geo, vistos = new Set(), pr = [];
    for (const p of puntos) {
      const i = Math.min(this.meta.nci - 1, Math.max(0, Math.floor((p.x + W / 2) / dx / CH))), j = Math.min(this.meta.ncj - 1, Math.max(0, Math.floor((p.z + D / 2) / dz / CH)));
      const k = `${i}_${j}`; if (vistos.has(k)) continue; vistos.add(k); pr.push(this.store.load(i, j, s));
    }
    return Promise.all(pr);
  }

  // Fuerza el nivel de detalle que ya esté cargado alrededor de un punto (para capturas y vuelos).
  settle(cam) { for (let i = 0; i < 6; i++) this.update(cam, 12); }
}
