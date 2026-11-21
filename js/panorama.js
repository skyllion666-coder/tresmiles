// Panorama de 360° desde un punto (la cima de la ficha o tu posición): el relieve que se ve, pintado columna a columna (color por altitud, luz del sol y bruma por distancia),
// las crestas dibujadas como líneas, nombres de las cumbres que se ven, lista y modo brújula.
// Cálculo propio con el relieve de 30 m (nivel 1) hasta FINO m y el de 120 m (nivel 4, ~1 MB) más lejos; se piden la primera vez; no toca el relieve del mapa. La visibilidad de cada cumbre se decide con una línea
// de visión sobre ese relieve (con curvatura de la Tierra y refracción media), con tolerancia porque la malla de 120 m redondea los picos. Es orientativo.
// Modo brújula: el panorama gira con el móvil y un nombre arriba dice a qué cumbre apuntas (DeviceOrientation; en Android «absolute», en iPhone webkitCompassHeading).
import { t, EN_INGLES } from './i18n.js?v=52';
const RT = 6371000, K_REF = 0.13, CURV = (1 - K_REF) / (2 * RT);
const BANDAS = [4000, 12000, 30000, 60000, 1e9];   // límites de distancia de las capas (m), de cerca a lejos
const SUELO = [null, [50, 74, 46], [98, 104, 66], [124, 124, 80], [136, 130, 122], [238, 242, 248], [72, 98, 116], null, [118, 120, 86]];   // por tipo de WorldCover: bosque, matorral, pasto, roca, nieve/hielo, agua, -, musgo
const AZ_PASO = 0.25, ALCANCE = 90000, RAD = Math.PI / 180, DECL = 1.3;   // DECL: declinación magnética del Pirineo (este), para pasar de rumbo magnético a geográfico
const RUMBOS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'], RUMBOS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
const rumbo = (az) => { const r = RUMBOS16[Math.round((((az % 360) + 360) % 360) / 22.5) % 16]; return EN_INGLES ? r.replace(/O/g, 'W') : r; };   // en inglés, oeste = W
const fmtKm = (d) => (d < 10000 ? (d / 1000).toFixed(1).replace('.', EN_INGLES ? '.' : ',') : String(Math.round(d / 1000))) + ' km';
const fmtM = (n) => new Intl.NumberFormat(EN_INGLES ? 'en-GB' : 'es-ES').format(n) + ' m';
const FUENTE = '"Barlow Condensed", "Barlow", sans-serif';

// posición del sol (fórmulas de la NOAA, error < 0,05°): rumbo desde el norte y elevación verdadera (sin refracción), en grados
export function solPos(ms, lat, lon) {
  const jd = ms / 864e5 + 2440587.5, T = (jd - 2451545) / 36525, r = RAD;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360, M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const C = Math.sin(M * r) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * r) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * r) * 0.000289;
  const om = 125.04 - 1934.136 * T, lam = (L0 + C - 0.00569 - 0.00478 * Math.sin(om * r)) * r;
  const eps = (23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(om * r)) * r;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam)), ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const H = ((280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T + lon) * r - ra), f = lat * r;
  const el = Math.asin(Math.sin(f) * Math.sin(dec) + Math.cos(f) * Math.cos(dec) * Math.cos(H)) / r;
  const az = (Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(f) - Math.tan(dec) * Math.cos(f)) / r + 180 + 360) % 360;
  return { az, el };
}
const refraccion = (h) => (h < -2 ? 0 : 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * RAD) / 60);   // refracción media (Bennett), en grados
const ZONA = 'Europe/Madrid', diaDe = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(ms);   // «2026-11-21» en hora de España
const fmtHora = (ms) => new Intl.DateTimeFormat(EN_INGLES ? 'en-GB' : 'es-ES', { timeZone: ZONA, hour: 'numeric', minute: '2-digit' }).format(ms);
const horaDe = (ms) => +new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: 'numeric', hourCycle: 'h23' }).format(ms);

// rumbo geográfico (0–360°, 0 = norte) hacia el que mira la cámara trasera del móvil, a partir de un evento de orientación; null si no lo da
export function leeOrientacion(e) {
  let h = null;
  if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;   // iPhone
  else if (e.alpha != null && (e.absolute || e.type === 'deviceorientationabsolute')) {
    const a = e.alpha * RAD, b = (e.beta ?? 0) * RAD, g = (e.gamma ?? 0) * RAD, cA = Math.cos(a), sA = Math.sin(a), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
    const este = -(cA * sG + sA * sB * cG), norte = -(sA * sG - cA * sB * cG);   // hacia dónde mira la cámara trasera (eje −Z del móvil), componentes este y norte
    h = Math.hypot(este, norte) > 0.35 ? Math.atan2(este, norte) / RAD : -e.alpha;   // casi horizontal (mirando al suelo o al cielo): vale el borde superior del móvil
  }
  return h == null ? null : (((h + DECL) % 360) + 360) % 360;
}

