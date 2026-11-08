// Capa «Sendas y pistas»: todos los caminos de OpenStreetMap (data/sendas/, tools/build_sendas.py) sobre el relieve, para ver por dónde se puede ir
// además de la ruta. Teselas de 5 km: se cargan las de alrededor del punto que se mira y se sueltan las lejanas; de muy lejos no se dibujan (serían una maraña).
// Sendas en crema, pistas en ocre, vías ferratas en rojo. Como la línea de la ruta, se levantan más sobre el suelo cuanto más lejos está la cámara.
import * as THREE from 'three';

const CARGA = 6000, SUELTA = 11000, MAXCAM = 16000, DENS = 20;   // m: radio de carga, de descarga, distancia máxima de la cámara, un vértice cada 20 m
const COLORES = ['#fff4d6', '#d9a866', '#ff5a3c'];

export function crearSendas({ scene, geo }) {
  const grupo = new THREE.Group(); grupo.visible = false; grupo.renderOrder = 1; scene.add(grupo);
  const mats = COLORES.map((c) => {
    const m = new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false, fog: true });
    m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float dd = distance((modelMatrix * vec4(position, 1.0)).xyz, cameraPosition); transformed.y += clamp(dd * 0.003, 1.5, 22.0);`); };
    m.customProgramCacheKey = () => 'sendas';
    return m;
  });
  let idx = null, on = false, lado = 5000;
  const teselas = new Map();   // "i_j" -> { obj, datos, cargando }
  const base = () => fetch(`data/sendas/index.json?dv=${window.DATOS_V || 0}`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  function malla(datos) {
    const pos = [[], [], []];
    for (const l of datos.l) {
      const tipo = l[0], P = pos[tipo] ?? pos[0]; let x = l[1], z = l[2];
      for (let k = 3; k < l.length; k += 2) {
        const nx = x + l[k], nz = z + l[k + 1], n = Math.max(1, Math.ceil(Math.hypot(l[k], l[k + 1]) / DENS));
        for (let s = 0; s < n; s++) {   // el tramo se parte para que siga el relieve
          const ax = x + l[k] * s / n, az = z + l[k + 1] * s / n, bx = x + l[k] * (s + 1) / n, bz = z + l[k + 1] * (s + 1) / n;
          P.push(ax, geo.heightAt(ax, az), az, bx, geo.heightAt(bx, bz), bz);
        }
        x = nx; z = nz;
      }
    }
    const g = new THREE.Group();
    pos.forEach((P, i) => {
      if (!P.length) return;
      const geom = new THREE.BufferGeometry(); geom.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geom.computeBoundingSphere();
      const ls = new THREE.LineSegments(geom, mats[i]); ls.renderOrder = 1; g.add(ls);
    });
    return g;
  }
  const suelta = (t) => { if (!t.obj) return; grupo.remove(t.obj); t.obj.traverse((o) => o.geometry?.dispose()); t.obj = null; };

  let ult = -1e9;
  return {
    get activa() { return on; },
    async poner(v) { on = v; grupo.visible = v; if (v && !idx) { idx = await base(); if (idx) lado = idx.lado; } },
    update(objetivo, camara) {
      if (!on || !idx) return;
      const lejos = camara.position.distanceTo(objetivo) > MAXCAM; grupo.visible = !lejos; if (lejos) return;
      const now = performance.now(); if (now - ult < 700) return; ult = now;
      const ci = Math.floor(objetivo.x / lado), cj = Math.floor(objetivo.z / lado), r = Math.ceil(CARGA / lado) + 1;
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
        const k = `${i}_${j}`; if (!idx.teselas.includes(k)) continue;
        const d = Math.hypot(Math.max(i * lado - objetivo.x, 0, objetivo.x - (i + 1) * lado), Math.max(j * lado - objetivo.z, 0, objetivo.z - (j + 1) * lado));
        let t = teselas.get(k); if (d > CARGA || t?.obj || t?.cargando) continue;
        if (!t) { t = {}; teselas.set(k, t); }
        t.cargando = (t.datos ? Promise.resolve(t.datos) : fetch(`data/sendas/${k}.json?dv=${window.DATOS_V || 0}`).then((r) => (r.ok ? r.json() : null)))
          .then((datos) => { t.datos = datos; if (datos && on) { t.obj = malla(datos); grupo.add(t.obj); } }).catch(() => {}).finally(() => { t.cargando = null; });
      }
      for (const [k, t] of teselas) {
        const [i, j] = k.split('_').map(Number);
        const d = Math.hypot(Math.max(i * lado - objetivo.x, 0, objetivo.x - (i + 1) * lado), Math.max(j * lado - objetivo.z, 0, objetivo.z - (j + 1) * lado));
        if (d > SUELTA) { suelta(t); if (d > 3 * SUELTA) teselas.delete(k); }
      }
    },
    // el relieve cambió en una zona (paquete, detalle de cima): las teselas de alrededor se rehacen a la altura nueva
    reajusta({ x0, z0, x1, z1 }) {
      for (const [k, t] of teselas) {
        const [i, j] = k.split('_').map(Number);
        if (!t.obj || (i + 1) * lado + 2000 < x0 || i * lado - 2000 > x1 || (j + 1) * lado + 2000 < z0 || j * lado - 2000 > z1) continue;
        suelta(t); t.obj = malla(t.datos); grupo.add(t.obj);
      }
    },
  };
}
