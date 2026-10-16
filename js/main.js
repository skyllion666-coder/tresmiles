import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { makeGeo } from './geo.js';
import { Terrain } from './terrain.js';
import { makeSky, Clouds, HORIZON } from './sky.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => new Intl.NumberFormat('es-ES', { useGrouping: 'always' }).format(n);
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

  // — controles —
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.09, screenSpacePanning: false, zoomToCursor: true, minDistance: 500, maxDistance: 90000, maxPolarAngle: 1.4, rotateSpeed: 0.6, zoomSpeed: 0.9, enabled: false });
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

  const S = { mode: 'intro', active: null, flight: null, shift: { x: 0, y: 0 }, shiftTo: { x: 0, y: 0 }, sun: 0, hovered: null, filters: { macizo: new Set(), dif: new Set(), alt: 3000 } };

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
  const peakState = (p) => ({ t: new THREE.Vector3(p.w.x, p.w.y - 60, p.w.z), theta: p.vista?.theta ?? -0.42, phi: p.vista?.phi ?? 1.17, r: p.vista?.r ?? 4300 });
  const viewShift = () => (isMobile() ? { x: 0, y: Math.min(innerHeight * 0.66, 620) / 2 } : { x: Math.min(460, innerWidth) / 2, y: 0 });

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
      <div class="aviso"><b>Información orientativa.</b> Las cifras proceden de guías y fichas de ruta y varían según la fuente. Antes de salir, contrasta con una guía actual, el estado de la ruta y la previsión del tiempo: la alta montaña implica riesgo.</div>${nav}`;
  }
  async function openPeak(id, { instant = false, hash = true } = {}) {
    const p = byId[id]; if (!p) return;
    S.active = id; setList(false);
    fichaBody.innerHTML = fichaHTML(p); fichaBody.scrollTop = 0;
    $('#ficha-macizo').textContent = macizoName[p.macizo];
    fichaEl.classList.add('is-open'); fichaEl.setAttribute('aria-hidden', 'false'); document.body.classList.add('ficha-open');
    hideHints(); refreshLists();
    if (hash) history.replaceState(null, '', `#${id}`);
    fichaEl.focus({ preventScroll: true });
    await flyTo(peakState(p), { shift: viewShift(), instant });
    terrain.update(camera, 8);
  }
  function closeFicha({ fly = false } = {}) {
    if (!S.active) return;
    const was = S.active; S.active = null;
    fichaEl.classList.remove('is-open'); fichaEl.setAttribute('aria-hidden', 'true'); document.body.classList.remove('ficha-open');
    history.replaceState(null, '', location.pathname + location.search); S.shiftTo = { x: 0, y: 0 }; refreshLists();
    pinEls.get(was)?.focus({ preventScroll: true });
    if (fly) goHome();
  }
  fichaBody.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) openPeak(b.dataset.go); });
  $('#ficha-close').addEventListener('click', () => closeFicha());
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!listEl.hidden) setList(false); else if (!$('#filters').hidden) { $('#filters').hidden = true; } else closeFicha(); } });
  const goHome = () => { S.active = null; refreshLists(); return flyTo(HOME, { shift: { x: 0, y: 0 } }); };
  $('#btn-home').addEventListener('click', () => { if (S.mode === 'explore') { closeFicha(); goHome(); } });
  $('#brand').addEventListener('click', (e) => { e.preventDefault(); if (S.mode === 'explore') { closeFicha(); goHome(); } });

  // — luz —
  function setSun(i) {
    S.sun = i; const s = SUN[i], az = (s.az * Math.PI) / 180, el = (s.el * Math.PI) / 180;
    sun.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(1000);
    sun.color.set(s.col); sun.intensity = s.k * 0.62 * Math.PI * (s.el < 30 ? 1.25 : 1);
    $('#light-name').textContent = s.nombre; $('#btn-light').setAttribute('aria-label', `Cambiar la luz: ${s.nombre.toLowerCase()}`);
  }
  $('#btn-light').addEventListener('click', (e) => {
    setSun((S.sun + 1) % SUN.length); const b = e.currentTarget; b.classList.add('show-tip'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('show-tip'), 1600);
  });
  setSun(0);

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
      <li>Imagen de satélite: Sentinel-2 cloudless 2016 de <a href="https://s2maps.eu" target="_blank" rel="noopener">EOX IT Services GmbH</a> (CC BY 4.0), con datos modificados de Copernicus Sentinel.</li></ul>
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
  $('#btn-start').addEventListener('click', startExplore);

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    if (S.active) S.shiftTo = viewShift();
  });
  addEventListener('hashchange', () => { const id = location.hash.slice(1); if (byId[id] && S.mode === 'explore' && S.active !== id) openPeak(id, { hash: false }); });

  // enlace directo a una cumbre: se salta la introducción
  const direct = byId[location.hash.slice(1)];
  if (direct) { S.mode = 'explore'; document.body.classList.add('is-ready'); $('#intro').classList.add('is-out'); await openPeak(direct.id, { instant: true, hash: false }); }

  // — bucle —
  let last = performance.now(), orbit = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (S.flight) tickFlight(dt);
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
    const az = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    needle.style.transform = `rotate(${az}rad)`;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  document.body.classList.remove('is-loading');
  window.tresmiles = { openPeak, startExplore, goHome, camera, controls, terrain, S, peaks, flyTo, closeFicha };
}

boot().catch((err) => {
  console.error(err);
  const t = $('#load-text'); if (t) t.textContent = 'No se ha podido iniciar el mapa 3D. Comprueba que tu navegador admite WebGL.';
});
