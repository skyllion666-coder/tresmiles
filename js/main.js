import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { makeGeo } from './geo.js';
import { Terrain } from './terrain.js';
import { makeSky, Clouds, HORIZON } from './sky.js';
import { crearLagos, crearAves, crearSonido } from './vida.js?v=10';
import { cargarRuta, crearRuta } from './ruta.js?v=16';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => new Intl.NumberFormat('es-ES', { useGrouping: 'always' }).format(n);
const km = (m) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(m / 1000);
const json = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const wrapPi = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } } };
const isMobile = () => innerWidth <= 760;

const SUN = [
  { id: 'manana', nombre: 'Mañana', az: 105, el: 20, col: '#ffd7a8', k: 1.0 },
  { id: 'mediodia', nombre: 'Mediodía', az: 180, el: 52, col: '#fff3dc', k: 0.95 },
  { id: 'tarde', nombre: 'Tarde', az: 252, el: 18, col: '#ffbf86', k: 1.0 },
];

async function boot() {
  const [data, fotos, meta] = await Promise.all([json('data/peaks.json'), json('data/fotos.json'), json('data/terrain/meta.json')]);
  const heights = new Uint16Array(await (await fetch('data/terrain/heights.bin')).arrayBuffer());
  $('#load-text').textContent = 'Preparando el mapa…';

  // — motor —
  const canvas = $('#gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight, false);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(HORIZON, 24000, 100000);
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 60, 260000);
  scene.add(makeSky());
  const hemi = new THREE.HemisphereLight(0xe6eef6, 0x6d7466, 0.78 * Math.PI);
  const sun = new THREE.DirectionalLight(0xffffff, 0.62 * Math.PI);
  scene.add(hemi, sun);

  const geo = makeGeo(meta, heights);
  const terrain = new Terrain({ scene, meta, heights, geo, renderer, base: 'data/terrain' });
  const clouds = new Clouds(scene, geo);
  const lagos = await crearLagos({ scene, geo, url: 'data/lagos.json' }).catch((e) => { console.warn('lagos', e); return null; });
  const sonido = crearSonido();

  // — cumbres activas (dentro del terreno cargado) —
  const params = new URLSearchParams(location.search);
  const activos = params.has('todos') ? data.picos.map((p) => p.id) : data.activos;
  const macizoName = Object.fromEntries(data.macizos.map((m) => [m.id, m.nombre]));
  const difName = Object.fromEntries(data.dificultades.map((d) => [d.id, d.nombre]));
  const difN = { moderada: 1, alta: 2, 'muy-alta': 3 };
  const peaks = data.picos.filter((p) => activos.includes(p.id)).map((p) => {
    const q = geo.toXZ(p.lon, p.lat);
    return { ...p, inside: Math.abs(q.x) < geo.W / 2 - 800 && Math.abs(q.z) < geo.D / 2 - 800, w: geo.summitNear(q.x, q.z) };
  }).filter((p) => p.inside).sort((a, b) => b.altitud - a.altitud);
  const byId = Object.fromEntries(peaks.map((p) => [p.id, p]));
  const bal = peaks.find((p) => p.id === 'balaitus');
  const aves = bal && !reduced ? crearAves({ scene, geo, centro: { x: bal.w.x, z: bal.w.z } }) : null;

  // recorridos (si existe el archivo; los de data/rutas/local/ no se publican)
  const rutas = {};
  for (const p of peaks) for (const rid of p.rutas ?? []) {
    try {
      const ruta = await cargarRuta(rid);
      if (!ruta.fuenteUrl || !ruta.autor) { console.warn(`Ruta ${rid} sin autor o sin enlace a su ficha: no se muestra`); continue; }
      (rutas[p.id] ??= []).push(crearRuta({ scene, geo, ruta }));
    } catch { /* sin ruta en esta copia */ }
  }
  const rutasDe = (id) => rutas[id] ?? [];
  let rutaOn = true;

  // etiquetas de ibones (solo con la cámara cerca)
  const lagoEls = (lagos?.nombrados ?? []).map((l) => {
    const el = document.createElement('span'); el.className = 'lago is-hidden'; el.textContent = l.nombre; $('#pins').appendChild(el); return { l, el };
  });

  // — controles —
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.09, screenSpacePanning: false, zoomToCursor: true, minDistance: 500, maxDistance: 90000, maxPolarAngle: 1.4, rotateSpeed: 0.6, zoomSpeed: 0.9, enabled: false });
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

  const S = { mode: 'intro', active: null, flight: null, shift: { x: 0, y: 0 }, shiftTo: { x: 0, y: 0 }, sun: 0, plegada: false, sheetH: null, vuelo: null, hovered: null, filters: { macizo: new Set(), dif: new Set(), alt: 3000 } };

  // — estados de cámara —
  const HOME = { t: new THREE.Vector3(0, 1400, -1500), theta: 0.1, phi: 0.66, r: 41000 };
  const camState = () => {
    const o = camera.position.clone().sub(controls.target); const r = o.length();
    return { t: controls.target.clone(), r, phi: Math.acos(clamp(o.y / r, -1, 1)), theta: Math.atan2(o.x, o.z) };
  };
  const applyState = (s) => {
    const sp = Math.sin(s.phi);
    camera.position.set(s.t.x + s.r * sp * Math.sin(s.theta), s.t.y + s.r * Math.cos(s.phi), s.t.z + s.r * sp * Math.cos(s.theta));
    const g = geo.heightAt(camera.position.x, camera.position.z) + 140;
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
    b.className = 'pin is-hidden'; b.type = 'button'; b.dataset.id = p.id;
    b.setAttribute('aria-label', `${p.nombre}, ${fmt(p.altitud)} metros. Abrir ficha`);
    b.innerHTML = `<span class="pin-label">${esc(p.nombre)}<i>${fmt(p.altitud)} m</i></span>`;
    b.addEventListener('click', () => openPeak(p.id));
    pinsEl.appendChild(b); pinEls.set(p.id, b);
  }
  const tmp = new THREE.Vector3();
  function occluded(pt) {
    const c = camera.position;
    for (let i = 1; i <= 26; i++) {
      const t = i / 27;
      const x = lerp(c.x, pt.x, t), y = lerp(c.y, pt.y, t), z = lerp(c.z, pt.z, t);
      if (geo.heightAt(x, z) > y + 14) return true;
    }
    return false;
  }
  function updatePins() {
    const W = innerWidth, H = innerHeight;
    for (const p of peaks) {
      const el = pinEls.get(p.id);
      tmp.set(p.w.x, p.w.y + 25, p.w.z);
      const dist = camera.position.distanceTo(tmp);
      tmp.project(camera);
      const show = S.mode === 'explore' && tmp.z < 1 && Math.abs(tmp.x) < 1.08 && Math.abs(tmp.y) < 1.08 && !occluded({ x: p.w.x, y: p.w.y + 25, z: p.w.z });
      el.classList.toggle('is-hidden', !show);
      if (!show) continue;
      el.style.transform = `translate3d(${((tmp.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-tmp.y * 0.5 + 0.5) * H).toFixed(1)}px, 0)`;
      el.classList.toggle('is-active', S.active === p.id);
      el.classList.toggle('show-label', S.active === p.id || dist < 15000);
      el.classList.toggle('is-dim', !passes(p));
    }
  }

  // hitos de la ruta y refugios (coordenadas de OpenStreetMap)
  const TIPO_HITO = { refugio: 'Refugio', paso: 'Paso', vivac: 'Vivac', cima: 'Cima', ibon: 'Ibón', barranco: 'Barranco', lugar: 'Lugar' };
  const fotosHitos = await json('data/fotos_hitos.json').catch(() => ({}));
  let hitoTimer = 0;
  const hitos = (await json('data/hitos.json').catch(() => [])).map((h) => {
    const q = geo.toXZ(h.lon, h.lat);
    if (Math.abs(q.x) > geo.W / 2 - 800 || Math.abs(q.z) > geo.D / 2 - 800) return null;
    const el = document.createElement('span'); el.className = `hito hito-${h.tipo} is-hidden`;
    el.innerHTML = `<button type="button" class="hito-btn" aria-expanded="false" aria-label="${esc(h.nombre)}"><i></i></button><b>${esc(h.nombre)}<em>${esc(TIPO_HITO[h.tipo] ?? '')}</em>${fotoHito(h)}</b>`;
    if (h.foto && fotosHitos[h.foto]) el.classList.add('con-foto');
    const R0 = Object.values(rutas).flat()[0], ps = R0 ? R0.pasos(q.x, q.z) : [];
    if (ps.length) el.querySelector('em').textContent += ` · km ${ps.map((c) => km(c.dist)).join(' y ')} del recorrido`;
    el.title = h.nota; $('#pins').appendChild(el);
    el.querySelector('.hito-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const abrir = !el.classList.contains('is-open');
      closeHitos(); if (abrir) { el.classList.add('is-open'); e.currentTarget.setAttribute('aria-expanded', 'true'); if (el.classList.contains('con-foto')) hitoTimer = setTimeout(closeHitos, 15000); }
    });
    return { h, el, x: q.x, y: geo.heightAt(q.x, q.z) + 12, z: q.z };
  }).filter(Boolean);
  function fotoHito(h) {
    const f = fotosHitos[h.foto]; if (!f) return '';
    return `<img src="img/hitos/${esc(h.foto)}.jpg" width="${f.w}" height="${f.h}" alt="${esc(h.nombre)}" loading="lazy"><small>Foto: ${esc(f.autor)}, <a href="${esc(f.licencia_url || f.pagina)}" target="_blank" rel="noopener">${esc(f.licencia)}</a>, vía <a href="${esc(f.pagina)}" target="_blank" rel="noopener">Wikimedia Commons</a></small>`;
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
      let show = S.mode === 'explore' && dist < 9500;
      if (show) { hitoTmp.project(camera); show = hitoTmp.z < 1 && Math.abs(hitoTmp.x) < 1.05 && Math.abs(hitoTmp.y) < 1.05 && !occluded({ x: o.x, y: o.y + 10, z: o.z }); }
      o.el.classList.toggle('is-hidden', !show);
      if (!show) o.el.classList.remove('is-open');
      if (show) o.el.style.transform = `translate3d(${((hitoTmp.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-hitoTmp.y * 0.5 + 0.5) * H).toFixed(1)}px, 0)`;
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
      el.classList.toggle('is-hidden', !show);
      if (show) el.style.transform = `translate3d(${((lagoTmp.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-lagoTmp.y * 0.5 + 0.5) * H).toFixed(1)}px, 0)`;
    }
    return cerca;
  }

  // — filtros —
  const passes = (p) => (!S.filters.macizo.size || S.filters.macizo.has(p.macizo)) && (!S.filters.dif.size || S.filters.dif.has(p.dificultad)) && p.altitud >= S.filters.alt;
  const visiblePeaks = () => peaks.filter(passes);
  function buildFilters() {
    if (peaks.length < 2) return;
    $('#btn-filters').hidden = false;
    const mac = [...new Set(peaks.map((p) => p.macizo))];
    $('#f-macizo').innerHTML = mac.map((m) => `<button type="button" class="chip" aria-pressed="false" data-k="macizo" data-v="${m}">${esc(macizoName[m])}</button>`).join('');
    $('#f-dif').innerHTML = data.dificultades.map((d) => `<button type="button" class="chip" aria-pressed="false" data-k="dif" data-v="${d.id}">${esc(d.nombre)}</button>`).join('');
    $('#filters').addEventListener('click', (e) => {
      const c = e.target.closest('.chip'); if (!c) return;
      const set = S.filters[c.dataset.k], on = c.getAttribute('aria-pressed') !== 'true';
      c.setAttribute('aria-pressed', on); on ? set.add(c.dataset.v) : set.delete(c.dataset.v); refreshLists();
    });
    $('#f-alt').addEventListener('input', (e) => { S.filters.alt = +e.target.value; $('#f-alt-out').textContent = `${fmt(S.filters.alt)} m`; refreshLists(); });
    $('#f-reset').addEventListener('click', () => {
      S.filters.macizo.clear(); S.filters.dif.clear(); S.filters.alt = 3000; $('#f-alt').value = 3000; $('#f-alt-out').textContent = '3.000 m';
      document.querySelectorAll('#filters .chip').forEach((c) => c.setAttribute('aria-pressed', 'false')); refreshLists();
    });
    $('#btn-filters').addEventListener('click', () => {
      const open = $('#filters').hidden; $('#filters').hidden = !open; $('#btn-filters').setAttribute('aria-expanded', open);
    });
  }

  // — selector inferior —
  const listEl = $('#list'), listBtn = $('#btn-list');
  function refreshLists() {
    const vis = visiblePeaks();
    listEl.innerHTML = vis.length
      ? vis.map((p) => `<li role="presentation"><button type="button" role="option" aria-selected="${S.active === p.id}" data-id="${p.id}"><span>${esc(p.nombre)}</span><span>${fmt(p.altitud)} m</span></button></li>`).join('')
      : '<li class="empty">Ninguna cumbre cumple los filtros.</li>';
    const fc = $('#f-count'); if (fc) fc.textContent = `${vis.length} de ${peaks.length} cumbres`;
    $('#dock-label').textContent = S.active ? byId[S.active].nombre : peaks.length === 1 ? `Explorar el ${peaks[0].nombre}` : 'Explorar las cumbres';
  }
  const setList = (open) => { listEl.hidden = !open; listBtn.setAttribute('aria-expanded', open); };
  listBtn.addEventListener('click', () => setList(listEl.hidden));
  listEl.addEventListener('click', (e) => { const b = e.target.closest('button[data-id]'); if (b) { setList(false); openPeak(b.dataset.id); } });
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#dock')) setList(false); });

  // — ficha —
  const fichaEl = $('#ficha'), fichaBody = $('#ficha-body');
  function fichaHTML(p) {
    const f = fotos[p.foto], n = difN[p.dificultad];
    const vis = visiblePeaks(), i = vis.findIndex((x) => x.id === p.id);
    const nav = vis.length > 1 && i >= 0
      ? `<div class="nav2"><button type="button" data-go="${vis[(i - 1 + vis.length) % vis.length].id}">← Anterior</button><button type="button" data-go="${vis[(i + 1) % vis.length].id}">Siguiente →</button></div>` : '';
    return `
      <figure><img src="img/peaks/${p.foto}.jpg" width="${f.w}" height="${f.h}" alt="${esc(p.nombre)}: ${esc(p.pie)}">
        <figcaption>${esc(p.pie)} Foto: ${esc(f.autor)}, <a href="${esc(f.licencia_url)}" target="_blank" rel="noopener">${esc(f.licencia)}</a>, vía <a href="${esc(f.pagina)}" target="_blank" rel="noopener">Wikimedia Commons</a>.</figcaption></figure>
      <h2>${esc(p.nombre)}</h2><p class="alias">${esc(p.alias)}</p>
      <div class="alt"><strong>${fmt(p.altitud)}</strong><span>metros</span></div>${p.otras ? `<p class="otras">${esc(p.otras)}</p>` : ''}
      <dl class="stats">
        <div><dt>Macizo</dt><dd>${esc(macizoName[p.macizo])}</dd></div>
        <div><dt>Situación</dt><dd>${p.frontera ? 'Frontera Aragón–Francia' : 'Aragón'}</dd></div>
        <div class="wide"><dt>Valle o pueblo de acceso</dt><dd>${esc(p.acceso)}</dd></div>
        <div><dt>Desnivel</dt><dd>${esc(p.desnivel)}</dd></div>
        <div><dt>Dificultad</dt><dd><span class="dif" data-n="${n}"><i><b></b><b></b><b></b></i>${esc(difName[p.dificultad])}</span><br><small>${esc(p.grado)}</small></dd></div>
        <div class="wide"><dt>Mejor época</dt><dd>${esc(p.epoca)}</dd></div>
      </dl>
      <h3>Ruta normal</h3><p class="ruta">${esc(p.ruta)}</p>
      <h3>Descripción</h3><p>${esc(p.descripcion)}</p>
      ${p.curiosidad ? `<h3>Curiosidad</h3><p>${esc(p.curiosidad)}</p>` : ''}
      ${rutaHTML(p)}
      ${p.enlace && !rutasDe(p.id).some((r) => r.ruta.fuenteUrl === p.enlace.url) ? `<p class="enlace-ruta"><a href="${esc(p.enlace.url)}" target="_blank" rel="noopener">${esc(p.enlace.texto)} ↗</a></p>` : ''}
      <div class="aviso"><b>Información orientativa.</b> Las cifras proceden de guías y fichas de ruta y varían según la fuente. Antes de salir, contrasta con una guía actual, el estado de la ruta y la previsión del tiempo: la alta montaña implica riesgo.</div>${nav}`;
  }
  function rutaHTML(p) {
    const r = rutasDe(p.id)[0]?.ruta; if (!r) return '';
    return `<h3>Recorrido en el mapa</h3>
      <p class="ruta-nombre">${esc(r.nombre)}</p>
      <div class="ruta-datos"><span><b>${km(r.distancia)} km</b>distancia</span><span><b>+${fmt(r.desnivel)} m</b>desnivel acumulado</span><span><b>${fmt(r.max)} m</b>punto más alto</span></div>
      ${rutasDe(p.id)[0].perfil()}
      <div class="ruta-acciones">
        <button type="button" class="btn-ruta" data-act="plegar">Ver el recorrido a pantalla completa</button>
        <button type="button" class="btn-ruta" data-act="vuelo">Volar por la ruta</button>
        <button type="button" class="btn-ruta btn-suave" id="btn-ruta" aria-pressed="${rutaOn}">${rutaOn ? 'Ocultar la ruta del mapa' : 'Mostrar la ruta en el mapa'}</button>
      </div>
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
  foldBtn.addEventListener('click', () => plegar(!S.plegada));
  tab.addEventListener('click', () => plegar(false));
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
  fichaBody.addEventListener('pointerup', sueltaPerfil); fichaBody.addEventListener('pointerleave', sueltaPerfil, true);

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
    _w.copy(a.pos).addScaledVector(V.dir, -1500); _w.y = Math.max(a.pos.y + 700, geo.heightAt(_w.x, _w.z) + 320);
    const k = 1 - Math.exp(-dt * 4);
    V.pos.lerp(_w, k); _l.copy(b.pos); _l.y -= 150; V.look.lerp(_l, k);
    camera.position.copy(V.pos); controls.target.copy(V.look); camera.lookAt(V.look);
    R.cursor(V.d);
    $('#vuelo-txt').textContent = `${(V.d / 1000).toFixed(1).replace('.', ',')} km · ${fmt(Math.round(a.ele))} m`;
  }
  btnVuelo.addEventListener('click', () => (S.vuelo ? pararVuelo(true) : iniciarVuelo()));
  $('#vuelo-stop').addEventListener('click', () => pararVuelo(true));
  canvas.addEventListener('pointerdown', () => { if (S.vuelo) pararVuelo(false); });

  async function openPeak(id, { instant = false, hash = true } = {}) {
    const p = byId[id]; if (!p) return;
    pararVuelo(false); S.active = id; setList(false);
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
  function closeFicha({ fly = false } = {}) {
    if (!S.active) return;
    const was = S.active; pararVuelo(false); S.active = null; pintaRuta(null);
    S.plegada = false; document.body.classList.remove('ficha-plegada'); fichaEl.classList.remove('is-folded'); tab.hidden = true; btnVuelo.hidden = true; aplicaAltura();
    fichaEl.classList.remove('is-open'); fichaEl.setAttribute('aria-hidden', 'true'); document.body.classList.remove('ficha-open');
    history.replaceState(null, '', location.pathname + location.search); S.shiftTo = { x: 0, y: 0 }; refreshLists();
    pinEls.get(was)?.focus({ preventScroll: true });
    if (fly) goHome();
  }
  fichaBody.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) openPeak(b.dataset.go); });
  $('#ficha-close').addEventListener('click', () => closeFicha());
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (S.vuelo) pararVuelo(true); else if (!listEl.hidden) setList(false); else if (!$('#filters').hidden) { $('#filters').hidden = true; } else closeFicha(); } });
  const goHome = () => { pararVuelo(false); S.active = null; pintaRuta(null); btnVuelo.hidden = true; refreshLists(); return flyTo(HOME, { shift: { x: 0, y: 0 } }); };
  $('#btn-home').addEventListener('click', () => { if (S.mode === 'explore') { closeFicha(); goHome(); } });
  $('#brand').addEventListener('click', (e) => { e.preventDefault(); if (S.mode === 'explore') { closeFicha(); goHome(); } });

  // — luz —
  function setSun(i) {
    S.sun = i; const s = SUN[i], az = (s.az * Math.PI) / 180, el = (s.el * Math.PI) / 180;
    sun.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(1000);
    lagos?.setSol(sun.position, s.col);
    sun.color.set(s.col); sun.intensity = s.k * 0.62 * Math.PI * (s.el < 30 ? 1.25 : 1);
    $('#light-name').textContent = s.nombre; $('#btn-light').setAttribute('aria-label', `Cambiar la luz: ${s.nombre.toLowerCase()}`);
  }
  $('#btn-light').addEventListener('click', (e) => {
    setSun((S.sun + 1) % SUN.length); const b = e.currentTarget; b.classList.add('show-tip'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('show-tip'), 1600);
  });
  setSun(0);

  // — sonido (activo desde el inicio; si el navegador lo bloquea, arranca con el primer toque) —
  const btnSound = $('#btn-sound');
  const pintaSonido = () => { btnSound.setAttribute('aria-pressed', sonido.on); btnSound.setAttribute('aria-label', sonido.on ? 'Silenciar el sonido ambiente' : 'Activar el sonido ambiente'); btnSound.classList.toggle('is-on', sonido.on); };
  btnSound.addEventListener('click', async () => { await sonido.set(!sonido.on); store.set('sonido', sonido.on ? '1' : '0'); pintaSonido(); });
  pintaSonido();
  if (store.get('sonido') !== '0') { sonido.set(true); pintaSonido(); }   // suena desde el principio; el botón lo silencia y se recuerda

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
    const usadas = peaks.map((p) => ({ p, f: fotos[p.foto] }));
    $('#about-body').innerHTML = `
      <h2>Tresmiles del Pirineo aragonés</h2>
      <p>Explorador 3D de las cumbres que superan los 3.000 metros en el Pirineo aragonés y su frontera. Por ahora incluye el Balaitús; el resto de las grandes cumbres se irá añadiendo.</p>
      <h3>Cumbres y rutas</h3>
      <ul><li>Altitudes y nombres oficiales: Orden VMV/914/2020 (BOA n.º 192) del Gobierno de Aragón, contrastadas con tresmiles.es (CC0), Buyse (1993) y UIAA (1995).</li>
      <li>Rutas, desniveles y dificultades: resumen propio a partir de guías y fichas públicas (Rutas Pirineos, Xiruca, Hiking Iberia, SummitPost, Wikiloc). Son cifras orientativas: varían según la fuente.</li></ul>
      <h3>Relieve e imagen</h3>
      <ul><li>Relieve: Copernicus DEM GLO-30, © DLR e.V. 2010-2014 y © Airbus Defence and Space GmbH 2014-2018, proporcionado por la Unión Europea y la ESA. Se muestra con una exageración vertical de ×1,3.</li>
      <li>Imagen de satélite: Sentinel-2 cloudless 2016 de <a href="https://s2maps.eu" target="_blank" rel="noopener">EOX IT Services GmbH</a> (CC BY 4.0), con datos modificados de Copernicus Sentinel.</li>
      <li>Contornos y nombres de los ibones, y posición de refugios y hitos: © colaboradores de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (ODbL). Aves y sonido ambiente (viento, agua y cantos): animación y síntesis propias; las aves son una ilustración, no seguimiento real. Música de fondo: composición propia con instrumentos de VSCO-2 Community Edition (CC0).</li></ul>
      <h3>Fotografías (Wikimedia Commons)</h3>
      <ul>${usadas.map(({ p, f }) => `<li>${esc(p.nombre)}: <a href="${esc(f.pagina)}" target="_blank" rel="noopener">${esc(f.archivo)}</a>, ${esc(f.autor)}, <a href="${esc(f.licencia_url)}" target="_blank" rel="noopener">${esc(f.licencia)}</a>.</li>`).join('')}</ul>
      <h3>Tipografías y software</h3>
      <ul><li>Cormorant Garamond y Barlow, licencia SIL OFL 1.1. three.js, licencia MIT.</li></ul>
      <h3>Seguridad</h3>
      <p>Esta web no sustituye a una guía, a un parte de condiciones ni a la experiencia en alta montaña. Consulta siempre la previsión y el estado de la ruta antes de salir.</p>`;
  }
  buildAbout();
  $('#btn-about').addEventListener('click', () => about.showModal());
  about.addEventListener('click', (e) => { if (e.target === about) about.close(); });

  // — arranque —
  buildFilters(); refreshLists();
  const introState = (p) => ({ t: new THREE.Vector3(p.w.x, 1900, p.w.z + 1500), theta: -0.4, phi: 1.04, r: 26000 });
  const focusPeak = peaks.find((p) => p.id === 'balaitus') ?? peaks[0];
  applyState(introState(focusPeak));
  await terrain.ready;
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
    if (S.vuelo) tickVuelo(dt);
    else if (S.flight) tickFlight(dt);
    else if (S.mode === 'intro') {
      if (!reduced) { orbit += dt * 0.03; const s = introState(focusPeak); s.theta += orbit; applyState(s); }
    } else {
      controls.update();
      const t = controls.target, mx = geo.W / 2 - 3000, mz = geo.D / 2 - 3000;
      t.x = clamp(t.x, -mx, mx); t.z = clamp(t.z, -mz, mz);
      t.y += (geo.heightAt(t.x, t.z) - t.y) * 0.08;
      const g = geo.heightAt(camera.position.x, camera.position.z) + 120;
      if (camera.position.y < g) camera.position.y = g;
    }
    // desplazamiento del encuadre para que la cumbre quede a la vista junto a la ficha
    const k = 1 - Math.exp(-dt * 6);
    S.shift.x += (S.shiftTo.x - S.shift.x) * k; S.shift.y += (S.shiftTo.y - S.shift.y) * k;
    if (Math.abs(S.shift.x) + Math.abs(S.shift.y) > 0.5) camera.setViewOffset(innerWidth, innerHeight, S.shift.x, S.shift.y, innerWidth, innerHeight);
    else if (camera.view?.enabled) camera.clearViewOffset();
    camera.updateMatrixWorld();
    terrain.update(camera);
    clouds.update(dt, camera, !reduced);
    updatePins();
    const tt = now / 1000;
    lagos?.update(tt); aves?.update(tt);
    for (const l of Object.values(rutas)) for (const r of l) { r.update(dt); r.escalar(camera.position); }
    const cerca = updateLagos(); updateHitos();
    sonido.update(camera.position.y - geo.heightAt(camera.position.x, camera.position.z), cerca);
    const az = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    needle.style.transform = `rotate(${az}rad)`;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  document.body.classList.remove('is-loading');
  window.tresmiles = { openPeak, startExplore, goHome, camera, controls, terrain, S, peaks, flyTo, closeFicha, aves, lagos, sonido, rutas };
}

boot().catch((err) => {
  console.error(err);
  const t = $('#load-text'); if (t) t.textContent = 'No se ha podido iniciar el mapa 3D. Comprueba que tu navegador admite WebGL.';
});