export function crearPanorama({ geo, meta, store, peaks, abrir, esc, camara = null, nieve = null }) {   // nieve(): «Nieve ahora» del satélite ({ img, meta, fecha }) o null   // camara(res): modo cámara (js/realidad.js), solo en la app y desde tu posición
  let n4 = null, el = null, token = 0, cajas = [], ctxP = null;   // ctxP: panorama abierto { p, res, g }
  const CH = meta.chunk, dim4 = CH / 4 + 3;

  // relieve de 120 m de todo el mapa, en un sampler propio (alturas reales en metros)
  function cargaN4() {
    return (n4 ??= Promise.all(Array.from({ length: meta.nci * meta.ncj }, (_, k) => fetch(`${store.base}/h/c_${k % meta.nci}_${Math.floor(k / meta.nci)}_4.bin`).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? new Uint16Array(b) : null)).catch(() => null))));
  }
  // relieve de 30 m (nivel 1) de los bloques a menos de FINO m de (x0, z0): lo cercano a quien mira (y su propia altura) decide la silueta
  const FINO = 12000, dim1 = CH + 3, finos = new Map();   // finos: bloques de 30 m ya pedidos (promesa), para no repetir la descarga
  async function cargaFino(x0, z0) {
    const fino = new Map(), pide = [], col = (x) => Math.floor((x + geo.W / 2) / geo.dx / CH), fil = (z) => Math.floor((z + geo.oz) / geo.dz / CH);
    for (let j = Math.max(0, fil(z0 - FINO)); j <= Math.min(meta.ncj - 1, fil(z0 + FINO)); j++) for (let i = Math.max(0, col(x0 - FINO)); i <= Math.min(meta.nci - 1, col(x0 + FINO)); i++) {
      const k = j * meta.nci + i;
      if (!finos.has(k)) finos.set(k, fetch(`${store.base}/h/c_${i}_${j}_1.bin${store.vdesde != null && j >= store.vdesde ? `?v=${store.v}` : ''}`).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b && b.byteLength === dim1 * dim1 * 2 ? new Uint16Array(b) : null)).catch(() => null));
      pide.push(finos.get(k).then((a) => { if (a) fino.set(k, a); }));
    }
    await Promise.all(pide);
    return fino;
  }
  // cobertura del suelo (ESA WorldCover, la misma rejilla que el relieve de 30 m; 1,8 MB en total, gzip) de todo el mapa
  let cob = null;
  function cargaCobertura() {
    if (typeof DecompressionStream === 'undefined') return Promise.resolve([]);
    return (cob ??= Promise.all(Array.from({ length: meta.nci * meta.ncj }, (_, k) => fetch(`${store.base}/cover/c_${k % meta.nci}_${Math.floor(k / meta.nci)}.bin.gz${meta.vcover ? `?v=${meta.vcover}` : ''}`)
      .then((r) => (r.ok ? new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : null)).then((b) => (b && b.byteLength === CH * CH ? new Uint8Array(b) : null)).catch(() => null))));
  }
  // nieve del satélite: R = fracción de nieve, G = suelo visto sin nubes (tools/nieve_ahora.py); rejilla 1,5 veces la del relieve
  let niv = null;
  function cargaNieve() {
    return (niv ??= (async () => {
      const o = nieve && (await nieve()); if (!o?.img) return null;
      try {
        const w = o.img.naturalWidth, h = o.img.naturalHeight, c = document.createElement('canvas'); c.width = w; c.height = h;
        const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(o.img, 0, 0);
        const d = cx.getImageData(0, 0, w, h).data, r = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) r[i] = d[i * 4 + 1] > 127 ? Math.min(250, d[i * 4]) : 255;   // 255 = no se ha visto (nubes)
        return { r, w, h, fecha: o.fecha };
      } catch { return null; }   // imagen de otro origen sin permiso de lectura: sin nieve del día
    })());
  }
  // color del suelo en (x, z) (sin luz ni bruma), media de 5 puntos a r m (lo lejano se ve como mezcla, no a rayas): ESA WorldCover y, encima,
  // la nieve que ha visto hoy el satélite (la «nieve o hielo» de WorldCover, que es de verano, se cambia por la de hoy si el satélite ve el suelo); sin dato, por altitud
  function suelo(cobs, nv) {
    const maxC = meta.nci * CH, maxR = meta.ncj * CH, OFF = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
    return (x, z, h, r) => {
      let R = 0, G = 0, B = 0;
      for (const [ox, oz] of OFF) {
        const fc = (x + ox * r + geo.W / 2) / geo.dx, fr = (z + oz * r + geo.oz) / geo.dz;
        let tipo = 0, n = -1;
        if (fc >= 0 && fr >= 0 && fc < maxC && fr < maxR) {
          const i = Math.floor(fc / CH), j = Math.floor(fr / CH), a = cobs[j * meta.nci + i];
          if (a) tipo = a[Math.floor(fr - j * CH) * CH + Math.floor(fc - i * CH)];
        }
        if (nv) { const px = Math.floor(fc / 1.5), py = Math.floor(fr / 1.5); if (px >= 0 && py >= 0 && px < nv.w && py < nv.h) { const v = nv.r[py * nv.w + px]; if (v !== 255) n = v / 250; } }
        let c = SUELO[tipo === 5 && n >= 0 ? 4 : tipo];
        if (!c) { const k = Math.min(1, Math.max(0, (h - 1700) / 900)); c = [74 + 54 * k, 96 + 28 * k, 70 + 48 * k]; }
        let [r1, g1, b1] = c;
        if (n >= 0) { const k = Math.min(1, Math.max(0, (n - 0.22) / 0.4)); r1 += (238 - r1) * k; g1 += (242 - g1) * k; b1 += (248 - b1) * k; }
        R += r1; G += g1; B += b1;
      }
      return (Math.round(R / 5) << 16) | (Math.round(G / 5) << 8) | Math.round(B / 5);   // en un número (cabe exacto en un Float32)
    };
  }
  function sampler(bloques, fino = null, ox = 0, oz = 0) {
    const maxC = meta.nci * CH, maxR = meta.ncj * CH;
    return (x, z) => {
      let fc = (x + geo.W / 2) / geo.dx, fr = (z + geo.oz) / geo.dz;
      fc = fc < 0 ? 0 : fc > maxC ? maxC : fc; fr = fr < 0 ? 0 : fr > maxR ? maxR : fr;
      const i = Math.min(meta.nci - 1, Math.floor(fc / CH)), j = Math.min(meta.ncj - 1, Math.floor(fr / CH));
      const f1 = fino && Math.abs(x - ox) < FINO && Math.abs(z - oz) < FINO ? fino.get(j * meta.nci + i) : null;
      if (f1) {
        const lx = fc - i * CH + 1, ly = fr - j * CH + 1, x1 = Math.min(dim1 - 2, Math.floor(lx)), y1 = Math.min(dim1 - 2, Math.floor(ly)), tx = lx - x1, ty = ly - y1, k = y1 * dim1 + x1;
        return ((f1[k] * (1 - tx) + f1[k + 1] * tx) * (1 - ty) + (f1[k + dim1] * (1 - tx) + f1[k + dim1 + 1] * tx) * ty) * meta.hscale;
      }
      const a = bloques[j * meta.nci + i];
      if (!a) return store.sample(fc, fr) * meta.hscale;
      const lx = (fc - i * CH) / 4 + 1, ly = (fr - j * CH) / 4 + 1, x0 = Math.min(dim4 - 2, Math.floor(lx)), y0 = Math.min(dim4 - 2, Math.floor(ly)), tx = lx - x0, ty = ly - y0, k = y0 * dim4 + x0;
      return ((a[k] * (1 - tx) + a[k + 1] * tx) * (1 - ty) + (a[k + dim4] * (1 - tx) + a[k + dim4 + 1] * tx) * ty) * meta.hscale;
    };
  }

  // silueta por capas y cumbres visibles desde (x0, z0) a la altura h0
  function calcula(alt, x0, z0, h0, excluye, sue = () => 0x5a6a50) {
    const NA = Math.round(360 / AZ_PASO), nb = BANDAS.length, sil = Array.from({ length: nb }, () => new Float32Array(NA).fill(-90));
    // cols[a]: tramos del relieve que se ven en esa columna, de abajo arriba: [ángulo de abajo, de arriba, distancia, altitud, luz, color del suelo] (planos, de 6 en 6);
    // cres[a]: crestas (borde de un tramo que tapa terreno más lejano): [ángulo, distancia] (de 2 en 2)
    const cols = new Array(NA), cres = new Array(NA);
    const SOL = [Math.sin(215 * RAD) * Math.cos(38 * RAD), Math.sin(38 * RAD), -Math.cos(215 * RAD) * Math.cos(38 * RAD)];   // sol del SO, a 38° (luz de tarde)
    // una columna (rumbo en grados): tramos visibles y crestas; si a ≥ 0, apunta también la silueta por capas en sil[·][a]
    function columna(azG, a = -1, kd = 1) {   // kd: paso a lo largo de la línea de vista (más corto con zoom: si no, la imagen sale a rayas)
      const az = azG * RAD, sx = Math.sin(az), sz = -Math.cos(az);   // 0° = norte (−z), 90° = este (+x)
      let b = 0, max = -90, visto = false, dVisto = 0, cresta = null;
      const tr = [], cr = [];
      for (let d = 60; d < ALCANCE; d += ((d < FINO ? 25 : 50) + d * 0.009) * kd) {
        while (d > BANDAS[b]) b++;
        const x = x0 + sx * d, z = z0 + sz * d;
        if (!geo.dentro(x, z)) break;   // fuera del mapa no hay relieve: ahí se acaba la vista
        const h = alt(x, z), ang = Math.atan2(h - h0 - d * d * CURV, d) / RAD;
        if (a >= 0 && ang > sil[b][a]) sil[b][a] = ang;
        if (ang > max) {
          if (cresta && d > cresta[1] * 1.12 + 250) cr.push(cresta[0], cresta[1]);   // lo de detrás de la cresta queda bastante más lejos: es una línea
          cresta = null;
          const e = d < FINO ? 30 : 120, gx = (alt(x + e, z) - alt(x - e, z)) / (2 * e), gz = (alt(x, z + e) - alt(x, z - e)) / (2 * e), nn = Math.hypot(gx, 1, gz);
          const luz = (-gx * SOL[0] + SOL[1] - gz * SOL[2]) / nn;
          tr.push(max, ang, d, h, luz, sue(x, z, h, Math.max(20, d * 0.006))); max = ang; visto = true; dVisto = d;
        } else if (visto) { cresta = [max, dVisto]; visto = false; }
      }
      cr.push(max, visto ? dVisto : (cresta ? cresta[1] : dVisto));   // la línea del cielo
      return [Float32Array.from(tr), Float32Array.from(cr)];
    }
    for (let a = 0; a < NA; a++) [cols[a], cres[a]] = columna(a * AZ_PASO, a);
    // sector más fino para el zoom: n columnas cada «paso» grados desde az0
    const sector = (az0, n, paso) => { const c = new Array(n), r = new Array(n); const kd = Math.max(0.35, Math.sqrt(paso / AZ_PASO)); for (let k = 0; k < n; k++) [c[k], r[k]] = columna(az0 + k * paso, -1, kd); return { az0, paso, n, cols: c, cres: r }; };
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
    const origen = { lon: meta.lon0 + (x0 + geo.W / 2) / geo.mLon, lat: meta.lat0 - (z0 + geo.oz) / geo.mLat, alt: h0 - 2 };   // dónde se está (para la franja de la foto de la cámara)
    return { sil, cols, cres, sector, origen, vis: unicos };
  }

  // el sol de hoy visto desde el punto del panorama: su camino minuto a minuto (con refracción) y cuándo asoma y se oculta tras el relieve
  // (el borde de arriba del disco por encima de la línea del cielo de esa columna); también la salida y la puesta con el horizonte despejado
  function calculaSol(res, ahora = Date.now()) {
    const { lat, lon, alt } = res.origen, NA = res.cres.length, caida = -0.9 * Math.sqrt(2 * Math.max(0, alt) / RT) / RAD;   // el horizonte del mar se ve algo por debajo de 0° desde lo alto
    const linea = (i) => { const c = res.cres[((i % NA) + NA) % NA]; return c && c.length ? c[c.length - 2] : -90; };
    const cielo = (az) => { const f = az / AZ_PASO, i = Math.floor(f), k = f - i; return Math.max(caida, linea(i) * (1 - k) + linea(i + 1) * k); };
    const hoy = diaDe(ahora), [y, m, d] = hoy.split('-').map(Number), t0 = Date.UTC(y, m - 1, d) - 3 * 36e5, pts = [];
    for (let ms = t0; ms < t0 + 28 * 36e5; ms += 6e4) {
      if (diaDe(ms) !== hoy) continue;
      const { az, el } = solPos(ms, lat, lon), ea = el + refraccion(el);
      pts.push({ ms, az, el: ea, ve: ea + 0.27 > cielo(az), llano: ea + 0.27 > 0 });
    }
    const tramos = []; let ini = null;
    pts.forEach((q, i) => { if (q.ve && ini == null) ini = q; if ((!q.ve || i === pts.length - 1) && ini) { tramos.push([ini, q.ve ? q : pts[i - 1]]); ini = null; } });
    const ll = pts.filter((q) => q.llano);
    return { pts, tramos, llano: ll.length ? [ll[0], ll[ll.length - 1]] : null, ahora: diaDe(ahora) === hoy ? solPos(ahora, lat, lon) : null, msAhora: ahora, cielo };
  }
  // camino del sol sobre el panorama: continuo donde se ve, a trazos donde lo tapa el relieve; marcas de cada hora, asoma/se oculta y dónde está ahora
  function pintaSol(ctx, sol, azX, y0, kv, W, H) {
    const pts = sol.pts.filter((q, i) => i % 3 === 0 && q.el > -4);
    ctx.save(); ctx.lineCap = 'round';
    for (const vis of [false, true]) {
      ctx.beginPath(); ctx.setLineDash(vis ? [] : [3, 5]); ctx.strokeStyle = vis ? 'rgba(232,150,32,.95)' : 'rgba(214,140,40,.6)'; ctx.lineWidth = vis ? 2.2 : 1.4;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i]; if (a.ve !== vis && b.ve !== vis) continue;
        const xa = azX(a.az), xb = azX(b.az); if (Math.abs(xb - xa) > W / 2 || (Math.max(xa, xb) < -10 || Math.min(xa, xb) > W + 10)) continue;
        ctx.moveTo(xa, y0 - a.el * kv); ctx.lineTo(xb, y0 - b.el * kv);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.lineJoin = 'round';
    const rotulo = (txt, x, y, fuerte) => { ctx.font = `${fuerte ? 700 : 600} ${fuerte ? 12 : 11}px ${FUENTE}`; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(247,242,228,.9)'; ctx.strokeText(txt, x, y); ctx.fillStyle = fuerte ? '#8a4f12' : '#9a6a2a'; ctx.fillText(txt, x, y); };
    for (const q of sol.pts) {   // cada hora en punto
      if (q.ms % 36e5 || q.el < -1) continue;
      const x = azX(q.az), y = y0 - q.el * kv; if (x < 8 || x > W - 8 || y < 14 || y > H - 44) continue;
      ctx.fillStyle = q.ve ? '#e39320' : 'rgba(214,140,40,.6)'; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 6.3); ctx.fill();
      rotulo(horaDe(q.ms) + 'h', x, y - 5, false);
    }
    const marca = (q, txt) => {   // asoma o se oculta
      const x = azX(q.az), y = y0 - q.el * kv; if (x < -10 || x > W + 10 || y < 30 || y > H - 12) return;
      ctx.fillStyle = '#f2b233'; ctx.strokeStyle = '#fff8e6'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 5, 0, 6.3); ctx.fill(); ctx.stroke();
      ctx.font = `700 12px ${FUENTE}`; const w = ctx.measureText(txt).width + 12;   // en una etiqueta, para que se lea entre los nombres
      ctx.fillStyle = 'rgba(255,248,230,.95)'; ctx.strokeStyle = 'rgba(181,112,26,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 27, w, 18, 9); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#8a4f12'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y - 17.5); ctx.textBaseline = 'bottom';
    };
    for (const [a, b] of sol.tramos) { marca(a, '↑ ' + fmtHora(a.ms)); marca(b, '↓ ' + fmtHora(b.ms)); }
    if (sol.ahora && sol.ahora.el > -2) {   // el sol ahora mismo (si es de noche, no)
      const el = sol.ahora.el + refraccion(sol.ahora.el), x = azX(sol.ahora.az), fuera = y0 - el * kv < 26, y = fuera ? 26 : y0 - el * kv;   // más alto que la vista: en el borde, con su altura
      if (x > -12 && x < W + 12) {
        const g = ctx.createRadialGradient(x, y, 2, x, y, 22); g.addColorStop(0, 'rgba(255,214,110,.75)'); g.addColorStop(1, 'rgba(255,214,110,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 22, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#ffc94a'; ctx.strokeStyle = '#b5701a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, 8, 0, 6.3); ctx.fill(); ctx.stroke();
        if (fuera) { ctx.textBaseline = 'middle'; ctx.textAlign = x > W / 2 ? 'right' : 'left'; rotulo(`${t('ahora')} ↑ ${Math.round(el)}°`, x + (x > W / 2 ? -13 : 13), y, true); }
        else rotulo(t('ahora'), x, y - 11, true);
      }
    }
    ctx.restore();
  }

  // — dibujo del panorama: un lienzo del tamaño de la pantalla que pinta lo que se mira (rumbo del centro, zoom y altura) —
  // escala a zoom 1: ppd0 px por grado (en escala real, con más zoom) y ex, la exageración vertical (1 en escala real); y00: dónde va el ángulo 0 a zoom 1
  function escala(res, vw, vh, real) {
    const ppd0 = real ? Math.min(16, Math.max(Math.ceil(vw / 110), Math.round(vw / 50))) : Math.max(4, Math.ceil(vw / 110)), TOPE = vh < 520 ? 120 : 150;
    let amax = 4; for (const s of res.sil) for (const v of s) if (v > amax) amax = v; for (const v of res.vis) if (v.ang > amax) amax = v.ang;
    const amin = Math.max(-22, Math.min(...res.sil.map((s) => Math.min(...s))));
    const ex = real ? 1 : Math.max(1.5, Math.min(3.5, (vh - TOPE - 70) / (amax - 0.35 * amin) / ppd0));   // la escala vertical se ajusta para llenar la pantalla
    const kv = ex * ppd0, H0 = TOPE + 16 + amax * kv - amin * kv * 0.35 + 54;
    return { ppd0, ex, amax, amin, y00: (vh - H0) * 0.5 + TOPE + 16 + amax * kv };
  }
  const dif = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;   // diferencia de rumbos en [−180, 180)
  // vista: { az (rumbo del centro), zoom (1–8), y0 (px donde queda el ángulo 0) }; no deja perder el relieve de vista
  function limita(v, e, vh) {
    v.zoom = Math.min(8, Math.max(1, v.zoom)); v.az = ((v.az % 360) + 360) % 360;
    const kv = e.ex * e.ppd0 * v.zoom;
    if (v.zoom <= 1.001) { v.zoom = 1; v.y0 = e.y00; return v; }
    v.y0 = Math.min(Math.max(e.y00, vh * 0.7 + e.amax * kv + 60), Math.max(v.y0, Math.min(e.y00, vh * 0.3 + e.amin * kv)));
    return v;
  }
  const lienzo = document.createElement('canvas');   // imagen del relieve, una columna de píxeles por columna de datos (se reutiliza)
  function dibuja(canvas, res, vw, vh, e, v, fina, sol = null) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), ctx = canvas.getContext('2d'), W = Math.round(vw), H = Math.round(vh);
    const ppd = e.ppd0 * v.zoom, kv = e.ex * ppd, y0 = v.y0, MAXN = Math.round(24 * v.zoom);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cielo = ctx.createLinearGradient(0, 0, 0, Math.max(60, Math.min(H, y0))); cielo.addColorStop(0, '#d5e3ec'); cielo.addColorStop(1, '#f6ecd6'); ctx.fillStyle = cielo; ctx.fillRect(0, 0, W, H);
    const azX = (az) => W / 2 + dif(az, v.az) * ppd, medio = W / 2 / ppd, azL = v.az - medio, azR = v.az + medio;
    // de dónde salen las columnas: el sector fino si cubre lo que se ve (con zoom), si no las de todo el panorama
    let src = { a0: 0, paso: AZ_PASO, col: (k) => res.cols[((k % res.cols.length) + res.cols.length) % res.cols.length], cre: (k) => res.cres[((k % res.cres.length) + res.cres.length) % res.cres.length] };
    if (fina && v.zoom >= 2) {
      const a0 = v.az + dif(fina.az0, v.az);   // inicio del sector, sin dar la vuelta respecto al centro
      if (a0 <= azL && a0 + fina.n * fina.paso >= azR) src = { a0, paso: fina.paso, col: (k) => fina.cols[k], cre: (k) => fina.cres[k] };
    }
    const k0 = Math.floor((azL - src.a0) / src.paso) - 1, k1 = Math.ceil((azR - src.a0) / src.paso) + 1, xk = (k) => W / 2 + (src.a0 + k * src.paso - v.az) * ppd;
    pintaRelieve(ctx, src, k0, k1, xk, W, H, y0, kv, ppd);
    const suelo = ctx.createLinearGradient(0, H - 120, 0, H); suelo.addColorStop(0, 'rgba(30,48,43,0)'); suelo.addColorStop(1, 'rgba(30,48,43,.45)'); ctx.fillStyle = suelo; ctx.fillRect(0, H - 120, W, 120);
    // brújula: marcas (más juntas con zoom) y letras en los rumbos
    const paso = [1, 5, 15].find((p) => p * ppd >= 45) ?? 15, cada = paso === 15 ? 30 : paso * 2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    for (let az = Math.ceil(azL / paso) * paso; az <= azR + paso; az += paso) {
      const x = azX(az), m = ((az % 360) + 360) % 360, card = m % 45 === 0;
      ctx.strokeStyle = 'rgba(245,238,220,.75)'; ctx.lineWidth = card ? 1.6 : 1; ctx.beginPath(); ctx.moveTo(x, H - (card ? 26 : 16)); ctx.lineTo(x, H - 8); ctx.stroke();
      ctx.fillStyle = '#f5eedc';
      if (card) { ctx.font = `700 13px ${FUENTE}`; ctx.fillText(RUMBOS[m / 45], x, H - 30); } else if (m % cada === 0) { ctx.font = `600 11px ${FUENTE}`; ctx.fillText(m + '°', x, H - 20); }
    }
    // nombres en vertical sobre cada cumbre, de la más importante a la menos; si pisa a otro, se queda para la lista (con zoom caben más)
    const puestas = []; let omitidas = 0, n = 0;
    for (const vi of res.vis) {
      const x = azX(vi.az); if (x < -20 || x > W + 20) continue;
      if (n >= MAXN) { omitidas++; continue; }
      const nom = vi.p.nombre.length > 24 ? vi.p.nombre.slice(0, 23) + '…' : vi.p.nombre, alt = fmtM(vi.p.altitud);
      ctx.font = `700 12px ${FUENTE}`; const w1 = ctx.measureText(nom).width; ctx.font = `500 11px ${FUENTE}`; const w2 = ctx.measureText(alt).width;
      const len = w1 + 6 + w2, ySum = y0 - vi.ang * kv, base = ySum - 9;
      if (base - len < 4 || ySum > H - 40) { omitidas++; continue; }
      if (puestas.some((q) => Math.abs(q.x - x) < 15 && q.base - q.len < base + 4 && q.base + 4 > base - len)) { omitidas++; continue; }
      puestas.push({ v: vi, nom, alt, w1, len, x, base, ySum }); n++;
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
    if (sol) pintaSol(ctx, sol, azX, y0, kv, W, H);   // el sol encima de los nombres, para que no tapen dónde asoma
    return { n, omitidas };
  }

  // relieve columna a columna en una imagen (una columna de píxeles por columna de datos, escalada con suavizado) y encima las crestas como líneas
  function pintaRelieve(ctx, src, k0, k1, xk, W, H, y0, kv, ppd) {
    const Wp = k1 - k0 + 1; if (Wp < 2) return;
    if (lienzo.width !== Wp || lienzo.height !== H) { lienzo.width = Wp; lienzo.height = H; }
    const lc = lienzo.getContext('2d', { willReadFrequently: true }), img = lc.createImageData(Wp, H), px = img.data;
    const col = (h, d, luz, su) => {   // color del suelo (ya calculado en calcula), con la luz y la bruma de la distancia
      let r = (su >> 16) & 255, g = (su >> 8) & 255, b = su & 255;
      const l = 0.62 + 0.5 * Math.max(-0.15, luz), cl = 1 + (l - 1) * Math.exp(-d / 40000);   // el contraste de luz se apaga con la distancia
      r *= cl; g *= cl; b *= cl;
      const bru = 1 - Math.exp(-d / 30000);   // bruma: hacia el azul pálido del cielo bajo
      return [r + (196 - r) * bru, g + (210 - g) * bru, b + (220 - b) * bru];
    };
    for (let x = 0; x < Wp; x++) {
      const t = src.col(k0 + x); if (!t) continue;
      for (let i = 0; i < t.length; i += 6) {
        const yA = Math.max(0, Math.round(y0 - t[i + 1] * kv)), yB = t[i] <= -89 ? H : Math.min(H, Math.round(y0 - t[i] * kv));
        if (yB <= yA) continue;
        const [r, g, b] = col(t[i + 3], t[i + 2], t[i + 4], t[i + 5]);
        for (let y = yA; y < yB; y++) { const o = (y * Wp + x) * 4; px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255; }
      }
    }
    lc.putImageData(img, 0, 0);
    const pp = src.paso * ppd;
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(lienzo, 0, 0, Wp, H, xk(k0) - 0.5 * pp, 0, Wp * pp, H); ctx.restore();
    // crestas: se unen con la de la columna de al lado que está a una distancia parecida y casi a la misma altura
    const tramos = [[], [], []];   // cerca (< 5 km), media (< 25 km), lejos
    for (let k = k0; k < k1; k++) {
      const a = src.cre(k), b = src.cre(k + 1); if (!a || !b) continue;
      const xa = xk(k), xb = xa + pp;
      for (let i = 0; i < a.length; i += 2) {
        let mejor = -1, dm = 1.2;
        for (let j = 0; j < b.length; j += 2) { const da = Math.abs(b[j] - a[i]); if (da < dm && Math.abs(Math.log(b[j + 1] / a[i + 1])) < 0.12) { dm = da; mejor = j; } }
        if (mejor < 0) continue;
        tramos[a[i + 1] < 5000 ? 0 : a[i + 1] < 25000 ? 1 : 2].push(xa, y0 - a[i] * kv, xb, y0 - b[mejor] * kv);
      }
    }
    const ESTILO = [['rgba(28,38,34,.85)', 1.5], ['rgba(40,54,52,.6)', 1.1], ['rgba(70,88,96,.45)', 0.8]];
    ctx.lineCap = 'round';
    for (let g = 2; g >= 0; g--) {
      const l = tramos[g]; if (!l.length) continue;
      ctx.beginPath(); for (let i = 0; i < l.length; i += 4) { ctx.moveTo(l[i], l[i + 1]); ctx.lineTo(l[i + 2], l[i + 3]); }
      ctx.strokeStyle = ESTILO[g][0]; ctx.lineWidth = ESTILO[g][1]; ctx.stroke();
    }
  }

  const leeReal = () => { try { return localStorage.getItem('tresmiles-pan-real') === '1'; } catch { return false; } };
  const tamVista = () => { const sc = el.querySelector('#pan-scroll'); return [sc.clientWidth || 360, sc.clientHeight || 520]; };
  // vuelve a pintar la vista actual (como mucho una vez por fotograma) y, con zoom, pide el sector fino al parar
  let rafV = 0, tFino = 0;
  function repinta() {
    if (rafV) return;
    rafV = requestAnimationFrame(() => {
      rafV = 0; if (!ctxP?.v) return;
      const [vw, vh] = tamVista(), g = dibuja(el.querySelector('#pan-canvas'), ctxP.res, vw, vh, ctxP.e, ctxP.v, ctxP.fina, ctxP.sol);
      el.querySelector('#pan-zoom-menos').disabled = ctxP.v.zoom <= 1; el.querySelector('#pan-zoom-mas').disabled = ctxP.v.zoom >= 8;
      return g;
    });
    clearTimeout(tFino); tFino = setTimeout(afina, 250);
  }
  // con zoom (≥ 2), el trozo que se ve (y algo más de media pantalla a cada lado) se calcula con columnas de ~1,5 px: las crestas salen nítidas
  function afina() {
    const c = ctxP; if (!c?.v || c.v.zoom < 2) return;
    const [vw] = tamVista(), ppd = c.e.ppd0 * c.v.zoom, paso = Math.max(0.04, Math.min(AZ_PASO, 1.5 / ppd)), ancho = Math.min(150, 2.2 * vw / ppd);
    const f = c.fina, azL = c.v.az - vw / 2 / ppd, azR = c.v.az + vw / 2 / ppd;
    if (f && f.paso <= paso * 1.01) { const a0 = c.v.az + dif(f.az0, c.v.az); if (a0 <= azL && a0 + f.n * f.paso >= azR) return; }   // ya está
    c.fina = c.res.sector(c.v.az - ancho / 2, Math.ceil(ancho / paso) + 1, paso);
    repinta();
  }
  // mira al rumbo az (zoom y altura como estén)
  function centraEn(az) { if (!ctxP?.v) return; ctxP.v.az = az; limita(ctxP.v, ctxP.e, tamVista()[1]); repinta(); }
  // zoom por k con el punto (fx, fy) de la pantalla quieto
  function zoomEn(fx, fy, k) {
    const c = ctxP; if (!c?.v) return;
    const [vw, vh] = tamVista(), v = c.v, ppd = c.e.ppd0 * v.zoom, azf = v.az + (fx - vw / 2) / ppd, angf = (v.y0 - fy) / (c.e.ex * ppd);
    v.zoom = Math.min(8, Math.max(1, v.zoom * k));
    const ppd2 = c.e.ppd0 * v.zoom; v.az = azf - (fx - vw / 2) / ppd2; v.y0 = fy + angf * c.e.ex * ppd2;
    limita(v, c.e, vh); repinta();
  }
  function desplaza(dx, dy) { const c = ctxP; if (!c?.v) return; c.v.az -= dx / (c.e.ppd0 * c.v.zoom); c.v.y0 += dy; limita(c.v, c.e, tamVista()[1]); repinta(); }

  // dibuja el panorama abierto (con la escala elegida) centrado en el rumbo az, a zoom 1, y pone la nota
  function pinta(az) {
    const real = leeReal(), { res, op, nv } = ctxP, [vw, vh] = tamVista(); el._tam?.(vw + 'x' + vh);
    ctxP.e = escala(res, vw, vh, real); ctxP.v = limita({ az, zoom: 1, y0: ctxP.e.y00 }, ctxP.e, vh);
    const g = dibuja(el.querySelector('#pan-canvas'), res, vw, vh, ctxP.e, ctxP.v, null, ctxP.sol);
    el.querySelector('#pan-zoom-menos').disabled = true; el.querySelector('#pan-zoom-mas').disabled = false;
    el.querySelector('#pan-escala').setAttribute('aria-pressed', String(real));
    el.querySelector('#pan-sub').textContent = res.vis.length ? t(g.omitidas ? '{v} cumbres con nombre a la vista: en el panorama van las {n} principales; todas están en la lista.' : '{v} cumbres con nombre a la vista.', { v: res.vis.length, n: g.n }) : t('Desde aquí no se ve ninguna cumbre de la lista.');
    const x = ctxP.e.ex.toFixed(1).replace('.', EN_INGLES ? '.' : ',');
    const so = ctxP.sol, tr = so.tramos, bs = el.querySelector('#pan-sol');
    bs.textContent = tr.length ? `${fmtHora(tr[0][0].ms)} – ${fmtHora(tr[tr.length - 1][1].ms)}` : t('Hoy no da el sol');
    bs.title = t('El sol de hoy: toca para ver por dónde asoma y por dónde se oculta');
    const notaSol = [
      so.llano ? t('Sol de hoy (hora de España): con un horizonte llano saldría a las {a} y se pondría a las {b}.', { a: fmtHora(so.llano[0].ms), b: fmtHora(so.llano[1].ms) }) : '',
      tr.length ? t(op.desdeAqui ? 'Aquí asoma tras el relieve a las {a} y se oculta a las {b}.' : 'En la cima asoma tras el relieve a las {a} y se oculta a las {b}.', { a: fmtHora(tr[0][0].ms), b: fmtHora(tr[tr.length - 1][1].ms) }) : t('Hoy el sol no llega a asomar por encima del relieve aquí.'),
      ...tr.slice(1).map((q, i) => t('Tapado por el relieve de {a} a {b}.', { a: fmtHora(tr[i][1].ms), b: fmtHora(q[0].ms) }))].join(' ');
    el.querySelector('#pan-nota').textContent = [
      t(op.desdeAqui ? 'Orientativo: relieve de 30 m hasta 12 km de ti y de 120 m más lejos; suelo de ESA WorldCover (CC BY 4.0).' : 'Orientativo: relieve de 30 m hasta 12 km de la cima y de 120 m más lejos; suelo de ESA WorldCover (CC BY 4.0).'),
      nv ? t('Nieve: satélite Sentinel-2 (Copernicus) del {f}.', { f: nv.fecha }) : '',
      notaSol,
      real ? t('Alturas a escala real, como en una foto.') : t('Alturas exageradas ×{x} para que se lean.', { x }),
      t('Pellizca o usa la rueda para ampliar; arrastra para moverte.'),
      t('Sin nubes. Las cumbres lejanas pueden faltar o sobrar. La brújula del móvil puede errar 10-20° si no está calibrada.')].filter(Boolean).join(' ');
  }

  // — lista —
  function pintaLista(orden) {
    const ul = el.querySelector('#pan-ul'), v = ctxP.res.vis.slice();
    if (orden === 'rumbo') v.sort((a, b) => a.az - b.az); else if (orden === 'distancia') v.sort((a, b) => a.d - b.d); else v.sort((a, b) => b.p.altitud - a.p.altitud);
    ul.innerHTML = v.map((x) => `<li><button type="button" data-id="${esc(x.p.id)}"><span class="pl-n">${esc(x.p.nombre)}${x.otros.length ? `<small>${t('también «{n}»', { n: esc(x.otros.join(EN_INGLES ? '”, “' : '», «')) })}</small>` : ''}</span><span class="pl-a">${fmtM(x.p.altitud)}</span><span class="pl-d">${fmtKm(x.d)} · ${rumbo(x.az)} ${Math.round(x.az)}°</span></button></li>`).join('') || '<li class="pl-vacio">Desde aquí no se ve ninguna cumbre de la lista.</li>';
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
    if (performance.now() > br.pausa && !el.querySelector('#pan-vista').hidden) centraEn(br.rumbo);
    const v = apuntada(br.rumbo); ctxP.apunta = v;
    if (v) ponApunta(v.p.nombre, `${fmtM(v.p.altitud)} · ${fmtKm(v.d)} · ${rumbo(v.az)} ${Math.round(v.az)}°`, true, true);
    else ponApunta(t('Sin cumbre con nombre'), t('Rumbo {n}', { n: `${rumbo(br.rumbo)} ${Math.round(br.rumbo)}°` }), false, false);
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
    else if (v === 'pan' && ctxP?.v) { if (br.on && br.rumbo != null) ctxP.v.az = br.rumbo; repinta(); }
  }

  function crea() {
    el = document.createElement('div'); el.id = 'panorama'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'pan-titulo'); el.hidden = true;
    el.innerHTML = `<header><div><h2 id="pan-titulo"></h2><p id="pan-sub"></p></div><button type="button" id="pan-cerrar" aria-label="Cerrar el panorama">×</button></header>
      <nav id="pan-barra"><div id="pan-tabs" role="tablist"><button type="button" role="tab" data-v="pan" aria-selected="true">Panorama</button><button type="button" role="tab" data-v="lis" aria-selected="false">Lista</button></div>
      <button type="button" id="pan-brujula" aria-pressed="false"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m15.5 8.5-2 5-5 2 2-5z" fill="currentColor"/></svg>Brújula</button><button type="button" id="pan-camara" hidden><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 8h3l1.6-2.2h6.8L17 8h3v11H4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="13.2" r="3.4" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>Cámara</button></nav>
      <div id="pan-vista"><div id="pan-apunta" hidden><div><b class="ap-n"></b><span class="ap-d"></span></div><button type="button" class="ap-ficha">Ver ficha</button></div><button type="button" id="pan-sol"></button><button type="button" id="pan-escala" aria-pressed="false" title="Alturas como en una foto">Escala real</button><div id="pan-zoom"><button type="button" id="pan-zoom-mas" aria-label="Ampliar">+</button><button type="button" id="pan-zoom-menos" aria-label="Reducir" disabled>−</button></div><button type="button" id="pan-completa" aria-label="Pantalla completa" title="Pantalla completa"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button type="button" id="pan-salir" aria-label="Salir de la pantalla completa" title="Salir de la pantalla completa">×</button><div id="pan-scroll"><canvas id="pan-canvas"></canvas></div><div id="pan-mira" aria-hidden="true"></div></div>
      <div id="pan-lista" hidden><div id="pan-orden" role="group" aria-label="Ordenar"><button type="button" data-o="rumbo">Por rumbo</button><button type="button" data-o="distancia">Por distancia</button><button type="button" data-o="altura">Por altura</button></div><ul id="pan-ul"></ul></div>
      <p id="pan-nota"></p>`;
    document.body.appendChild(el);
    const cerrar = () => { completa(false); apagaBrujula(); el.hidden = true; document.body.classList.remove('pan-abierto'); token++; };
    el.querySelector('#pan-cerrar').addEventListener('click', cerrar);
    // pantalla completa: fuera la cabecera, la nota y la barra; en el navegador, además, su pantalla completa (la app ya va sin barras del sistema).
    // Se sale con la ✕, con «atrás» del móvil o con Esc (main.js: cierraUno), o saliendo de la pantalla completa del navegador
    function completa(on) {
      if (el.classList.contains('pan-completa') === on) return;
      el.classList.toggle('pan-completa', on);
      const nav = !window.TresmilesApp && document.fullscreenEnabled;
      try { if (on && nav && !document.fullscreenElement) el.requestFullscreen?.().catch(() => {}); else if (!on && document.fullscreenElement === el) document.exitFullscreen?.().catch(() => {}); } catch { /* sin pantalla completa del navegador */ }
      if (ctxP?.v) { ctxP.fina = null; pinta(ctxP.v.az); }
    }
    el.querySelector('#pan-sol').addEventListener('click', () => {   // mira a donde asoma el sol; otra vez, a donde se oculta
      const tr = ctxP?.sol?.tramos; if (!tr?.length) return;
      const ir = ctxP.solVa = ctxP.solVa === 'sale' ? 'pone' : 'sale', q = ir === 'sale' ? tr[0][0] : tr[tr.length - 1][1];
      centraEn(q.az);
    });
    el.querySelector('#pan-completa').addEventListener('click', () => completa(!el.classList.contains('pan-completa')));
    el.querySelector('#pan-salir').addEventListener('click', () => completa(false));
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && el.classList.contains('pan-completa')) completa(false); });
    el._completa = completa;
    el.querySelector('#pan-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) vista(b.dataset.v); });
    el.querySelector('#pan-brujula').addEventListener('click', activaBrujula);
    el.querySelector('#pan-escala').addEventListener('click', () => {   // cambia entre alturas exageradas y escala real, mirando al mismo sitio
      const real = !(leeReal()); try { localStorage.setItem('tresmiles-pan-real', real ? '1' : '0'); } catch {}
      if (ctxP?.v) { ctxP.fina = null; pinta(ctxP.v.az); }
    });
    el.querySelector('#pan-camara').addEventListener('click', () => { if (ctxP && camara) { apagaBrujula(); camara(ctxP.res); } });
    el.querySelector('#pan-orden').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { el.dataset.orden = b.dataset.o; pintaLista(b.dataset.o); } });
    el.querySelector('#pan-ul').addEventListener('click', (e) => { const b = e.target.closest('button[data-id]'); if (b) { cerrar(); abrir(b.dataset.id); } });
    el.querySelector('.ap-ficha').addEventListener('click', () => { const v = ctxP?.apunta; if (v) { cerrar(); abrir(v.p.id); } });
    const cv = el.querySelector('#pan-canvas');
    // arrastrar: mover (a los lados gira, arriba y abajo cambia la altura); pellizcar o la rueda: zoom en ese punto; doble toque: ampliar ahí; tocar un nombre: su ficha
    const dedos = new Map(); let movido = 0;
    const centro = (l) => ({ x: l.reduce((s, p) => s + p.x, 0) / l.length, y: l.reduce((s, p) => s + p.y, 0) / l.length });
    const sep = (l) => (l.length >= 2 ? Math.hypot(l[0].x - l[1].x, l[0].y - l[1].y) : 0);
    cv.addEventListener('pointerdown', (e) => { try { cv.setPointerCapture(e.pointerId); } catch { /* nada */ } dedos.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (dedos.size === 1) movido = 0; br.pausa = performance.now() + 4000; });
    cv.addEventListener('pointermove', (e) => {
      if (!dedos.has(e.pointerId)) return;
      const antes = [...dedos.values()], c0 = centro(antes), d0 = sep(antes);
      dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const ahora = [...dedos.values()], c1 = centro(ahora), d1 = sep(ahora), r = cv.getBoundingClientRect();
      movido += Math.hypot(c1.x - c0.x, c1.y - c0.y) + Math.abs(d1 - d0); br.pausa = performance.now() + 4000;
      if (ahora.length >= 2 && d0 > 0 && d1 > 0) zoomEn(c1.x - r.left, c1.y - r.top, d1 / d0);
      desplaza(c1.x - c0.x, c1.y - c0.y);
    });
    const suelta = (e) => { dedos.delete(e.pointerId); };
    cv.addEventListener('pointerup', suelta); cv.addEventListener('pointercancel', suelta);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomEn(e.clientX - r.left, e.clientY - r.top, Math.exp(-Math.max(-300, Math.min(300, e.deltaY * (e.deltaMode ? 30 : 1))) * 0.002)); }, { passive: false });
    cv.addEventListener('dblclick', (e) => { const r = cv.getBoundingClientRect(); zoomEn(e.clientX - r.left, e.clientY - r.top, 2); });
    cv.addEventListener('click', (e) => {   // tocar un nombre abre la ficha de esa cumbre (si no se ha arrastrado)
      if (movido > 8) return;
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, c = cajas.find((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
      if (c) { cerrar(); abrir(c.id); }
    });
    const [vw0, vh0] = [() => tamVista()[0] / 2, () => tamVista()[1] / 2];
    el.querySelector('#pan-zoom-mas').addEventListener('click', () => zoomEn(vw0(), vh0(), 2));
    el.querySelector('#pan-zoom-menos').addEventListener('click', () => zoomEn(vw0(), vh0(), 0.5));
    // si cambia el tamaño de la vista (girar el móvil, pantalla completa, o la nota de abajo que ocupa más líneas), se vuelve a pintar
    let tamPintado = '';
    new ResizeObserver(() => { const k = tamVista().join('x'); if (k !== tamPintado && ctxP?.v && !el.hidden) { tamPintado = k; ctxP.fina = null; pinta(ctxP.v.az); } }).observe(el.querySelector('#pan-scroll'));
    el._tam = (k) => { tamPintado = k; };
    el._cerrar = cerrar;
  }

  // op.desdeAqui: desde la posición del GPS (p = { id: null, nombre, q }; altura del relieve en ese punto); op.brujula: con la brújula ya encendida
  async function abrirPanorama(p, op = {}) {
    if (!el) crea();
    const tok = ++token, cv = el.querySelector('#pan-canvas');
    apagaBrujula(); ctxP = null; el.dataset.orden = 'altura'; el.querySelector('#pan-camara').hidden = !(op.desdeAqui && camara);
    el.hidden = false; document.body.classList.add('pan-abierto'); vista('pan');
    el.querySelector('#pan-titulo').textContent = t('Panorama desde {n}', { n: p.nombre }); el.querySelector('#pan-sub').textContent = op.desdeAqui ? 'Calculando lo que se ve desde aquí…' : 'Calculando lo que se ve desde la cima…'; el.querySelector('#pan-nota').textContent = '';
    cv.width = 1;
    const [bloques, cobs, nv] = await Promise.all([cargaN4(), cargaCobertura(), Promise.race([cargaNieve(), new Promise((r) => setTimeout(r, 2500, null))])]); if (tok !== token) return;   // la nieve no espera más de 2,5 s (sin conexión, sin ella)
    await new Promise((r) => setTimeout(r, 30)); if (tok !== token) return;
    const fino = await cargaFino(p.q.x, p.q.z); if (tok !== token) return;
    const alt = sampler(bloques, fino, p.q.x, p.q.z), h0 = (op.desdeAqui ? alt(p.q.x, p.q.z) : p.altitud) + 2, res = calcula(alt, p.q.x, p.q.z, h0, p.id, suelo(cobs, nv));
    if (tok !== token) return;
    ctxP = { p, res, op, nv, sol: calculaSol(res) }; pinta(res.vis[0]?.az ?? 0);
    if (op.brujula && !br.on) activaBrujula();
  }
  return { abrir: abrirPanorama, cerrar: () => el?._cerrar?.(), abierto: () => !!el && !el.hidden,
    enCompleta: () => !!el && !el.hidden && el.classList.contains('pan-completa'), salCompleta: () => el?._completa?.(false) };
}
