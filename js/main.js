import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { makeGeo } from './geo.js';
import { Terrain } from './terrain.js?v=20';
import { crearVegetacion } from './vegetacion.js?v=8';
import { crearCumbres } from './cumbres.js?v=40';
import { crearBanderines, leerHechos, guardarHechos } from './banderines.js?v=4';
import { HeightStore } from './heights.js';
import { makeSky, Clouds, HORIZON } from './sky.js?v=3';
import { instalaNiebla } from './niebla.js?v=4';
import { crearLagos, crearAves, crearSonido } from './vida.js?v=20';
import { crearFauna } from './fauna.js?v=11';
import { cargarRuta, crearRuta } from './ruta.js?v=47';
import { crearPanorama } from './panorama.js?v=3';
import { crearSelector } from './selector.js?v=3';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => new Intl.NumberFormat('es-ES', { useGrouping: 'always' }).format(n);
const km = (m) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(m / 1000);
const conV = (u) => u + (u.includes('?') ? '&' : '?') + 'dv=' + (window.DATOS_V || 0);   // sube DATOS_V en index.html al cambiar datos
const json = (u) => fetch(conV(u), { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const wrapPi = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } } };
const isMobile = () => innerWidth <= 760;

// colores del cielo, la niebla y la luz ambiente según la luz elegida: amanecer, mediodía y atardecer (cambian con suavidad)
const LOOK = [
  { top: '#3a5a8c', mid: '#bfb2c0', hor: '#f3cfae', fog: '#e4cdbb', hemiC: '#ffe6d2', hemiG: '#6c6a70', hemiK: 0.76, glow: '#ffbb80', glowK: 0.36, nube: '#ffe3d6' },
  { top: '#3a6a9e', mid: '#97b8d2', hor: '#d6dde0', fog: '#d6dde0', hemiC: '#f1eee6', hemiG: '#767060', hemiK: 0.70, glow: '#fff4d6', glowK: 0.12, nube: '#ffffff' },
  { top: '#434a82', mid: '#c49aa0', hor: '#f2b88e', fog: '#e0bba6', hemiC: '#ffd8bf', hemiG: '#6a5f5e', hemiK: 0.74, glow: '#ff9a5c', glowK: 0.42, nube: '#ffd3bc' },
].map((l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, typeof v === 'string' ? new THREE.Color(v) : v])));
const BRUMA = [{ k: 0.80, t: 0.55 }, { k: 0.10, t: 0 }, { k: 0.42, t: 1 }];   // fuerza y tinte cálido de la bruma de valle (js/niebla.js) según la luz
const SUN = [
  { id: 'manana', nombre: 'Mañana', az: 105, el: 20, col: '#ffd7a8', k: 1.0 },
  { id: 'mediodia', nombre: 'Mediodía', az: 180, el: 52, col: '#ffe9c8', k: 1.08 },
  { id: 'tarde', nombre: 'Tarde', az: 252, el: 18, col: '#ffbf86', k: 1.0 },
];

