import * as THREE from 'three';
import { EXAG } from './geo.js';

const SKIRT = 160; // faldón bajo los bordes de cada bloque para ocultar grietas entre niveles de detalle
const MAX_HI = 8;  // texturas de alta resolución simultáneas
const MAX_DESCARGAS = 4;   // alturas que se piden a la vez
const MAX_COBERTURA = 12;  // mapas de cobertura del suelo (ESA WorldCover) en memoria

// Detalle de material (solo geometría y color procedurales; los datos reales son el relieve, la imagen de satélite y la cobertura del suelo):
// roca con estratos y fracturas, canchal, pradera y bosque según la clase de ESA WorldCover y la pendiente, con granulado cercano y relieve fino en la roca.
const GLSL_PARS = `
uniform sampler2D uCover; uniform float uHasCover; uniform float uOct; uniform float uBump;
varying vec3 vWPos; varying vec3 vWNrm; varying vec2 vCUv;
float h31(vec3 p){ p=fract(p*0.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ if(float(i)>=uOct) break; s+=a*vn(p); p=p*2.03+vec3(11.,7.,3.); a*=.5; } return s; }
`;
const GLSL_COLOR = `
if (distance(vWPos, cameraPosition) < 15000.) {
  vec3 N = normalize(vWNrm); float sl = 1. - N.y;
  float dist = distance(vWPos, cameraPosition);
  float fa = 1. - smoothstep(2500., 15000., dist), fc = 1. - smoothstep(250., 3500., dist);
  float cl = 0.;
  if (uHasCover > .5) { vec2 w = (vec2(vn(vWPos * .017), vn(vWPos * .017 + 9.)) - .5) * .004; cl = floor(texture2D(uCover, vec2(vCUv.x, 1. - vCUv.y) + w).r * 255. + .5); }
  float tree = step(abs(cl - 1.), .5), shrub = step(abs(cl - 2.), .5), grass = step(abs(cl - 3.), .5), bare = max(step(abs(cl - 4.), .5), step(abs(cl - 8.), .5));
  float rock = max(bare, smoothstep(.30, .56, sl)); rock = max(rock, 0.) * (1. - tree * .6);
  float n1 = fbm(vWPos * vec3(.011, .017, .011)), n2 = fbm(vWPos * .085), n3 = vn(vWPos * .65);
  vec3 c = diffuseColor.rgb;
  float nieve = smoothstep(.60, .80, dot(c, vec3(.30, .59, .11))); rock *= 1. - nieve * .85;
  // roca: variación de tono, estratos en las paredes y fracturas
  c *= mix(vec3(1.), mix(vec3(1.04, .98, .90), vec3(.93, .97, 1.03), n1), rock * fa * .8);
  float st = sin((vWPos.y + n1 * 46.) * .55) * .5 + .5;
  c *= 1. + (st - .5) * .15 * smoothstep(.32, .6, sl) * fa * (.6 + .8 * n1);
  if (uBump > .5) {   // fracturas solo en calidad alta
    float rid = 1. - abs(2. * fbm(vWPos * vec3(.07, .022, .07) + 3.) - 1.);
    c *= 1. - .20 * smoothstep(.90, .985, rid) * smoothstep(.30, .50, sl) * rock * fa;
  }
  // canchal: ladera de piedra suelta de pendiente media
  float scree = bare * smoothstep(.10, .26, sl) * (1. - smoothstep(.42, .58, sl));
  c = mix(c, c * (.78 + .55 * n3) * vec3(1.02, 1., .97), scree * fc);
  // pradera y matorral: moteado suave; bosque: oscurece y rompe el tono
  c *= 1. + (n2 - .5) * .22 * (grass + shrub) * fa;
  c *= 1. + (vn(vWPos * .21) - .5) * .38 * tree * fa;
  // granulado cercano
  c *= 1. + (n3 - .5) * .07 * fc * (1. - nieve * .6);
  diffuseColor.rgb = c;
}
`;
const GLSL_BUMP = `
if (uBump > .5) {
  vec3 Nw = normalize(vWNrm); float sl2 = 1. - Nw.y; float dist2 = distance(vWPos, cameraPosition);
  float k = smoothstep(.22, .5, sl2) * (1. - smoothstep(400., 4500., dist2)) * (1. - smoothstep(.55, .8, dot(diffuseColor.rgb, vec3(.30, .59, .11))) * .6);
  if (k > .01) {
    vec3 p = vWPos * .32; float e = .5, b0 = vn(p) + .5 * vn(p * 2.1);
    vec3 g = vec3(vn(p + vec3(e, 0., 0.)) + .5 * vn((p + vec3(e, 0., 0.)) * 2.1) - b0, vn(p + vec3(0., e, 0.)) + .5 * vn((p + vec3(0., e, 0.)) * 2.1) - b0, vn(p + vec3(0., 0., e)) + .5 * vn((p + vec3(0., 0., e)) * 2.1) - b0) / e;
    g -= Nw * dot(g, Nw);
    normal = normalize(normal - (viewMatrix * vec4(g, 0.)).xyz * k * 1.1);
  }
}
`;

