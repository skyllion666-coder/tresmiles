// Panorama de 360° desde un punto (por ahora, la cima de la ficha): silueta del relieve en capas por distancia, nombres de las cumbres que se ven, lista y modo brújula.
// Cálculo propio con el relieve de 120 m (nivel 4 de los bloques, ~1 MB, se pide la primera vez); no toca el relieve del mapa. La visibilidad de cada cumbre se decide con una línea
// de visión sobre ese relieve (con curvatura de la Tierra y refracción media), con tolerancia porque la malla de 120 m redondea los picos. Es orientativo.
// Modo brújula: el panorama gira con el móvil y un nombre arriba dice a qué cumbre apuntas (DeviceOrientation; en Android «absolute», en iPhone webkitCompassHeading).
const RT = 6371000, K_REF = 0.13, CURV = (1 - K_REF) / (2 * RT);
const BANDAS = [4000, 12000, 30000, 60000, 1e9];   // límites de distancia de las capas (m), de cerca a lejos
const COLORES = ['#2f4c45', '#4a6a60', '#6d8b85', '#93a9ac', '#b8c7ce'];   // de cerca a lejos (más lejos = más claro, como la bruma)
const AZ_PASO = 0.25, ALCANCE = 90000, RAD = Math.PI / 180, DECL = 1.3;   // DECL: declinación magnética del Pirineo (este), para pasar de rumbo magnético a geográfico
const RUMBOS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'], RUMBOS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
const rumbo = (az) => RUMBOS16[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];
const fmtKm = (d) => (d < 10000 ? (d / 1000).toFixed(1).replace('.', ',') : String(Math.round(d / 1000))) + ' km';
const fmtM = (n) => new Intl.NumberFormat('es-ES').format(n) + ' m';
const FUENTE = '"Barlow Condensed", "Barlow", sans-serif';

// rumbo geográfico (0–360°, 0 = norte) hacia el que mira la cámara trasera del móvil, a partir de un evento de orientación; null si no lo da
export function leeOrientacion(e) {
  let h = null;
  if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;   // iPhone
  else if (e.alpha != null && (e.absolute || e.type === 'deviceorientationabsolute')) {
    const a = e.alpha * RAD, b = (e.beta ?? 0) * RAD, g = (e.gamma ?? 0) * RAD, cA = Math.cos(a), sA = Math.sin(a), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g), cB = Math.cos(b);
    const este = -(cA * sG + sA * sB * cG), norte = -(sA * sG - cA * sB * cG);   // hacia dónde mira la cámara trasera (eje −Z del móvil), componentes este y norte
    h = Math.hypot(este, norte) > 0.35 ? Math.atan2(este, norte) / RAD : -e.alpha;   // casi horizontal (mirando al suelo o al cielo): vale el borde superior del móvil
    void cB;
  }
  return h == null ? null : (((h + DECL) % 360) + 360) % 360;
}