async function boot() {
  const [data, fotos, meta, menores] = await Promise.all([json('data/peaks.json'), json('data/fotos.json'), json('data/terrain/meta.json'), json('data/menores.json').catch(() => ({ zonas: [], picos: [] }))]);
  // picos de 2.000 a 3.000 m (ficha sencilla, sin ruta): se suman a la lista con su zona; el filtro «capa» decide cuáles se ven
  data.picos.push(...menores.picos); data.macizos.push(...menores.zonas); window.Carga?.paso(1);
  Object.assign(fotos, menores.fotos ?? {});   // sus fotos (pequeñas, WebP) vienen en el mismo archivo
  const relieve = new HeightStore(meta, 'data/terrain'); await relieve.init();   // vista general ligera; el detalle se pide por zonas
  $('#load-text').textContent = 'Preparando el mapa…'; window.Carga?.paso(2);

  // — motor —
  const canvas = $('#gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight, false);
  instalaNiebla();   // niebla de valle (antes de crear ningún material)
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(HORIZON, 24000, 100000);
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 60, 260000);
  const sky = makeSky(); scene.add(sky);
  renderer.setClearColor(HORIZON);
  const hemi = new THREE.HemisphereLight(0xe6eef6, 0x6d7466, 0.78 * Math.PI);
  const sun = new THREE.DirectionalLight(0xffffff, 0.62 * Math.PI);
  scene.add(hemi, sun);

  const geo = makeGeo(meta, relieve);
  const terrain = new Terrain({ scene, meta, store: relieve, geo, renderer, base: 'data/terrain', movil: isMobile() || matchMedia('(pointer: coarse)').matches });
  const banderines = crearBanderines({ scene, geo });
  const veg = crearVegetacion({ scene, geo, meta, terrain, movil: terrain.movil });
  const cumbres = crearCumbres({ scene, geo, terrain, movil: terrain.movil, alCargar: (r) => veg.refrescar(r), fijo: () => S.active });
  const clouds = new Clouds(scene, geo);
  const lagos = await crearLagos({ scene, geo, url: 'data/lagos.json', meta }).catch((e) => { console.warn('lagos', e); return null; });
  window.Carga?.paso(3);
  const sonido = crearSonido();

  // — cumbres activas (dentro del terreno cargado) —
  const params = new URLSearchParams(location.search);
  const activos = params.has('todos') ? data.picos.map((p) => p.id) : [...data.activos, ...menores.picos.map((p) => p.id)];
  const macizoName = Object.fromEntries(data.macizos.map((m) => [m.id, m.nombre]));
  const difName = Object.fromEntries(data.dificultades.map((d) => [d.id, d.nombre]));
  const difN = { moderada: 1, alta: 2, 'muy-alta': 3 };
  // todas las cumbres del proyecto; solo las `activo` tienen ficha, ruta y hitos (el resto sale como «Próximamente»)
  const peaks = data.picos.map((p) => {
    const q = geo.toXZ(p.lon, p.lat);
    return { ...p, q, activo: activos.includes(p.id), inside: Math.abs(q.x) < geo.W / 2 - 800 && Math.abs(q.z) < geo.D / 2 - 800, w: { x: q.x, y: p.altitud * geo.hs / meta.hscale - 40, z: q.z } };
  }).filter((p) => p.inside).sort((a, b) => b.altitud - a.altitud);
  const byId = Object.fromEntries(peaks.map((p) => [p.id, p]));
  const activas = new Set(peaks.filter((p) => p.activo).map((p) => p.id));
  const bal = peaks.find((p) => p.id === 'balaitus');
  const aves = bal && !reduced ? crearAves({ scene, geo, centro: { x: bal.w.x, z: bal.w.z } }) : null;
  const pDef = byId.perdido || bal;
  const fauna = pDef && !reduced ? crearFauna({ scene, geo, centro: { x: pDef.w.x, z: pDef.w.z }, camera, sol: sun.position, lagos }) : null;

  // recorridos: los datos se leen al arrancar; el dibujo sobre el relieve se crea al abrir el pico, cuando ya hay alturas finas
  const rutas = {}, rutaDatos = {};
  for (const p of peaks) for (const rid of p.activo ? p.rutas ?? [] : []) {
    try {
      const ruta = await cargarRuta(rid);
      if (!ruta.fuenteUrl || !ruta.autor) { console.warn(`Ruta ${rid} sin autor o sin enlace a su ficha: no se muestra`); continue; }
      (rutaDatos[p.id] ??= []).push(ruta);
    } catch { /* sin ruta en esta copia */ }
  }
  const rutasDe = (id) => rutas[id] ?? [];
  fauna?.setAmenazas(() => { const out = []; if (S.active) for (const r of rutasDe(S.active)) if (r.visible) { const ps = r.posiciones(); for (const q of ps.equipo) out.push(q); out.push(ps.solo); } return out; });   // los rebecos se alejan de los montañeros
  let rutaOn = true;

  // etiquetas de ibones (solo con la cámara cerca)
  const lagoEls = [];
  const añadirLagos = (nuevos) => { for (const l of nuevos) { const el = document.createElement('span'); el.className = 'lago is-hidden'; el.textContent = l.nombre; $('#pins').appendChild(el); lagoEls.push({ l, el }); } };
  // etiquetas de pueblos y aldeas (OpenStreetMap): los grandes se ven de más lejos, las aldeas solo de cerca
  const puebloEls = [];
  json('data/pueblos.json').then((lista) => {
    for (const [nombre, lon, lat, tipo, pob] of lista) {
      const q = geo.toXZ(lon, lat);
      if (Math.abs(q.x) > geo.W / 2 || Math.abs(q.z) > geo.D / 2) continue;
      const grande = tipo === 'village' && pob >= 500, el = document.createElement('span');
      el.className = `pueblo ${grande ? 'pueblo-grande' : tipo === 'hamlet' ? 'pueblo-aldea' : ''} is-hidden`; el.textContent = nombre; $('#pins').appendChild(el);
      puebloEls.push({ x: q.x, z: q.z, lim: grande ? 42000 : tipo === 'hamlet' ? 9000 : 22000, el });
    }
  }).catch(() => {});
  // al llegar las alturas de un bloque se dibujan sus ibones y se afina la posición de sus cumbres
  relieve.onLevel((i, j, nivel) => {
    if (nivel > 2) return;
    if (lagos) añadirLagos(lagos.construirBloque(i, j));
    const CH = meta.chunk;
    for (const p of peaks) {
      const pi = Math.min(meta.nci - 1, Math.floor((p.q.x + geo.W / 2) / geo.dx / CH)), pj = Math.min(meta.ncj - 1, Math.floor((p.q.z + geo.D / 2) / geo.dz / CH));
      if (pi === i && pj === j) p.w = geo.summitNear(p.q.x, p.q.z, nivel === 1 ? 90 : 160);
    }
  });

  // — controles —
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.09, screenSpacePanning: false, zoomToCursor: true, minDistance: 500, maxDistance: 90000, maxPolarAngle: 1.4, rotateSpeed: 0.6, zoomSpeed: 0.9, enabled: false });
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  // con el dedo (móvil/tableta) el mapa se movía demasiado deprisa: arrastre, giro y zoom algo más lentos para poder afinar
  const TACTIL = matchMedia('(pointer: coarse)').matches;
  const VEL = TACTIL ? { pan: 0.65, rot: 0.42, zoom: 0.65 } : { pan: 1, rot: 0.6, zoom: 0.9 };
  if (TACTIL) Object.assign(controls, { panSpeed: VEL.pan, rotateSpeed: VEL.rot, zoomSpeed: VEL.zoom, dampingFactor: 0.14 });   // algo menos de inercia con el dedo: el mapa se para antes al soltar
  // cerca del suelo todo va más despacio: la velocidad de arrastre, giro y zoom baja con la altura de la cámara sobre el relieve
  // (a 3 km o más, la de siempre; a 300 m, alrededor de un tercio), con un cambio suave para que no dé saltos
  let kVel = 1;
  function ajustaVelocidad(dt) {
    const h = camera.position.y - geo.heightAt(camera.position.x, camera.position.z), dT = camera.position.distanceTo(controls.target);
    const obj = clamp(Math.min(h, dT) / 3000, 0.3, 1);
    kVel += (obj - kVel) * Math.min(1, dt * 4);
    controls.panSpeed = VEL.pan * kVel; controls.rotateSpeed = VEL.rot * (0.45 + 0.55 * kVel); controls.zoomSpeed = VEL.zoom * (0.6 + 0.4 * kVel);
  }
  controls.addEventListener('start', () => { callaHasta = 0; });   // el usuario mueve el mapa: ya pueden salir los nombres cercanos que quepan

  const S = { mode: 'intro', active: null, flight: null, shift: { x: 0, y: 0 }, shiftTo: { x: 0, y: 0 }, sun: 0, look: { to: LOOK[0], hemiK: 0.74, glowK: 1, ini: false }, bruma: { k: 0.8, t: 0.55, to: BRUMA[0] }, plegada: false, sheetH: null, vuelo: null, hovered: null, filters: { macizo: new Set(), dif: new Set(), alt: 3000, hecho: null }, capa: ['tres', 'menos', 'todos'].includes(store.get('capa')) ? store.get('capa') : 'tres' };
  // capa: qué cumbres se ven en el mapa y en los selectores (tresmiles, las de menos de 3.000 o todas)
  const enCapa = (p) => S.capa === 'todos' || (S.capa === 'menos') === !!p.menor;

  // — estados de cámara —
  const hq = geo.toXZ(-0.05, 42.79);
  const HOME = { t: new THREE.Vector3(hq.x, 1400, hq.z), theta: 0.1, phi: 0.66, r: 70000 };
  const camState = () => {
    const o = camera.position.clone().sub(controls.target); const r = o.length();
    return { t: controls.target.clone(), r, phi: Math.acos(clamp(o.y / r, -1, 1)), theta: Math.atan2(o.x, o.z) };
  };
  const applyState = (s) => {
    const sp = Math.sin(s.phi);
    camera.position.set(s.t.x + s.r * sp * Math.sin(s.theta), s.t.y + s.r * Math.cos(s.phi), s.t.z + s.r * sp * Math.cos(s.theta));
    const g = geo.heightAt(camera.position.x, camera.position.z) + (S.detalle ? 22 : 140);
    if (camera.position.y < g) camera.position.y = g;
    controls.target.copy(s.t); camera.lookAt(s.t);
  };
  const peakState = (p, plegada = S.plegada) => {
    const R = rutaOn ? rutasDe(p.id)[0] : null;
    if (R) {
      // con ruta: se encuadra todo el recorrido, no solo la cumbre
      const x = lerp(p.w.x, R.centro.x, 0.6), z = lerp(p.w.z, R.centro.z, 0.6);
      return { t: new THREE.Vector3(x, p.w.y - 900, z), theta: p.vista?.theta ?? -0.42, phi: 0.95, r: clamp(R.extension * (isMobile() ? (plegada ? 1.9 : 3.2) : plegada ? 1.15 : 1.5), 4300, 18000) };
    }
    return { t: new THREE.Vector3(p.w.x, p.w.y - 60, p.w.z), theta: p.vista?.theta ?? -0.42, phi: p.vista?.phi ?? 1.17, r: p.vista?.r ?? 4300 };
  };
  const sheetH = () => S.sheetH ?? Math.min(innerHeight * 0.66, 620);
  const viewShift = () => (isMobile() ? { x: 0, y: S.plegada ? 30 : sheetH() / 2 } : { x: S.plegada ? 0 : Math.min(460, innerWidth) / 2, y: 0 });

  function flyTo(state, { dur, shift = { x: 0, y: 0 }, instant = false } = {}) {
    S.shiftTo = shift;
    controls.enabled = false;
    if (instant || reduced) { applyState(state); S.shift = { ...shift }; S.flight = null; finishFlight(); return Promise.resolve(); }
    const a = camState();
    const hd = Math.hypot(a.t.x - state.t.x, a.t.z - state.t.z);
    const d = dur ?? clamp(1.6 + hd / 9000 + Math.abs(Math.log(a.r / state.r)) * 0.5, 1.8, 4.6);
    return new Promise((res) => { S.flight = { a, b: state, k: 0, d, arc: Math.min(0.7, hd / 32000), done: res }; });
  }
  function finishFlight() {
    if (S.mode !== 'intro') { controls.enabled = true; controls.update(); }
  }
  function tickFlight(dt) {
    const F = S.flight; F.k = Math.min(1, F.k + dt / F.d);
    const e = ease(F.k), { a, b } = F;
    const r = Math.exp(lerp(Math.log(a.r), Math.log(b.r), e)) * (1 + F.arc * Math.sin(Math.PI * e));
    applyState({ t: a.t.clone().lerp(b.t, e), theta: a.theta + wrapPi(b.theta - a.theta) * e, phi: lerp(a.phi, b.phi, e), r });
    if (F.k >= 1) { S.flight = null; finishFlight(); F.done(); }
  }

  // — marcadores —
  const pinsEl = $('#pins');
  const pinEls = new Map();
  for (const p of peaks) {
    const b = document.createElement('button');
    b.className = `pin is-hidden${p.activo ? '' : ' pin-prox'}${p.clase && p.clase !== 'principal' ? ' pin-sec' : ''}${p.menor ? ' pin-menor' : ''}`; b.type = 'button'; b.dataset.id = p.id;
    b.setAttribute('aria-label', p.activo ? `${p.nombre}, ${fmt(p.altitud)} metros. Abrir ficha` : `${p.nombre}, ${fmt(p.altitud)} metros. Próximamente`);
    b.innerHTML = `<span class="pin-label">${esc(p.nombre)}<i>${fmt(p.altitud)} m${p.activo ? '' : ' · Próximamente'}</i></span><span class="pin-stem" aria-hidden="true"></span>`;
    b.addEventListener('click', () => (p.activo ? openPeak(p.id) : verPrevia(p)));
    if (p.foto && !p.menor) b.dataset.mini = `img/mini/${p.id}.webp`;   // miniatura de la ficha dentro del círculo (se carga al acercarse)
    pinsEl.appendChild(b); pinEls.set(p.id, b);
  }
  const tmp = new THREE.Vector3();

  // — tocar cualquier punto del mapa: dice el pico con nombre más cercano (OpenStreetMap, se descarga la primera vez) —
  let picosOSM = null, picoSel = null, picoTimer = 0;
  const picoEl = document.createElement('div'); picoEl.className = 'pico-osm is-hidden'; picoEl.hidden = true; $('#pins').appendChild(picoEl);
  const cargaPicos = () => (picosOSM ??= json('data/picos_osm.json').then((l) => l.map(([nombre, lon, lat, ele]) => ({ nombre, ele, ...geo.toXZ(lon, lat) }))).catch(() => []));
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function puntoDelRelieve(cx, cy) {
    ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin, d = ray.ray.direction; let t = 0, prev = 0;
    for (let i = 0; i < 2600; i++) {
      t += Math.max(30, t * 0.012);
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (Math.abs(x) > geo.W / 2 || Math.abs(z) > geo.D / 2) return null;
      if (y < geo.heightAt(x, z)) { let a = prev, b = t; for (let k = 0; k < 14; k++) { const m = (a + b) / 2; if (o.y + d.y * m < geo.heightAt(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; } return { x: o.x + d.x * b, z: o.z + d.z * b }; }
      prev = t;
    }
    return null;
  }
  async function nombrePico(cx, cy) {
    const pt = puntoDelRelieve(cx, cy); if (!pt) return;
    const lista = await cargaPicos(); if (!lista.length) return;
    const dist = Math.hypot(pt.x - camera.position.x, pt.z - camera.position.z);
    const radio = clamp(dist * 0.05, 500, 1800);   // cuanto más lejos está la cámara, más margen al tocar
    let mejor = null, md = 1e18;
    for (const p of lista) { const d = Math.hypot(p.x - pt.x, p.z - pt.z) - (p.ele ? (p.ele - 2000) / 40 : 0); if (d < md && Math.hypot(p.x - pt.x, p.z - pt.z) < radio) { md = d; mejor = p; } }
    clearTimeout(picoTimer);
    if (!mejor) { picoSel = null; picoEl.hidden = true; return; }
    const y = geo.heightAt(mejor.x, mejor.z);
    picoSel = { x: mejor.x, y, z: mejor.z };
    picoEl.innerHTML = `<b>${esc(mejor.nombre)}</b><i>${mejor.ele ? `${fmt(mejor.ele)} m` : 'altitud sin datos'}</i>`;
    picoEl.hidden = false; picoEl.classList.remove('is-hidden');
    picoTimer = setTimeout(() => { picoSel = null; picoEl.hidden = true; }, 7000);
  }
  let toque = null;
  canvas.addEventListener('pointerdown', (e) => { toque = { x: e.clientX, y: e.clientY, t: performance.now() }; if (picoSel) { picoSel = null; picoEl.hidden = true; } });
  canvas.addEventListener('pointerup', (e) => {
    if (!toque || S.mode !== 'explore' || S.vuelo || S.flight) { toque = null; return; }
    const mov = Math.hypot(e.clientX - toque.x, e.clientY - toque.y), dur = performance.now() - toque.t; toque = null;
    if (mov < 7 && dur < 450) nombrePico(e.clientX, e.clientY);
  });
  function occluded(pt) {
    const c = camera.position;
    for (let i = 1; i <= 26; i++) {
      const t = i / 27;
      const x = lerp(c.x, pt.x, t), y = lerp(c.y, pt.y, t), z = lerp(c.z, pt.z, t);
      if (geo.heightAt(x, z) > y + 14) return true;
    }
    return false;
  }
  let cimaCerca = null;   // cumbre con detalle propio a menos de 450 m de la cámara: su marcador se eleva y se aclara para dejar ver la cima
  function updatePins() {
    const W = innerWidth, H = innerHeight; const cimaPrev = cimaCerca; cimaCerca = null;
    obstaculos.length = 0; pinAct = null; candPicos.length = 0;
    if (picoSel) {   // pico que se ha tocado en el mapa
      tmp.set(picoSel.x, picoSel.y + 10, picoSel.z); tmp.project(camera);
      const ok = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
      picoEl.classList.toggle('is-hidden', !ok);
      if (ok) picoEl.style.transform = `translate3d(${((tmp.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-tmp.y * 0.5 + 0.5) * H).toFixed(1)}px, 0)`;
    }
    for (const p of peaks) {
      const el = pinEls.get(p.id);
      tmp.set(p.w.x, p.w.y + 25, p.w.z);
      const dist = camera.position.distanceTo(tmp);
      // fuera de la capa elegida no se ven; las de menos de 3.000 solo de cerca (para no llenar el mapa de puntos)
      if (S.active !== p.id && (!enCapa(p) || (p.menor && dist > 22000))) { if (!el._fuera) { el._fuera = true; el.classList.add('is-hidden'); el.classList.remove('show-label'); el._lv = false; } continue; }
      el._fuera = false;
      const wp = p._wDet || p.w;   // con detalle de cima cerca, el punto es el máximo real de la pieza fina (el del relieve general queda en la ladera)
      tmp.set(wp.x, wp.y + 3, wp.z); tmp.project(camera);   // punto de la cumbre; el círculo se dibuja LIFT píxeles más arriba, unido por un hilo fino
      // con la cámara pegada a una cima con detalle, los marcadores de las demás cumbres (flotan sobre el relieve) se ocultan: parecían delante de la cima
      const show = !(cimaPrev && p.w !== cimaPrev) && S.mode === 'explore' && tmp.z < 1 && Math.abs(tmp.x) < 1.08 && Math.abs(tmp.y) < 1.08 && !occluded({ x: p.w.x, y: p.w.y + 25, z: p.w.z });
      el.classList.toggle('is-hidden', !show);
      if (!show) continue;
      const det = dist < 450 && cumbres.detalle.includes(p.id);
      if (det) { cimaCerca = p.w; if (!p._wDet) p._wDet = geo.summitNear(p.w.x, p.w.z, 70); } else if (p._wDet && dist > 600) p._wDet = null;
      // el círculo se eleva poco a poco al acercarse (de 34/38 px a 2.250 u hasta el máximo a 450 u): con la cámara cerca deja ver la cima, y de lejos no se pega al relieve
      const base = isMobile() ? 38 : 34, tope = cumbres.ficha()?.[p.id] ? (isMobile() ? 160 : 140) : (isMobile() ? 76 : 66);
      const otra = !!S.active && S.active !== p.id;   // con una cumbre abierta, solo ella sube del todo: las demás se quedan a ras para no llenar el cielo de globos
      let LIFT = p.menor ? 0 : otra ? base : det ? tope : base + (tope - base) * Math.pow(1 - Math.min(1, Math.max(0, (dist - 450) / 1800)), 2);
      if (!p.menor) {   // y sin meterse bajo el título: si el círculo cae sobre la cabecera, sube solo hasta donde cabe
        const cab = uiRects.find((u) => u.cab && u.w > 120), pyPunto = (-tmp.y * 0.5 + 0.5) * H, pxPunto = (tmp.x * 0.5 + 0.5) * W;
        if (cab && pxPunto > cab.x - 24 && pxPunto < cab.x + cab.w + 24) LIFT = Math.max(base, Math.min(LIFT, pyPunto - (cab.y + cab.h + 26)));
      }
      // ruta absoluta: la variable CSS se resuelve desde css/
      if (el.dataset.mini && dist < 38000) { el.style.setProperty('--foto', `url("${new URL(el.dataset.mini, location.href).href}")`); el.classList.add('con-foto'); delete el.dataset.mini; }
      el.classList.toggle('pin-alto', det); el.classList.toggle('pin-muycerca', det && dist < 230); el.classList.toggle('pin-pegado', det && dist < 150);   // pegado a la cima: el marcador casi desaparece para no tapar la cruz o el pilar
      if (!p.menor && Math.abs((el._lift || 0) - LIFT) > 1) { el._lift = LIFT; el.style.setProperty('--lift', LIFT.toFixed(1) + 'px'); }   // el hilo mide lo mismo que la elevación
      el.style.transform = `translate3d(${((tmp.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-tmp.y * 0.5 + 0.5) * H - LIFT).toFixed(1)}px, 0)`;
      { const px = (tmp.x * 0.5 + 0.5) * W, py = (-tmp.y * 0.5 + 0.5) * H - LIFT;
        const lb = el.firstElementChild, act = S.active === p.id;
        if (act) pinAct = { el, lb, px, py, id: p.id };   // su marcador y su etiqueta se colocan después (colocaEtiquetaActiva)
        else {
          const obs = { x: px - 22, y: py - 22, w: 44, h: 44 }; obstaculos.push(obs);
          if (el._cl) { lb.style.cssText = ''; el._cl = false; }   // deja de ser la cumbre abierta: etiqueta a su sitio de siempre
          if (lb && p.activo && (!p.menor || dist < 5000)) candPicos.push({ el, lb, px, py, dist, obs, menor: p.menor });   // su nombre solo sale si hay hueco (etiquetasPicos)
        } }
      if (S.active === p.id) { el.classList.remove('pin-agr'); el._agr = false; }
      el.classList.toggle('is-active', S.active === p.id);
      el.classList.toggle('is-other', !!S.active && S.active !== p.id && p.activo);
      el.classList.toggle('show-label', S.active === p.id || (!S.active && !!el._lv));   // los demás nombres los decide etiquetasPicos
      el.classList.toggle('is-dim', !passes(p));
      { const k = S.active === p.id ? 1 : Math.min(1, Math.max(0.72, 1.25 - dist / 36000)); if (Math.abs((el._k ?? 1) - k) > 0.02) { el._k = k; el.style.setProperty('--k', k.toFixed(2)); } }   // el círculo se hace algo más pequeño cuanto más lejos está la cámara
    }
  }

  // círculos amontonados: de cada grupo a menos de ~22 px (30 para volver a mostrarlo, sin parpadeos) solo se queda el más cercano a la cámara; la cumbre abierta siempre se queda
  function agrupaPines() {
    const keep = pinAct ? [{ px: pinAct.px, py: pinAct.py }] : [];
    for (const c of candPicos.filter((q) => !q.menor).sort((a, b) => a.dist - b.dist)) {
      const r = c.el._agr ? 30 : 22, choca = keep.some((k) => Math.hypot(k.px - c.px, k.py - c.py) < r);
      if (choca !== !!c.el._agr) { c.el._agr = choca; c.el.classList.toggle('pin-agr', choca); }
      if (!choca) keep.push(c);
    }
    // con una cumbre abierta solo las 6 más cercanas se ven con normalidad; el resto, tenues
    const otras = candPicos.filter((q) => !q.menor && !q.el._agr).sort((a, b) => a.dist - b.dist);
    otras.forEach((c, k) => { const t = !!S.active && k >= 6; if (t !== !!c.el._ten) { c.el._ten = t; c.el.classList.toggle('pin-tenue', t); } });
  }

  // — etiqueta de la cumbre abierta: va al lado del marcador (derecha, izquierda, debajo o encima), en un hueco libre —
  const candPicos = []; let callaHasta = 0;
  let pinAct = null; const labAct = { id: null, lado: null, cnt: 0, x: 0, y: 0 };
  // — nombres de las demás cumbres: ocultos por defecto; solo salen unos pocos, cerca de la cámara y si caben sin pisar nada —
  function etiquetasPicos() {
    const W = innerWidth, H = innerHeight;
    const hay = !S.active && S.mode === 'explore' && !S.vuelo && performance.now() > callaHasta;   // al cerrar la ficha, el terreno queda despejado hasta que el usuario lo mueva
    const LIM = 7000, MAX = isMobile() ? 2 : 4;
    let n = 0;
    const lista = hay ? candPicos.filter((c) => c.dist < LIM).sort((a, b) => (a.menor ? 1 : 0) - (b.menor ? 1 : 0) || a.dist - b.dist) : [];
    for (const c of candPicos) if (!lista.includes(c)) { c.el._lv = false; c.el._n = 0; c.el.classList.remove('show-label'); }
    for (const c of lista) {
      const el = c.el;
      if (el._lk !== 'n' || el._lwW !== W) { el._lk = 'n'; el._lwW = W; el._lw = c.lb.offsetWidth; el._lh = c.lb.offsetHeight; }
      const b = { x: c.px - el._lw / 2, y: c.py + 21, w: el._lw, h: el._lh };
      let cabe = n < MAX && b.x > 6 && b.x + b.w < W - 6 && b.y > 6 && b.y + b.h < H - 6;
      if (cabe) for (const u of uiRects) if (hayChoque(b, u, 6)) { cabe = false; break; }
      if (cabe) for (const q of obstaculos) if (q !== c.obs && hayChoque(b, q, 3)) { cabe = false; break; }
      if (!!el._lv !== cabe) { el._n = (el._n || 0) + 1; if (el._n > (cabe ? 10 : 3)) { el._lv = cabe; el._n = 0; } } else el._n = 0;   // sin parpadeos: salir pide 10 fotogramas seguidos con hueco; ocultarse, solo 3 (nunca se queda pisando a otra)
      el.classList.toggle('show-label', !!el._lv);
      if (el._lv) { n++; obstaculos.push(b); }
    }
  }
  const rutaPts = new WeakMap();
  const puntosRuta = (r) => { let a = rutaPts.get(r); if (!a) { a = []; const n = Math.min(160, Math.max(40, Math.round(r.ruta.distancia / 120))); for (let i = 0; i <= n; i++) a.push(r.en(r.ruta.distancia * i / n).pos); rutaPts.set(r, a); } return a; };
  const rtmp = new THREE.Vector3();
  function colocaEtiquetaActiva(dt) {
    const P = pinAct; if (!P || !P.lb) return;
    const W = innerWidth, H = innerHeight, { el, lb, px, py } = P;
    const clave = P.id + '|' + W;
    if (el._lc !== clave) { el._lc = clave; lb.style.cssText = ''; el._lw = lb.offsetWidth; el._lh = lb.offsetHeight; }   // medida con su estilo de cumbre abierta
    const w = el._lw, h = el._lh, gap = 26;
    // recorrido dibujado, en pantalla (segmentos sueltos)
    const seg = [];
    for (const r of rutasDe(P.id)) if (r.visible) {
      let prev = null;
      for (const q of puntosRuta(r)) { rtmp.copy(q).project(camera); const cur = rtmp.z < 1 ? { x: (rtmp.x * 0.5 + 0.5) * W, y: (-rtmp.y * 0.5 + 0.5) * H } : null; if (prev && cur) seg.push([prev, cur]); prev = cur; }
    }
    const cajas = {
      derecha: { x: px + gap, y: py - h / 2 }, izquierda: { x: px - gap - w, y: py - h / 2 },
      debajo: { x: px - w / 2, y: py + gap }, encima: { x: px - w / 2, y: py - gap - h },
      encimaDer: { x: px + 16, y: py - gap - h }, encimaIzq: { x: px - 16 - w, y: py - gap - h },
      debajoDer: { x: px + 16, y: py + gap }, debajoIzq: { x: px - 16 - w, y: py + gap },
    };
    const orden = (px < W / 2 ? ['derecha', 'izquierda'] : ['izquierda', 'derecha']).concat(['encima', 'debajo'], px < W / 2 ? ['encimaDer', 'debajoDer', 'encimaIzq', 'debajoIzq'] : ['encimaIzq', 'debajoIzq', 'encimaDer', 'debajoDer']);
    const roce = (b) => {   // 0 = hueco libre
      let n = 0;
      if (b.x < 6 || b.x + w > W - 6 || b.y < 6 || b.y + h > H - 6) n += 12;   // el texto entero siempre dentro de la pantalla
      const bb = { x: b.x, y: b.y, w, h };
      for (const u of uiRects) if (hayChoque(bb, u, 6)) n += u.cab ? 30 : 6;   // el título pesa mucho más: la etiqueta no se pone encima de «Tresmiles»
      for (const q of obstaculos) if (hayChoque(bb, q, 3)) n += 2;
      for (const [a, c] of seg) {   // ¿cruza la ruta naranja?
        const L = Math.hypot(c.x - a.x, c.y - a.y), k = Math.max(1, Math.ceil(L / 10));
        for (let i = 0; i <= k; i++) { const x = a.x + (c.x - a.x) * i / k, y = a.y + (c.y - a.y) * i / k; if (x > b.x - 4 && x < b.x + w + 4 && y > b.y - 4 && y < b.y + h + 4) { n += 1; break; } }
      }
      return n;
    };
    let mejor = null, mn = 1e9;
    const pun = {}; for (const lado of orden) { pun[lado] = roce(cajas[lado]); if (pun[lado] < mn) { mn = pun[lado]; mejor = lado; } }
    if (labAct.id !== P.id) { labAct.id = P.id; labAct.lado = mejor; labAct.cnt = 0; labAct.x = null; }
    else if (pun[labAct.lado] > 0 && mejor !== labAct.lado && pun[mejor] < pun[labAct.lado]) { if (++labAct.cnt > 12) { labAct.lado = mejor; labAct.cnt = 0; } }   // solo cambia de lado si el actual lleva un rato molestando
    else labAct.cnt = 0;
    const b = cajas[labAct.lado];
    const mitad = el.offsetWidth / 2;   // la caja del marcador mide 30 o 44 px según el puntero
    const tx = b.x - (px - mitad), ty = b.y - (py - mitad);
    if (labAct.x == null) { labAct.x = tx; labAct.y = ty; }
    else { const k = 1 - Math.exp(-Math.min(dt, 0.05) * 10); labAct.x += (tx - labAct.x) * k; labAct.y += (ty - labAct.y) * k; }
    lb.style.left = '0'; lb.style.top = '0'; lb.style.transform = `translate3d(${labAct.x.toFixed(1)}px, ${labAct.y.toFixed(1)}px, 0)`;
    el._cl = true;
    obstaculos.push({ x: px - 22, y: py - 22, w: 44, h: 44 }, { x: px - mitad + labAct.x, y: py - mitad + labAct.y, w, h });   // marcador y etiqueta: ocupados para los nombres geográficos
  }

  // hitos de la ruta y refugios (coordenadas de OpenStreetMap)
  const TIPO_HITO = { refugio: 'Refugio', paso: 'Paso', vivac: 'Vivac', cima: 'Cima', ibon: 'Ibón', barranco: 'Barranco', lugar: 'Lugar' };
  const fotosHitos = await json('data/fotos_hitos.json').catch(() => ({}));
  let hitoTimer = 0;
  const hitosDatos = await json('data/hitos.json').catch(() => []);
  window.Carga?.paso(4);
  const hitos = [];
  const kmTexto = (o, id) => { const R = rutasDe(id)[0], ps = R ? R.pasos(o.x, o.z) : []; return ps.length ? ` · km ${ps.map((c) => km(c.dist)).join(' y ')} del recorrido` : ''; };
  // los hitos de un pico se crean al abrirlo (cuando ya hay alturas finas bajo ellos)
  const normNombre = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\(.*?\)/g, '').replace(/\b(cima|del|de|la|las|los|el|pico|pic|punta|tuca|gran|pequeno)\b/g, '').replace(/[^a-z0-9]/g, '');
  function crearHitosDe(picoId) {
    for (const h of hitosDatos) {
      const picos = h.picos ?? [h.pico ?? 'balaitus'];
      if (!picos.includes(picoId) || h._hecho) continue;
      const q = geo.toXZ(h.lon, h.lat);
      if (Math.abs(q.x) > geo.W / 2 - 800 || Math.abs(q.z) > geo.D / 2 - 800) continue;
      h._hecho = true;
      const el = document.createElement('span'); el.className = `hito hito-${h.tipo}${h.inicio ? ' hito-inicio' : ''} is-hidden`;
      el.innerHTML = `<button type="button" class="hito-btn" aria-expanded="false" aria-label="${esc(h.nombre)}"><i></i></button><b>${esc(h.nombre)}<em>${esc(TIPO_HITO[h.tipo] ?? '')}</em>${fotoHito(h)}</b>`;
      if (h.foto && fotosHitos[h.foto]) { el.classList.add('con-foto'); if (fotosHitos[h.foto].w / fotosHitos[h.foto].h > 2.5) el.classList.add('pano'); }
      el.title = h.nota; $('#pins').appendChild(el);
      el.querySelector('.hito-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const abrir = !el.classList.contains('is-open');
        closeHitos(); if (abrir) { el.classList.add('is-open'); e.currentTarget.setAttribute('aria-expanded', 'true'); if (el.classList.contains('con-foto')) hitoTimer = setTimeout(closeHitos, 15000); }
      });
      // el hito «Cima» que lleva el nombre de la cumbre se coloca en el punto de la cumbre (si no, el relieve fino los separa y salen dos marcadores y dos nombres)
      let hx = q.x, hz = q.z, hy = geo.heightAt(q.x, q.z) + 12, fusion = null;
      if (h.tipo === 'cima') { const nh = normNombre(h.nombre), pc = peaks.find((p) => picos.includes(p.id) && p.w && normNombre(p.nombre) === nh && Math.hypot(p.q.x - q.x, p.q.z - q.z) < 250); if (pc) { hx = pc.w.x; hz = pc.w.z; hy = pc.w.y + 12; fusion = pc; } }
      hitos.push({ fusion: fusion ? fusion.id : null, h, el, picos, kms: {}, tipoTxt: h.inicio ? 'Inicio del recorrido' : (TIPO_HITO[h.tipo] ?? ''), last: null, x: hx, y: hy, z: hz });
    }
  }
  function figCima(p) {
    const c = p.fotoCima, f = c && fotosHitos[c.foto]; if (!f) return '';
    return `<figure class="fig-cima"><img src="img/hitos/${esc(c.foto)}.jpg" width="${f.w}" height="${f.h}" alt="${esc(c.pie)}" loading="lazy"><figcaption>${esc(c.pie)} Foto: ${esc(f.autor)}.</figcaption></figure>`;
  }
  function fotoHito(h) {
    const f = fotosHitos[h.foto]; if (!f) return '';
    return `${h.pie ? `<p class="hito-pie">${esc(h.pie)}</p>` : ''}<img src="img/hitos/${esc(h.foto)}.jpg" width="${f.w}" height="${f.h}" alt="${esc(h.nombre)}" loading="lazy"${f.pos ? ` style="object-position:${esc(f.pos)}"` : ''}><small>Foto: ${esc(f.autor)}${f.licencia ? `, <a href="${esc(f.licencia_url || f.pagina)}" target="_blank" rel="noopener">${esc(f.licencia.replace('Public domain', 'Dominio público'))}</a>` : ''}${f.pagina ? `, vía <a href="${esc(f.pagina)}" target="_blank" rel="noopener">${esc(f.fuente || 'Wikimedia Commons')}</a>` : ''}</small>`;
  }
  function closeHitos() { clearTimeout(hitoTimer); for (const o of hitos) { o.el.classList.remove('is-open'); o.el.querySelector('.hito-btn').setAttribute('aria-expanded', 'false'); } }
  addEventListener('pointerdown', (e) => { if (!e.target.closest?.('.hito')) closeHitos(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHitos(); });
  const hitoTmp = new THREE.Vector3();
  function updateHitos() {
    const W = innerWidth, H = innerHeight;
    for (const o of hitos) {
      hitoTmp.set(o.x, o.y, o.z);
      const dist = camera.position.distanceTo(hitoTmp);
      // solo los hitos de la cumbre abierta (o compartidos con ella)
      let show = S.mode === 'explore' && !!S.active && o.picos.includes(S.active) && dist < 15000;
      if (show && o.fusion && o.fusion === S.active) show = false;   // el hito «Cima» de la cumbre abierta ya lo representa su círculo
      if (show && cimaCerca && Math.hypot(o.x - cimaCerca.x, o.z - cimaCerca.z) < 60) show = false;   // de cerca, el rombo de la cima no tapa los objetos de la cumbre
      if (show && o.last !== S.active) { o.last = S.active; o.kms[S.active] ??= kmTexto(o, S.active); o.el.querySelector('em').textContent = o.tipoTxt + (o.h.inicio ? '' : o.kms[S.active]); }
      if (show) { hitoTmp.project(camera); show = hitoTmp.z < 1 && Math.abs(hitoTmp.x) < 1.05 && Math.abs(hitoTmp.y) < 1.05 && !occluded({ x: o.x, y: o.y + 10, z: o.z }); }
      if (show && pinAct && Math.hypot((hitoTmp.x * 0.5 + 0.5) * W - pinAct.px, (-hitoTmp.y * 0.5 + 0.5) * H - pinAct.py) < 44) show = false;   // no se pega al círculo de la cumbre abierta
      o.el.classList.toggle('is-hidden', !show);
      if (!show) o.el.classList.remove('is-open');
      if (show) o.el.classList.toggle('abajo', (-hitoTmp.y * 0.5 + 0.5) * H < (o.el.classList.contains('con-foto') ? 340 : 90));
      if (show) o.el.style.transform = `translate3d(${((hitoTmp.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-hitoTmp.y * 0.5 + 0.5) * H).toFixed(1)}px, 0)`;
      if (show) obstaculos.push({ x: (hitoTmp.x * 0.5 + 0.5) * W - 14, y: (-hitoTmp.y * 0.5 + 0.5) * H - 14, w: 28, h: 28 });
    }
  }

  // — nombres geográficos (ibones y pueblos): se reparten para que no se pisen entre ellos ni con marcadores, brújula o controles —
  const etiquetas = [], obstaculos = [];
  let uiRects = [], uiT = 0;
  const hayChoque = (a, b, m) => a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;
  function distribuyeEtiquetas(dt) {
    const W = innerWidth, H = innerHeight;
    if (!etiquetas.length) return;
    if (--uiT <= 0) {   // rectángulos de la interfaz fija (se refrescan de vez en cuando)
      uiT = 30; uiRects = [];
      for (const el of document.querySelectorAll('#compass, #tools, #dock, #ficha, #filters, #vuelo-hud, #brand, #btn-about, #btn-reintro, #giro-izq, #giro-der')) {
        const r = el.getBoundingClientRect(); if (!(r.width && r.height && r.right > 0 && r.left < W)) continue;
        const m = el.id === 'brand' ? [14, 6, 14, 14] : el.id === 'btn-about' || el.id === 'btn-reintro' ? [6, 4, 6, 6] : [0, 0, 0, 0];   // el encabezado deja un margen: nada de nombres encima ni justo debajo
        uiRects.push({ x: r.left - m[0], y: r.top - m[1], w: r.width + m[0] + m[2], h: r.height + m[1] + m[3], cab: el.id === 'brand' || el.id === 'btn-about' || el.id === 'btn-reintro' });
      }
    }
    const cajas = [];   // ocupado: etiquetas ya colocadas, etiqueta de la cumbre abierta y obstáculos
    etiquetas.sort((a, b) => b.prio - a.prio);
    const k = 1 - Math.exp(-Math.min(dt, 0.05) * 9);
    for (const e of etiquetas) {
      const o = e.o, el = e.el;
      if (o.w == null || o.mw !== W) { o.w = el.offsetWidth; o.h = el.offsetHeight; o.mw = W; }   // medida (se rehace si cambia el ancho)
      const w = o.w, h = o.h, gap = 2;
      if (!o.cand || o.cw !== w + ':' + h) {   // posiciones posibles, de menor a mayor desplazamiento
        const c = [[0, 0]];
        for (const ring of [1, 2, 3]) {
          const dy = ring * (h + gap);
          c.push([0, dy], [0, -dy], [w * 0.5 + 6, 0], [-(w * 0.5 + 6), 0], [w * 0.3, dy], [-w * 0.3, dy], [w * 0.3, -dy], [-w * 0.3, -dy]);
        }
        c.sort((a, b) => (Math.abs(a[0]) * 0.7 + Math.abs(a[1]) * 1.4) - (Math.abs(b[0]) * 0.7 + Math.abs(b[1]) * 1.4));
        o.cand = c; o.cw = w + ':' + h;
      }
      const libre = ([dx, dy]) => {
        const b = { x: e.sx + dx - w / 2, y: e.sy + e.top + dy, w, h };
        if (dx || dy) { if (b.x < 2 || b.x + w > W - 2 || b.y < 2 || b.y + h > H - 2) return null; }   // la posición propia puede quedar cortada por el borde, como antes
        for (const u of uiRects) if (hayChoque(b, u, 4)) return null;
        for (const q of obstaculos) if (hayChoque(b, q, 1)) return null;
        for (const q of cajas) if (hayChoque(b, q, 3)) return null;
        return b;
      };
      // se prefiere la posición que ya tenía (evita saltos); si no sirve, la más cercana que quede libre
      let pos = null, box = null;
      if (o.slot != null && (box = libre(o.cand[o.slot]))) pos = o.slot;
      else for (let i = 0; i < o.cand.length; i++) if ((box = libre(o.cand[i]))) { pos = i; break; }
      const quiere = pos != null;
      if (quiere) { cajas.push(box); o.slot = pos; }
      // histéresis: un cambio de visible/oculto necesita varios fotogramas seguidos
      if (o.vis == null) o.vis = quiere;
      if (quiere !== o.vis) { o.cnt = (o.cnt || 0) + 1; if (o.cnt > 10) { o.vis = quiere; o.cnt = 0; } } else o.cnt = 0;
      const objetivo = quiere ? o.cand[pos] : o.cand[o.slot ?? 0] || [0, 0];
      if (o.ox == null) { o.ox = objetivo[0]; o.oy = objetivo[1]; }
      o.ox += (objetivo[0] - o.ox) * k; o.oy += (objetivo[1] - o.oy) * k;
      if (e.top === -4) {   // pueblo: si su nombre no cabe, queda solo el punto; si el punto cae bajo el logotipo, se oculta entero
        const bajoCab = uiRects.some((u) => u.cab && e.sx > u.x && e.sx < u.x + u.w && e.sy > u.y && e.sy < u.y + u.h);
        el.classList.toggle('is-hidden', bajoCab); el.classList.toggle('sin-nombre', !o.vis);
      } else el.classList.toggle('is-hidden', !o.vis);
      el.style.transform = `translate3d(${(e.sx + o.ox).toFixed(1)}px, ${(e.sy + o.oy).toFixed(1)}px, 0)`;
      if (e.top === -4) { el.style.setProperty('--ox', o.ox.toFixed(1)); el.style.setProperty('--oy', o.oy.toFixed(1)); }   // el punto del pueblo no se mueve con su nombre
    }
    etiquetas.length = 0;
  }

  const puebloTmp = new THREE.Vector3();
  function updatePueblos() {
    const W = innerWidth, H = innerHeight;
    for (const o of puebloEls) {
      puebloTmp.set(o.x, 0, o.z);
      let show = S.mode === 'explore' && Math.hypot(camera.position.x - o.x, camera.position.z - o.z) < o.lim;
      if (show) { puebloTmp.y = geo.heightAt(o.x, o.z) + 6; show = camera.position.distanceTo(puebloTmp) < o.lim; }
      if (show) { puebloTmp.project(camera); show = puebloTmp.z < 1 && Math.abs(puebloTmp.x) < 1.05 && Math.abs(puebloTmp.y) < 1.05 && !occluded({ x: o.x, y: geo.heightAt(o.x, o.z) + 10, z: o.z }); }
      if (show) etiquetas.push({ o, el: o.el, sx: (puebloTmp.x * 0.5 + 0.5) * W, sy: (-puebloTmp.y * 0.5 + 0.5) * H, prio: o.lim, top: -4 });
      else { o.el.classList.add('is-hidden'); o.vis = null; o.ox = null; }
    }
  }

  const lagoTmp = new THREE.Vector3();
  function updateLagos() {
    const W = innerWidth, H = innerHeight;
    let cerca = Infinity;
    for (const { l, el } of lagoEls) {
      lagoTmp.set(l.x, l.y, l.z);
      const dist = camera.position.distanceTo(lagoTmp);
      cerca = Math.min(cerca, dist);
      const lim = 4000 + Math.sqrt(l.area) * 28;
      let show = S.mode === 'explore' && dist < lim;
      if (show) { lagoTmp.project(camera); show = lagoTmp.z < 1 && Math.abs(lagoTmp.x) < 1.05 && Math.abs(lagoTmp.y) < 1.05 && !occluded({ x: l.x, y: l.y + 8, z: l.z }); }
      if (show) etiquetas.push({ o: l, el, sx: (lagoTmp.x * 0.5 + 0.5) * W, sy: (-lagoTmp.y * 0.5 + 0.5) * H, prio: 1e5 + l.area, top: -8 });
      else { el.classList.add('is-hidden'); l.vis = null; l.ox = null; }
    }
    return cerca;
  }

  // — filtros —
  const hechos = leerHechos();
  const passes = (p) => enCapa(p) && (!S.filters.hecho || (S.filters.hecho === 'si') === hechos.has(p.id)) && (!S.filters.macizo.size || S.filters.macizo.has(p.macizo)) && (!S.filters.dif.size || S.filters.dif.has(p.dificultad)) && (p.menor || p.altitud >= S.filters.alt);
  const visiblePeaks = () => peaks.filter((p) => p.activo && passes(p));   // solo las activas (navegación anterior/siguiente)
  function buildFilters() {
    if (activas.size < 2) return;
    $('#btn-filters').hidden = false;
    const mac = [...new Set(data.picos.map((p) => p.macizo))];
    $('#f-macizo').innerHTML = mac.map((m) => `<button type="button" class="chip" aria-pressed="false" data-k="macizo" data-v="${m}">${esc(macizoName[m])}</button>`).join('');
    $('#f-dif').innerHTML = data.dificultades.map((d) => `<button type="button" class="chip" aria-pressed="false" data-k="dif" data-v="${d.id}">${esc(d.nombre)}</button>`).join('');
    $('#filters').addEventListener('click', (e) => {
      const c = e.target.closest('.chip'); if (!c) return;
      if (c.dataset.k === 'hecho') { const on = c.getAttribute('aria-pressed') !== 'true'; document.querySelectorAll('#f-hecho .chip').forEach((b) => b.setAttribute('aria-pressed', 'false')); c.setAttribute('aria-pressed', on); S.filters.hecho = on ? c.dataset.v : null; refreshLists(); return; }
      const set = S.filters[c.dataset.k], on = c.getAttribute('aria-pressed') !== 'true';
      c.setAttribute('aria-pressed', on); on ? set.add(c.dataset.v) : set.delete(c.dataset.v); refreshLists();
    });
    $('#f-alt').addEventListener('input', (e) => { S.filters.alt = +e.target.value; $('#f-alt-out').textContent = `${fmt(S.filters.alt)} m`; refreshLists(); });
    $('#f-reset').addEventListener('click', () => {
      S.filters.macizo.clear(); S.filters.dif.clear(); S.filters.hecho = null; S.filters.alt = 3000; $('#f-alt').value = 3000; $('#f-alt-out').textContent = '3.000 m';
      document.querySelectorAll('#filters .chip').forEach((c) => c.setAttribute('aria-pressed', 'false')); refreshLists();
    });
    $('#btn-filters').addEventListener('click', () => {
      const open = $('#filters').hidden; sonido.fx(open ? 'abrir' : 'cerrar'); $('#filters').hidden = !open; $('#btn-filters').setAttribute('aria-expanded', open);
    });
  }

  // — capa (tresmiles / menos de 3.000 / todas): la comparten los dos selectores y el mapa; se recuerda en el dispositivo —
  let introSel = null;   // selector de la pantalla de inicio (se crea más abajo)
  const capaSel = { get: () => S.capa, set: (v) => { S.capa = v; store.set('capa', v); sonido.fx('toque'); refreshLists(); } };

  // — selector inferior —
  const listEl = $('#picker'), listBtn = $('#btn-list');
  const kmAlCentro = (p) => Math.hypot(p.q.x - controls.target.x, p.q.z - controls.target.z) / 1000;   // distancia (km) de la cumbre al punto del mapa que se está mirando
  const hayFiltros = () => !!(S.filters.hecho || S.filters.macizo.size || S.filters.dif.size || S.filters.alt > 3000);
  const selMapa = crearSelector(listEl, {
    picos: peaks, macizos: data.macizos, activa: () => S.active, hecho: (id) => hechos.has(id), pasa: passes, filtrado: hayFiltros, capa: capaSel, cercania: kmAlCentro,
    quitarFiltros: () => $('#f-reset').click(), elegir: (id) => { setList(false); openPeak(id); },
  });
  function refreshLists() {
    if (!listEl.hidden) selMapa.pinta();
    if (!$('#intro-picos').hidden) introSel?.pinta();
    const fc = $('#f-count'); if (fc) fc.textContent = `${peaks.filter(passes).length} de ${peaks.length} cumbres`;
    $('#dock-label').textContent = S.active ? byId[S.active].nombre : activas.size === 1 ? `Explorar el ${peaks.find((p) => p.activo).nombre}` : 'Explorar las cumbres';
  }
  const setList = (open) => {
    listEl.hidden = !open; listBtn.setAttribute('aria-expanded', open); document.body.classList.toggle('selector-abierto', open);
    if (open) {
      // en el escritorio el desplegable sale centrado sobre la barra (que se desplaza cuando la ficha está abierta)
      if (!isMobile()) { const r = $('#dock').getBoundingClientRect(), w = listEl.offsetWidth / 2 + 20; listEl.style.left = `${clamp(r.left + r.width / 2, w, innerWidth - w)}px`; } else listEl.style.left = '';
      selMapa.alAbrir(); if (matchMedia('(hover: hover)').matches) selMapa.input.focus();
    }
  };
  listBtn.addEventListener('click', () => { sonido.fx(listEl.hidden ? 'abrir' : 'cerrar'); setList(listEl.hidden); });
  selMapa.cerrar.addEventListener('click', () => { sonido.fx('cerrar'); setList(false); });
  selMapa.input.addEventListener('keydown', (e) => { if (e.key === 'Escape') setList(false); });
  document.addEventListener('pointerdown', (e) => { if (!listEl.hidden && !e.target.closest('#dock, #picker')) setList(false); });
  // el panel de filtros se cierra al tocar fuera, al abrir una cumbre o el selector
  const cierraFiltros = () => { $('#filters').hidden = true; $('#btn-filters').setAttribute('aria-expanded', 'false'); };
  document.addEventListener('pointerdown', (e) => { if (!$('#filters').hidden && !e.target.closest('#filters, #btn-filters')) cierraFiltros(); });
  listBtn.addEventListener('click', cierraFiltros);

  // — ficha —
  const fichaEl = $('#ficha'), fichaBody = $('#ficha-body');
  function fichaHTML(p) {
    const f = fotos[p.foto], n = difN[p.dificultad];
    const vis = visiblePeaks(), i = vis.findIndex((x) => x.id === p.id);
    const nav = vis.length > 1 && i >= 0
      ? `<div class="nav2"><button type="button" data-go="${vis[(i - 1 + vis.length) % vis.length].id}">← Anterior</button><button type="button" data-go="${vis[(i + 1) % vis.length].id}">Siguiente →</button></div>` : '';
    const foto = f
      ? `<figure><img src="${f.ruta ?? `img/peaks/${p.foto}.jpg`}" width="${f.w}" height="${f.h}" alt="${esc(p.nombre)}: ${esc(p.pie)}" decoding="async" onerror="this.parentNode.classList.add('sin-foto')">
        <figcaption>${esc(p.pie)} Foto: ${esc(f.autor)}${f.licencia ? `, <a href="${esc(f.licencia_url)}" target="_blank" rel="noopener">${esc(f.licencia)}</a>` : ''}${f.pagina ? `, vía <a href="${esc(f.pagina)}" target="_blank" rel="noopener">${esc(f.fuente || 'Wikimedia Commons')}</a>` : ''}.</figcaption></figure>`
      : p.menor ? '' : '<figure class="sin-foto" aria-hidden="true"></figure>';   // ficha sencilla sin foto: sin marco   // sin imagen: marco con la silueta de una montaña
    return `
      ${foto}
      <h2>${esc(p.nombre)}</h2>${p.alias ? `<p class="alias">${esc(p.alias)}</p>` : ''}
      <div class="alt"><strong>${fmt(p.altitud)}</strong><span>m</span></div>${p.otras ? `<p class="otras">${/^otras/i.test(p.otras) ? '' : '<b>Otras cifras</b> '}${esc(p.otras)}</p>` : ''}
      ${p.activo ? `<div class="hecho-box"><button type="button" class="btn-hecho" data-act="hecho" aria-pressed="${hechos.has(p.id)}">${hechos.has(p.id) ? '<i aria-hidden="true"></i>Subido · banderín puesto' : `<i aria-hidden="true"></i>${textoSubir(p)}`}</button><span class="hecho-cuenta">${resumenHechos(p)}</span></div>` : ''}
      <p class="lede">${esc(p.descripcion)}</p>
      <dl class="stats">
        <div><dt>${p.menor ? 'Zona' : 'Macizo'}</dt><dd>${esc(macizoName[p.macizo])}</dd></div>
        <div><dt>Situación</dt><dd>${p.situacion ? esc(p.situacion) : p.frontera ? 'Frontera Aragón–Francia' : 'Aragón'}</dd></div>
        ${p.clase && p.clase !== 'principal' ? `<div><dt>Clase</dt><dd>${p.clase === 'discutida' ? 'Cima discutida' : 'Cima secundaria'}</dd></div>` : ''}
        ${p.cerca ? `<div class="wide"><dt>Pueblo más cercano</dt><dd>${esc(p.cerca)}</dd></div>` : ''}
        ${p.acceso ? `<div class="wide"><dt>Valle o pueblo de acceso</dt><dd>${esc(p.acceso)}</dd></div>` : ''}
        ${p.desnivel ? `<div><dt>Desnivel</dt><dd>${esc(p.desnivel)}</dd></div>` : ''}
        ${n ? `<div><dt>Dificultad</dt><dd><span class="dif" data-n="${n}"><i><b></b><b></b><b></b></i>${esc(difName[p.dificultad])}</span><br><small>${esc(p.grado)}</small></dd></div>` : ''}
        ${p.epoca ? `<div class="wide"><dt>Mejor época</dt><dd>${esc(p.epoca)}</dd></div>` : ''}
      </dl>
      <p class="panorama-acc"><button type="button" class="btn-ruta btn-suave" data-act="panorama">Ver el panorama desde la cima</button>${cumbres.ficha()?.[p.id]?.modelo ? ' <button type="button" class="btn-ruta btn-suave" data-act="cerca">Ver la cima de cerca</button>' : ''}</p>
      ${p.ruta ? `<h3>${/^Esta (cima|cumbre) aparece en la ruta/.test(p.ruta) ? 'En una ruta de Wikiloc' : 'Ruta normal'}</h3><p class="ruta">${esc(p.ruta)}</p>` : ''}
      ${p.curiosidad ? `<h3>Curiosidad</h3><p>${esc(p.curiosidad)}</p>` : ''}
      ${p.info ? `<h3>Información</h3><p>${esc(p.info.texto)}</p><p class="ruta-credito">${p.info.traducido ? 'Texto traducido al castellano' : 'Texto'} de Wikipedia en ${{ an: 'aragonés', ca: 'catalán', es: 'castellano' }[p.info.idioma]}, artículo «<a href="${esc(p.info.url)}" target="_blank" rel="noopener">${esc(p.info.titulo)}</a>», licencia CC BY-SA 4.0. Sus autores están en el historial del artículo.</p>` : ''}
      ${figCima(p)}
      ${rutaHTML(p)}
      ${p.enlace && !rutasDe(p.id).some((r) => r.ruta.fuenteUrl === p.enlace.url) ? `<p class="enlace-ruta"><a href="${esc(p.enlace.url)}" target="_blank" rel="noopener">${esc(p.enlace.texto)} ↗</a></p>` : ''}
      ${p.menor ? `<div class="aviso"><b>Ficha sencilla.</b> Nombre, altitud y posición proceden de OpenStreetMap y pueden variar según la fuente. Antes de salir, consulta una guía o un mapa actual y la previsión del tiempo: la montaña implica riesgo.</div>` : `<div class="aviso"><b>Información orientativa.</b> Las cifras proceden de guías y fichas de ruta y varían según la fuente. Antes de salir, contrasta con una guía actual, el estado de la ruta y la previsión del tiempo: la alta montaña implica riesgo.</div>`}${nav}`;
  }
  function rutaHTML(p) {
    const r = rutasDe(p.id)[0]?.ruta; if (!r) return '';
    return `<h3>Recorrido en el mapa</h3>
      <p class="ruta-nombre">${esc(r.nombre)}</p>
      <div class="ruta-datos"><span><b>${km(r.distancia)} km</b>distancia</span><span><b>+${fmt(r.desnivel)} m</b>desnivel acumulado</span><span><b>${fmt(r.max)} m</b>punto más alto</span></div>
      <details class="perfil-det" ${store.get('perfil-oculto') === '1' ? '' : 'open'}><summary>Perfil de altura</summary>${rutasDe(p.id)[0].perfil()}</details>
      <div class="ruta-acciones">
        <button type="button" class="btn-ruta" data-act="plegar">Ver el recorrido a pantalla completa</button>
        <button type="button" class="btn-ruta" data-act="vuelo">Volar por la ruta</button>
        <button type="button" class="btn-ruta btn-suave" id="btn-ruta" aria-pressed="${rutaOn}">${rutaOn ? 'Ocultar la ruta del mapa' : 'Mostrar la ruta en el mapa'}</button>
      </div>
      ${p.id === 'aneto' ? `<h3>Paso de Mahoma</h3><p class="ruta-credito">Vista opcional de detalle de la arista entre la antecima y la cumbre. Relieve: MDT05 del IGN; los bloques de granito son una aproximación visual.</p><div class="ruta-acciones"><button type="button" class="btn-ruta" data-act="vista" data-vista="antecima">Ver desde la antecima</button><button type="button" class="btn-ruta" data-act="vista" data-vista="lateral">Ver desde un lateral</button></div>` : ''}
      <p class="enlace-ruta"><a href="${esc(r.fuenteUrl)}" target="_blank" rel="noopener">Descargar el GPX y ver la ruta completa en Wikiloc ↗</a></p>
      <p class="ruta-credito">Vista previa del recorrido sobre el mapa. El track original, para descargar, está en la ficha de Wikiloc. El trazado está simplificado y colocado sobre un modelo de relieve: es orientativo y no sustituye a un GPS ni a un mapa.</p>`;
  }
  function pintaRuta(id, { animar = true } = {}) {
    for (const [rid, lista] of Object.entries(rutas)) for (const r of lista) r.mostrar(rid === id && rutaOn, { animar });
  }
  fichaBody.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act?.dataset.act === 'plegar') { plegar(true); return; }
    if (act?.dataset.act === 'vuelo') { iniciarVuelo(); return; }
    if (act?.dataset.act === 'panorama') { panorama.abrir(byId[S.active]); return; }
    if (act?.dataset.act === 'vista') { vistaMahoma(act.dataset.vista); return; }
    if (act?.dataset.act === 'cerca') { vistaCima(S.active); return; }
    if (act?.dataset.act === 'hecho') { marcaHecho(S.active); return; }
    const b = e.target.closest('#btn-ruta'); if (!b) return;
    rutaOn = !rutaOn; b.setAttribute('aria-pressed', rutaOn); b.textContent = rutaOn ? 'Ocultar la ruta del mapa' : 'Mostrar la ruta en el mapa';
    pintaRuta(S.active);
  });
  // — ficha plegable (ver el recorrido con el mapa libre) —
  const tab = $('#ficha-tab'), foldBtn = $('#ficha-fold');
  const aplicaAltura = () => { fichaEl.style.height = !S.plegada && S.sheetH && isMobile() ? `${S.sheetH}px` : ''; };
  function plegar(v, { fly = true } = {}) {
    const p = byId[S.active]; if (!p || S.plegada === v) return;
    if (v === false) pararVuelo(false);
    S.plegada = v;
    document.body.classList.toggle('ficha-plegada', v); fichaEl.classList.toggle('is-folded', v);
    tab.hidden = !v || isMobile(); $('#ficha-tab-name').textContent = p.nombre;
    foldBtn.setAttribute('aria-label', v ? 'Abrir la ficha' : 'Recoger la ficha para ver el recorrido');
    fichaEl.setAttribute('aria-hidden', 'false'); aplicaAltura();
    if (fly) flyTo(peakState(p), { shift: viewShift() });
    else S.shiftTo = viewShift();
  }
  foldBtn.addEventListener('click', () => { sonido.fx(S.plegada ? 'abrir' : 'cerrar'); plegar(!S.plegada); });
  tab.addEventListener('click', () => { sonido.fx('abrir'); plegar(false); });
  // móvil: arrastrar el asa o la cabecera para subir/bajar la hoja; un toque en la barra plegada la abre
  let arr = null;
  const alturas = () => [54, innerHeight * 0.4, Math.min(innerHeight * 0.66, 620), innerHeight * 0.9];
  for (const el of [fichaEl.querySelector('.ficha-grip'), fichaEl.querySelector('.ficha-head')]) {
    el.addEventListener('pointerdown', (e) => {
      if (!isMobile() || e.target.closest('button')) return;
      arr = { y0: e.clientY, h0: S.plegada ? 54 : fichaEl.getBoundingClientRect().height, moved: false };
      el.setPointerCapture?.(e.pointerId); fichaEl.style.transition = 'none';
    });
    el.addEventListener('pointermove', (e) => {
      if (!arr) return;
      if (Math.abs(e.clientY - arr.y0) > 6) arr.moved = true;
      if (!arr.moved) return;
      const h = clamp(arr.h0 + (arr.y0 - e.clientY), 54, innerHeight * 0.92);
      fichaEl.style.height = `${h}px`; S.sheetH = Math.max(h, 54); S.shiftTo = { x: 0, y: h / 2 };
    });
    const fin = () => {
      if (!arr) return; const a = arr; arr = null; fichaEl.style.transition = '';
      if (!a.moved) { if (S.plegada) plegar(false); return; }
      const h = parseFloat(fichaEl.style.height) || a.h0;
      const snap = alturas().reduce((m, v) => (Math.abs(v - h) < Math.abs(m - h) ? v : m));
      if (snap <= 54) { S.sheetH = null; plegar(true); return; }
      S.sheetH = snap; const estabaPlegada = S.plegada;
      if (estabaPlegada) plegar(false, { fly: false });
      aplicaAltura(); S.shiftTo = viewShift();
      if (estabaPlegada && byId[S.active]) flyTo(peakState(byId[S.active]), { shift: viewShift() });
    };
    el.addEventListener('pointerup', fin); el.addEventListener('pointercancel', fin);
  }

  fichaBody.addEventListener('toggle', (e) => { if (e.target.classList?.contains('perfil-det')) store.set('perfil-oculto', e.target.open ? '0' : '1'); }, true);   // el perfil se puede ocultar y se recuerda
  const panorama = crearPanorama({ geo, meta, store: relieve, peaks, abrir: (id) => openPeak(id), esc });
  // — perfil de altura interactivo: un punto recorre la ruta en el mapa —
  let perfilT = 0;
  const sobrePerfil = (e) => {
    const svg = e.target.closest?.('.perfil'); if (!svg) return;
    const R = rutasDe(S.active)[0]; if (!R) return;
    clearTimeout(perfilT);
    const d = R.distanciaEn(svg, e.clientX); R.marcarPerfil(svg, d); R.cursor(d);
    if (e.type === 'pointerdown' && e.pointerType !== 'mouse') svg.setPointerCapture?.(e.pointerId);
  };
  const sueltaPerfil = (e) => {
    const svg = e.target.closest?.('.perfil'); if (!svg) return;
    const R = rutasDe(S.active)[0]; if (!R) return;
    const quita = () => { R.marcarPerfil(svg, null); R.cursor(null); };
    if (e.pointerType === 'mouse') quita(); else perfilT = setTimeout(quita, 2500);
  };
  fichaBody.addEventListener('pointerdown', sobrePerfil);
  fichaBody.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) sobrePerfil(e); });
  // con ratón, el montañero se queda mientras el puntero esté sobre el perfil; con el dedo, 2,5 s tras soltar
  fichaBody.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') sueltaPerfil(e); });
  fichaBody.addEventListener('pointercancel', sueltaPerfil);
  fichaBody.addEventListener('pointerout', (e) => { if (e.relatedTarget?.closest?.('.perfil')) return; sueltaPerfil(e); });

  // — vuelo por la ruta —
  const hud = $('#vuelo-hud'), btnVuelo = $('#btn-vuelo');
  function iniciarVuelo() {
    const R = rutasDe(S.active)[0]; if (!R) return;
    if (!rutaOn) { rutaOn = true; pintaRuta(S.active, { animar: false }); const b = $('#btn-ruta'); if (b) { b.setAttribute('aria-pressed', 'true'); b.textContent = 'Ocultar la ruta del mapa'; } }
    else R.mostrar(true, { animar: false });
    if (!S.plegada) plegar(true, { fly: false });
    S.flight = null; controls.enabled = false; S.shiftTo = viewShift();
    S.vuelo = { R, d: 0, vel: R.ruta.distancia / 25, pos: camera.position.clone(), look: controls.target.clone(), dir: null, fin: 0 };
    hud.hidden = false; btnVuelo.setAttribute('aria-pressed', 'true');
  }
  function pararVuelo(volver = true) {
    const V = S.vuelo; if (!V) return;
    S.vuelo = null; V.R.cursor(null); hud.hidden = true; btnVuelo.setAttribute('aria-pressed', 'false');
    controls.enabled = true; controls.update();
    const p = byId[S.active]; if (volver && p) flyTo(peakState(p), { shift: viewShift() });
  }
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _l = new THREE.Vector3();
  function tickVuelo(dt) {
    const V = S.vuelo, R = V.R, total = R.ruta.distancia;
    if (V.d >= total) { V.fin += dt; if (V.fin > 3) pararVuelo(true); return; }
    V.d = Math.min(total, V.d + V.vel * dt);
    const a = R.en(V.d), b = R.en(V.d + 700);
    _v.copy(b.pos).sub(a.pos); _v.y = 0;
    if (_v.lengthSq() < 1) { if (!V.dir) _v.set(0, 0, -1); else _v.copy(V.dir); }
    _v.normalize(); V.dir = V.dir ? V.dir.lerp(_v, 1 - Math.exp(-dt * 1.4)).normalize() : _v.clone();
    _w.copy(a.pos).addScaledVector(V.dir, -800); _w.y = Math.max(a.pos.y + 400, geo.heightAt(_w.x, _w.z) + 260);
    const k = 1 - Math.exp(-dt * 4);
    V.pos.lerp(_w, k); _l.copy(b.pos); _l.y -= 150; V.look.lerp(_l, k);
    camera.position.copy(V.pos); controls.target.copy(V.look); camera.lookAt(V.look);
    R.cursor(V.d);
    $('#vuelo-txt').textContent = `${(V.d / 1000).toFixed(1).replace('.', ',')} km · ${fmt(Math.round(a.ele))} m`;
  }
  btnVuelo.addEventListener('click', () => { sonido.fx(S.vuelo ? 'desactivar' : 'activar'); S.vuelo ? pararVuelo(true) : iniciarVuelo(); });
  $('#vuelo-stop').addEventListener('click', () => { sonido.fx('desactivar'); pararVuelo(true); });
  canvas.addEventListener('pointerdown', () => { if (S.vuelo) pararVuelo(false); });

  // — carga por zonas: las alturas finas, la ruta y los hitos de un pico se preparan al abrirlo —
  let openTok = 0;
  const preparados = new Map(), zonaCarga = $('#zona-carga');
  const avisoCarga = (txt) => { zonaCarga.textContent = txt ?? ''; zonaCarga.hidden = !txt; };
  function cargarZona(p) {
    if (!preparados.has(p.id)) preparados.set(p.id, (async () => {
      const datos = rutaDatos[p.id] ?? [];
      const pts = [p.q]; for (const r of datos) for (const q of r.puntos) pts.push(geo.toXZ(q[0], q[1]));
      await terrain.asegurar(pts, 1);
      p.w = geo.summitNear(p.q.x, p.q.z);   // la cumbre se fija con el relieve general; las rutas ya se apoyan en la pieza de alta resolución
      await cumbres.carga(p.id);
      for (const r of datos) (rutas[p.id] ??= []).push(crearRuta({ scene, geo, ruta: r }));
      { const dif = hitosDatos.filter((h) => h.tipo === 'paso' && (h.picos ?? [h.pico]).includes(p.id) && /funambul|regleta|gato|onso|acrob|clave|cadenas/i.test(h.nombre)).map((h) => geo.toXZ(h.lon, h.lat)); if (dif.length) for (const r of rutas[p.id] ?? []) r.setPasosHito(dif); }   // pasos difíciles con nombre: postura de funambulista
      { const fi = await cumbres.fichaListo; const cfg = fi?.aneto?.tramo; if (cfg) for (const r of rutas[p.id] ?? []) r.setPaso({ ...cfg, cresta: fi.aneto.cresta }); }   // tramo especial (Paso de Mahoma): se detecta si el recorrido pasa por la arista
      crearHitosDe(p.id);
    })());
    return preparados.get(p.id);
  }
  // cumbre sin ficha todavía: se puede ver la zona (vista previa) y sale «Próximamente»
  function verPrevia(p) {
    if (S.mode !== 'explore') return;
    closeFicha();
    flyTo({ t: new THREE.Vector3(p.w.x, p.w.y - 300, p.w.z), theta: -0.45, phi: 1.0, r: 15000 }, { shift: { x: 0, y: 0 } });
    avisoCarga(`${p.nombre}: próximamente`); clearTimeout(verPrevia.t); verPrevia.t = setTimeout(() => avisoCarga(null), 2600);
  }
  async function openPeak(id, { instant = false, hash = true } = {}) {
    const p = byId[id]; if (!p || !p.activo) return;
    pararVuelo(false); setList(false); if (S.detalle) { S.detalle = false; controls.minDistance = 500; }
    const tok = ++openTok, t = setTimeout(() => avisoCarga('Cargando la zona…'), 300);
    try { await cargarZona(p); } finally { clearTimeout(t); avisoCarga(null); }
    if (tok !== openTok) return;
    if (S.active !== id) sonido.fx(S.active ? 'seleccion' : 'ficha');   // ficha cerrada: soplo + nota; cambio de cumbre: solo el clic
    S.active = id; fauna?.setCentro(p.w.x, p.w.z, p.w.y);
    if (S.plegada) { S.plegada = false; document.body.classList.remove('ficha-plegada'); fichaEl.classList.remove('is-folded'); tab.hidden = true; aplicaAltura(); }
    const conRuta = !!rutasDe(id)[0]; fichaEl.classList.toggle('con-ruta', conRuta); btnVuelo.hidden = !conRuta;
    fichaBody.innerHTML = fichaHTML(p); fichaBody.scrollTop = 0;
    $('#ficha-macizo').textContent = macizoName[p.macizo];
    fichaEl.classList.add('is-open'); fichaEl.setAttribute('aria-hidden', 'false'); document.body.classList.add('ficha-open');
    hideHints(); refreshLists();
    fichaEl.focus({ preventScroll: true });
    pintaRuta(null);
    await flyTo(peakState(p), { shift: viewShift(), instant });
    if (S.active === id) pintaRuta(id, { animar: !instant });
    terrain.update(camera, 8);
  }
  // — tresmiles subidos: banderín de Aragón en la cima, aro dorado en el marcador y contador —
  const totalActivas = (menor = false) => peaks.filter((p) => p.activo && !!p.menor === menor).length;
  const textoSubir = (p) => (p?.menor ? 'He subido esta cumbre' : 'He subido este tresmil');
  function resumenHechos(p = null) {
    const menor = !!p?.menor, n = [...hechos].filter((id) => byId[id]?.activo && !!byId[id].menor === menor).length;
    return `${n} de ${totalActivas(menor)} ${menor ? 'cumbres de 2.000 a 3.000 m subidas' : 'tresmiles subidos'}`;
  }
  function pintaHechos() {
    for (const p of peaks) pinEls.get(p.id)?.classList.toggle('is-hecho', hechos.has(p.id));
    const c = $('#hechos-cuenta'); if (c) c.textContent = resumenHechos();
  }
  function marcaHecho(id) {
    const p = byId[id]; if (!p) return;
    if (hechos.has(id)) { hechos.delete(id); banderines.quita(id); sonido.fx('desactivar'); }
    else { hechos.add(id); banderines.pone(p, true); sonido.fx('activar'); }
    guardarHechos(hechos); pintaHechos();
    const b = fichaBody.querySelector('.btn-hecho');
    if (b) { const on = hechos.has(id); b.setAttribute('aria-pressed', on); b.innerHTML = `<i aria-hidden="true"></i>${on ? 'Subido · banderín puesto' : textoSubir(p)}`; fichaBody.querySelector('.hecho-cuenta').textContent = resumenHechos(p); }
    refreshLists();
  }
  // copia de seguridad: exportar e importar la lista en un archivo
  $('#hechos-exportar')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ app: 'tresmiles', hechos: [...hechos] }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mis-tresmiles.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('#hechos-importar')?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { const j = JSON.parse(await f.text()); const ids = (j.hechos ?? j).filter((id) => byId[id]); for (const id of ids) { hechos.add(id); banderines.pone(byId[id], false); } guardarHechos(hechos); pintaHechos(); refreshLists(); avisoCarga(`${ids.length} tresmiles importados`); setTimeout(() => avisoCarga(null), 2200); }
    catch { avisoCarga('Ese archivo no es una copia de tus tresmiles'); setTimeout(() => avisoCarga(null), 2600); }
    e.target.value = '';
  });
  for (const id of hechos) if (byId[id]) banderines.pone(byId[id], false);
  pintaHechos();

  // vista opcional de detalle del Paso de Mahoma: la cámara se acerca con el vuelo de siempre y el usuario conserva el control
  // vista de cerca de una cima con modelo de Blender (vértice, torre de piedras…): la cámara baja a unas decenas de metros, de frente al modelo, y el usuario conserva el control
  async function vistaCima(id) {
    if (!id) return;
    await cumbres.carga(id); const d = cumbres.ficha()?.[id], e = d?.elementos?.find((x) => x.ancla) ?? d?.elementos?.[0]; if (!e) return;
    pararVuelo(false); if (!S.plegada) plegar(true, { fly: false });
    S.detalle = true; controls.minDistance = 20;
    if (S.sun !== 1) setSun(1);   // luz de mediodía: neutra y alta, deja ver el color de la roca (la de mañana y tarde la tiñe de naranja)
    const Se = e.escala ?? d.escalaModelo ?? 1, t = new THREE.Vector3(e.x, geo.heightAt(e.x, e.z) + 1.3 * Se, e.z);
    flyTo({ t, r: Math.max(45, 7.5 * Se), phi: 1.2, theta: e.giro ?? 0 }, { dur: 3.2, shift: { x: 0, y: 0 } });   // el frente del modelo (−Y en Blender) mira hacia +Z, girado `giro`
  }
  async function vistaMahoma(cual) {
    if (S.active !== 'aneto') return;
    await cumbres.carga('aneto'); const d = cumbres.ficha()?.aneto; if (!d) return;
    pararVuelo(false); if (!S.plegada) plegar(true, { fly: false });
    S.detalle = true; controls.minDistance = 20;
    const A = d.antecima, B = d.cruz, L = Math.hypot(B.x - A.x, B.z - A.z), u = { x: (B.x - A.x) / L, z: (B.z - A.z) / L };
    let v = { x: u.z, z: -u.x }; if (v.x < 0) v = { x: -v.x, z: -v.z };   // perpendicular, hacia el este
    const gy = (x, z) => geo.heightAt(x, z), mid = { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 };
    let t, c;
    if (cual === 'antecima') { t = new THREE.Vector3(A.x + u.x * 24, 0, A.z + u.z * 24); t.y = gy(t.x, t.z) + 3; c = new THREE.Vector3(A.x - u.x * 30, 0, A.z - u.z * 30); c.y = gy(c.x, c.z) + 20; }
    else { t = new THREE.Vector3(mid.x, 0, mid.z); t.y = gy(t.x, t.z); c = new THREE.Vector3(mid.x + v.x * 80, 0, mid.z + v.z * 80); c.y = Math.max(gy(c.x, c.z) + 22, t.y + 28); }
    const o = c.clone().sub(t), r = o.length();
    flyTo({ t, r, phi: Math.min(1.35, Math.acos(clamp(o.y / r, -1, 1))), theta: Math.atan2(o.x, o.z) }, { dur: 3.2, shift: { x: 0, y: 0 } });
  }
  const sueltaDetalle = () => { if (S.detalle) { S.detalle = false; if (!S.flight) controls.minDistance = 500; } };
  function closeFicha({ fly = false } = {}) {
    if (!S.active) return;
    S.detalle = false; controls.minDistance = 500;
    const was = S.active; sonido.fx('cerrar'); callaHasta = performance.now() + 8000; pararVuelo(false); S.active = null; pintaRuta(null);
    S.plegada = false; document.body.classList.remove('ficha-plegada'); fichaEl.classList.remove('is-folded'); tab.hidden = true; btnVuelo.hidden = true; aplicaAltura();
    fichaEl.classList.remove('is-open'); fichaEl.setAttribute('aria-hidden', 'true'); document.body.classList.remove('ficha-open');
    history.replaceState(null, '', location.pathname + location.search); S.shiftTo = { x: 0, y: 0 }; refreshLists();
    pinEls.get(was)?.focus({ preventScroll: true, focusVisible: false });   // el foco vuelve al marcador sin aro ni nombre para quien usa ratón o dedo
    if (fly) goHome();
  }
  fichaBody.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) openPeak(b.dataset.go); });
  $('#ficha-close').addEventListener('click', () => closeFicha());
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (S.vuelo) pararVuelo(true); else if (!listEl.hidden) setList(false); else if (!$('#filters').hidden) { cierraFiltros(); } else closeFicha(); } });
  const goHome = () => { S.detalle = false; controls.minDistance = 500; pararVuelo(false); S.active = null; if (pDef) fauna?.setCentro(pDef.w.x, pDef.w.z); pintaRuta(null); btnVuelo.hidden = true; refreshLists(); return flyTo(HOME, { shift: { x: 0, y: 0 } }); };
  $('#btn-home').addEventListener('click', () => { if (S.mode === 'explore') { sonido.fx('inicio'); closeFicha(); goHome(); } });
  $('#brand').addEventListener('click', (e) => { e.preventDefault(); if (S.mode === 'explore') { sonido.fx('inicio'); closeFicha(); goHome(); } });

  // — luz —
  function setSun(i) {
    S.sun = i; const s = SUN[i], az = (s.az * Math.PI) / 180, el = (s.el * Math.PI) / 180;
    sun.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(1000);
    lagos?.setSol(sun.position, s.col);
    S.look.to = LOOK[i]; sky.material.uniforms.uSunDir.value.copy(sun.position).normalize();
    S.bruma.to = BRUMA[i];   // mar de nubes por la mañana, calima suave a mediodía, bruma dorada por la tarde
    sun.color.set(s.col); sun.intensity = s.k * 0.62 * Math.PI * (s.el < 30 ? 1.25 : 1);
    $('#light-name').textContent = s.nombre; $('#btn-light').setAttribute('aria-label', `Cambiar la luz: ${s.nombre.toLowerCase()}`);
  }
  $('#btn-light').addEventListener('click', (e) => {
    sonido.fx('toque');
    setSun((S.sun + 1) % SUN.length); const b = e.currentTarget; b.classList.add('show-tip'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('show-tip'), 1600);
  });
  setSun(0);

  // — sonido (activo desde el inicio; si el navegador lo bloquea, arranca con el primer toque) —
  const btnSound = $('#btn-sound');
  const pintaSonido = () => { btnSound.setAttribute('aria-pressed', sonido.on); btnSound.setAttribute('aria-label', sonido.on ? 'Silenciar el sonido y los efectos' : 'Activar el sonido y los efectos'); btnSound.classList.toggle('is-on', sonido.on); };
  btnSound.addEventListener('click', async () => { if (sonido.on) sonido.fx('desactivar'); await sonido.set(!sonido.on); if (sonido.on) setTimeout(() => sonido.fx('activar'), 250); store.set('sonido', sonido.on ? '1' : '0'); pintaSonido(); });
  pintaSonido();
  if (store.get('sonido') !== '0') { sonido.set(true); pintaSonido(); }   // suena desde el principio; el botón lo silencia y se recuerda

  // — llamada del quebrantahuesos: al azar cada 40–90 s si hay alguno a la vista, y con más probabilidad cuando uno se acerca a la cámara —
  let detPrev = false, proxLlamada = performance.now() + 20000, ceBajo = new Set();
  const _vAve = new THREE.Vector3();
  function llamadasAve(now) {
    if (!fauna?.aves.length || !sonido.on || document.hidden || S.mode !== 'explore' || now - sonido.msUltimaLlamada < 15000) return;
    let mejor = null, dm = 1e9;
    for (const a of fauna.aves) {
      if (!a.g.visible || a.esp !== 'quebrantahuesos') continue;   // la llamada grabada es la del quebrantahuesos
      const d = camera.position.distanceTo(a.g.position);
      if (d < dm) { dm = d; mejor = a; }
      const cerca = d < 1300;   // se acaba de acercar: oportunidad de oírlo (la mitad de las veces)
      if (cerca && !ceBajo.has(a)) { ceBajo.add(a); if (Math.random() < 0.5) proxLlamada = Math.min(proxLlamada, now); }
      else if (!cerca && d > 1800) ceBajo.delete(a);
    }
    if (!mejor || now < proxLlamada || dm > 15000) return;
    _vAve.copy(mejor.g.position).project(camera);
    if (sonido.llamada(dm, _vAve.z < 1 ? _vAve.x : 0)) proxLlamada = now + 40000 + Math.random() * 50000;
  }

  // — flechas de giro: un toque gira la vista 30° alrededor del punto que se mira; mantenerla pulsada gira sin parar (36°/s) —
  const giro = { dir: 0, resta: 0, sostenido: false, t: null };
  for (const [id, dir] of [['#giro-izq', 1], ['#giro-der', -1]]) {
    const b = $(id);
    b.addEventListener('pointerdown', (e) => {
      if (S.mode !== 'explore' || S.flight || S.vuelo) return;
      e.preventDefault(); b.setPointerCapture?.(e.pointerId); b.classList.add('is-on'); callaHasta = 0;
      giro.dir = dir; giro.resta = 0; giro.sostenido = false; giro.vt = 0;
      clearTimeout(giro.t); giro.t = setTimeout(() => { giro.sostenido = true; }, 450);
    });
    const suelta = () => {
      if (!b.classList.contains('is-on')) return; b.classList.remove('is-on'); clearTimeout(giro.t);
      if (!giro.sostenido) { giro.resta = Math.PI / 180; sonido.fx('toque'); } else giro.dir = 0;   // toque corto: 1°
      giro.sostenido = false;
    };
    b.addEventListener('pointerup', suelta); b.addEventListener('pointercancel', suelta); b.addEventListener('lostpointercapture', suelta);
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); giro.dir = dir; giro.resta = Math.PI / 180; } });
  }
  const _ejeY = new THREE.Vector3(0, 1, 0), _off = new THREE.Vector3();
  function aplicaGiro(dt) {
    if (!giro.dir) return;
    if (S.flight || S.vuelo || S.mode !== 'explore') { giro.dir = 0; giro.resta = 0; return; }
    let a;
    if (giro.sostenido) { giro.vt = Math.min(1, (giro.vt ?? 0) + dt * 1.5); a = (0.11 + 0.065 * kVel) * giro.vt * dt; }   // 6–10°/s según la altura, arrancando poco a poco
    else if (giro.resta > 0) { a = Math.min(giro.resta, Math.max(0.1 * dt, giro.resta * Math.min(1, dt * 4))); giro.resta -= a; if (giro.resta <= 1e-4) { giro.resta = 0; giro.dir = 0; } }
    else return;
    _off.subVectors(camera.position, controls.target).applyAxisAngle(_ejeY, giro.dir * a);
    camera.position.copy(controls.target).add(_off); camera.lookAt(controls.target); controls.update();
  }

  // — brújula —
  const needle = $('#needle');
  $('#compass').addEventListener('click', () => { if (S.mode !== 'explore') return; const s = camState(); flyTo({ ...s, theta: 0 }, { dur: 1.0, shift: S.shiftTo }); });

  // — tutorial —
  const hMove = $('#hint-move'), hZoom = $('#hint-zoom'); let hintTimer = [];
  function showHints() {
    if (store.get('tresmiles-tutorial')) return;
    hMove.classList.add('is-on'); hintTimer.push(setTimeout(() => { hMove.classList.remove('is-on'); hZoom.classList.add('is-on'); }, 6500), setTimeout(hideHints, 13000));
    const nextStep = () => { hMove.classList.remove('is-on'); hintTimer.push(setTimeout(() => hZoom.classList.add('is-on'), 500)); canvas.removeEventListener('pointerdown', nextStep); };
    canvas.addEventListener('pointerdown', nextStep, { once: true });
    canvas.addEventListener('wheel', hideHints, { once: true, passive: true });
  }
  function hideHints() { hintTimer.forEach(clearTimeout); hintTimer = []; hMove.classList.remove('is-on'); hZoom.classList.remove('is-on'); store.set('tresmiles-tutorial', '1'); }

  // — acerca de —
  const about = $('#about');
  function buildAbout() {
    const todas = peaks.map((p) => ({ p, f: fotos[p.foto] })).filter((u) => u.f), usadas = todas.filter((u) => !u.p.menor), menoresUsadas = todas.filter((u) => u.p.menor);
    const credFoto = (nombre, f) => {
      const fuente = f.fuente && f.fuente !== 'Wikimedia Commons' ? f.fuente : (f.archivo || 'Wikimedia Commons');
      const lic = f.licencia ? `, <a href="${esc(f.licencia_url || f.pagina)}" target="_blank" rel="noopener">${esc(f.licencia.replace('Public domain', 'Dominio público'))}</a>` : '';
      return `${esc(nombre)}: ${esc(f.autor)}${lic}${f.pagina ? `, vía <a href="${esc(f.pagina)}" target="_blank" rel="noopener">${esc(fuente)}</a>` : `, vía ${esc(fuente)}`}.`;
    };
    $('#about-body').innerHTML = `
      <h2>Tresmiles del Pirineo aragonés</h2>
      <p>Explorador 3D de las cumbres que superan los 3.000 metros en el Pirineo aragonés y su frontera. Incluye ya ${totalActivas()} tresmiles: unas ${peaks.filter((p) => p.activo && !p.basica && !p.menor).length} con ruta de ejemplo, hitos y fotografías, y el resto con una ficha básica (nombre, altitud, macizo y situación). Además, ${totalActivas(true)} cumbres de 2.000 a 3.000 m con una ficha sencilla (nombre, altitud y posición de OpenStreetMap, sin ruta), que se ven eligiendo «Menos de 3.000» o «Todas» en el selector.</p>
      <h3>Cumbres y rutas</h3>
      <ul><li>Altitudes y nombres oficiales: Orden VMV/914/2020 (BOA n.º 192) del Gobierno de Aragón, contrastadas con tresmiles.es (CC0), Buyse (1993) y UIAA (1995).</li>
      <li>Rutas, desniveles y dificultades: resumen propio a partir de guías y fichas públicas (Rutas Pirineos, Xiruca, Hiking Iberia, SummitPost, Wikiloc). Son cifras orientativas: varían según la fuente.</li></ul>
      <h3>Relieve e imagen</h3>
      <ul><li>Relieve: Copernicus DEM GLO-30, © DLR e.V. 2010-2014 y © Airbus Defence and Space GmbH 2014-2018, proporcionado por la Unión Europea y la ESA. Se muestra con una exageración vertical de ×1,3.</li>
      <li>Cimas con detalle propio (Aneto, Posets, Monte Perdido, Maladeta y Vignemale): el relieve de la cima sale del MDT05 del IGN (1 m interpolado) y su posición, de OpenStreetMap y de las reseñas de la Red Geodésica del IGN. Solo el Aneto muestra un elemento artificial (la cruz, confirmada en OpenStreetMap). En el Posets, el pilar roto del vértice (con su funda pintada «POSETS 3369», los hierros de la armadura y una cinta) se ha modelado en Blender a partir de fotografías de la cima y de la reseña del IGN; la roca de la cima, más oscura y en bloques angulosos, imita esas fotos. En el Monte Perdido, el pilar roto del vértice, el mojón de piedras y el buzón de cumbre con sus siluetas se han modelado en Blender a partir de fotografías de la cima (medidas del pilar según la reseña del IGN; el resto, estimado); están a la escala de los montañeros, por lo que el pilar se ha separado del mojón para que no se solapen. El tipo de roca (granito en Aneto, Maladeta y Posets; caliza en Monte Perdido) es una aproximación visual.</li>
      <li>Paso de Mahoma (Aneto): la arista y la cruz de cumbre se sitúan con el eje del paso y la cruz de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (ODbL) y el MDT05 del IGN interpolado a 1,5 m. Las fracturas y bloques de granito son una aproximación visual (procedural), no una medición. La cruz (unos 32 m en el modelo) y los montañeros (unos 21 m) están muy exagerados de tamaño, aunque guardan la proporción cruz ≈ 1,5 veces un montañero. Las posturas en la arista (agachados, manos en la roca, a cuatro apoyos) y la cuerda son una animación gráfica, no una simulación.</li>
      <li>Detalle del relieve en las cumbres: MDT05 (5 m) del <a href="https://www.ign.es" target="_blank" rel="noopener">Instituto Geográfico Nacional</a>, CC BY 4.0 © Instituto Geográfico Nacional de España, remuestreado a 6 m (12 m en móvil) en torno a cada cumbre con ficha. Ortofotografía del PNOA (25–50 cm, CC BY 4.0, © Instituto Geográfico Nacional de España) sobre la cima del Monte Perdido y del Aneto.</li>
      <li>Cobertura del suelo (dónde hay bosque, pradera o roca): <a href="https://esa-worldcover.org" target="_blank" rel="noopener">ESA WorldCover 2021</a> (10 m, CC BY 4.0), © ESA WorldCover project / Contains modified Copernicus Sentinel data. Los árboles se colocan donde ese mapa marca arbolado; su posición exacta, tipo (conífera o frondosa, según altitud y orientación) y tamaño son una aproximación visual, no un inventario forestal. El detalle de la roca (estratos, fracturas, canchales) es una textura procedural, no un levantamiento geológico.</li>
      <li>Imagen de satélite: Sentinel-2 cloudless 2016 de <a href="https://s2maps.eu" target="_blank" rel="noopener">EOX IT Services GmbH</a> (CC BY 4.0), con datos modificados de Copernicus Sentinel.</li>
      <li>Contornos y nombres de los ibones, nombres y posición de pueblos y aldeas, y posición de refugios y hitos: © colaboradores de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (ODbL). Aves y sonido ambiente (viento, agua y cantos): animación y síntesis propias; las aves son una ilustración, no seguimiento real. El quebrantahuesos, el buitre leonado, el buitre negro, el alimoche (de marzo a septiembre) y el rebeco 3D son modelos propios hechos con Blender. Llamada del quebrantahuesos: grabación del canal «adalaves» en <a href="https://www.youtube.com/watch?v=FwhmelnlDUs" target="_blank" rel="noopener">YouTube</a>. Música de fondo: composición propia con instrumentos de VSCO-2 Community Edition (CC0).</li></ul>
      <h3>Fotografías de las cumbres</h3>
      <p>Cada foto se muestra con el nombre de su autor y un enlace a la página de origen (Wikimedia Commons, Wikiloc, Mendikat u otras). Las fotos de Wikiloc y Mendikat se usan con el nombre de su autor y el enlace a su ficha; si eres su autor y prefieres que se quite, dínoslo y se retirará.</p>
      <ul>${usadas.map(({ p, f }) => `<li>${credFoto(p.nombre, f)}</li>`).join('')}</ul>
      ${menoresUsadas.length ? `<details class="creditos-menores"><summary>Cumbres de 2.000 a 3.000 m (${menoresUsadas.length} fotos)</summary><ul>${menoresUsadas.map(({ p, f }) => `<li>${credFoto(p.nombre, f)}</li>`).join('')}</ul></details>` : ''}
      <h3>Recorrido y hitos</h3>
      <ul>${Object.values(rutaDatos).flat().map((r) => `<li>${esc(r.nombre)}: vista previa orientativa del track de <a href="${esc(r.autorUrl)}" target="_blank" rel="noopener">${esc(r.autor)}</a> en Wikiloc; el original, para descargar, está en <a href="${esc(r.fuenteUrl)}" target="_blank" rel="noopener">su ficha</a>.</li>`).join('')}
      <li>Los hitos del recorrido salen de los puntos marcados en los tracks de sus autores (Wikiloc).</li></ul>
      <h3>Fotografías de los hitos</h3>
      <ul>${Object.entries(fotosHitos).map(([k, f]) => `<li>${esc(hitosDatos.find((h) => h.foto === k)?.nombre ?? (peaks.find((p) => p.fotoCima?.foto === k) ? `Cima: ${peaks.find((p) => p.fotoCima?.foto === k).nombre}` : k))}: ${esc(f.autor)}${f.licencia ? `, <a href="${esc(f.licencia_url || f.pagina)}" target="_blank" rel="noopener">${esc(f.licencia.replace('Public domain', 'Dominio público'))}</a>` : ''}${f.pagina ? `, vía <a href="${esc(f.pagina)}" target="_blank" rel="noopener">${esc(f.fuente || 'Wikimedia Commons')}</a>` : ''}.</li>`).join('')}</ul>
      <h3>Modelos 3D y animaciones</h3>
      <ul><li>Animaciones de los montañeros (andar, trotar, correr, agacharse, tropezar y rodar): <a href="https://quaternius.com" target="_blank" rel="noopener">Universal Animation Library</a> de Quaternius, CC0 (dominio público). El maniquí se ha vestido y equipado en Blender (ropa, mochila, casco y bastones propios); la montañera es una variante propia del mismo maniquí, con otra silueta, pelo y coleta.</li>
      <li>Resto de modelos (cimas, fauna, aves, refugios y objetos): modelados en Blender para esta web a partir de fotografías de referencia.</li></ul>
      <h3>Tipografías y software</h3>
      <ul><li>Cormorant Garamond y Barlow, licencia SIL OFL 1.1. three.js, licencia MIT. Blender (GPL) para los modelos.</li></ul>
      <h3>Visitas</h3>
      <p>Esta web usa <a href="https://www.goatcounter.com" target="_blank" rel="noopener">GoatCounter</a>, un contador de visitas sin cookies que no guarda datos personales ni te sigue por otras webs: solo cuenta cuántas veces se abre cada página.</p>
      <h3>Seguridad</h3>
      <p>Esta web no sustituye a una guía, a un parte de condiciones ni a la experiencia en alta montaña. Consulta siempre la previsión y el estado de la ruta antes de salir.</p>`;
  }
  buildAbout();

  // pantalla de inicio: elegir una cumbre por zonas (las activas, primero; las demás, «Próximamente»)
  function irDesdeInicio(id) {
    if (store.get('sonido') !== '0') { sonido.set(true); pintaSonido(); }
    S.mode = 'explore'; document.body.classList.add('is-ready'); $('#intro').classList.add('is-out');
    openPeak(id);
  }
  (function buildIntro() {
    const lista = $('#intro-picos'), btn = $('#btn-elegir');
    const sel = introSel = crearSelector(lista, { picos: peaks, macizos: data.macizos, hecho: (id) => hechos.has(id), pasa: enCapa, capa: capaSel, cercania: kmAlCentro, elegir: (id) => { abre(false); irDesdeInicio(id); } });
    // en el escritorio el desplegable se ajusta al espacio real: se abre hacia el lado con más sitio y se desplaza por dentro (en el móvil es una hoja a pantalla casi completa)
    const ajusta = () => {
      if (lista.hidden || isMobile()) { lista.style.maxHeight = ''; return; }
      const r = btn.getBoundingClientRect(), vh = window.innerHeight, abajo = vh - r.bottom - 20, arriba = r.top - 96;   // 96 px: deja libre la cabecera con el logo
      const sube = abajo < 300 && arriba > abajo;
      lista.classList.toggle('arriba', sube);
      lista.style.maxHeight = Math.max(180, Math.min(sube ? arriba : abajo, vh * 0.7)) + 'px';
    };
    const abre = (v) => { lista.hidden = !v; btn.setAttribute('aria-expanded', v); document.body.classList.toggle('selector-abierto', v); if (v) { sel.alAbrir(); ajusta(); if (matchMedia('(hover: hover)').matches) sel.input.focus(); } };
    window.addEventListener('resize', ajusta);
    btn.addEventListener('click', () => abre(lista.hidden));
    sel.cerrar.addEventListener('click', () => abre(false));
    sel.input.addEventListener('keydown', (e) => { if (e.key === 'Escape') abre(false); });
    lista.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); abre(false); btn.focus(); } });
    document.addEventListener('pointerdown', (e) => { if (!lista.hidden && !e.target.closest('#intro-elegir')) abre(false); });
  })();
  $('#btn-about').addEventListener('click', () => about.showModal());
  about.addEventListener('click', (e) => { if (e.target === about) about.close(); });

  // — arranque —
  buildFilters(); refreshLists();
  const introState = (p) => ({ t: new THREE.Vector3(p.w.x, 1900, p.w.z + 1500), theta: -0.4, phi: 1.04, r: 26000 });
  const focusPeak = peaks.find((p) => p.id === 'balaitus') ?? peaks[0];
  applyState(introState(focusPeak));
  await terrain.ready;
  window.Carga?.paso(5);
  terrain.settle(camera);

  function startExplore() {
    S.mode = 'explore'; document.body.classList.add('is-ready'); $('#intro').classList.add('is-out');
    flyTo(HOME, { dur: 4.2 }).then(() => { if (!S.active) showHints(); });
  }
  $('#btn-start').addEventListener('click', () => { if (store.get('sonido') !== '0') { sonido.set(true); pintaSonido(); } startExplore(); });

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    if (S.active) S.shiftTo = viewShift();
  });
  addEventListener('hashchange', () => { if (!new URLSearchParams(location.search).has('directo')) return; const id = location.hash.slice(1); if (byId[id] && S.mode === 'explore' && S.active !== id) openPeak(id, { hash: false }); });

  // enlace directo a una cumbre (solo con ?directo#id): se salta la introducción. Sin ?directo se ignora el # para que
  // recargar o restaurar la pestaña nunca abra una ficha sola.
  const direct = new URLSearchParams(location.search).has('directo') ? byId[location.hash.slice(1)] : null;
  if (!direct && location.hash) history.replaceState(null, '', location.pathname + location.search);
  if (direct) { S.mode = 'explore'; document.body.classList.add('is-ready'); $('#intro').classList.add('is-out'); await openPeak(direct.id, { instant: true, hash: false }); }

  // — bucle —
  let last = performance.now(), orbit = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    { // colores del cielo, la niebla y la luz ambiente hacia los de la luz elegida (el primer fotograma, de golpe)
      const L = S.look, T = L.to, kc = L.ini ? 1 - Math.exp(-dt * 1.1) : 1, u = sky.material.uniforms; L.ini = true;
      u.uTop.value.lerp(T.top, kc); u.uMid.value.lerp(T.mid, kc); u.uHor.value.lerp(T.hor, kc); u.uGlow.value.lerp(T.glow, kc);
      L.glowK += (T.glowK - L.glowK) * kc; u.uGlowK.value = L.glowK;
      scene.fog.color.lerp(T.fog, kc); renderer.setClearColor(scene.fog.color);
      hemi.color.lerp(T.hemiC, kc); hemi.groundColor.lerp(T.hemiG, kc); L.hemiK += (T.hemiK - L.hemiK) * kc; hemi.intensity = L.hemiK * Math.PI;
      clouds?.setTinte(T.nube, kc);
    }
    { const b = S.bruma, kk = 1 - Math.exp(-dt * 0.9); b.k += (b.to.k - b.k) * kk; b.t += (b.to.t - b.t) * kk; scene.fog.near = 24000 + Math.min(0.995, b.k); scene.fog.far = 100000 + Math.min(0.995, b.t); }   // la bruma cambia suavemente al cambiar la luz
    if (S.vuelo) tickVuelo(dt);
    else if (S.flight) tickFlight(dt);
    else if (S.mode === 'intro') {
      if (!reduced) { orbit += dt * 0.03; const s = introState(focusPeak); s.theta += orbit; applyState(s); }
    } else {
      controls.update();
      const t = controls.target, mx = geo.W / 2 - 3000, mz = geo.D / 2 - 3000;
      t.x = clamp(t.x, -mx, mx); t.z = clamp(t.z, -mz, mz);
      t.y += (geo.heightAt(t.x, t.z) - t.y) * 0.08;
      const g = geo.heightAt(camera.position.x, camera.position.z) + (S.detalle ? 18 : 120);
      if (camera.position.y < g) camera.position.y = g;
    }
    // desplazamiento del encuadre para que la cumbre quede a la vista junto a la ficha
    const k = 1 - Math.exp(-dt * 6);
    S.shift.x += (S.shiftTo.x - S.shift.x) * k; S.shift.y += (S.shiftTo.y - S.shift.y) * k;
    if (Math.abs(S.shift.x) + Math.abs(S.shift.y) > 0.5) camera.setViewOffset(innerWidth, innerHeight, S.shift.x, S.shift.y, innerWidth, innerHeight);
    else if (camera.view?.enabled) camera.clearViewOffset();
    { const cerca = S.detalle ? 8 : 60; if (camera.near !== cerca) { camera.near = cerca; camera.updateProjectionMatrix(); } }   // en las vistas de cerca (cima, Paso de Mahoma) el recorte cercano de 60 m cortaba los modelos
    camera.updateMatrixWorld();
    sky.position.copy(camera.position);   // la cúpula del cielo acompaña a la cámara (con el mapa grande, parte quedaba más allá del plano lejano)
    terrain.update(camera); cumbres.update(camera); veg.update(camera); banderines.update(camera, now / 1000);
    clouds.update(dt, camera, !reduced);
    updatePins();
    const tt = now / 1000;
    lagos?.update(tt); aves?.update(tt); fauna?.update(tt, dt);
    for (const l of Object.values(rutas)) for (const r of l) { r.update(dt); r.escalar(camera.position); }
    etiquetas.length = 0;
    const cerca = updateLagos(); updateHitos(); updatePueblos(); colocaEtiquetaActiva(dt); agrupaPines(); etiquetasPicos(); distribuyeEtiquetas(dt);
    if (S.detalle && !S.flight && controls.target.distanceTo(camera.position) > 700) { S.detalle = false; controls.minDistance = 500; }   // el usuario se ha alejado: vuelven los límites de siempre
    if (!!S.detalle !== detPrev) { detPrev = !!S.detalle; for (const l of Object.values(rutas)) for (const r of l) r.delgada?.(detPrev); }
    ajustaVelocidad(dt); aplicaGiro(dt);
    llamadasAve(now);
    sonido.update(camera.position.y - geo.heightAt(camera.position.x, camera.position.z), cerca);
    const az = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    needle.style.transform = `rotate(${az}rad)`;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  await window.Carga?.fin();   // el 100 % se ve un instante antes de abrir el mapa
  document.body.classList.remove('is-loading');
  window.tresmiles = { scene, geo, veg, cumbres, nombrePico, puntoDelRelieve, openPeak, startExplore, goHome, camera, controls, terrain, S, peaks, flyTo, closeFicha, aves, fauna, lagos, sonido, rutas };
}

boot().catch((err) => {
  console.error(err);
  const t = $('#load-text'); if (t) t.textContent = 'No se ha podido iniciar el mapa 3D. Comprueba que tu navegador admite WebGL.';
});
