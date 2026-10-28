// Modo cámara (realidad aumentada, solo en la app): la cámara trasera a pantalla completa y, encima, la silueta del horizonte y los nombres
// de las cumbres calculados por el panorama desde tu posición (res = { sil, vis } de panorama.js). Hacia dónde y cuánto inclinas el móvil sale
// de la brújula y del giroscopio (DeviceOrientation); como la brújula puede errar 10–20°, arrastrar con el dedo desplaza la silueta hasta que case
// con las montañas de verdad y pellizcar ajusta el ángulo de visión de la cámara (se recuerda). Pensado para el móvil en vertical.
import { leeOrientacion } from './panorama.js?v=9';

const RAD = Math.PI / 180, AZ_PASO = 0.25;
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* nada */ } } };
const fmtKm = (d) => (d < 10000 ? (d / 1000).toFixed(1).replace('.', ',') : String(Math.round(d / 1000))) + ' km';
const fmtM = (n) => new Intl.NumberFormat('es-ES').format(n) + ' m';
const dif = (a, b) => ((a - b + 540) % 360) - 180;   // diferencia de rumbos en (−180, 180]

export function crearRealidad({ esc, abrirFicha }) {
  let el = null, res = null, stream = null, raf = 0;
  // FOV_LARGO: ángulo de visión del lado largo de la imagen de la cámara (24 mm equivalentes, 4:3 ≈ 69°)
  const st = { rumbo: null, elev: null, abs: false, offAz: 0, offEl: 0, fov: Number(store.get('tresmiles-ra-fov')) || 69, cajas: [] };

  function crea() {
    el = document.createElement('div'); el.id = 'ra'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Montañas por la cámara'); el.hidden = true;
    el.innerHTML = `<video id="ra-video" playsinline muted autoplay></video><canvas id="ra-canvas"></canvas>
      <header><p id="ra-ayuda">Sujeta el móvil en vertical y apunta a las montañas. Si la línea no casa, arrástrala con el dedo; pellizca para el zoom.</p><button type="button" id="ra-cerrar" aria-label="Cerrar la cámara">×</button></header>
      <div id="ra-apunta" hidden><b></b><span></span></div>`;
    document.body.appendChild(el);
    el.querySelector('#ra-cerrar').addEventListener('click', cerrar);
    const cv = el.querySelector('#ra-canvas');
    // arrastrar: desplaza la silueta (corrige el error de la brújula); pellizcar: ángulo de visión; tocar un nombre: su ficha
    const dedos = new Map(); let ini = null;
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); dedos.set(e.pointerId, { x: e.clientX, y: e.clientY }); ini = { x: e.clientX, y: e.clientY, offAz: st.offAz, offEl: st.offEl, fov: st.fov, d: distDedos(), movido: false }; });
    cv.addEventListener('pointermove', (e) => {
      if (!dedos.has(e.pointerId) || !ini) return; dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const f = focal();
      if (dedos.size >= 2) { const d = distDedos(); if (ini.d && d) { st.fov = Math.min(110, Math.max(25, ini.fov * ini.d / d)); ini.movido = true; } return; }
      const dx = e.clientX - ini.x, dy = e.clientY - ini.y; if (Math.hypot(dx, dy) > 6) ini.movido = true;
      st.offAz = ini.offAz - Math.atan(dx / f) / RAD; st.offEl = ini.offEl + Math.atan(dy / f) / RAD;
    });
    const suelta = (e) => {
      dedos.delete(e.pointerId);
      if (!dedos.size && ini) {
        store.set('tresmiles-ra-fov', st.fov.toFixed(1));
        if (!ini.movido) { const c = st.cajas.find((c) => e.clientX >= c.x && e.clientX <= c.x + c.w && e.clientY >= c.y && e.clientY <= c.y + c.h); if (c) { cerrar(); abrirFicha(c.id); } }
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
    }
  }

  function dibuja() {
    raf = requestAnimationFrame(dibuja);
    const cv = el.querySelector('#ra-canvas'), dpr = Math.min(devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H); st.cajas = [];
    if (!res || st.rumbo == null) return;
    const f = focal(), rumbo = st.rumbo + st.offAz, elev = (st.elev ?? 0) + st.offEl, NA = res.sil[0].length;
    const aY = (ang, daz) => H / 2 - f * Math.tan((ang - elev) * RAD) / Math.cos(daz * RAD);   // proyección (aprox. para el ángulo vertical)
    // silueta: el horizonte (lo más alto de todas las capas) en cada columna de la pantalla
    x.lineWidth = 2.2; x.lineJoin = 'round'; x.strokeStyle = 'rgba(255,255,255,.9)'; x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = 4; x.beginPath();
    for (let px = 0; px <= W; px += 3) {
      const daz = Math.atan((px - W / 2) / f) / RAD, i = ((Math.round((rumbo + daz) / AZ_PASO) % NA) + NA) % NA;
      let a = -90; for (const b of res.sil) if (b[i] > a) a = b[i];
      const py = aY(a, daz); if (px === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.stroke(); x.shadowBlur = 0;
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

  async function abrir(resultado) {
    if (!el) crea();
    res = resultado; st.offAz = 0; st.offEl = 0; st.rumbo = null; st.elev = null; st.abs = false;
    el.hidden = false; document.body.classList.add('ra-abierto');
    try { if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') await DeviceOrientationEvent.requestPermission(); } catch { /* sin permiso: no habrá rumbo */ }
    addEventListener('deviceorientationabsolute', alOrientar, true); addEventListener('deviceorientation', alOrientar, true);
    const ayuda = el.querySelector('#ra-ayuda');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      const v = el.querySelector('#ra-video'); v.srcObject = stream; await v.play().catch(() => {});
    } catch { ayuda.textContent = 'No se puede abrir la cámara (¿falta el permiso?). La silueta y los nombres siguen funcionando con la brújula.'; }
    if (!raf) dibuja();
    setTimeout(() => { if (!el.hidden && st.rumbo == null) ayuda.textContent = 'Este móvil no da la brújula: no se puede saber hacia dónde apuntas.'; }, 3000);
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
