// Paquete de zona a máxima calidad (tools/build_paquete.py → data/paquetes/<cumbre>/): piezas de 1 × 1 km a lo largo de las rutas de una cumbre,
// con relieve MDT05 del IGN remuestreado a 2,5 m y ortofoto PNOA a ≈ 25 cm por píxel. Se cargan las piezas más cercanas al punto que se mira y se sueltan las lejanas.
// Entre piezas vecinas no hay fundido (encajan borde con borde); solo en el borde exterior del pasillo se funden con el relieve general y el satélite.
// Debajo de cada pieza cargada el relieve general se recorta con una máscara (terrain.paq); las piezas de cumbre de js/cumbres.js se quitan dentro del paquete.
import * as THREE from 'three';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export async function crearPaquete({ scene, geo, terrain, cumbres, base, movil, alRelieve }) {
  const idx = await fetch(`${base}/index.json`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!idx?.piezas?.length) return null;
  const L = idx.lado, MAX = movil ? 6 : 12, CARGA = movil ? 2200 : 3200, DESCARGA = CARGA + 1200, FUNDE = 90;
  const porCelda = new Map(idx.piezas.map((d) => [`${Math.round(d.x0 / L)}_${Math.round(d.z0 / L)}`, d]));
  const i0 = Math.min(...idx.piezas.map((d) => Math.round(d.x0 / L))), j0 = Math.min(...idx.piezas.map((d) => Math.round(d.z0 / L)));
  const ni = Math.max(...idx.piezas.map((d) => Math.round(d.x0 / L))) - i0 + 1, nj = Math.max(...idx.piezas.map((d) => Math.round(d.z0 / L))) - j0 + 1;
  // máscara: un texel por pieza (1 = cargada: el relieve general no se dibuja ahí)
  const mascara = new Uint8Array(ni * nj * 4), texM = new THREE.DataTexture(mascara, ni, nj, THREE.RGBAFormat);
  texM.magFilter = texM.minFilter = THREE.NearestFilter; texM.needsUpdate = true;
  terrain.paq.uPaq.value = texM; terrain.paq.uPaqB.value.set(i0 * L, j0 * L, (i0 + ni) * L, (j0 + nj) * L);
  const marca = (d, v) => { const k = ((Math.round(d.z0 / L) - j0) * ni + Math.round(d.x0 / L) - i0) * 4; mascara[k] = v ? 255 : 0; texM.needsUpdate = true; };
  const vecina = (d, di, dj) => porCelda.has(`${Math.round(d.x0 / L) + di}_${Math.round(d.z0 / L) + dj}`);
  const piezas = new Map(), cargando = new Set();

  const sample = (p, x, z) => {
    const fx = (x - p.x0) / p.paso, fz = (z - p.z0) / p.paso;
    if (fx < 0 || fz < 0 || fx > p.n - 1 || fz > p.n - 1) return undefined;
    const i = Math.min(p.n - 2, Math.floor(fx)), j = Math.min(p.n - 2, Math.floor(fz)), tx = fx - i, tz = fz - j, H = p.H, n = p.n;
    return (H[j * n + i] * (1 - tx) + H[j * n + i + 1] * tx) * (1 - tz) + (H[(j + 1) * n + i] * (1 - tx) + H[(j + 1) * n + i + 1] * tx) * tz;
  };
  geo.setPaquete((x, z) => { for (const p of piezas.values()) { const h = sample(p, x, z); if (h !== undefined) return h; } return undefined; });
  cumbres.excluye = (x, z) => [...piezas.values()].some((p) => x > p.x0 - 600 && x < p.x0 + L + 600 && z > p.z0 - 600 && z < p.z0 + L + 600);

  async function carga(d) {
    cargando.add(d.id);
    try {
      const r = await fetch(`${base}/${d.id}.bin.gz`); if (!r.ok) return;
      const raw = new Uint16Array(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
      const ch = terrain.chunkEn(d.x0 + L / 2, d.z0 + L / 2); if (!ch || raw.length !== d.n * d.n) return;
      const { n, paso, x0, z0 } = d, H = new Float32Array(n * n), hs = geo.hs;
      // fundido con el relieve general solo hacia los lados sin pieza vecina
      const lados = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([a, b]) => !vecina(d, a, b));
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const x = x0 + i * paso, z = z0 + j * paso, b = geo.heightBase(x, z), v = raw[j * n + i];
        let borde = 1e9; if (lados[0]) borde = Math.min(borde, i * paso); if (lados[1]) borde = Math.min(borde, (n - 1 - i) * paso); if (lados[2]) borde = Math.min(borde, j * paso); if (lados[3]) borde = Math.min(borde, (n - 1 - j) * paso);
        H[j * n + i] = v ? b + (v * hs - b) * sstep(0, FUNDE, borde) : b;
      }
      const m = movil ? 2 : 1, nm = Math.floor((n - 1) / m) + 1;   // en el móvil, una malla de 5 m (el dato del MDT05); en el ordenador, la de 2,5 m
      const pos = new Float32Array(nm * nm * 3), nor = new Float32Array(nm * nm * 3), uv = new Float32Array(nm * nm * 2);
      const cw = terrain.meta.chunk * geo.dx, cd = terrain.meta.chunk * geo.dz;
      for (let b = 0; b < nm; b++) for (let a = 0; a < nm; a++) {
        const i = a * m, j = b * m, k = b * nm + a, x = x0 + i * paso, z = z0 + j * paso;
        pos[k * 3] = x; pos[k * 3 + 1] = H[j * n + i]; pos[k * 3 + 2] = z;
        const ia = Math.max(0, i - m), ib = Math.min(n - 1, i + m), ja = Math.max(0, j - m), jb = Math.min(n - 1, j + m);
        // en el borde con una vecina, la normal se calcula con el relieve de la vecina (geo.heightAt) para que no se marque la junta
        const hx = ((i - m < 0 ? geo.heightAt(x - m * paso, z) : H[j * n + ia]) - (i + m > n - 1 ? geo.heightAt(x + m * paso, z) : H[j * n + ib])) / (2 * m * paso);
        const hz = ((j - m < 0 ? geo.heightAt(x, z - m * paso) : H[ja * n + i]) - (j + m > n - 1 ? geo.heightAt(x, z + m * paso) : H[jb * n + i])) / (2 * m * paso), il = 1 / Math.hypot(hx, 1, hz);
        nor[k * 3] = hx * il; nor[k * 3 + 1] = il; nor[k * 3 + 2] = hz * il;
        uv[k * 2] = (x - ch.x0) / cw; uv[k * 2 + 1] = 1 - (z - ch.z0) / cd;
      }
      const idx3 = new Uint32Array((nm - 1) * (nm - 1) * 6); let q = 0;
      for (let b = 0; b < nm - 1; b++) for (let a = 0; a < nm - 1; a++) { const v0 = b * nm + a, v1 = v0 + 1, v2 = v0 + nm, v3 = v2 + 1; idx3[q++] = v0; idx3[q++] = v2; idx3[q++] = v1; idx3[q++] = v1; idx3[q++] = v2; idx3[q++] = v3; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(new THREE.BufferAttribute(idx3, 1)); g.computeBoundingSphere();
      const mat = terrain.crearMaterialPieza(ch, 'granito'), mesh = new THREE.Mesh(g, mat); mesh.matrixAutoUpdate = false;
      const p = { d, H, x0, z0, n, paso, mesh, mat, ch, lados };
      if (piezas.size >= MAX + 2) { g.dispose(); mat.dispose(); return; }
      scene.add(mesh); piezas.set(d.id, p); marca(d, true);
      alRelieve?.({ x0, z0, x1: x0 + L, z1: z0 + L });
      if (d.orto) new THREE.TextureLoader().load(`${base}/${d.orto}`, (tex) => {
        if (piezas.get(d.id) !== p) { tex.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(16, terrain.aniso ?? 8); tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.repeat.set(cw / L, cd / L); tex.offset.set((ch.x0 - x0) / L, (L - (ch.z0 - z0) - cd) / L);
        mat.map = tex; mat.color.set(0xffffff); mat.needsUpdate = true;
        const u = mat.userData; u.orto.value = 1; u.sat.value = ch.mat.map; u.pbW.value = 350;
        if (idx.og) idx.og.forEach((v, i) => u.og[i].value.set(v[0], v[1], v[2]));   // un solo ajuste de color para todo el paquete (tools/build_paquete.py)
        // el fundido con el satélite solo en los lados sin vecina: los demás lados se llevan lejos
        u.pb.value.set(lados[0] ? x0 : -1e7, lados[2] ? z0 : -1e7, lados[1] ? x0 + L : 1e7, lados[3] ? z0 + L : 1e7);
        p.orto = tex;
      });
    } catch (e) { console.warn('paquete', d.id, e); } finally { cargando.delete(d.id); }
  }
  function quita(id) {
    const p = piezas.get(id); if (!p) return;
    scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mat.dispose(); p.orto?.dispose(); piezas.delete(id); marca(p.d, false);
    alRelieve?.({ x0: p.x0, z0: p.z0, x1: p.x0 + L, z1: p.z0 + L });
  }
  let cuenta = 0;
  return {
    idx, get cargadas() { return [...piezas.keys()]; },
    update(cam, objetivo) {
      for (const p of piezas.values()) if (p.orto) p.mat.userData.sat.value = p.ch.mat.map;
      if (++cuenta % 10) return;
      const c = objetivo ?? cam.position, cerca = [];
      for (const d of idx.piezas) {
        const dist = Math.hypot(d.x0 + L / 2 - c.x, d.z0 + L / 2 - c.z);
        if (piezas.has(d.id)) { if (dist > DESCARGA) quita(d.id); } else if (dist < CARGA && !cargando.has(d.id)) cerca.push([dist, d]);
      }
      cerca.sort((a, b) => a[0] - b[0]);
      for (const [, d] of cerca) { if (piezas.size + cargando.size >= MAX) break; carga(d); }
    },
  };
}