export function crearPanorama({ geo, meta, store, peaks, abrir, esc, camara = null }) {   // camara(res): modo cámara (js/realidad.js), solo en la app y desde tu posición
  let n4 = null, el = null, token = 0, cajas = [], ctxP = null;   // ctxP: panorama abierto { p, res, g }
  const CH = meta.chunk, dim4 = CH / 4 + 3;

  // relieve de 120 m de todo el mapa, en un sampler propio (alturas reales en metros)
  function cargaN4() {
    return (n4 ??= Promise.all(Array.from({ length: meta.nci * meta.ncj }, (_, k) => fetch(`${store.base}/h/c_${k % meta.nci}_${Math.floor(k / meta.nci)}_4.bin`).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? new Uint16Array(b) : null)).catch(() => null))));
  }
  function sampler(bloques) {
    const maxC = meta.nci * CH, maxR = meta.ncj * CH;
    return (x, z) => {
      let fc = (x + geo.W / 2) / geo.dx, fr = (z + geo.D / 2) / geo.dz;
      fc = fc < 0 ? 0 : fc > maxC ? maxC : fc; fr = fr < 0 ? 0 : fr > maxR ? maxR : fr;
      const i = Math.min(meta.nci - 1, Math.floor(fc / CH)), j = Math.min(meta.ncj - 1, Math.floor(fr / CH)), a = bloques[j * meta.nci + i];
      if (!a) return store.sample(fc, fr) * meta.hscale;
      const lx = (fc - i * CH) / 4 + 1, ly = (fr - j * CH) / 4 + 1, x0 = Math.min(dim4 - 2, Math.floor(lx)), y0 = Math.min(dim4 - 2, Math.floor(ly)), tx = lx - x0, ty = ly - y0, k = y0 * dim4 + x0;
      return ((a[k] * (1 - tx) + a[k + 1] * tx) * (1 - ty) + (a[k + dim4] * (1 - tx) + a[k + dim4 + 1] * tx) * ty) * meta.hscale;
    };
  }

  // silueta por capas y cumbres visibles desde (x0, z0) a la altura h0
  function calcula(alt, x0, z0, h0, excluye) {
    const NA = Math.round(360 / AZ_PASO), nb = BANDAS.length, sil = Array.from({ length: nb }, () => new Float32Array(NA).fill(-90));
    for (let a = 0; a < NA; a++) {
      const az = a * AZ_PASO * RAD, sx = Math.sin(az), sz = -Math.cos(az);   // 0° = norte (−z), 90° = este (+x)
      let b = 0;
      for (let d = 80; d < ALCANCE; d += 50 + d * 0.012) {
        while (d > BANDAS[b]) b++;
        const ang = Math.atan2(alt(x0 + sx * d, z0 + sz * d) - h0 - d * d * CURV, d) / RAD;
        if (ang > sil[b][a]) sil[b][a] = ang;
      }
    }
    const vis = [];
    for (const p of peaks) {
      if (p.id === excluye) continue;
      const dx = p.q.x - x0, dz = p.q.z - z0, d = Math.hypot(dx, dz); if (d < 600 || d > ALCANCE) continue;
      const aT = Math.atan2(p.altitud - h0 - d * d * CURV, d), az = ((Math.atan2(dx, -dz) / RAD) + 360) % 360;
      let ok = true;
      for (let s = 150; s < d - 450; s += 50 + s * 0.012) {
        const f = s / d, ang = Math.atan2(alt(x0 + dx * f, z0 + dz * f) - h0 - s * s * CURV, s);
        if (ang > aT + 0.0022) { ok = false; break; }
      }
      if (ok) vis.push({ p, d, az, ang: aT / RAD, score: p.altitud + (p.altitud >= 3000 ? 1200 : 0) + (p.activo ? 300 : 0) - d / 1000 * 12, otros: [] });
    }
    // la misma cima apuntada dos veces en los datos (a menos de 130 m y de altura casi igual, p. ej. «Vallibierna» y «Ballibierna»): una sola, con la otra grafía anotada
    vis.sort((a, b) => b.score - a.score);
    const unicos = [];
    for (const v of vis) {
      const m = unicos.find((u) => Math.hypot(u.p.q.x - v.p.q.x, u.p.q.z - v.p.q.z) < 130 && Math.abs(u.p.altitud - v.p.altitud) <= 25);
      if (m) m.otros.push(v.p.nombre); else unicos.push(v);
    }
    return { sil, vis: unicos };
  }

  // — dibujo del panorama —
  function dibuja(canvas, res, vw, vh) {
    const ppd = Math.max(4, Math.ceil(vw / 110)), pad = vw / ppd + 10, W = Math.round((360 + 2 * pad) * ppd), dpr = Math.min(window.devicePixelRatio || 1, 2), ctx = canvas.getContext('2d');
    const TOPE = vh < 520 ? 120 : 150, MAXN = 24;
    let amax = 4; for (const s of res.sil) for (const v of s) if (v > amax) amax = v; for (const v of res.vis) if (v.ang > amax) amax = v.ang;
    const amin = Math.max(-22, Math.min(...res.sil.map((s) => Math.min(...s))));
    const kv = Math.max(ppd * 1.5, Math.min(ppd * 3.5, (vh - TOPE - 70) / (amax - 0.35 * amin)));   // la escala vertical se ajusta para llenar la pantalla
    const H0 = Math.round(TOPE + 16 + amax * kv - amin * kv * 0.35 + 54), oy = Math.max(0, vh - H0) * 0.5, y0 = oy + TOPE + 16 + amax * kv, H = Math.max(H0, Math.round(vh));
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cielo = ctx.createLinearGradient(0, 0, 0, y0); cielo.addColorStop(0, '#d5e3ec'); cielo.addColorStop(1, '#f6ecd6'); ctx.fillStyle = cielo; ctx.fillRect(0, 0, W, H);
    const xAz = (az) => (az + pad) * ppd;
    for (let b = BANDAS.length - 1; b >= 0; b--) {   // de lejos a cerca
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let px = 0; px <= W; px += 2) {
        const az = px / ppd - pad, k = Math.round((((az % 360) + 360) % 360) / AZ_PASO) % res.sil[b].length, ang = res.sil[b][k];
        ctx.lineTo(px, ang <= -89 ? H : y0 - ang * kv);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fillStyle = COLORES[b]; ctx.fill();
    }
    const suelo = ctx.createLinearGradient(0, y0 + 10, 0, H); suelo.addColorStop(0, 'rgba(47,76,69,0)'); suelo.addColorStop(1, 'rgba(30,48,43,.55)'); ctx.fillStyle = suelo; ctx.fillRect(0, y0, W, H - y0);
    // brújula: marcas cada 15° y letras en los rumbos
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    for (let az = Math.ceil(-pad / 15) * 15; az <= 360 + pad; az += 15) {
      const x = xAz(az), m = ((az % 360) + 360) % 360, card = m % 45 === 0;
      ctx.strokeStyle = 'rgba(245,238,220,.75)'; ctx.lineWidth = card ? 1.6 : 1; ctx.beginPath(); ctx.moveTo(x, H - (card ? 26 : 16)); ctx.lineTo(x, H - 8); ctx.stroke();
      ctx.fillStyle = '#f5eedc';
      if (card) { ctx.font = `700 13px ${FUENTE}`; ctx.fillText(RUMBOS[m / 45], x, H - 30); } else if (m % 30 === 0) { ctx.font = `600 11px ${FUENTE}`; ctx.fillText(m + '°', x, H - 20); }
    }
    // nombres en vertical sobre cada cumbre, de la más importante a la menos; si pisa a otro, se queda para la lista
    const puestas = []; let omitidas = 0, n = 0;
    for (const v of res.vis) {
      if (n >= MAXN) { omitidas++; continue; }
      const nom = v.p.nombre.length > 24 ? v.p.nombre.slice(0, 23) + '…' : v.p.nombre, alt = fmtM(v.p.altitud);
      ctx.font = `700 12px ${FUENTE}`; const w1 = ctx.measureText(nom).width; ctx.font = `500 11px ${FUENTE}`; const w2 = ctx.measureText(alt).width;
      const len = w1 + 6 + w2, ySum = y0 - v.ang * kv, base = ySum - 9;
      if (base - len < oy + 4) { omitidas++; continue; }
      const sitios = [-360, 0, 360].map((off) => xAz(v.az + off)).filter((x) => x > -20 && x < W + 20);   // se repite a los lados para que el giro de 360° no la corte
      if (sitios.some((x) => puestas.some((q) => Math.abs(q.x - x) < 15 && q.base - q.len < base + 4 && q.base + 4 > base - len))) { omitidas++; continue; }
      for (const x of sitios) puestas.push({ v, nom, alt, w1, len, x, base, ySum });
      n++;
    }
    cajas = [];
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const q of puestas) {
      const tres = q.v.p.altitud >= 3000;
      ctx.fillStyle = '#24302c'; ctx.beginPath(); ctx.arc(q.x, q.ySum, 2.3, 0, 6.3); ctx.fill();
      ctx.strokeStyle = 'rgba(36,48,44,.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(q.x, q.ySum - 3); ctx.lineTo(q.x, q.base + 1); ctx.stroke();
      ctx.save(); ctx.translate(q.x, q.base); ctx.rotate(-Math.PI / 2);
      ctx.lineJoin = 'round'; ctx.lineWidth = 3.2; ctx.strokeStyle = 'rgba(247,242,228,.9)';
      ctx.font = `${tres ? 800 : 700} 12px ${FUENTE}`; ctx.strokeText(q.nom, 0, 0); ctx.fillStyle = tres ? '#8a4f12' : '#24302c'; ctx.fillText(q.nom, 0, 0);
      ctx.font = `500 11px ${FUENTE}`; ctx.strokeText(q.alt, q.w1 + 6, 0); ctx.fillStyle = '#45524c'; ctx.fillText(q.alt, q.w1 + 6, 0);
      ctx.restore();
      cajas.push({ x: q.x - 8, y: q.base - q.len, w: 16, h: q.len + 12, id: q.v.p.id });
    }
    return { ppd, pad, W, H, exag: kv / ppd, n, omitidas };
  }

  const normaliza = (g, left) => { const L = 360 * g.ppd, lo = 10 * g.ppd; while (left < lo) left += L; while (left >= lo + L) left -= L; return left; };
  const centraEn = (sc, g, az) => { sc.scrollLeft = normaliza(g, (az + g.pad) * g.ppd - sc.clientWidth / 2); };

  // — lista —
  function pintaLista(orden) {
    const ul = el.querySelector('#pan-ul'), v = ctxP.res.vis.slice();
    if (orden === 'rumbo') v.sort((a, b) => a.az - b.az); else if (orden === 'distancia') v.sort((a, b) => a.d - b.d); else v.sort((a, b) => b.p.altitud - a.p.altitud);
    ul.innerHTML = v.map((x) => `<li><button type="button" data-id="${esc(x.p.id)}"><span class="pl-n">${esc(x.p.nombre)}${x.otros.length ? `<small>también «${esc(x.otros.join('», «'))}»</small>` : ''}</span><span class="pl-a">${fmtM(x.p.altitud)}</span><span class="pl-d">${fmtKm(x.d)} · ${rumbo(x.az)} ${Math.round(x.az)}°</span></button></li>`).join('') || '<li class="pl-vacio">Desde aquí no se ve ninguna cumbre de la lista.</li>';
    for (const b of el.querySelectorAll('#pan-orden button')) b.setAttribute('aria-pressed', String(b.dataset.o === orden));
  }

  // — modo brújula —
  const br = { on: false, rumbo: null, pausa: 0, raf: 0, abs: false, tmo: 0 };
  function alOrientar(e) {
    if (e.type === 'deviceorientationabsolute') br.abs = true; else if (br.abs) return;   // en Android la relativa no vale
    const h = leeOrientacion(e); if (h == null) return;
    if (br.rumbo == null) br.rumbo = h; else { const d = ((h - br.rumbo + 540) % 360) - 180; br.rumbo = (br.rumbo + d * 0.18 + 360) % 360; }   // suavizado del temblor de la brújula
    if (!br.raf) br.raf = requestAnimationFrame(actualizaBrujula);
  }
  function apuntada(h) {   // la cumbre más importante dentro de ±2,5° del rumbo (si no hay, la más cercana si está a menos de 6°)
    let mejor = null, dmin = 1e9, cerca = null;
    for (const v of ctxP.res.vis) { const d = Math.abs(((v.az - h + 540) % 360) - 180); if (d <= 2.5 && (!mejor || v.score > mejor.score)) mejor = v; if (d < dmin) { dmin = d; cerca = v; } }
    return mejor ?? (dmin <= 6 ? cerca : null);
  }
  const ponApunta = (n, d, ficha, ok) => { const ap = el.querySelector('#pan-apunta'); ap.hidden = false; ap.dataset.v = ok ? '1' : '0'; ap.querySelector('.ap-n').textContent = n; ap.querySelector('.ap-d').textContent = d; ap.querySelector('.ap-ficha').hidden = !ficha; };
  function actualizaBrujula() {
    br.raf = 0; if (!br.on || !ctxP || br.rumbo == null) return;
    if (performance.now() > br.pausa && !el.querySelector('#pan-vista').hidden) centraEn(el.querySelector('#pan-scroll'), ctxP.g, br.rumbo);
    const v = apuntada(br.rumbo); ctxP.apunta = v;
    if (v) ponApunta(v.p.nombre, `${fmtM(v.p.altitud)} · ${fmtKm(v.d)} · ${rumbo(v.az)} ${Math.round(v.az)}°`, true, true);
    else ponApunta('Sin cumbre con nombre', `Rumbo ${rumbo(br.rumbo)} ${Math.round(br.rumbo)}°`, false, false);
  }
  async function activaBrujula() {
    if (br.on) { apagaBrujula(); return; }
    try { if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') throw new Error('permiso'); } }
    catch { ponApunta('Brújula no disponible', 'No has dado permiso para usar los sensores del móvil.', false, false); return; }
    br.on = true; br.rumbo = null; br.abs = false; el.querySelector('#pan-brujula').setAttribute('aria-pressed', 'true'); el.classList.add('con-brujula');
    addEventListener('deviceorientationabsolute', alOrientar, true); addEventListener('deviceorientation', alOrientar, true);
    ponApunta('Buscando la brújula…', 'Sujeta el móvil en vertical, mirando al horizonte.', false, false);
    br.tmo = setTimeout(() => { if (br.on && br.rumbo == null) ponApunta('Este móvil no da la brújula', 'Prueba en un móvil con sensores, o desliza con el dedo.', false, false); }, 3000);
  }
  function apagaBrujula() {
    br.on = false; clearTimeout(br.tmo); removeEventListener('deviceorientationabsolute', alOrientar, true); removeEventListener('deviceorientation', alOrientar, true);
    if (!el) return; el.querySelector('#pan-brujula').setAttribute('aria-pressed', 'false'); el.classList.remove('con-brujula'); el.querySelector('#pan-apunta').hidden = true;
  }

  function vista(v) {
    el.querySelector('#pan-vista').hidden = v !== 'pan'; el.querySelector('#pan-lista').hidden = v !== 'lis';
    for (const b of el.querySelectorAll('#pan-tabs button')) b.setAttribute('aria-selected', String(b.dataset.v === v));
    if (v === 'lis' && ctxP) pintaLista(el.dataset.orden || 'altura');
    else if (v === 'pan' && ctxP?.g && br.on && br.rumbo != null) centraEn(el.querySelector('#pan-scroll'), ctxP.g, br.rumbo);
  }

  function crea() {
    el = document.createElement('div'); el.id = 'panorama'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'pan-titulo'); el.hidden = true;
    el.innerHTML = `<header><div><h2 id="pan-titulo"></h2><p id="pan-sub"></p></div><button type="button" id="pan-cerrar" aria-label="Cerrar el panorama">×</button></header>
      <nav id="pan-barra"><div id="pan-tabs" role="tablist"><button type="button" role="tab" data-v="pan" aria-selected="true">Panorama</button><button type="button" role="tab" data-v="lis" aria-selected="false">Lista</button></div>
      <button type="button" id="pan-brujula" aria-pressed="false"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m15.5 8.5-2 5-5 2 2-5z" fill="currentColor"/></svg>Brújula</button><button type="button" id="pan-camara" hidden><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 8h3l1.6-2.2h6.8L17 8h3v11H4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="13.2" r="3.4" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>Cámara</button></nav>
      <div id="pan-vista"><div id="pan-apunta" hidden><div><b class="ap-n"></b><span class="ap-d"></span></div><button type="button" class="ap-ficha">Ver ficha</button></div><div id="pan-scroll"><canvas id="pan-canvas"></canvas></div><div id="pan-mira" aria-hidden="true"></div></div>
      <div id="pan-lista" hidden><div id="pan-orden" role="group" aria-label="Ordenar"><button type="button" data-o="rumbo">Por rumbo</button><button type="button" data-o="distancia">Por distancia</button><button type="button" data-o="altura">Por altura</button></div><ul id="pan-ul"></ul></div>
      <p id="pan-nota"></p>`;
    document.body.appendChild(el);
    const cerrar = () => { apagaBrujula(); el.hidden = true; document.body.classList.remove('pan-abierto'); token++; };
    el.querySelector('#pan-cerrar').addEventListener('click', cerrar);
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) cerrar(); });
    el.querySelector('#pan-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) vista(b.dataset.v); });
    el.querySelector('#pan-brujula').addEventListener('click', activaBrujula);
    el.querySelector('#pan-camara').addEventListener('click', () => { if (ctxP && camara) { apagaBrujula(); camara(ctxP.res); } });
    el.querySelector('#pan-orden').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { el.dataset.orden = b.dataset.o; pintaLista(b.dataset.o); } });
    el.querySelector('#pan-ul').addEventListener('click', (e) => { const b = e.target.closest('button[data-id]'); if (b) { cerrar(); abrir(b.dataset.id); } });
    el.querySelector('.ap-ficha').addEventListener('click', () => { const v = ctxP?.apunta; if (v) { cerrar(); abrir(v.p.id); } });
    const sc = el.querySelector('#pan-scroll'), cv = el.querySelector('#pan-canvas');
    cv.addEventListener('click', (e) => {   // tocar un nombre abre la ficha de esa cumbre
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, c = cajas.find((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
      if (c) { cerrar(); abrir(c.id); }
    });
    sc.addEventListener('scroll', () => { const g = ctxP?.g; if (!g) return; const L = 360 * g.ppd, lo = 10 * g.ppd; if (sc.scrollLeft < lo) sc.scrollLeft += L; else if (sc.scrollLeft >= lo + L) sc.scrollLeft -= L; }, { passive: true });   // vuelta de 360°
    sc.addEventListener('pointerdown', () => { br.pausa = performance.now() + 4000; }, { passive: true });   // si tocas, la brújula te deja mover un momento
    el._cerrar = cerrar;
  }

  // op.desdeAqui: desde la posición del GPS (p = { id: null, nombre, q }; altura del relieve en ese punto); op.brujula: con la brújula ya encendida
  async function abrirPanorama(p, op = {}) {
    if (!el) crea();
    const tok = ++token, sc = el.querySelector('#pan-scroll'), cv = el.querySelector('#pan-canvas');
    apagaBrujula(); ctxP = null; el.dataset.orden = 'altura'; el.querySelector('#pan-camara').hidden = !(op.desdeAqui && camara);
    el.hidden = false; document.body.classList.add('pan-abierto'); vista('pan');
    el.querySelector('#pan-titulo').textContent = `Panorama desde ${p.nombre}`; el.querySelector('#pan-sub').textContent = op.desdeAqui ? 'Calculando lo que se ve desde aquí…' : 'Calculando lo que se ve desde la cima…'; el.querySelector('#pan-nota').textContent = '';
    cv.width = 1;
    const bloques = await cargaN4(); if (tok !== token) return;
    await new Promise((r) => setTimeout(r, 30)); if (tok !== token) return;
    const alt = sampler(bloques), h0 = (op.desdeAqui ? alt(p.q.x, p.q.z) : p.altitud) + 2, res = calcula(alt, p.q.x, p.q.z, h0, p.id);
    if (tok !== token) return;
    const g = dibuja(cv, res, sc.clientWidth || 360, sc.clientHeight || 520); ctxP = { p, res, g };
    el.querySelector('#pan-sub').textContent = res.vis.length ? `${res.vis.length} cumbres con nombre a la vista${g.omitidas ? `: en el panorama van las ${g.n} principales; todas están en la lista` : ''}.` : 'Desde aquí no se ve ninguna cumbre de la lista.';
    el.querySelector('#pan-nota').textContent = `Orientativo: calculado con el relieve de 120 m, sin nubes ni bosque. Alturas exageradas ×${g.exag.toFixed(1).replace('.', ',')} para que se lean. Las cumbres lejanas pueden faltar o sobrar. La brújula del móvil puede errar 10-20° si no está calibrada.`;
    centraEn(sc, g, res.vis[0]?.az ?? 0);
    if (op.brujula && !br.on) activaBrujula();
  }
  return { abrir: abrirPanorama, cerrar: () => el?._cerrar?.() };
}
