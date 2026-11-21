// Modo cámara (realidad aumentada, solo en la app): la cámara trasera a pantalla completa y, encima, la silueta del horizonte y los nombres
// de las cumbres calculados por el panorama desde tu posición (res = { sil, cres, vis } de panorama.js), y las crestas de dentro como líneas finas. Hacia dónde y cuánto inclinas el móvil sale
// de la brújula y del giroscopio (DeviceOrientation); como la brújula puede errar 10–20°, arrastrar con el dedo desplaza la silueta hasta que case
// con las montañas de verdad y pellizcar ajusta el ángulo de visión de la cámara (se recuerda). Pensado para el móvil en vertical.
import { leeOrientacion } from './panorama.js?v=29';
import { t } from './i18n.js?v=45';

const RAD = Math.PI / 180, AZ_PASO = 0.25;
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* nada */ } } };
const fmtKm = (d) => (d < 10000 ? (d / 1000).toFixed(1).replace('.', ',') : String(Math.round(d / 1000))) + ' km';
const fmtM = (n) => new Intl.NumberFormat('es-ES').format(n) + ' m';
const dif = (a, b) => ((a - b + 540) % 360) - 180;   // diferencia de rumbos en (−180, 180]

export function crearRealidad({ esc, abrirFicha }) {
  let el = null, res = null, tramos = null, stream = null, raf = 0, vez = 0;
  // FOV_LARGO: ángulo de visión del lado largo de la imagen de la cámara (24 mm equivalentes, 4:3 ≈ 69°)
  // fov: el que ajustó el usuario pellizcando; si no, el de la cámara del móvil (la app lo lee de Android); si no, 69°
  const fovApp = () => { try { return Number(window.TresmilesApp?.camaraFov?.()) || 0; } catch { return 0; } };
  const st = { rumbo: null, elev: null, giro: 0, abs: false, offAz: 0, offEl: 0, fov: Number(store.get('tresmiles-ra-fov2')) || fovApp() || 69, cajas: [] };

  function crea() {
    el = document.createElement('div'); el.id = 'ra'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', t('Montañas por la cámara')); el.hidden = true;
    el.innerHTML = `<video id="ra-video" playsinline muted autoplay></video><canvas id="ra-canvas"></canvas>
      <header><p id="ra-ayuda"${t('Sujeta el móvil en vertical y apunta a las montañas. Si la línea no casa, arrástrala con el dedo; pellizca para el zoom.')}</p><button type="button" id="ra-encajar"${t('Encajar')}</button><button type="button" id="ra-cerrar" aria-label="${t('Cerrar la cámara')}">×</button></header>
      <div id="ra-apunta" hidden><b></b><span></span></div>`;
    document.body.appendChild(el);
    el.querySelector('#ra-cerrar').addEventListener('click', cerrar);
    el.querySelector('#ra-encajar').addEventListener('click', encajar);
    const cv = el.querySelector('#ra-canvas');
    // arrastrar: desplaza la silueta (corrige el error de la brújula); pellizcar: ángulo de visión; tocar un nombre: su ficha
    const dedos = new Map(); let ini = null;
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); dedos.set(e.pointerId, { x: e.clientX, y: e.clientY }); ini = { x: e.clientX, y: e.clientY, offAz: st.offAz, offEl: st.offEl, fov: st.fov, d: distDedos(), movido: false }; });
    cv.addEventListener('pointermove', (e) => {
      if (!dedos.has(e.pointerId) || !ini) return; dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const f = focal();
      if (dedos.size >= 2) { const d = distDedos(); if (ini.d && d) { st.fov = Math.min(110, Math.max(25, ini.fov * ini.d / d)); ini.movido = true; ini.zoom = true; } return; }
      const dx = e.clientX - ini.x, dy = e.clientY - ini.y; if (Math.hypot(dx, dy) > 6) ini.movido = true;
      st.offAz = ini.offAz - Math.atan(dx / f) / RAD; st.offEl = ini.offEl + Math.atan(dy / f) / RAD;
    });
    const suelta = (e) => {
      dedos.delete(e.pointerId);
      if (!dedos.size && ini) {
        if (ini.zoom) store.set('tresmiles-ra-fov2', st.fov.toFixed(1));
        if (!ini.movido) {   // el toque, al marco sin girar en el que están las cajas de los nombres
          const W = innerWidth, H = innerHeight, c0 = Math.cos(-st.giro), s0 = Math.sin(-st.giro), dx = e.clientX - W / 2, dy = e.clientY - H / 2;
          const tx = W / 2 + dx * c0 - dy * s0, ty = H / 2 + dx * s0 + dy * c0;
          const c = st.cajas.find((c) => tx >= c.x && tx <= c.x + c.w && ty >= c.y && ty <= c.y + c.h); if (c) { cerrar(); abrirFicha(c.id); }
        }
        ini = null;
      } else if (ini) ini.d = distDedos();
    };
    cv.addEventListener('pointerup', suelta); cv.addEventListener('pointercancel', suelta);
    function distDedos() { const p = [...dedos.values()]; return p.length >= 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0; }
  }

  // distancia focal en px de pantalla: el vídeo cubre la pantalla (object-fit: cover) y su lado largo abarca st.fov grados
  function focal() {
    const v = el.querySelector('#ra-video'), W = innerWidth, H = innerHeight;
    let vw = v.videoWidth || 3, vh = v.videoHeight || 4; if ((vw > vh) !== (W > H)) [vw, vh] = [vh, vw];   // el vídeo va girado como la pantalla
    const s = Math.max(W / vw, H / vh), largo = Math.max(vw, vh) * s;
    return (largo / 2) / Math.tan((st.fov / 2) * RAD);
  }

  function alOrientar(e) {
    if (e.type === 'deviceorientationabsolute') st.abs = true; else if (st.abs) return;
    const h = leeOrientacion(e);
    if (h != null) { if (st.rumbo == null) st.rumbo = h; else st.rumbo = (st.rumbo + dif(h, st.rumbo) * 0.2 + 360) % 360; }
    if (e.beta != null) {   // elevación del eje de la cámara trasera (−Z del móvil): asin(−cos β · cos γ)
      const el2 = Math.asin(Math.max(-1, Math.min(1, -Math.cos(e.beta * RAD) * Math.cos((e.gamma ?? 0) * RAD)))) / RAD;
      st.elev = st.elev == null ? el2 : st.elev + (el2 - st.elev) * 0.25;
      // giro lateral: hacia dónde queda «arriba» en la pantalla (vector vertical del mundo en ejes del móvil: −cos β · sen γ, sen β)
      const b = e.beta * RAD, g = (e.gamma ?? 0) * RAD, ux = -Math.cos(b) * Math.sin(g), uy = Math.sin(b);
      if (Math.hypot(ux, uy) > 0.3) { const gi = Math.atan2(ux, uy) - (screen.orientation?.angle ?? 0) * RAD;   // en horizontal, la pantalla va girada respecto al móvil
        st.giro += Math.atan2(Math.sin(gi - st.giro), Math.cos(gi - st.giro)) * 0.25; }
    }
  }

  // crestas de dentro (las que tapan terreno más lejano; sin la del cielo, que va aparte), unidas con la de la columna de al lado si está a una
  // distancia parecida y casi a la misma altura: tramos[k] = [ángulo en k, ángulo en k+1, distancia, …]. Las de menos de 1 km no (el GPS y el relieve de 30 m no dan para tanto)
  function uneCrestas(r) {
    if (!r?.cres) return null;
    const NA = r.cres.length, out = new Array(NA);
    for (let k = 0; k < NA; k++) {
      const a = r.cres[k], b = r.cres[(k + 1) % NA], l = [];
      for (let i = 0; i < a.length - 2; i += 2) {
        if (a[i + 1] < 1000) continue;
        let mejor = -1, dm = 1.2;
        for (let j = 0; j < b.length - 2; j += 2) { const da = Math.abs(b[j] - a[i]); if (da < dm && Math.abs(Math.log(b[j + 1] / a[i + 1])) < 0.12) { dm = da; mejor = j; } }
        if (mejor >= 0) l.push(a[i], b[mejor], a[i + 1]);
      }
      out[k] = Float32Array.from(l);
    }
    return out;
  }

  function dibuja() {
    raf = requestAnimationFrame(dibuja);
    const cv = el.querySelector('#ra-canvas'), dpr = Math.min(devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H); st.cajas = [];
    if (!res || st.rumbo == null) return;
    x.translate(W / 2, H / 2); x.rotate(st.giro); x.translate(-W / 2, -H / 2);   // el horizonte sigue nivelado aunque ladees el móvil
    const f = focal(), rumbo = st.rumbo + st.offAz, elev = (st.elev ?? 0) + st.offEl, NA = res.sil[0].length;
    const aY = (ang, daz) => H / 2 - f * Math.tan((ang - elev) * RAD) / Math.cos(daz * RAD);   // proyección (aprox. para el ángulo vertical)
    // silueta: el horizonte (lo más alto de todas las capas) en cada columna de la pantalla
    x.lineWidth = 2.2; x.lineJoin = 'round'; x.strokeStyle = 'rgba(255,255,255,.9)'; x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = 4; x.beginPath();
    for (let px = -Math.round(W * 0.4); px <= W * 1.4; px += 3) {
      const daz = Math.atan((px - W / 2) / f) / RAD, i = ((Math.round((rumbo + daz) / AZ_PASO) % NA) + NA) % NA;
      let a = -90; for (const b of res.sil) if (b[i] > a) a = b[i];
      const py = aY(a, daz); if (px === -Math.round(W * 0.4)) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.stroke(); x.shadowBlur = 0;
    // crestas de dentro: líneas finas, más tenues cuanto más lejos (cerca < 5 km, media < 25 km, lejos)
    if (tramos) {
      const mitadAz = Math.atan(W * 0.9 / f) / RAD, k0 = Math.floor((rumbo - mitadAz) / AZ_PASO), k1 = Math.ceil((rumbo + mitadAz) / AZ_PASO);
      const capas = [new Path2D(), new Path2D(), new Path2D()];
      for (let kk = k0; kk < k1; kk++) {
        const k = ((kk % NA) + NA) % NA, l = tramos[k]; if (!l || !l.length) continue;
        const dA = kk * AZ_PASO - rumbo, dB = dA + AZ_PASO, xA = W / 2 + f * Math.tan(dA * RAD), xB = W / 2 + f * Math.tan(dB * RAD);
        for (let i = 0; i < l.length; i += 3) { const p = capas[l[i + 2] < 5000 ? 0 : l[i + 2] < 25000 ? 1 : 2]; p.moveTo(xA, aY(l[i], dA)); p.lineTo(xB, aY(l[i + 1], dB)); }
      }
      x.lineCap = 'round';
      for (const [g, ancho, alfa] of [[2, 1, 0.45], [1, 1.3, 0.65], [0, 1.7, 0.85]]) {
        x.strokeStyle = 'rgba(0,0,0,.3)'; x.lineWidth = ancho + 1.6; x.stroke(capas[g]);   // borde oscuro para que se vea sobre nieve y cielo
        x.strokeStyle = `rgba(255,255,255,${alfa})`; x.lineWidth = ancho; x.stroke(capas[g]);
      }
    }
    // nombres: de más a menos importante, sin pisarse; una línea fina baja hasta la cumbre
    const mitad = Math.atan(W / 2 / f) / RAD + 2, puestos = [];
    x.font = '600 13px "Barlow Semi Condensed", "Barlow", sans-serif'; x.textBaseline = 'middle';
    for (const v of [...res.vis].sort((a, b) => b.score - a.score)) {
      const daz = dif(v.az, rumbo); if (Math.abs(daz) > mitad) continue;
      const px = W / 2 + f * Math.tan(daz * RAD), py = aY(v.ang, daz);
      const txt = v.p.nombre.length > 22 ? v.p.nombre.slice(0, 21) + '…' : v.p.nombre, sub = fmtM(v.p.altitud);
      const w = Math.max(x.measureText(txt).width, x.measureText(sub).width * 0.85) + 14, h = 34;
      let bx = Math.min(W - w - 4, Math.max(4, px - w / 2)), by = Math.min(py - 30, H * 0.62) - h;
      for (let k = 0; k < 12 && puestos.some((r) => bx < r.x + r.w && bx + w > r.x && by < r.y + r.h && by + h > r.y); k++) by -= h + 4;
      if (by < 64 || puestos.length >= 14) continue;
      puestos.push({ x: bx, y: by, w, h });
      x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 1; x.beginPath(); x.moveTo(px, by + h); x.lineTo(px, py - 3); x.stroke();
      x.fillStyle = 'rgba(255,255,255,.95)'; x.beginPath(); x.arc(px, py, 3, 0, 7); x.fill();
      x.fillStyle = v.p.altitud >= 3000 ? 'rgba(36,48,44,.88)' : 'rgba(36,48,44,.7)'; x.beginPath(); x.roundRect(bx, by, w, h, 7); x.fill();
      x.fillStyle = '#f7f2e4'; x.font = '600 13px "Barlow Semi Condensed", "Barlow", sans-serif'; x.fillText(txt, bx + 7, by + 11);
      x.fillStyle = 'rgba(247,242,228,.75)'; x.font = '500 11px "Barlow Semi Condensed", "Barlow", sans-serif'; x.fillText(`${sub} · ${fmtKm(v.d)}`, bx + 7, by + 25);
      st.cajas.push({ x: bx, y: by, w, h, id: v.p.id });
    }
    // la cumbre del centro de la pantalla, abajo
    let mejor = null; for (const v of res.vis) { const d = Math.abs(dif(v.az, rumbo)); if (d < 3 && (!mejor || v.score > mejor.score)) mejor = v; }
    const ap = el.querySelector('#ra-apunta'); ap.hidden = !mejor;
    if (mejor) { ap.querySelector('b').textContent = mejor.p.nombre; ap.querySelector('span').textContent = `${fmtM(mejor.p.altitud)} · ${fmtKm(mejor.d)}`; }
  }

  // — «Encajar»: busca en la imagen de la cámara dónde acaba el cielo y desplaza la silueta (rumbo y altura) hasta que case con él —
  const lienzo = document.createElement('canvas');
  const horizonteEn = (az) => { const NA = res.sil[0].length, i = ((Math.round(az / AZ_PASO) % NA) + NA) % NA; let a = -90; for (const b of res.sil) if (b[i] > a) a = b[i]; return a; };
  function bordeCielo() {   // [{ daz, rel, rumbo, elev }]: en cada columna, el ángulo (respecto al centro) donde la imagen pasa de cielo a montaña
    const v = el.querySelector('#ra-video'); if (!v.videoWidth || st.rumbo == null || st.elev == null) return [];
    const W = innerWidth, H = innerHeight, cw = 120, ch = Math.round(cw * H / W), f = focal();
    lienzo.width = cw; lienzo.height = ch; const x = lienzo.getContext('2d', { willReadFrequently: true });
    const s = Math.max(cw / v.videoWidth, ch / v.videoHeight); x.drawImage(v, (cw - v.videoWidth * s) / 2, (ch - v.videoHeight * s) / 2, v.videoWidth * s, v.videoHeight * s);
    const px = x.getImageData(0, 0, cw, ch).data, out = [], val = new Float32Array(ch);
    for (let c = 0; c < cw; c++) {
      let tot = 0;
      for (let r = 0; r < ch; r++) { const k = (r * cw + c) * 4; val[r] = 0.3 * px[k] + 0.6 * px[k + 1] + 0.1 * px[k + 2] + 0.6 * (px[k + 2] - px[k]); tot += val[r]; }   // brillo + azul: el cielo, arriba
      let arriba = 0, mejor = 0, rm = -1;
      for (let r = 1; r < ch - 2; r++) {
        arriba += val[r - 1]; const n1 = r, n2 = ch - r, d = arriba / n1 - (tot - arriba) / n2, sc = d * Math.sqrt(n1 * n2 / ch);
        if (sc > mejor) { mejor = sc; rm = r; }
      }
      if (rm < 2 || mejor < 40 * Math.sqrt(ch / 4)) continue;   // sin un salto claro de cielo a montaña
      const pxs = (c + 0.5) * W / cw, pys = rm * H / ch, daz = Math.atan((pxs - W / 2) / f) / RAD;
      out.push({ daz, rel: Math.atan((H / 2 - pys) * Math.cos(daz * RAD) / f) / RAD, rumbo: st.rumbo, elev: st.elev });
    }
    return out;
  }
  async function encajar() {
    const b = el.querySelector('#ra-encajar'), ayuda = el.querySelector('#ra-ayuda'); if (b.disabled || !res) return;
    if (Math.abs(st.giro) > 0.12) { ayuda.textContent = t('Sujeta el móvil recto (sin ladearlo) y apunta a un horizonte de montañas con cielo detrás.'); return; }
    b.disabled = true; b.textContent = t('Buscando…');
    const m = [];
    for (let k = 0; k < 5; k++) { m.push(...bordeCielo()); await new Promise((r) => setTimeout(r, 160)); }
    let mejor = null;
    if (m.length >= 40) {
      const prueba = (dAz) => {
        const r = m.map((o) => o.elev + o.rel - horizonteEn(o.rumbo + dAz + o.daz)).sort((a, c) => a - c), med = r[r.length >> 1];
        let coste = 0, bien = 0; for (const v of r) { const e = Math.abs(v - med); coste += Math.min(e, 3); if (e < 0.8) bien++; }
        return { dAz, med, coste: coste / r.length, bien: bien / r.length };
      };
      for (let d = -30; d <= 30; d += 0.5) { const p = prueba(d); if (!mejor || p.coste < mejor.coste) mejor = p; }
      for (let d = mejor.dAz - 0.5; d <= mejor.dAz + 0.5; d += 0.1) { const p = prueba(d); if (p.coste < mejor.coste) mejor = p; }
    }
    if (mejor && mejor.bien >= 0.45) {
      st.offAz = mejor.dAz; st.offEl = -mejor.med;
      ayuda.textContent = t('Encajado: la brújula se desviaba {g}°. Si aún no casa, arrastra la línea con el dedo.', { g: Math.abs(mejor.dAz).toFixed(0) });
    } else ayuda.textContent = t('No he podido encajar la silueta: apunta a montañas con el cielo despejado detrás, o arrastra la línea con el dedo.');
    b.disabled = false; b.textContent = t('Encajar');
  }

  async function abrir(resultado) {
    if (!el) crea();
    res = resultado; tramos = uneCrestas(res); st.offAz = 0; st.offEl = 0; st.rumbo = null; st.elev = null; st.abs = false;
    el.hidden = false; document.body.classList.add('ra-abierto');
    const turno = ++vez, fuera = () => turno !== vez || el.hidden;   // se cerró (o se volvió a abrir) mientras se esperaba el permiso o la cámara
    try { if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') await DeviceOrientationEvent.requestPermission(); } catch { /* sin permiso: no habrá rumbo */ }
    if (fuera()) return;
    addEventListener('deviceorientationabsolute', alOrientar, true); addEventListener('deviceorientation', alOrientar, true);
    const ayuda = el.querySelector('#ra-ayuda');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      if (fuera()) { s.getTracks().forEach((t) => t.stop()); return; }   // ya no hace falta: la cámara se apaga en vez de quedarse encendida
      stream = s; const v = el.querySelector('#ra-video'); v.srcObject = stream; await v.play().catch(() => {});
    } catch { ayuda.textContent = t('No se puede abrir la cámara (¿falta el permiso?). La silueta y los nombres siguen funcionando con la brújula.'); }
    if (fuera()) return;
    if (!raf) dibuja();
    setTimeout(() => { if (!el.hidden && st.rumbo == null) ayuda.textContent = t('Este móvil no da la brújula: no se puede saber hacia dónde apuntas.'); }, 3000);
  }

  function cerrar() {
    if (!el) return;
    cancelAnimationFrame(raf); raf = 0;
    removeEventListener('deviceorientationabsolute', alOrientar, true); removeEventListener('deviceorientation', alOrientar, true);
    stream?.getTracks().forEach((t) => t.stop()); stream = null; el.querySelector('#ra-video').srcObject = null;
    el.hidden = true; document.body.classList.remove('ra-abierto');
  }
  void esc;
  return { abrir, cerrar };
}
