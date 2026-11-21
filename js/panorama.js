// Panorama de 360° desde un punto (la cima de la ficha o tu posición): el relieve que se ve, pintado columna a columna (color por altitud, luz del sol y bruma por distancia),
// las crestas dibujadas como líneas, nombres de las cumbres que se ven, lista y modo brújula.
// Cálculo propio con el relieve de 30 m (nivel 1) hasta FINO m y el de 120 m (nivel 4, ~1 MB) más lejos; se piden la primera vez; no toca el relieve del mapa. La visibilidad de cada cumbre se decide con una línea
// de visión sobre ese relieve (con curvatura de la Tierra y refracción media), con tolerancia porque la malla de 120 m redondea los picos. Es orientativo.
// Modo brújula: el panorama gira con el móvil y un nombre arriba dice a qué cumbre apuntas (DeviceOrientation; en Android «absolute», en iPhone webkitCompassHeading).
import { t, EN_INGLES } from './i18n.js?v=45';
const RT = 6371000, K_REF = 0.13, CURV = (1 - K_REF) / (2 * RT);
const BANDAS = [4000, 12000, 30000, 60000, 1e9];   // límites de distancia de las capas (m), de cerca a lejos
const SUELO = [null, [50, 74, 46], [98, 104, 66], [124, 124, 80], [136, 130, 122], [238, 242, 248], [72, 98, 116], null, [118, 120, 86]];   // por tipo de WorldCover: bosque, matorral, pasto, roca, nieve/hielo, agua, -, musgo
const AZ_PASO = 0.25, ALCANCE = 90000, RAD = Math.PI / 180, DECL = 1.3;   // DECL: declinación magnética del Pirineo (este), para pasar de rumbo magnético a geográfico
const RUMBOS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'], RUMBOS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
const rumbo = (az) => { const r = RUMBOS16[Math.round((((az % 360) + 360) % 360) / 22.5) % 16]; return EN_INGLES ? r.replace(/O/g, 'W') : r; };   // en inglés, oeste = W
const fmtKm = (d) => (d < 10000 ? (d / 1000).toFixed(1).replace('.', EN_INGLES ? '.' : ',') : String(Math.round(d / 1000))) + ' km';
const fmtM = (n) => new Intl.NumberFormat(EN_INGLES ? 'en-GB' : 'es-ES').format(n) + ' m';
const FUENTE = '"Barlow Condensed", "Barlow", sans-serif';

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
    for (let a = 0; a < NA; a++) {
      const az = a * AZ_PASO * RAD, sx = Math.sin(az), sz = -Math.cos(az);   // 0° = norte (−z), 90° = este (+x)
      let b = 0, max = -90, visto = false, dVisto = 0, cresta = null;
      const tr = [], cr = [];
      for (let d = 60; d < ALCANCE; d += (d < FINO ? 25 : 50) + d * 0.009) {
        while (d > BANDAS[b]) b++;
        const x = x0 + sx * d, z = z0 + sz * d;
        if (!geo.dentro(x, z)) break;   // fuera del mapa no hay relieve: ahí se acaba la vista
        const h = alt(x, z), ang = Math.atan2(h - h0 - d * d * CURV, d) / RAD;
        if (ang > sil[b][a]) sil[b][a] = ang;
        if (ang > max) {
          if (cresta && d > cresta[1] * 1.12 + 250) cr.push(cresta[0], cresta[1]);   // lo de detrás de la cresta queda bastante más lejos: es una línea
          cresta = null;
          const e = d < FINO ? 30 : 120, gx = (alt(x + e, z) - alt(x - e, z)) / (2 * e), gz = (alt(x, z + e) - alt(x, z - e)) / (2 * e), nn = Math.hypot(gx, 1, gz);
          const luz = (-gx * SOL[0] + SOL[1] - gz * SOL[2]) / nn;
          tr.push(max, ang, d, h, luz, sue(x, z, h, Math.max(20, d * 0.006))); max = ang; visto = true; dVisto = d;
        } else if (visto) { cresta = [max, dVisto]; visto = false; }
      }
      cr.push(max, visto ? dVisto : (cresta ? cresta[1] : dVisto));   // la línea del cielo
      cols[a] = Float32Array.from(tr); cres[a] = Float32Array.from(cr);
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
    return { sil, cols, cres, vis: unicos };
  }

  // — dibujo del panorama —
  function dibuja(canvas, res, vw, vh, real = false) {   // real: alturas a escala real (como una foto), con más zoom
    const ppd = real ? Math.min(16, Math.max(Math.ceil(vw / 110), Math.round(vw / 50))) : Math.max(4, Math.ceil(vw / 110)), pad = vw / ppd + 10, W = Math.round((360 + 2 * pad) * ppd), dpr = Math.min(window.devicePixelRatio || 1, 2), ctx = canvas.getContext('2d');
    const TOPE = vh < 520 ? 120 : 150, MAXN = 24;
    let amax = 4; for (const s of res.sil) for (const v of s) if (v > amax) amax = v; for (const v of res.vis) if (v.ang > amax) amax = v.ang;
    const amin = Math.max(-22, Math.min(...res.sil.map((s) => Math.min(...s))));
    const kv = real ? ppd : Math.max(ppd * 1.5, Math.min(ppd * 3.5, (vh - TOPE - 70) / (amax - 0.35 * amin)));   // la escala vertical se ajusta para llenar la pantalla (en escala real, la misma que la horizontal)
    const H0 = Math.round(TOPE + 16 + amax * kv - amin * kv * 0.35 + 54), oy = Math.max(0, vh - H0) * 0.5, y0 = oy + TOPE + 16 + amax * kv, H = Math.max(H0, Math.round(vh));
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cielo = ctx.createLinearGradient(0, 0, 0, y0); cielo.addColorStop(0, '#d5e3ec'); cielo.addColorStop(1, '#f6ecd6'); ctx.fillStyle = cielo; ctx.fillRect(0, 0, W, H);
    const xAz = (az) => (az + pad) * ppd;
    pintaRelieve(ctx, res, W, H, ppd, pad, y0, kv);
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

  // relieve columna a columna en una imagen (a 1 píxel CSS) y encima las crestas como líneas
  function pintaRelieve(ctx, res, W, H, ppd, pad, y0, kv) {
    const NA = res.cols.length, Wp = Math.ceil(W / (AZ_PASO * ppd)) + 1, img = new ImageData(Wp, H), px = img.data;   // una columna de píxeles por cada paso de rumbo
    const col = (h, d, luz, su) => {   // color del suelo (ya calculado en calcula), con la luz y la bruma de la distancia
      let r = (su >> 16) & 255, g = (su >> 8) & 255, b = su & 255;
      const l = 0.62 + 0.5 * Math.max(-0.15, luz), cl = 1 + (l - 1) * Math.exp(-d / 40000);   // el contraste de luz se apaga con la distancia
      r *= cl; g *= cl; b *= cl;
      const bru = 1 - Math.exp(-d / 30000);   // bruma: hacia el azul pálido del cielo bajo
      return [r + (196 - r) * bru, g + (210 - g) * bru, b + (220 - b) * bru];
    };
    for (let x = 0; x < Wp; x++) {
      const az = x * AZ_PASO - pad, k = Math.round((((az % 360) + 360) % 360) / AZ_PASO) % NA, t = res.cols[k];
      for (let i = 0; i < t.length; i += 6) {
        const yA = Math.max(0, Math.round(y0 - t[i + 1] * kv)), yB = t[i] <= -89 ? H : Math.min(H, Math.round(y0 - t[i] * kv));
        if (yB <= yA) continue;
        const [r, g, b] = col(t[i + 3], t[i + 2], t[i + 4], t[i + 5]);
        for (let y = yA; y < yB; y++) { const o = (y * Wp + x) * 4; px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255; }
      }
    }
    const oc = document.createElement('canvas'); oc.width = Wp; oc.height = H; oc.getContext('2d').putImageData(img, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(oc, 0, 0, Wp, H, -0.5 * AZ_PASO * ppd, 0, Wp * AZ_PASO * ppd, H); ctx.restore();
    // crestas: se unen con la de la columna de al lado que está a una distancia parecida y casi a la misma altura
    const tramos = [[], [], []];   // cerca (< 5 km), media (< 25 km), lejos
    const x0c = (k) => (k * AZ_PASO + pad) * ppd;
    for (let k = 0; k < NA; k++) {
      const a = res.cres[k], b = res.cres[(k + 1) % NA];
      for (let i = 0; i < a.length; i += 2) {
        let mejor = -1, dm = 1.2;
        for (let j = 0; j < b.length; j += 2) { const da = Math.abs(b[j] - a[i]); if (da < dm && Math.abs(Math.log(b[j + 1] / a[i + 1])) < 0.12) { dm = da; mejor = j; } }
        if (mejor < 0) continue;
        const g = a[i + 1] < 5000 ? 0 : a[i + 1] < 25000 ? 1 : 2;
        for (const off of [-360, 0, 360]) {
          const xa = x0c(k) + off * ppd, xb = xa + AZ_PASO * ppd; if (xb < -2 || xa > W + 2) continue;
          tramos[g].push(xa, y0 - a[i] * kv, xb, y0 - b[mejor] * kv);
        }
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
  // dibuja el panorama abierto (con la escala elegida) centrado en el rumbo az, y pone la nota
  function pinta(az) {
    const sc = el.querySelector('#pan-scroll'), cv = el.querySelector('#pan-canvas'), real = leeReal(), { res, op, nv } = ctxP;
    const g = dibuja(cv, res, sc.clientWidth || 360, sc.clientHeight || 520, real); ctxP.g = g;
    el.querySelector('#pan-escala').setAttribute('aria-pressed', String(real));
    el.querySelector('#pan-sub').textContent = res.vis.length ? t(g.omitidas ? '{v} cumbres con nombre a la vista: en el panorama van las {n} principales; todas están en la lista.' : '{v} cumbres con nombre a la vista.', { v: res.vis.length, n: g.n }) : t('Desde aquí no se ve ninguna cumbre de la lista.');
    const x = g.exag.toFixed(1).replace('.', EN_INGLES ? '.' : ',');
    el.querySelector('#pan-nota').textContent = [
      t(op.desdeAqui ? 'Orientativo: relieve de 30 m hasta 12 km de ti y de 120 m más lejos; suelo de ESA WorldCover (CC BY 4.0).' : 'Orientativo: relieve de 30 m hasta 12 km de la cima y de 120 m más lejos; suelo de ESA WorldCover (CC BY 4.0).'),
      nv ? t('Nieve: satélite Sentinel-2 (Copernicus) del {f}.', { f: nv.fecha }) : '',
      real ? t('Alturas a escala real, como en una foto.') : t('Alturas exageradas ×{x} para que se lean.', { x }),
      t('Sin nubes. Las cumbres lejanas pueden faltar o sobrar. La brújula del móvil puede errar 10-20° si no está calibrada.')].filter(Boolean).join(' ');
    centraEn(sc, g, az);
  }

  const normaliza = (g, left) => { const L = 360 * g.ppd, lo = 10 * g.ppd; while (left < lo) left += L; while (left >= lo + L) left -= L; return left; };
  const centraEn = (sc, g, az) => { sc.scrollLeft = normaliza(g, (az + g.pad) * g.ppd - sc.clientWidth / 2); };

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
    if (performance.now() > br.pausa && !el.querySelector('#pan-vista').hidden) centraEn(el.querySelector('#pan-scroll'), ctxP.g, br.rumbo);
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
    else if (v === 'pan' && ctxP?.g && br.on && br.rumbo != null) centraEn(el.querySelector('#pan-scroll'), ctxP.g, br.rumbo);
  }

  function crea() {
    el = document.createElement('div'); el.id = 'panorama'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'pan-titulo'); el.hidden = true;
    el.innerHTML = `<header><div><h2 id="pan-titulo"></h2><p id="pan-sub"></p></div><button type="button" id="pan-cerrar" aria-label="Cerrar el panorama">×</button></header>
      <nav id="pan-barra"><div id="pan-tabs" role="tablist"><button type="button" role="tab" data-v="pan" aria-selected="true">Panorama</button><button type="button" role="tab" data-v="lis" aria-selected="false">Lista</button></div>
      <button type="button" id="pan-brujula" aria-pressed="false"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m15.5 8.5-2 5-5 2 2-5z" fill="currentColor"/></svg>Brújula</button><button type="button" id="pan-camara" hidden><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 8h3l1.6-2.2h6.8L17 8h3v11H4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="13.2" r="3.4" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>Cámara</button></nav>
      <div id="pan-vista"><div id="pan-apunta" hidden><div><b class="ap-n"></b><span class="ap-d"></span></div><button type="button" class="ap-ficha">Ver ficha</button></div><button type="button" id="pan-escala" aria-pressed="false" title="Alturas como en una foto">Escala real</button><div id="pan-scroll"><canvas id="pan-canvas"></canvas></div><div id="pan-mira" aria-hidden="true"></div></div>
      <div id="pan-lista" hidden><div id="pan-orden" role="group" aria-label="Ordenar"><button type="button" data-o="rumbo">Por rumbo</button><button type="button" data-o="distancia">Por distancia</button><button type="button" data-o="altura">Por altura</button></div><ul id="pan-ul"></ul></div>
      <p id="pan-nota"></p>`;
    document.body.appendChild(el);
    const cerrar = () => { apagaBrujula(); el.hidden = true; document.body.classList.remove('pan-abierto'); token++; };
    el.querySelector('#pan-cerrar').addEventListener('click', cerrar);
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) cerrar(); });
    el.querySelector('#pan-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) vista(b.dataset.v); });
    el.querySelector('#pan-brujula').addEventListener('click', activaBrujula);
    el.querySelector('#pan-escala').addEventListener('click', () => {   // cambia entre alturas exageradas y escala real, mirando al mismo sitio
      const real = !(leeReal()); try { localStorage.setItem('tresmiles-pan-real', real ? '1' : '0'); } catch {}
      if (ctxP?.g) { const g = ctxP.g, az = (sc.scrollLeft + sc.clientWidth / 2) / g.ppd - g.pad; pinta(az); }
    });
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
    el.querySelector('#pan-titulo').textContent = t('Panorama desde {n}', { n: p.nombre }); el.querySelector('#pan-sub').textContent = op.desdeAqui ? 'Calculando lo que se ve desde aquí…' : 'Calculando lo que se ve desde la cima…'; el.querySelector('#pan-nota').textContent = '';
    cv.width = 1;
    const [bloques, cobs, nv] = await Promise.all([cargaN4(), cargaCobertura(), Promise.race([cargaNieve(), new Promise((r) => setTimeout(r, 2500, null))])]);   // la nieve no espera más de 2,5 s (sin conexión, sin ella) if (tok !== token) return;
    await new Promise((r) => setTimeout(r, 30)); if (tok !== token) return;
    const fino = await cargaFino(p.q.x, p.q.z); if (tok !== token) return;
    const alt = sampler(bloques, fino, p.q.x, p.q.z), h0 = (op.desdeAqui ? alt(p.q.x, p.q.z) : p.altitud) + 2, res = calcula(alt, p.q.x, p.q.z, h0, p.id, suelo(cobs, nv));
    if (tok !== token) return;
    ctxP = { p, res, op, nv }; pinta(res.vis[0]?.az ?? 0);
    if (op.brujula && !br.on) activaBrujula();
  }
  return { abrir: abrirPanorama, cerrar: () => el?._cerrar?.() };
}
