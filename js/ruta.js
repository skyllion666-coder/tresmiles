import * as THREE from 'three';

// Recorrido (track GPX simplificado) dibujado sobre el relieve, con perfil de altura.
export async function cargarRuta(id) {
  const r = await fetch(`data/rutas/${id}.json`);
  if (!r.ok) throw new Error(`ruta ${id} ${r.status}`);
  return r.json();
}

export function crearRuta({ scene, geo, ruta }) {
  const pts = ruta.puntos.map(([lon, lat]) => {
    const q = geo.toXZ(lon, lat);
    return new THREE.Vector3(q.x, geo.heightAt(q.x, q.z) + 24, q.z);
  });
  const bb = pts.reduce((o, p) => ({ x0: Math.min(o.x0, p.x), x1: Math.max(o.x1, p.x), z0: Math.min(o.z0, p.z), z1: Math.max(o.z1, p.z) }), { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 });
  const centro = { x: (bb.x0 + bb.x1) / 2, z: (bb.z0 + bb.z1) / 2 }, extension = Math.hypot(bb.x1 - bb.x0, bb.z1 - bb.z0);
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const tub = 1800, rad = 5;
  const geom = new THREE.TubeGeometry(curve, tub, 11, rad, false);
  const mat = new THREE.MeshBasicMaterial({ color: '#ffa930', fog: true });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.visible = false;
  scene.add(mesh);
  const total = tub * rad * 6;
  let k = 1, activo = false, t0 = 0;
  const set = () => geom.setDrawRange(0, Math.floor(k * tub) * rad * 6);
  set();
  return {
    ruta, centro, extension,
    mostrar(v, { animar = true } = {}) {
      activo = v; mesh.visible = v;
      if (v) { k = animar ? 0 : 1; t0 = performance.now(); set(); }
    },
    get visible() { return activo; },
    update() { if (activo && k < 1) { k = Math.min(1, (performance.now() - t0) / 4500); set(); } },
    perfil() {
      const W = 300, H = 84, pl = 34, pb = 16, pt = 6;
      const d = ruta.distancia, lo = Math.floor(ruta.min / 100) * 100, hi = Math.ceil(ruta.max / 100) * 100;
      const X = (m) => pl + (m / d) * (W - pl - 4), Y = (e) => pt + (1 - (e - lo) / (hi - lo)) * (H - pt - pb);
      const lin = ruta.puntos.map((p) => `${X(p[3]).toFixed(1)},${Y(p[2]).toFixed(1)}`).join(' ');
      return `<svg viewBox="0 0 ${W} ${H}" class="perfil" role="img" aria-label="Perfil de altura de la ruta, de ${ruta.min} a ${ruta.max} metros en ${(d / 1000).toFixed(1)} kilómetros">
        <line x1="${pl}" x2="${W - 4}" y1="${Y(hi)}" y2="${Y(hi)}" class="g"/><line x1="${pl}" x2="${W - 4}" y1="${Y(lo)}" y2="${Y(lo)}" class="g"/>
        <polygon points="${X(0)},${Y(lo)} ${lin} ${X(d)},${Y(lo)}" class="a"/><polyline points="${lin}" class="l"/>
        <text x="${pl - 4}" y="${Y(hi) + 3}" text-anchor="end">${hi}</text><text x="${pl - 4}" y="${Y(lo) + 3}" text-anchor="end">${lo}</text>
        <text x="${pl}" y="${H - 3}">0 km</text><text x="${W - 4}" y="${H - 3}" text-anchor="end">${(d / 1000).toFixed(1).replace('.', ',')} km</text></svg>`;
    },
  };
}
