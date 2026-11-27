// Mapa plano (2D): para ver los caminos y los desniveles de un vistazo y para móviles lentos (mientras está abierto, el 3D se para).
// Fondo propio dibujado en el móvil con nuestros datos (funciona sin conexión, como el 3D): color del suelo (ESA WorldCover), sombreado del relieve,
// curvas de nivel (más juntas cuanto más cerca) con su altitud, pendientes en colores (opcional) y sendas y pistas de OpenStreetMap.
// Fondos con conexión: topográfico del IGN (MTN) y ortofoto PNOA. Encima: cumbres, refugios, fuentes, pueblos, la ruta de la cumbre (subida continua,
// bajada a rayas) con su perfil, las otras subidas y tu posición. Leaflet (BSD-2) va copiado en vendor/leaflet y se carga la primera vez que se abre.
import { t, EN_INGLES } from './i18n.js?v=54';

const SUELO = { 1: [196, 220, 170], 2: [218, 226, 186], 3: [232, 236, 204], 4: [228, 224, 216], 5: [250, 252, 255], 6: [168, 204, 228], 8: [222, 228, 200] };   // WorldCover: bosque, matorral, pasto, roca, nieve/hielo, agua, musgo
const PAPEL = [238, 236, 222];
const PEND = [[30, [250, 214, 60]], [35, [245, 150, 40]], [40, [226, 60, 40]], [45, [150, 60, 160]]];   // pendiente (°) desde la que se pinta cada color
const fmtM = (n) => new Intl.NumberFormat(EN_INGLES ? 'en-GB' : 'es-ES').format(Math.round(n));
const fmtKm = (m) => (m / 1000).toFixed(1).replace('.', EN_INGLES ? '.' : ',');
const RAD = Math.PI / 180;

function cargaLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return (cargaLeaflet.p ??= new Promise((ok, mal) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'vendor/leaflet/leaflet.css'; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = 'vendor/leaflet/leaflet.js'; s.onload = () => ok(window.L); s.onerror = mal; document.head.appendChild(s);
  }));
}

