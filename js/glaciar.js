import * as THREE from 'three';

// «El glaciar en el tiempo»: el hielo de una época (relleno translúcido pegado al relieve) y el contorno de las demás (líneas de colores).
// Datos: data/glaciares.json (tools/build_glaciares.py): contornos en lon/lat por año; los anillos van mezclados (exteriores y huecos):
// un punto está dentro si cruza un número impar de anillos (par-impar), así los huecos salen solos.
export const COLOR_EPOCA = { 1981: '#7b5cff', 2000: '#3d8bff', 2011: '#21c4d8', 2020: '#7ee0a0', 2021: '#d6e86a', 2022: '#ffd166' };

export function crearGlaciares({ scene, geo }) {
  let datos = null;
  const cargar = () => (datos ??= fetch(`data/glaciares.json?dv=${window.DATOS_V || 0}`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  const grupo = new THREE.Group(); grupo.renderOrder = 3; scene.add(grupo);
  const matHielo = new THREE.MeshBasicMaterial({ color: '#e8f7ff', transparent: true, opacity: 0.62, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const LIFT = 3;   // metros sobre el relieve

  const aXZ = (anillos) => anillos.map((r) => r.map(([lon, lat]) => geo.toXZ(lon, lat)));
  function dentro(rs, x, z) {
    let c = false;
    for (const r of rs) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i], b = r[j];
      if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) c = !c;
    }
    return c;
  }
  // relleno: rejilla de PASO m dentro del contorno, con la altura del relieve en cada vértice
  function relleno(rs) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const r of rs) for (const q of r) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
    const area = (x1 - x0) * (z1 - z0), PASO = Math.max(4, Math.sqrt(area / 60000));   // como mucho ~60.000 celdas
    const nx = Math.ceil((x1 - x0) / PASO) + 1, nz = Math.ceil((z1 - z0) / PASO) + 1;
    const pos = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i * PASO, z = z0 + j * PASO, k = (j * nx + i) * 3;
      pos[k] = x; pos[k + 1] = geo.heightAt(x, z) + LIFT; pos[k + 2] = z;
    }
    const idx = [];
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      if (!dentro(rs, x0 + (i + 0.5) * PASO, z0 + (j + 0.5) * PASO)) continue;
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, matHielo); m.renderOrder = 3; m.frustumCulled = false; return m;
  }
  // contorno pegado al relieve, con un punto cada ~3 m
  function contorno(rs, color, opacidad) {
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: opacidad, depthWrite: false, fog: true });
    const g = new THREE.Group();
    for (const r of rs) {
      const p = [];
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 3));
        for (let s = 0; s < n; s++) { const x = a.x + ((b.x - a.x) * s) / n, z = a.z + ((b.z - a.z) * s) / n; p.push(new THREE.Vector3(x, geo.heightAt(x, z) + LIFT + 0.5, z)); }
      }
      const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(p), mat); l.renderOrder = 4; l.frustumCulled = false; g.add(l);
    }
    return g;
  }
  function limpiar() {
    for (const o of [...grupo.children]) { o.traverse((x) => { x.geometry?.dispose(); if (x.material && x.material !== matHielo) x.material.dispose(); }); grupo.remove(o); }
  }
  // gl: glaciar de data/glaciares.json; anio: la época que se rellena; las demás, solo el contorno
  function mostrar(gl, anio) {
    limpiar(); if (!gl) return;
    for (const [a, an] of Object.entries(gl.epocas)) {
      const rs = aXZ(an);
      if (a === String(anio)) { grupo.add(relleno(rs)); grupo.add(contorno(rs, '#ffffff', 0.95)); }
      else grupo.add(contorno(rs, COLOR_EPOCA[a] ?? '#ffffff', 0.85));
    }
  }
  // centro y tamaño del glaciar (para acercar la cámara)
  function caja(gl) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const an of Object.values(gl.epocas)) for (const r of aXZ(an)) for (const q of r) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
    const x = (x0 + x1) / 2, z = (z0 + z1) / 2; return { x, z, y: geo.heightAt(x, z), r: Math.max(x1 - x0, z1 - z0) / 2 };
  }
  return { cargar, mostrar, quitar: limpiar, caja };
}
