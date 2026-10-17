import * as THREE from 'three';
import { crearMontanero } from './montanero.js?v=3';

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

  // montañeros: uno que sigue a la cámara en el vuelo o al dedo en el perfil, y un grupo de tres que recorre la ruta
  const KM = 42;   // metros por unidad del muñeco (mide ~1,8): se escala además con la distancia de la cámara
  const reducido = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mk = (o) => { const m = crearMontanero(o), h = new THREE.Group(); h.add(m.group); h.visible = false; scene.add(h); return { h, m, fase: Math.random() * 6 }; };
  const solo = mk({});
  const equipo = [   // cada uno con su ropa, su mochila y sus bastones (2, 0 y 1)
    mk({ chaqueta: '#d8362b', mochila: '#e8892b', mochilaTipo: 'grande', palos: 2 }),
    mk({ chaqueta: '#2f6fb5', mochila: '#3a8f5a', pantalon: '#3a3a44', mochilaTipo: 'pequena', palos: 0 }),
    mk({ chaqueta: '#e8b923', mochila: '#6a4a8f', pantalon: '#2f3b30', mochilaTipo: 'media', palos: 1 }),
  ];
  let cursorOn = false, dEquipo = 0, dCursor = 0, ultimoCursor = -1e9;
  function colocar(p, d, lat, andando) {
    const a = en(d), b = en(d + 40), c = en(d - 40);
    let dx = b.pos.x - c.pos.x, dz = b.pos.z - c.pos.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const x = a.pos.x + dz * lat, z = a.pos.z - dx * lat;
    p.h.position.set(x, Math.max(geo.heightAt(x, z) + 30, a.pos.y + 13), z);   // los pies por encima del tubo de la ruta (radio 11 m) y del relieve dibujado   // por encima del relieve dibujado (el nivel de detalle puede quedar más alto que la altura real) p.h.rotation.y = Math.atan2(dx, dz);
    p.m.pose(p.fase, andando ? 1 : 0, Math.max(-0.6, Math.min(0.8, (b.pos.y - c.pos.y) / L)) * 0.4);
  }
  const ver = () => { solo.h.visible = activo && cursorOn; for (const p of equipo) p.h.visible = activo && !cursorOn && !reducido; };

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

  // todas las veces que el recorrido pasa a menos de `radio` m de un punto (subida y bajada), en orden
  function pasos(x, z, radio = 220) {
    const out = []; let cur = null;
    for (let i = 0; i < pts.length; i++) {
      const m = Math.hypot(pts[i].x - x, pts[i].z - z);
      if (m > radio) { if (cur) { out.push(cur); cur = null; } continue; }
      if (!cur) cur = { metros: m, dist: dist[i] }; else if (m < cur.metros) { cur.metros = m; cur.dist = dist[i]; }
    }
    if (cur) out.push(cur);
    // pasadas casi seguidas (vueltas del track, GPS) cuentan como una sola
    return out.reduce((a, c) => { const u = a[a.length - 1]; if (u && c.dist - u.dist < 1500) { if (c.metros < u.metros) { u.metros = c.metros; u.dist = c.dist; } } else a.push({ ...c }); return a; }, []);
  }

  const lo = Math.floor(ruta.min / 100) * 100, hi = Math.ceil(ruta.max / 100) * 100;
  const X = (m) => PL + (m / ruta.distancia) * (PW - PL - PR), Y = (e) => PT + (1 - (e - lo) / (hi - lo)) * (PH - PT - PB);
  const fmtKm = (m) => (m / 1000).toFixed(1).replace('.', ',');

  return {
    ruta, centro, extension, en, cercano, pasos,
    mostrar(v, { animar = true } = {}) {
      activo = v; mesh.visible = v; ver();
      if (v) { k = animar ? 0 : 1; t0 = performance.now(); set(); dEquipo = 0; }
    },
    get visible() { return activo; },
    update(dt = 0.016) {
      if (activo && k < 1) { k = Math.min(1, (performance.now() - t0) / 4500); set(); }
      if (!activo) return;
      if (cursorOn) { const anda = performance.now() - ultimoCursor < 250; if (anda) solo.fase += dt * 11; colocar(solo, dCursor, 0, anda); }
      else if (!reducido) {
        dEquipo += dt * 170; if (dEquipo > ruta.distancia + 500) dEquipo = 0;
        equipo.forEach((p, i) => { const d = dEquipo - i * 110; p.fase += dt * 10; colocar(p, Math.max(0, Math.min(ruta.distancia, d)), [0, 34, -34][i], d > 0 && d < ruta.distancia); });
      }
    },
    escalar(cam) {
      for (const p of equipo) if (p.h.visible) p.h.scale.setScalar(KM * 1.275 * Math.min(5, Math.max(0.8, cam.distanceTo(p.h.position) / 4500)));
      // el montañero solo mantiene siempre un tamaño parecido en pantalla (~3 % del alto), esté la cámara cerca o lejos
      if (solo.h.visible) solo.h.scale.setScalar(Math.max(KM * 0.64, 0.015 * cam.distanceTo(solo.h.position)));
    },
    posiciones: () => ({ solo: solo.h.position.clone(), equipo: equipo.map((p) => p.h.position.clone()) }),
    cursor(d) {
      if (d == null || !activo) { cursorOn = false; ver(); return; }
      if (Math.abs(d - dCursor) > 0.5) ultimoCursor = performance.now();
      dCursor = d; cursorOn = true; ver(); colocar(solo, d, 0, false);
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