export function crearPlano({ geo, meta, store, peaks, json, refugios = () => [], fuentes = () => [], pueblos = () => [], abrirFicha, alAbrir = () => {}, alCerrar = () => {} }) {
  const CH = meta.chunk, ST = meta.step;
  let el = null, map = null, fondo = null, capaPropia = null, capaEncima = null, capaIGN = null, capaOrto = null, marcas = null, rutaCapa = null, gps = null, gpsWatch = null;
  const op = { fondo: 'propio', pend: false };
  let rumbo = 0, mapEl = null, v0 = null, pantallaV = null;   // rumbo: hacia dónde mira la parte de arriba de la pantalla (grados desde el norte, como el 3D)
  try { Object.assign(op, JSON.parse(localStorage.getItem('tresmiles-plano') || '{}')); } catch { /* sin almacenamiento */ }
  const guarda = () => { try { localStorage.setItem('tresmiles-plano', JSON.stringify(op)); } catch { /* nada */ } };
  const lonLat = (x, z) => [meta.lat0 - (z + geo.oz) / geo.mLat, meta.lon0 + (x + geo.W / 2) / geo.mLon];   // [lat, lon] de un punto del mapa 3D

  // — relieve: bloques de 30, 60 y 120 m (los mismos del 3D), guardados como mucho 40 —
  const bloques = new Map();
  function bloque(L, i, j) {
    const k = `${L}_${i}_${j}`;
    if (!bloques.has(k)) {
      if (bloques.size > 40) bloques.delete(bloques.keys().next().value);
      const dim = CH / L + 3;
      bloques.set(k, fetch(`${store.base}/h/c_${i}_${j}_${L}.bin${j >= (store.vdesde ?? 1e9) ? `?v=${store.v}` : ''}`).then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((b) => (b && b.byteLength === dim * dim * 2 ? new Uint16Array(b) : null)).catch(() => null));
    }
    return bloques.get(k);
  }
  const cobs = new Map();
  function cobertura(i, j) {
    const k = `${i}_${j}`;
    if (!cobs.has(k)) cobs.set(k, typeof DecompressionStream === 'undefined' ? Promise.resolve(null) : fetch(`${store.base}/cover/c_${i}_${j}.bin.gz${meta.vcover ? `?v=${meta.vcover}` : ''}`)
      .then((r) => (r.ok ? new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : null)).then((b) => (b && b.byteLength === CH * CH ? new Uint8Array(b) : null)).catch(() => null));
    return cobs.get(k);
  }
  let sendasIdx = null; const sendas = new Map();
  const sendasIndice = () => (sendasIdx ??= json('data/sendas/index.json').then((d) => ({ lado: d.lado, hay: new Set(d.teselas) })).catch(() => null));
  const tesela = (k) => { if (!sendas.has(k)) sendas.set(k, json(`data/sendas/${k}.json`).catch(() => null)); return sendas.get(k); };

  // — la capa propia: una tesela de 256 px (512 en pantallas densas) dibujada aquí —
  // modo 'propio': todo; 'encima' (sobre el IGN o la ortofoto): solo pendientes y, sobre la ortofoto, las sendas
  function hazCapa(L, modo) {
    const Capa = L.GridLayer.extend({
      createTile(c, hecho) {
        const dpr = Math.min(2, Math.max(1, Math.round(window.devicePixelRatio || 1))), R = 256 * dpr, cv = document.createElement('canvas');
        cv.width = R; cv.height = R;
        dibujaTesela(cv, c, R, modo).then(() => hecho(null, cv), (e) => hecho(e, cv));
        return cv;
      },
    });
    return new Capa({ tileSize: 256, minZoom: 8, maxZoom: 20, maxNativeZoom: 20, updateWhenIdle: true, keepBuffer: 1, className: 'plano-capa-' + modo });
  }

  // pesos de Catmull-Rom para las muestras -1, 0, 1, 2 a la distancia t de la 0
  const cr = (t, m) => { const t2 = t * t, t3 = t2 * t;
    return m === -1 ? (-t3 + 2 * t2 - t) / 2 : m === 0 ? (3 * t3 - 5 * t2 + 2) / 2 : m === 1 ? (-3 * t3 + 4 * t2 + t) / 2 : (t3 - t2) / 2; };
  async function dibujaTesela(cv, c, R, modo) {
    const z = c.z, N = 256 * 2 ** z, k = 256 / R;
    const lonDe = (px) => ((c.x * 256 + px * k) / N) * 360 - 180;
    const latDe = (py) => Math.atan(Math.sinh(Math.PI * (1 - (2 * (c.y * 256 + py * k)) / N))) / RAD;
    const latC = latDe(R / 2), mpx = (40075016 * Math.cos(latC * RAD)) / N * k;   // metros por píxel del lienzo
    const conRelieve = modo === 'propio' || op.pend;
    const ctx = cv.getContext('2d');
    // posición en la rejilla del relieve (columnas y filas de 1″ desde la esquina NO) de cada columna y fila del lienzo (con un píxel de margen)
    const fc = new Float64Array(R + 2), fr = new Float64Array(R + 2);
    for (let p = -1; p <= R; p++) { fc[p + 1] = (lonDe(p + 0.5) - meta.lon0) / ST; fr[p + 1] = (meta.lat0 - latDe(p + 0.5)) / ST; }
    const fuera = fc[R + 1] < 0 || fc[0] > meta.ncols || fr[R + 1] < 0 || fr[0] > meta.nrows;
    if (fuera) return;
    let H = null;
    if (conRelieve) {
      const Lv = [1, 2, 4].reduce((a, l) => (l * 30 <= 1.6 * mpx ? l : a), 1);   // el relieve más fino que haga falta a este zoom
      const i0 = Math.max(0, Math.floor(fc[0] / CH)), i1 = Math.min(meta.nci - 1, Math.floor(fc[R + 1] / CH)), j0 = Math.max(0, Math.floor(fr[0] / CH)), j1 = Math.min(meta.ncj - 1, Math.floor(fr[R + 1] / CH));
      const bl = new Map(), dim = CH / Lv + 3;
      await Promise.all([]
        .concat(...Array.from({ length: j1 - j0 + 1 }, (_, a) => Array.from({ length: i1 - i0 + 1 }, (_, b) => [i0 + b, j0 + a])))
        .map(([i, j]) => bloque(Lv, i, j).then((d) => bl.set(j * meta.nci + i, d))));
      H = new Float32Array((R + 2) * (R + 2));
      const suave = Lv * 30 / mpx > 2;   // cada celda del relieve ocupa más de 2 píxeles
      const maxC = meta.nci * CH - 0.001, maxR = meta.ncj * CH - 0.001;
      for (let y = 0; y < R + 2; y++) {
        const rr = Math.min(maxR, Math.max(0, fr[y])), j = Math.floor(rr / CH), ly = (rr - j * CH) / Lv + 1, y1 = Math.min(dim - 2, Math.floor(ly)), ty = ly - y1;
        const fueraY = fr[y] < 0 || fr[y] > meta.nrows - 1;
        for (let x = 0; x < R + 2; x++) {
          const cc = Math.min(maxC, Math.max(0, fc[x])), i = Math.floor(cc / CH), a = bl.get(j * meta.nci + i);
          if (!a || fueraY || fc[x] < 0 || fc[x] > meta.ncols - 1) { H[y * (R + 2) + x] = NaN; continue; }   // fuera de nuestros datos: sin relieve
          const lx = (cc - i * CH) / Lv + 1, x1 = Math.min(dim - 2, Math.floor(lx)), tx = lx - x1, q = y1 * dim + x1;
          if (suave) {   // de cerca: interpolación cúbica (Catmull-Rom), sin los cuadros de 30 m en el sombreado ni picos en las curvas
            let v = 0;
            for (let m = -1; m <= 2; m++) {
              const yy = Math.min(dim - 1, Math.max(0, y1 + m)) * dim, wy = cr(ty, m);
              let f = 0;
              for (let n = -1; n <= 2; n++) f += a[yy + Math.min(dim - 1, Math.max(0, x1 + n))] * cr(tx, n);
              v += f * wy;
            }
            H[y * (R + 2) + x] = v * meta.hscale;
          } else H[y * (R + 2) + x] = ((a[q] * (1 - tx) + a[q + 1] * tx) * (1 - ty) + (a[q + dim] * (1 - tx) + a[q + dim + 1] * tx) * ty) * meta.hscale;
        }
      }
    }
    const W2 = R + 2, img = ctx.createImageData(R, R), px = img.data;
    if (modo === 'propio') {
      // color del suelo (mezcla de las 4 celdas de 30 m de alrededor: sin escalones), sombreado con luz del NO a 45°
      const ci0 = Math.max(0, Math.floor(fc[0] / CH)), ci1 = Math.min(meta.nci - 1, Math.floor(fc[R + 1] / CH)), cj0 = Math.max(0, Math.floor(fr[0] / CH)), cj1 = Math.min(meta.ncj - 1, Math.floor(fr[R + 1] / CH));
      const cb = new Map();
      for (let j = cj0; j <= cj1; j++) for (let i = ci0; i <= ci1; i++) cb.set(j * meta.nci + i, await cobertura(i, j));
      const clase = (cc, rr) => { const i = Math.floor(cc / CH), j = Math.floor(rr / CH), a = cb.get(j * meta.nci + i); return a ? a[Math.floor(rr - j * CH) * CH + Math.floor(cc - i * CH)] : 0; };
      const exag = Math.max(1, Math.min(1.5, mpx / 25));   // de lejos, algo más de relieve para que se lea
      for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
        const o = (y * R + x) * 4, cc = fc[x + 1] - 0.5, rr = fr[y + 1] - 0.5, c0 = Math.floor(cc), r0 = Math.floor(rr), tx = cc - c0, ty = rr - r0;
        if (cc < 0 || rr < 0 || cc > meta.ncols - 1 || rr > meta.nrows - 1) { px[o] = 214; px[o + 1] = 214; px[o + 2] = 208; px[o + 3] = 255; continue; }   // fuera del mapa: gris liso
        let R1 = 0, G1 = 0, B1 = 0;
        for (const [dc, dr, w] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]]) {
          const s = SUELO[clase(Math.max(0, c0 + dc), Math.max(0, r0 + dr))] || PAPEL; R1 += s[0] * w; G1 += s[1] * w; B1 += s[2] * w;
        }
        const q = (y + 1) * W2 + x + 1, h = H[q];
        let f = 1;
        if (h === h) {
          const gx = (H[q + 1] - H[q - 1]) / (2 * mpx) * exag, gy = (H[q - W2] - H[q + W2]) / (2 * mpx) * exag;   // gy: hacia el norte
          if (gx === gx && gy === gy) { const l = (0.5 * gx - 0.5 * gy + 0.7071) / Math.hypot(gx, gy, 1); f = Math.max(0.58, Math.min(1.1, 1 + (l - 0.7071) * 0.75)); }
        }
        px[o] = R1 * f; px[o + 1] = G1 * f; px[o + 2] = B1 * f; px[o + 3] = 255;
      }
    }
    if (op.pend && H) {   // pendientes en colores (de 30° en adelante), con la pendiente real (sin exagerar)
      for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
        const q = (y + 1) * W2 + x + 1, gx = (H[q + 1] - H[q - 1]) / (2 * mpx), gy = (H[q - W2] - H[q + W2]) / (2 * mpx);
        if (!(gx === gx && gy === gy)) continue;
        const s = Math.atan(Math.hypot(gx, gy)) / RAD; if (s < 30) continue;
        let col = PEND[0][1]; for (const [lim, cc] of PEND) if (s >= lim) col = cc;
        const o = (y * R + x) * 4, a = modo === 'propio' ? 0.5 : 0.55;
        if (modo === 'propio') { px[o] += (col[0] - px[o]) * a; px[o + 1] += (col[1] - px[o + 1]) * a; px[o + 2] += (col[2] - px[o + 2]) * a; }
        else { px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = 105; }
      }
    }
    ctx.putImageData(img, 0, 0);
    if (modo === 'propio' && H) curvas(ctx, H, R, W2, z, R / 256);
    if (z >= 12 && (modo === 'propio' || op.fondo === 'orto')) await caminos(ctx, c, R, N, k);
  }

  // curvas de nivel por «marching squares» sobre una rejilla de 2 px; las maestras (cada 5) más gruesas y con su altitud
  function curvas(ctx, H, R, W2, z, d) {
    const [iv, im] = z <= 11 ? [200, 1000] : z === 12 ? [100, 500] : z === 13 ? [50, 250] : z <= 15 ? [20, 100] : [10, 50];
    const S = 2, n = Math.floor(R / S), fina = new Path2D(), gruesa = new Path2D(), rot = [];
    const h = (x, y) => H[(y + 1) * W2 + x + 1];
    for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) {
      const x0 = cx * S, y0 = cy * S, a = h(x0, y0), b = h(x0 + S, y0), c = h(x0 + S, y0 + S), e = h(x0, y0 + S);
      if (!(a === a && b === b && c === c && e === e)) continue;
      const mn = Math.min(a, b, c, e), mx = Math.max(a, b, c, e);
      for (let v = Math.ceil(mn / iv) * iv; v <= mx; v += iv) {
        if (v === mn) continue;
        const pts = [];
        const corta = (p, q, xa, ya, xb, yb) => { if ((p < v) !== (q < v)) { const t2 = (v - p) / (q - p); pts.push(xa + (xb - xa) * t2, ya + (yb - ya) * t2); } };
        corta(a, b, x0, y0, x0 + S, y0); corta(b, c, x0 + S, y0, x0 + S, y0 + S); corta(c, e, x0 + S, y0 + S, x0, y0 + S); corta(e, a, x0, y0 + S, x0, y0);
        const P = v % im === 0 ? gruesa : fina;
        for (let i = 0; i + 3 < pts.length; i += 4) {
          P.moveTo(pts[i], pts[i + 1]); P.lineTo(pts[i + 2], pts[i + 3]);
          if (P === gruesa && cx % 24 === 12 && cy % 3 === 0) rot.push([v, (pts[i] + pts[i + 2]) / 2, (pts[i + 1] + pts[i + 3]) / 2, Math.atan2(pts[i + 3] - pts[i + 1], pts[i + 2] - pts[i])]);
        }
      }
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(150,92,46,.5)'; ctx.lineWidth = 0.7 * d; ctx.stroke(fina);
    ctx.strokeStyle = 'rgba(140,80,36,.8)'; ctx.lineWidth = 1.25 * d; ctx.stroke(gruesa);
    // altitud sobre algunas curvas maestras (no junto al borde de la tesela, que la cortaría; nunca dos muy juntas)
    const puestas = [];
    ctx.font = `600 ${10 * d}px "Barlow Condensed", "Barlow", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [v, x, y, ang] of rot) {
      const m = 26 * d; if (x < m || y < m || x > R - m || y > R - m) continue;
      if (puestas.some(([px, py]) => Math.hypot(px - x, py - y) < 70 * d)) continue;
      puestas.push([x, y]);
      let a = ang; if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.lineWidth = 3 * d; ctx.strokeStyle = 'rgba(240,236,222,.95)'; ctx.strokeText(String(v), 0, 0); ctx.fillStyle = 'rgba(120,66,28,.95)'; ctx.fillText(String(v), 0, 0);
      ctx.restore();
    }
  }

  // sendas (a trazos), pistas (continuas) y vías ferratas (rojas) de OpenStreetMap (data/sendas: teselas de 5 km en metros del mapa 3D)
  async function caminos(ctx, c, R, N, k) {
    const idx = await sendasIndice(); if (!idx) return;
    const s = R / 256, x0 = c.x * 256, y0 = c.y * 256;
    const pxDe = (lat, lon) => [(((lon + 180) / 360) * N - x0) / k, ((1 - Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2)) / Math.PI) / 2 * N - y0) / k];
    // recuadro de la tesela en metros del mapa 3D
    const lonA = (x0 / N) * 360 - 180, lonB = ((x0 + 256) / N) * 360 - 180, latA = Math.atan(Math.sinh(Math.PI * (1 - (2 * y0) / N))) / RAD, latB = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y0 + 256)) / N))) / RAD;
    const xA = (lonA - meta.lon0) * geo.mLon - geo.W / 2, xB = (lonB - meta.lon0) * geo.mLon - geo.W / 2, zA = (meta.lat0 - latA) * geo.mLat - geo.oz, zB = (meta.lat0 - latB) * geo.mLat - geo.oz;
    const L = idx.lado, claves = [];
    for (let j = Math.floor((zA - 50) / L); j <= Math.floor((zB + 50) / L); j++) for (let i = Math.floor((xA - 50) / L); i <= Math.floor((xB + 50) / L); i++) if (idx.hay.has(`${i}_${j}`)) claves.push(`${i}_${j}`);
    const datos = await Promise.all(claves.map(tesela));
    const tipos = [new Path2D(), new Path2D(), new Path2D()];
    for (const d of datos) for (const l of d?.l || []) {
      const P = tipos[l[0]] ?? tipos[0]; let x = l[1], z = l[2];
      let [a, b] = pxDe(...lonLat(x, z)); P.moveTo(a, b);
      for (let q = 3; q < l.length; q += 2) { x += l[q]; z += l[q + 1]; [a, b] = pxDe(...lonLat(x, z)); P.lineTo(a, b); }
    }
    const w = (c.z >= 15 ? 1.6 : c.z >= 13 ? 1.25 : 0.9) * s;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = c.z >= 13 ? 1 : 0.7;
    ctx.setLineDash([]); ctx.strokeStyle = 'rgba(255,250,236,.9)'; ctx.lineWidth = w * 3.2; ctx.stroke(tipos[1]);   // pista: borde claro y centro ocre
    ctx.strokeStyle = '#a2722e'; ctx.lineWidth = w * 1.7; ctx.stroke(tipos[1]);
    ctx.strokeStyle = 'rgba(255,250,236,.75)'; ctx.lineWidth = w * 2.6; ctx.stroke(tipos[0]);   // senda: a trazos, rojo oscuro, sobre un halo claro
    ctx.setLineDash([4.5 * s, 3 * s]); ctx.strokeStyle = '#9b2f22'; ctx.lineWidth = w * 1.3; ctx.stroke(tipos[0]);
    ctx.setLineDash([2 * s, 2.5 * s]); ctx.strokeStyle = '#e0321c'; ctx.lineWidth = w * 2; ctx.stroke(tipos[2]);   // vía ferrata
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }

  // — lo de encima: cumbres, refugios, fuentes, pueblos (sus nombres se ven según el zoom, con CSS) —
  // (hay unas 4.000: en el mapa solo están las que tocan a ese zoom y caen cerca de lo que se ve; se crean la primera vez que hacen falta)
  function ponMarcas(L) {
    const icono = (cls, html) => L.divIcon({ className: 'pl-m ' + cls, html: `<b class="pl-r">${html}</b>`, iconSize: [0, 0] });   // .pl-r: los nombres siguen derechos aunque el mapa gire
    const lista = [];
    for (const p of peaks) {
      const [lat, lon] = p.lat != null ? [p.lat, p.lon] : lonLat(p.q.x, p.q.z);
      const tres = p.altitud >= 3000 && !p.menor, cls = p.menor ? 'pl-menor' : tres ? 'pl-tres' : 'pl-pico';
      lista.push({ ll: [lat, lon], z: tres ? 9 : p.menor ? 14 : 12, crea: () => {
        const m = L.marker([lat, lon], { icon: icono(cls, `<i></i><span><b>${escHtml(p.nombre)}</b> ${fmtM(p.altitud)}</span>`), title: `${p.nombre} · ${fmtM(p.altitud)} m`, riseOnHover: true, zIndexOffset: tres ? 300 : p.menor ? 0 : 150 });
        m.on('click', () => popupPico(L, p, [lat, lon])); return m;
      } });
    }
    for (const r of refugios() || []) lista.push({ ll: [r.lat, r.lon], z: 12, crea: () => L.marker([r.lat, r.lon], { icon: icono('pl-ref' + (r.guardado ? ' pl-guardado' : ''), `<i></i><span>${escHtml(r.nombre === 'vivac' ? t('Vivac') : r.nombre)}${r.alt ? ` · ${fmtM(r.alt)}` : ''}</span>`), title: r.nombre, zIndexOffset: 100 }) });
    for (const f of fuentes() || []) lista.push({ ll: [f.lat, f.lon], z: 14, crea: () => L.marker([f.lat, f.lon], { icon: icono('pl-fuente' + (f.tipo === 'manantial' ? ' pl-manantial' : ''), '<i></i>'), title: f.nombre || (f.tipo === 'manantial' ? t('Manantial') : t('Fuente')), interactive: false }) });
    // nombres de los ibones con nombre (OpenStreetMap, data/lagos.json): dentro del agua; los grandes antes. Con el fondo IGN no (ya los trae impresos)
    json('data/lagos.json').then((lagos) => {
      for (const l of lagos) {
        if (!l.nombre || !l.poly?.length) continue;
        const [lon, lat] = puntoDentro(l.poly), ha = l.area / 1e4;
        const o = { ll: [lat, lon], z: ha >= 50 ? 11 : ha >= 5 ? 13 : ha >= 1 ? 14 : 15, crea: () => L.marker([lat, lon], { icon: icono('pl-lago', `<span>${escHtml(l.nombre)}</span>`), title: l.nombre, interactive: false, zIndexOffset: -50 }) };
        lista.push(o);
      }
      pon();
    }).catch(() => {});
    for (const [nombre, lon, lat] of pueblos() || []) lista.push({ ll: [lat, lon], z: 11, crea: () => L.marker([lat, lon], { icon: icono('pl-pueblo', `<span>${escHtml(nombre)}</span>`), interactive: false, zIndexOffset: -100 }) });
    marcas = L.layerGroup().addTo(map);
    const pon = () => {
      const z = map.getZoom(), b = map.getBounds().pad(0.3);
      for (const o of lista) {
        const ver = z >= o.z && b.contains(o.ll);
        if (ver && !o.m) o.m = o.crea();
        if (ver && !o.dentro) { marcas.addLayer(o.m); o.dentro = true; } else if (!ver && o.dentro) { marcas.removeLayer(o.m); o.dentro = false; }
      }
    };
    map.on('moveend zoomend', pon); pon();
  }
  // un punto dentro del polígono para poner el nombre: el centro de la franja horizontal más ancha cerca del centro (el centroide puede caer fuera en ibones con forma de media luna)
  function puntoDentro(poly) {
    let a = 0, cx = 0, cy = 0, y0 = Infinity, y1 = -Infinity;
    for (let i = 0, n = poly.length; i < n; i++) {
      const [x1, y1_] = poly[i], [x2, y2] = poly[(i + 1) % n], f = x1 * y2 - x2 * y1_;
      a += f; cx += (x1 + x2) * f; cy += (y1_ + y2) * f; y0 = Math.min(y0, y1_); y1 = Math.max(y1, y1_);
    }
    const c = a ? [cx / (3 * a), cy / (3 * a)] : poly[0];
    const cortes = (y) => { const xs = []; for (let i = 0, n = poly.length; i < n; i++) { const [xa, ya] = poly[i], [xb, yb] = poly[(i + 1) % n]; if ((ya <= y) !== (yb <= y)) xs.push(xa + ((y - ya) / (yb - ya)) * (xb - xa)); } return xs.sort((p, q) => p - q); };
    const dentro = (x, y) => cortes(y).filter((v) => v < x).length % 2 === 1;
    if (dentro(c[0], c[1])) return c;
    let mejor = null, ancho = -1;
    for (let k = 1; k < 12; k++) {
      const y = y0 + ((y1 - y0) * k) / 12, xs = cortes(y);
      for (let i = 0; i + 1 < xs.length; i += 2) { const w = xs[i + 1] - xs[i] - Math.abs(y - c[1]) * 0.5; if (w > ancho) { ancho = w; mejor = [(xs[i] + xs[i + 1]) / 2, y]; } }
    }
    return mejor ?? c;
  }
  const escHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function popupPico(L, p, ll) {
    const conRuta = !!p.rutas?.length;
    const html = `<div class="pl-pop"><b>${escHtml(p.nombre)}</b><span>${fmtM(p.altitud)} m</span>
      <div class="pl-pop-b">${conRuta ? `<button type="button" data-a="ruta">${t('Ver la ruta')}</button>` : ''}<button type="button" data-a="ficha">${t('Abrir la ficha')}</button></div></div>`;
    const pop = L.popup({ closeButton: true, autoPan: !girado(), autoPanPadding: [20, 60] }).setLatLng(ll).setContent(html).openOn(map);
    pop.getElement()?.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-a]'); if (!b) return;
      if (b.dataset.a === 'ruta') { map.closePopup(); muestraRuta(p, true); }
      else { cerrar(); abrirFicha(p.id); }
    });
  }

  // — la ruta de una cumbre (rutas[0]): subida continua, bajada a rayas; las otras subidas finas; y el perfil abajo —
  let rutaPico = null, perfilDatos = null, marcaPerfil = null;
  async function muestraRuta(p, encuadra) {
    const L = window.L;
    if (rutaCapa) { rutaCapa.remove(); rutaCapa = null; }
    el.querySelector('#pl-perfil').hidden = true; perfilDatos = null; rutaPico = p?.id ?? null;
    if (!p?.rutas?.length) return;
    const r = await json(`data/rutas/${p.rutas[0]}.json`).catch(() => null);
    if (!r?.puntos?.length || rutaPico !== p.id || !map) return;
    const pts = r.puntos, im = pts.reduce((m, q, i) => (q[2] > pts[m][2] ? i : m), 0);
    const sub = pts.slice(0, im + 1).map((q) => [q[1], q[0]]), baj = pts.slice(im).map((q) => [q[1], q[0]]);
    rutaCapa = L.layerGroup();
    const otras = await json(`data/subidas/${p.id}.json`).catch(() => null);
    const COLS = ['#2f7fd8', '#8a5bd6', '#1fa596', '#d6528a'];
    (otras?.subidas || []).forEach((s, i) => {
      const ll = s.puntos.map((q) => [q[1], q[0]]);
      L.polyline(ll, { color: '#fff', weight: 5, opacity: 0.7, interactive: false }).addTo(rutaCapa);
      L.polyline(ll, { color: COLS[i % COLS.length], weight: 2.6, opacity: 0.9 }).bindTooltip(`<span class="pl-tt">${escHtml(t('Otra subida: desde {d}', { d: s.desde }))}</span>`).addTo(rutaCapa);
    });
    if (baj.length > 2) {
      L.polyline(baj, { color: '#fff', weight: 6, opacity: 0.75, interactive: false }).addTo(rutaCapa);
      L.polyline(baj, { color: '#e8731c', weight: 3.2, dashArray: '7 7', opacity: 0.95, interactive: false }).addTo(rutaCapa);
    }
    L.polyline(sub, { color: '#fff', weight: 7.5, opacity: 0.85, interactive: false }).addTo(rutaCapa);
    L.polyline(sub, { color: '#e8731c', weight: 4.2, opacity: 1, interactive: false }).addTo(rutaCapa);
    L.circleMarker(sub[0], { radius: 6, color: '#fff', weight: 2, fillColor: '#2c8a3e', fillOpacity: 1 }).bindTooltip(`<span class="pl-tt">${escHtml(t('Inicio'))}</span>`).addTo(rutaCapa);
    rutaCapa.addTo(map);
    if (encuadra) ponRumbo(0);
    if (encuadra) map.fitBounds(L.latLngBounds(pts.map((q) => [q[1], q[0]])), { paddingTopLeft: [30, 70], paddingBottomRight: [60, 190], maxZoom: 15 });   // abajo queda el perfil
    el.querySelector('#pl-perfil').classList.toggle('plegado', !encuadra);   // al venir del 3D, plegado: el mapa se ve igual que allí
    perfil(p, r);
  }

  function perfil(p, r) {
    const caja = el.querySelector('#pl-perfil'), cv = caja.querySelector('canvas'), pts = r.puntos;
    perfilDatos = pts; caja.hidden = false;
    const dmax = pts[pts.length - 1][3], hmin = Math.min(...pts.map((q) => q[2])), hmax = Math.max(...pts.map((q) => q[2]));
    caja.querySelector('.pl-pf-t').textContent = `${p.nombre} · ${fmtKm(r.distancia ?? dmax)} km · +${fmtM(r.desnivel ?? hmax - hmin)} m · ${fmtM(hmin)}–${fmtM(hmax)} m`;
    const pinta = (sel = -1) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth || 300, H = cv.clientHeight || 90;
      cv.width = W * dpr; cv.height = H * dpr; const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const ml = 34, mr = 8, mt = 8, mb = 16, X = (d) => ml + (d / dmax) * (W - ml - mr), Y = (h) => mt + (1 - (h - hmin) / Math.max(1, hmax - hmin)) * (H - mt - mb);
      ctx.clearRect(0, 0, W, H);
      ctx.font = '500 10px "Barlow Condensed", sans-serif'; ctx.fillStyle = '#5b6760'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const paso = [100, 200, 250, 500, 1000].find((s) => (hmax - hmin) / s <= 4) ?? 1000;
      ctx.strokeStyle = 'rgba(36,48,44,.12)'; ctx.lineWidth = 1;
      for (let v = Math.ceil(hmin / paso) * paso; v <= hmax; v += paso) { ctx.beginPath(); ctx.moveTo(ml, Y(v)); ctx.lineTo(W - mr, Y(v)); ctx.stroke(); ctx.fillText(fmtM(v), ml - 4, Y(v)); }
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      for (let km = 0; km * 1000 <= dmax; km += dmax > 15000 ? 5 : dmax > 6000 ? 2 : 1) ctx.fillText(km + ' km', X(km * 1000), H - 3);
      const g = ctx.createLinearGradient(0, mt, 0, H - mb); g.addColorStop(0, 'rgba(232,115,28,.45)'); g.addColorStop(1, 'rgba(232,115,28,.06)');
      ctx.beginPath(); ctx.moveTo(X(0), H - mb); for (const q of pts) ctx.lineTo(X(q[3]), Y(q[2])); ctx.lineTo(X(dmax), H - mb); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(X(q[3]), Y(q[2])) : ctx.moveTo(X(q[3]), Y(q[2])))); ctx.strokeStyle = '#c85f14'; ctx.lineWidth = 1.8; ctx.stroke();
      if (sel >= 0) {
        const q = pts[sel], x = X(q[3]), y = Y(q[2]);
        ctx.strokeStyle = 'rgba(36,48,44,.5)'; ctx.beginPath(); ctx.moveTo(x, mt); ctx.lineTo(x, H - mb); ctx.stroke();
        ctx.fillStyle = '#c85f14'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 6.3); ctx.fill();
        const txt = `${fmtM(q[2])} m · km ${fmtKm(q[3])}`; ctx.font = '700 11px "Barlow Condensed", sans-serif'; const w = ctx.measureText(txt).width + 10, bx = Math.min(W - mr - w, Math.max(ml, x - w / 2));
        ctx.fillStyle = 'rgba(255,250,236,.95)'; ctx.fillRect(bx, mt, w, 16); ctx.fillStyle = '#24302c'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + 5, mt + 8);
      }
      return { X, ml, mr, W };
    };
    let g = pinta();
    const elige = (e) => {
      const rc = cv.getBoundingClientRect(), d = ((e.clientX - rc.left - g.ml) / (g.W - g.ml - g.mr)) * dmax;
      let i = 0; while (i < pts.length - 1 && pts[i][3] < d) i++;
      g = pinta(i);
      const ll = [pts[i][1], pts[i][0]];
      if (!marcaPerfil) marcaPerfil = window.L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2.5, fillColor: '#c85f14', fillOpacity: 1, interactive: false }).addTo(map);
      else marcaPerfil.setLatLng(ll).addTo(map);
    };
    cv.onpointerdown = (e) => { cv.setPointerCapture?.(e.pointerId); elige(e); };
    cv.onpointermove = (e) => { if (e.buttons || e.pointerType === 'mouse') elige(e); };
    perfil.repinta = () => { g = pinta(); };
  }

  // — tu posición (GPS) —
  function gpsOn(on) {
    const b = el.querySelector('#pl-gps'); b.setAttribute('aria-pressed', String(on));
    if (!on) { if (gpsWatch != null) navigator.geolocation.clearWatch(gpsWatch); gpsWatch = null; gps?.remove(); gps = null; return; }
    if (!navigator.geolocation) { aviso(t('Este dispositivo no da la posición.')); b.setAttribute('aria-pressed', 'false'); return; }
    let primero = true;
    gpsWatch = navigator.geolocation.watchPosition((pos) => {
      const L = window.L, ll = [pos.coords.latitude, pos.coords.longitude], acc = pos.coords.accuracy;
      if (!gps) gps = L.layerGroup([L.circle(ll, { radius: acc, color: '#2a7de1', weight: 1, fillOpacity: 0.12, interactive: false }), L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2.5, fillColor: '#2a7de1', fillOpacity: 1, interactive: false })]).addTo(map);
      else gps.eachLayer((l) => { l.setLatLng(ll); if (l.setRadius && l instanceof L.Circle) l.setRadius(acc); });
      if (primero) { primero = false; map.setView(ll, Math.max(map.getZoom(), 15)); }
    }, () => { aviso(t('No se ha podido saber dónde estás. Sal a cielo abierto y vuelve a probar.')); gpsOn(false); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  }
  let tAviso = 0;
  function aviso(txt) { const a = el.querySelector('#pl-aviso'); a.textContent = txt; a.hidden = false; clearTimeout(tAviso); tAviso = setTimeout(() => { a.hidden = true; }, 4000); }

  // — fondos —
  function ponFondo() {
    const L = window.L;
    for (const c of [capaPropia, capaEncima, capaIGN, capaOrto]) c?.remove();
    if (op.fondo === 'ign') { (capaIGN ??= L.tileLayer('https://www.ign.es/wmts/mapa-raster?service=WMTS&request=GetTile&version=1.0.0&format=image/jpeg&layer=MTN&style=default&tilematrixset=GoogleMapsCompatible&tilematrix={z}&tilerow={y}&tilecol={x}', { maxZoom: 20, maxNativeZoom: 17, attribution: '© <a href="https://www.ign.es" target="_blank" rel="noopener">IGN</a> (CC BY 4.0)' })).addTo(map); }
    else if (op.fondo === 'orto') { (capaOrto ??= L.tileLayer('https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&format=image/jpeg&layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&tilematrix={z}&tilerow={y}&tilecol={x}', { maxZoom: 20, maxNativeZoom: 19, attribution: 'PNOA © <a href="https://www.ign.es" target="_blank" rel="noopener">IGN</a> (CC BY 4.0)' })).addTo(map); }
    if (op.fondo === 'propio') { capaPropia = hazCapa(L, 'propio'); capaPropia.options.attribution = t('Relieve: Copernicus GLO-30 y MDT05 del IGN · suelo: ESA WorldCover (CC BY 4.0) · caminos: © OpenStreetMap (ODbL)'); capaPropia.addTo(map); }
    else if (op.pend || op.fondo === 'orto') { capaEncima = hazCapa(L, 'encima'); capaEncima.options.attribution = op.fondo === 'orto' ? t('Caminos: © OpenStreetMap (ODbL)') : ''; capaEncima.addTo(map); }
    for (const b of el.querySelectorAll('#pl-fondos button')) b.setAttribute('aria-pressed', String(b.dataset.f === op.fondo));
    el.querySelector('#pl-pend').setAttribute('aria-pressed', String(op.pend));
    el.querySelector('#pl-leyenda').hidden = !op.pend;
    el.classList.toggle('pl-con-relieve', op.fondo === 'propio');
    el.classList.toggle('pl-fondo-ign', op.fondo === 'ign'); el.classList.toggle('pl-fondo-orto', op.fondo === 'orto');
  }

  function crea() {
    el = document.createElement('div'); el.id = 'plano'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Mapa plano');
    el.innerHTML = `<div id="pl-mapa"></div>
      <div id="pl-arriba">
        <button type="button" id="pl-cerrar" aria-label="Volver al mapa 3D"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>3D</span></button>
        <div id="pl-fondos" role="group" aria-label="Fondo del mapa"><button type="button" data-f="propio">Relieve</button><button type="button" data-f="ign">IGN</button><button type="button" data-f="orto">Foto</button></div>
      </div>
      <div id="pl-botones">
        <button type="button" id="pl-norte" hidden aria-label="Poner el norte arriba" title="Poner el norte arriba"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3l4 9h-8z" fill="#c4352a"/><path d="M12 21l-4-9h8z" fill="currentColor" opacity=".55"/></svg></button>
        <button type="button" id="pl-pend" aria-pressed="false" title="Pendientes en colores">Pendiente</button>
        <button type="button" id="pl-gps" aria-pressed="false" aria-label="Dónde estoy"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/><path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
      </div>
      <div id="pl-leyenda" hidden><span><i style="background:#fad63c"></i>30°</span><span><i style="background:#f59628"></i>35°</span><span><i style="background:#e23c28"></i>40°</span><span><i style="background:#963ca0"></i>45°</span></div>
      <div id="pl-perfil" hidden><div class="pl-pf-cab"><button type="button" class="pl-pf-t"></button><button type="button" class="pl-pf-x" aria-label="Quitar la ruta">×</button></div><canvas></canvas></div>
      <p id="pl-aviso" role="status" hidden></p>`;
    document.body.appendChild(el);
    mapEl = el.querySelector('#pl-mapa');
    el.querySelector('#pl-cerrar').addEventListener('click', () => cerrar());
    el.querySelector('.pl-pf-t').addEventListener('click', () => {   // tocar el título pliega o despliega el perfil
      const c = el.querySelector('#pl-perfil'); c.classList.toggle('plegado'); perfil.repinta?.();
    });
    el.querySelector('#pl-fondos').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-f]'); if (!b) return;
      if (b.dataset.f !== 'propio' && !navigator.onLine) aviso(t('Este fondo necesita conexión. Sin cobertura, usa «Relieve».'));
      op.fondo = b.dataset.f; guarda(); ponFondo();
    });
    el.querySelector('#pl-pend').addEventListener('click', () => { op.pend = !op.pend; guarda(); ponFondo(); });
    el.querySelector('#pl-gps').addEventListener('click', (e) => gpsOn(e.currentTarget.getAttribute('aria-pressed') !== 'true'));
    el.querySelector('.pl-pf-x').addEventListener('click', () => { if (rutaCapa) { rutaCapa.remove(); rutaCapa = null; } marcaPerfil?.remove(); el.querySelector('#pl-perfil').hidden = true; rutaPico = null; });
    addEventListener('resize', () => { if (!el.hidden) { ponRumbo(rumbo); map?.invalidateSize({ animate: false }); perfil.repinta?.(); } });
    el.querySelector('#pl-norte').addEventListener('click', () => {   // el norte arriba, girando poco a poco
      const r0 = rumbo, t0 = performance.now();
      const paso = (ahora) => { const k = Math.min(1, (ahora - t0) / 350); ponRumbo(r0 * (1 - k * k * (3 - 2 * k))); if (k < 1) requestAnimationFrame(paso); };
      requestAnimationFrame(paso);
    });
    gestos();
  }

  // — el mapa gira como el 3D —
  // Leaflet no gira: el contenedor del mapa se gira con CSS (cuadrado, de lado la diagonal de la pantalla, para que no se vean esquinas vacías)
  // y los gestos (arrastrar, pellizcar, girar con dos dedos, rueda, doble toque) se hacen aquí, pasando de la pantalla al mapa girado
  const girado = () => Math.abs(rumbo) > 0.05;
  function ponRumbo(r) {
    rumbo = ((r % 360) + 540) % 360 - 180; if (Math.abs(rumbo) < 0.05) rumbo = 0;
    if (!mapEl) return;
    const W = el.clientWidth, H = el.clientHeight, D = girado() ? Math.ceil(Math.hypot(W, H)) + 2 : 0;
    const st = mapEl.style, w = D || W, h = D || H, antes = st.width;
    Object.assign(st, { width: w + 'px', height: h + 'px', left: (W - w) / 2 + 'px', top: (H - h) / 2 + 'px', right: 'auto', bottom: 'auto', transform: rumbo ? `rotate(${-rumbo}deg)` : '' });
    st.setProperty('--contra', rumbo + 'deg');
    if (map && antes !== st.width) map.invalidateSize({ animate: false });
    el.classList.toggle('girado', girado());
    const b = el.querySelector('#pl-norte'); b.hidden = !girado(); b.querySelector('svg').style.transform = `rotate(${-rumbo}deg)`;
  }
  // de un punto de la pantalla al del contenedor del mapa (y al revés)
  function aMapa(sx, sy) {
    const sz = map.getSize(), b = rumbo * RAD, c = Math.cos(b), s = Math.sin(b), dx = sx - el.clientWidth / 2, dy = sy - el.clientHeight / 2;
    return window.L.point(c * dx - s * dy + sz.x / 2, s * dx + c * dy + sz.y / 2);
  }
  const llEn = (sx, sy) => map.containerPointToLatLng(aMapa(sx, sy));
  function ancla(ll, sx, sy) {   // mueve el mapa para que ll quede en ese punto de la pantalla
    const q = map.latLngToContainerPoint(ll).subtract(aMapa(sx, sy));
    if (Math.abs(q.x) + Math.abs(q.y) >= 0.5) map.panBy(q, { animate: false });
  }
  function gestos() {
    const ptrs = new Map(); let g = null, movido = false, pend = null, toque = null;
    const aplica = () => {
      pend = null; if (!g) return;
      if (g.n === 1) { const p = [...ptrs.values()][0]; if (p) ancla(g.ll, p.x, p.y); return; }
      const [a, b] = [...ptrs.values()]; if (!b) return;
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, d = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      let da = ang - g.a0; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (!g.gira && Math.abs(da) > 0.2) { g.gira = true; g.a0 = ang; g.r0 = rumbo; da = 0; }   // gira solo si los dedos giran de verdad (no al pellizcar)
      if (g.gira) ponRumbo(g.r0 - da / RAD);
      map.setZoom(g.z0 + Math.log2(Math.max(10, d) / g.d0), { animate: false });
      ancla(g.ll, cx, cy);
    };
    const pide = () => { pend ??= requestAnimationFrame(aplica); };
    const empieza = () => {
      const v = [...ptrs.values()];
      if (!v.length) { g = null; return; }
      if (v.length === 1) { g = { n: 1, ll: llEn(v[0].x, v[0].y), x0: v[0].x, y0: v[0].y }; return; }
      const [a, b] = v, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      g = { n: 2, ll: llEn(cx, cy), z0: map.getZoom(), d0: Math.max(10, Math.hypot(b.x - a.x, b.y - a.y)), a0: Math.atan2(b.y - a.y, b.x - a.x), r0: rumbo, gira: false };
    };
    mapEl.addEventListener('pointerdown', (e) => {
      if (!map || e.target.closest('.leaflet-popup') || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (!ptrs.size) movido = false;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); empieza();
    });
    addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId); if (!p || !g) return;
      p.x = e.clientX; p.y = e.clientY;
      if (!movido && (g.n === 2 || Math.hypot(p.x - g.x0, p.y - g.y0) > 5)) { movido = true; mapEl.classList.add('pl-arrastra'); }
      if (movido) pide();
    });
    const suelta = (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (!ptrs.size) {
        mapEl.classList.remove('pl-arrastra');
        if (!movido && e.type === 'pointerup') {   // doble toque: acercar ahí
          const ahora = performance.now();
          if (toque && ahora - toque.t < 320 && Math.hypot(e.clientX - toque.x, e.clientY - toque.y) < 30) {
            const ll = llEn(e.clientX, e.clientY); map.setZoom(map.getZoom() + 1, { animate: false }); ancla(ll, e.clientX, e.clientY); toque = null;
          } else toque = { t: ahora, x: e.clientX, y: e.clientY };
        }
      }
      empieza();
    };
    addEventListener('pointerup', suelta); addEventListener('pointercancel', suelta);
    mapEl.addEventListener('click', (e) => { if (movido) { e.stopPropagation(); e.preventDefault(); } }, true);   // al soltar tras arrastrar no se abre lo que haya debajo
    let rueda = null;
    mapEl.addEventListener('wheel', (e) => {
      if (!map) return; e.preventDefault();
      const dz = -Math.max(-120, Math.min(120, e.deltaY * (e.deltaMode === 1 ? 33 : 1))) / 160;
      if (!rueda) { rueda = { ll: llEn(e.clientX, e.clientY), x: e.clientX, y: e.clientY, dz: 0 }; requestAnimationFrame(() => { const r = rueda; rueda = null; map.setZoom(map.getZoom() + r.dz, { animate: false }); ancla(r.ll, r.x, r.y); }); }
      rueda.dz += dz;
    }, { passive: false });
  }

  // centro: { x, z } del mapa 3D; zoom: del mapa plano; pico: la cumbre abierta (se dibuja su ruta); encuadra: llevar el mapa a la ruta; pantalla: píxel donde debe quedar el centro
  async function abrir({ centro, zoom = 13, pico = null, encuadra = true, pantalla = null, rumbo: r = 0 } = {}) {
    if (!el) crea();
    el.hidden = false; document.body.classList.add('plano-abierto'); alAbrir();
    let L;
    try { L = await cargaLeaflet(); } catch { aviso(t('No se ha podido cargar el mapa plano.')); return; }
    const [lat, lon] = centro ? lonLat(centro.x, centro.z) : [42.65, 0.3];
    if (!map) {
      const sw = lonLat(-geo.W / 2, geo.zmax), ne = lonLat(geo.W / 2, geo.zmin);
      ponRumbo(r);
      map = L.map(mapEl, { zoomControl: true, minZoom: 9, maxZoom: 20, maxBounds: L.latLngBounds(sw, ne).pad(0.15), attributionControl: true, zoomSnap: 0,
        dragging: false, touchZoom: false, doubleClickZoom: false, scrollWheelZoom: false, boxZoom: false, keyboard: false });   // los gestos los lleva gestos() (el mapa puede estar girado)
      const ctl = document.createElement('div'); ctl.className = 'leaflet-container pl-ctl'; ctl.appendChild(map._controlContainer); el.insertBefore(ctl, mapEl.nextSibling);   // los controles, fuera del giro
      map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
      map.zoomControl.setPosition('bottomright');
      const nivel = () => { const z = map.getZoom(); for (let k = 10; k <= 16; k++) el.classList.toggle('z' + k, z >= k); };   // qué nombres caben (CSS: .z12 …)
      map.on('zoomend', nivel); nivel();
      map.setView([lat, lon], zoom, { animate: false });
      ponFondo(); ponMarcas(L);
      L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
    } else { ponRumbo(r); map.invalidateSize({ animate: false }); map.setView([lat, lon], zoom, { animate: false }); }
    if (pantalla) ancla(L.latLng(lat, lon), pantalla.x, pantalla.y);   // el punto queda donde estaba en el 3D
    pantallaV = pantalla ?? { x: el.clientWidth / 2, y: el.clientHeight / 2 };
    v0 = { ll: llEn(pantallaV.x, pantallaV.y), z: map.getZoom(), r: rumbo };
    map.fire('zoomend');
    if (pico && pico.id !== rutaPico) muestraRuta(pico, encuadra);
    else if (!pico && rutaPico) { rutaCapa?.remove(); rutaCapa = null; marcaPerfil?.remove(); el.querySelector('#pl-perfil').hidden = true; rutaPico = null; }
  }
  function cerrar() {
    if (!el || el.hidden) return;
    let vista = null;
    if (map && v0) {   // lo que se ve en el 2D, para dejar el 3D igual: el punto en el mismo píxel, la escala y el rumbo
      const ll = llEn(pantallaV.x, pantallaV.y), q = map.latLngToContainerPoint(v0.ll).distanceTo(aMapa(pantallaV.x, pantallaV.y));
      vista = { lat: ll.lat, lon: ll.lng, zoom: map.getZoom(), rumbo, cambiado: q > 1.5 || Math.abs(map.getZoom() - v0.z) > 0.01 || Math.abs(rumbo - v0.r) > 0.1 };
    }
    map?.closePopup(); el.hidden = true; document.body.classList.remove('plano-abierto'); gpsOn(false); alCerrar(vista);
  }
  // el centro del mapa plano en coordenadas del mapa 3D (para volver al mismo sitio)
  const centro = () => { if (!map) return null; const c = map.getCenter(); return geo.toXZ(c.lng, c.lat); };
  // dónde cae en la pantalla un punto (para las pruebas: comparar con el 3D)
  function pantallaDe(lat, lon) {
    const q = map.latLngToContainerPoint([lat, lon]), sz = map.getSize(), b = -rumbo * RAD, c = Math.cos(b), s = Math.sin(b), dx = q.x - sz.x / 2, dy = q.y - sz.y / 2;
    return { x: c * dx - s * dy + el.clientWidth / 2, y: s * dx + c * dy + el.clientHeight / 2 };
  }
  return { abrir, cerrar, abierto: () => !!el && !el.hidden, centro, zoom: () => map?.getZoom() ?? 13, pantallaDe };
}
