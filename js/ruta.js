import * as THREE from 'three';

// Recorrido (track GPX simplificado) dibujado sobre el relieve, con perfil de altura interactivo y vuelo.
export async function cargarRuta(id) {
  const r = await fetch(`data/rutas/${id}.json`);
  if (!r.ok) throw new Error(`ruta ${id} ${r.status}`);
  return r.json();
}

const PW = 300, PH = 92, PL = 34, PR = 4, PT = 6, PB = 16; // medidas del perfil (viewBox)

export function crearRuta({ scene, geo, ruta }) {
  const pts = ruta.puntos.map(([lon, lat]) => {
    const q = geo.toXZ(lon, lat);
    return new THREE.Vector3(q.x, geo.heightAt(q.x, q.z) + 24, q.z);
  });
  const dist = ruta.puntos.map((p) => p[3]);
  const bb = pts.reduce((o, p) => ({ x0: Math.min(o.x0, p.x), x1: Math.max(o.x1, p.x), z0: Math.min(o.z0, p.z), z1: Math.max(o.z1, p.z) }), { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 });
  const centro = { x: (bb.x0 + bb.x1) / 2, z: (bb.z0 + bb.z1) / 2 }, extension = Math.hypot(bb.x1 - bb.x0, bb.z1 - bb.z0);
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const tub = 1800, rad = 5;
  const geom = new THREE.TubeGeometry(curve, tub, 11, rad, false);
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: '#ffa930', fog: true }));
  mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.visible = false;
  scene.add(mesh);

  // punto que sigue al dedo sobre el perfil o a la cámara durante el vuelo
  const marca = new THREE.Group();
  marca.add(new THREE.Mesh(new THREE.SphereGeometry(30, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffffff', fog: true })));
  marca.add(new THREE.Mesh(new THREE.SphereGeometry(62, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffa930', transparent: true, opacity: 0.38, depthWrite: false, fog: true })));
  marca.visible = false; marca.renderOrder = 3; scene.add(marca);

  let k = 1, activo = false, t0 = 0;
  const set = () => geom.setDrawRange(0, Math.floor(k * tub) * rad * 6);
  set();

  // posición y altitud a una distancia (m) del inicio
  function en(d) {
    d = Math.min(ruta.distancia, Math.max(0, d));
    let lo = 0, hi = dist.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (dist[m] <= d) lo = m; else hi = m; }
    const span = dist[hi] - dist[lo] || 1, t = (d - dist[lo]) / span;
    return { pos: pts[lo].clone().lerp(pts[hi], t), ele: ruta.puntos[lo][2] + (ruta.puntos[hi][2] - ruta.puntos[lo][2]) * t, dist: d };
  }
  // punto de la ruta más cercano a una posición (x, z): para situar un hito en el recorrido
  function cercano(x, z) {
    let best = 1e18, bi = 0;
    for (let i = 0; i < pts.length; i++) { const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2; if (d < best) { best = d; bi = i; } }
    return { metros: Math.sqrt(best), dist: dist[bi], ele: ruta.puntos[bi][2] };
  }

  const lo = Math.floor(ruta.min / 100) * 100, hi = Math.ceil(ruta.max / 100) * 100;
  const X = (m) => PL + (m / ruta.distancia) * (PW - PL - PR), Y = (e) => PT + (1 - (e - lo) / (hi - lo)) * (PH - PT - PB);
  const fmtKm = (m) => (m / 1000).toFixed(1).replace('.', ',');

  return {
    ruta, centro, extension, en, cercano,
    mostrar(v, { animar = true } = {}) {
      activo = v; mesh.visible = v; if (!v) marca.visible = false;
      if (v) { k = animar ? 0 : 1; t0 = performance.now(); set(); }
    },
    get visible() { return activo; },
    update() { if (activo && k < 1) { k = Math.min(1, (performance.now() - t0) / 4500); set(); } },
    escalar(cam) { if (marca.visible) marca.scale.setScalar(Math.min(5, Math.max(0.8, cam.distanceTo(marca.position) / 4500))); },
    cursor(d) {
      if (d == null || !activo) { marca.visible = false; return; }
      marca.position.copy(en(d).pos); marca.position.y += 30; marca.visible = true;
    },
    perfil() {
      const lin = ruta.puntos.map((p) => `${X(p[3]).toFixed(1)},${Y(p[2]).toFixed(1)}`).join(' ');
      return `<svg viewBox="0 0 ${PW} ${PH}" class="perfil" role="img" aria-label="Perfil de altura de la ruta, de ${ruta.min} a ${ruta.max} metros en ${fmtKm(ruta.distancia)} kilómetros. Desliza el dedo para ver un punto concreto en el mapa.">
        <line x1="${PL}" x2="${PW - PR}" y1="${Y(hi)}" y2="${Y(hi)}" class="g"/><line x1="${PL}" x2="${PW - PR}" y1="${Y(lo)}" y2="${Y(lo)}" class="g"/>
        <polygon points="${X(0)},${Y(lo)} ${lin} ${X(ruta.distancia)},${Y(lo)}" class="a"/><polyline points="${lin}" class="l"/>
        <text x="${PL - 4}" y="${Y(hi) + 3}" text-anchor="end">${hi}</text><text x="${PL - 4}" y="${Y(lo) + 3}" text-anchor="end">${lo}</text>
        <text x="${PL}" y="${PH - 3}">0 km</text><text x="${PW - PR}" y="${PH - 3}" text-anchor="end">${fmtKm(ruta.distancia)} km</text>
        <g class="cur" visibility="hidden"><line class="cl" y1="${PT}" y2="${PH - PB}"/><circle r="3" class="cp"/><text class="ct" y="${PT + 7}"></text></g></svg>`;
    },
    // distancia (m) bajo el puntero, a partir de la posición en el SVG del perfil
    distanciaEn(svg, clientX) {
      const r = svg.getBoundingClientRect(); const x = ((clientX - r.left) / r.width) * PW;
      return Math.min(ruta.distancia, Math.max(0, ((x - PL) / (PW - PL - PR)) * ruta.distancia));
    },
    marcarPerfil(svg, d) {
      const g = svg.querySelector('.cur'); if (!g) return;
      if (d == null) { g.setAttribute('visibility', 'hidden'); return; }
      const e = en(d), x = X(d), y = Y(e.ele);
      g.setAttribute('visibility', 'visible');
      g.querySelector('.cl').setAttribute('x1', x); g.querySelector('.cl').setAttribute('x2', x);
      g.querySelector('.cp').setAttribute('cx', x); g.querySelector('.cp').setAttribute('cy', y);
      const t = g.querySelector('.ct'); t.textContent = `${fmtKm(d)} km · ${Math.round(e.ele)} m`;
      const izq = x > PW * 0.62; t.setAttribute('x', izq ? x - 5 : x + 5); t.setAttribute('text-anchor', izq ? 'end' : 'start');
    },
  };
}