// Relieve por bloques de 512 celdas con nivel de detalle según la distancia a la cámara.
export class Terrain {
  constructor({ scene, meta, store, geo, renderer, base, movil = false }) {
    this.movil = movil; this.coberturas = new Map();
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
    const u = { uCover: { value: null }, uHasCover: { value: 0 }, uOct: { value: this.movil ? 2 : 4 }, uBump: { value: this.movil ? 0 : 1 } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm; varying vec2 vCUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.)).xyz; vWNrm = normal; vCUv = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + GLSL_PARS)
        .replace('#include <map_fragment>', '#include <map_fragment>\n' + GLSL_COLOR)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + GLSL_BUMP);
    };
    mat.customProgramCacheKey = () => 'terreno-detalle-' + (this.movil ? 'm' : 'd');
    const c = {
      id: `${t.i}_${t.j}`, t, mat, mesh: null, stride: 0, wantStride: 8,
      x0, z0, x1: x0 + CH * dx, z1: z0 + CH * dz,
      lo: null, hi: null, hiLoading: false, u, cobTex: null, cobCarga: false,
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

  // cobertura del suelo (ESA WorldCover 2021) de un bloque: 512×512 clases, gzip; se pide solo cerca y se descomprime con DecompressionStream
  cobertura(c) {
    const k = c.id; let p = this.coberturas.get(k);
    if (p) { this.coberturas.delete(k); this.coberturas.set(k, p); return p; }
    p = (typeof DecompressionStream === 'undefined' ? Promise.resolve(null)
      : fetch(`${this.base}/cover/c_${k}.bin.gz`).then((r) => (r.ok ? new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : null))
        .then((b) => (b && b.byteLength === 512 * 512 ? new Uint8Array(b) : null))).catch(() => null);
    this.coberturas.set(k, p);
    for (const [kk] of this.coberturas) { if (this.coberturas.size <= MAX_COBERTURA) break; this.coberturas.delete(kk); }
    return p;
  }
  _cargaCobertura(c) {
    c.cobCarga = true;
    this.cobertura(c).then((a) => {
      c.cobCarga = false; if (!a) return;
      const t = new THREE.DataTexture(a, 512, 512, THREE.RedFormat, THREE.UnsignedByteType);
      t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false; t.needsUpdate = true;
      c.cobTex = t; c.u.uCover.value = t; c.u.uHasCover.value = 1;
    });
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
      if (d < 15000 && !c.cobTex && !c.cobCarga) this._cargaCobertura(c);
      else if (d > 30000 && c.cobTex) { c.cobTex.dispose(); c.cobTex = null; c.u.uCover.value = null; c.u.uHasCover.value = 0; }
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
