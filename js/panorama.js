// Panorama de 360° desde un punto (por ahora, la cima de la ficha): silueta del relieve en capas por distancia y nombre de las cumbres que se ven.
// Cálculo propio con el relieve de 120 m (nivel 4 de los bloques, ~1 MB, se pide la primera vez); no toca el relieve del mapa. La visibilidad de cada cumbre se decide con una línea
// de visión sobre ese relieve (con curvatura de la Tierra y refracción media), con tolerancia porque la malla de 120 m redondea los picos. Es orientativo.
const RT = 6371000, K_REF = 0.13, CURV = (1 - K_REF) / (2 * RT);
const BANDAS = [4000, 12000, 30000, 60000, 1e9];   // límites de distancia de las capas (m), de cerca a lejos
const COLORES = ['#2f4c45', '#4a6a60', '#6d8b85', '#93a9ac', '#b8c7ce'];   // de cerca a lejos (más lejos = más claro, como la bruma)
const AZ_PASO = 0.25, ALCANCE = 90000, RAD = Math.PI / 180;
const RUMBOS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

export function crearPanorama({ geo, meta, store, peaks, abrir, esc }) {
  let n4 = null, el = null, tokenCalculo = 0, cajas = [];
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
      if (ok) vis.push({ p, d, az, ang: aT / RAD });
    }
    return { sil, vis };
  }

  function dibuja(canvas, r, vw, vh) {
    const ppd = Math.max(4, Math.ceil(vw / 110)), pad = vw / ppd + 10, W = Math.round((360 + 2 * pad) * ppd), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ctx = canvas.getContext('2d');
    // los mejores primero; cada etiqueta busca una fila libre
    const cand = r.vis.map((v) => ({ ...v, score: v.p.altitud + (v.p.altitud >= 3000 ? 1500 : 0) - v.d / 1000 * 9 })).sort((a, b) => b.score - a.score).slice(0, 90);
    const FILAS = 6, LH = 31; ctx.font = '600 11px "Barlow Condensed", "Barlow", sans-serif';
    const filas = Array.from({ length: FILAS }, () => []), puestas = [];
    for (const c of cand) {
      const txt = c.p.nombre, sub = `${new Intl.NumberFormat('es-ES').format(c.p.altitud)} m · ${c.d < 10000 ? (c.d / 1000).toFixed(1).replace('.', ',') : Math.round(c.d / 1000)} km`, ancho = Math.max(ctx.measureText(txt).width, 62) + 10;
      for (const off of [0, 360]) {   // las etiquetas se repiten a los lados para que el giro de 360° no las corte
        const x = (c.az + off + pad) * ppd;
        let f = 0; for (; f < FILAS; f++) if (!filas[f].some(([a, b]) => x - ancho / 2 < b + 4 && x + ancho / 2 > a - 4)) break;
        if (f === FILAS) { if (off === 0) break; else continue; }
        filas[f].push([x - ancho / 2, x + ancho / 2]); puestas.push({ ...c, txt, sub, ancho, x, fila: f });
      }
    }
    const filasUsadas = Math.max(1, Math.max(0, ...puestas.map((p) => p.fila)) + 1), tope = 14 + filasUsadas * LH;
    let amax = 4; for (const s of r.sil) for (const v of s) if (v > amax) amax = v; for (const p of puestas) if (p.ang > amax) amax = p.ang;
    const amin = Math.max(-22, Math.min(...r.sil.map((s) => Math.min(...s))));
    const kv = Math.max(ppd * 1.5, Math.min(ppd * 3.5, (vh - tope - 70) / (amax - 0.35 * amin)));   // la escala vertical se ajusta para llenar la pantalla
    const H0 = Math.round(tope + 16 + amax * kv - amin * kv * 0.35 + 54), oy = Math.max(0, vh - H0) * 0.5, y0 = oy + tope + 16 + amax * kv, H = Math.max(H0, Math.round(vh));   // si sobra alto, el cielo se alarga por arriba
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cielo = ctx.createLinearGradient(0, 0, 0, y0); cielo.addColorStop(0, '#d5e3ec'); cielo.addColorStop(1, '#f6ecd6'); ctx.fillStyle = cielo; ctx.fillRect(0, 0, W, H);
    const xAz = (az) => (az + pad) * ppd;
    for (let b = BANDAS.length - 1; b >= 0; b--) {   // de lejos a cerca
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let px = 0; px <= W; px += 2) {
        const az = px / ppd - pad, k = Math.round((((az % 360) + 360) % 360) / AZ_PASO) % r.sil[b].length, ang = r.sil[b][k];
        ctx.lineTo(px, ang <= -89 ? H : y0 - ang * kv);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fillStyle = COLORES[b]; ctx.fill();
    }
    const suelo = ctx.createLinearGradient(0, y0 + 10, 0, H); suelo.addColorStop(0, 'rgba(47,76,69,0)'); suelo.addColorStop(1, 'rgba(30,48,43,.55)'); ctx.fillStyle = suelo; ctx.fillRect(0, y0, W, H - y0);
    // brújula: marcas cada 15° y letras en los rumbos
    ctx.textAlign = 'center'; ctx.font = '600 11px "Barlow Condensed", sans-serif';
    for (let az = Math.ceil(-pad / 15) * 15; az <= 360 + pad; az += 15) {
      const x = xAz(az), m = ((az % 360) + 360) % 360, card = m % 45 === 0;
      ctx.strokeStyle = 'rgba(245,238,220,.75)'; ctx.lineWidth = card ? 1.6 : 1; ctx.beginPath(); ctx.moveTo(x, H - (card ? 26 : 16)); ctx.lineTo(x, H - 8); ctx.stroke();
      ctx.fillStyle = '#f5eedc'; if (card) { ctx.font = '700 13px "Barlow Condensed", sans-serif'; ctx.fillText(RUMBOS[m / 45], x, H - 30); ctx.font = '600 11px "Barlow Condensed", sans-serif'; }
      else if (m % 30 === 0) ctx.fillText(m + '°', x, H - 20);
    }
    cajas = [];
    for (const p of puestas) {
      const yL = oy + 10 + p.fila * LH, yS = y0 - p.ang * kv, xl = p.x - p.ancho / 2;
      ctx.strokeStyle = 'rgba(36,48,44,.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, yL + 27); ctx.lineTo(p.x, yS - 2); ctx.stroke();
      ctx.fillStyle = '#24302c'; ctx.beginPath(); ctx.arc(p.x, yS, 2.2, 0, 6.3); ctx.fill();
      ctx.fillStyle = 'rgba(250,245,232,.93)'; ctx.beginPath(); ctx.roundRect(xl, yL, p.ancho, 27, 4); ctx.fill(); ctx.strokeStyle = p.p.altitud >= 3000 ? '#b9772f' : 'rgba(36,48,44,.3)'; ctx.lineWidth = p.p.altitud >= 3000 ? 1.4 : 1; ctx.stroke();
      ctx.fillStyle = '#24302c'; ctx.font = (p.p.altitud >= 3000 ? '700' : '600') + ' 11px "Barlow Condensed", sans-serif'; ctx.fillText(p.txt, p.x, yL + 11);
      ctx.fillStyle = '#5b6760'; ctx.font = '500 10px "Barlow Condensed", sans-serif'; ctx.fillText(p.sub, p.x, yL + 23);
      cajas.push({ x: xl, y: yL, w: p.ancho, h: 27, id: p.p.id });
    }
    return { ppd, pad, W, H, exag: kv / ppd, vwDeg: vw / ppd, mayor: r.vis.reduce((m, v) => (!m || v.p.altitud > m.p.altitud ? v : m), null), n: new Set(puestas.map((p) => p.p.id)).size };
  }

  function crea() {
    el = document.createElement('div'); el.id = 'panorama'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.hidden = true;
    el.innerHTML = '<header><div><h2 id="pan-titulo"></h2><p id="pan-sub"></p></div><button type="button" id="pan-cerrar" aria-label="Cerrar el panorama">×</button></header><div id="pan-scroll"><canvas id="pan-canvas"></canvas></div><p id="pan-nota"></p>';
    document.body.appendChild(el);
    const cerrar = () => { el.hidden = true; document.body.classList.remove('pan-abierto'); tokenCalculo++; };
    el.querySelector('#pan-cerrar').addEventListener('click', cerrar);
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) cerrar(); });
    const sc = el.querySelector('#pan-scroll'), cv = el.querySelector('#pan-canvas');
    cv.addEventListener('click', (e) => {   // tocar una etiqueta abre la ficha de esa cumbre
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, c = cajas.find((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
      if (c) { cerrar(); abrir(c.id); }
    });
    sc.addEventListener('scroll', () => {   // vuelta de 360°: al llegar a un extremo salta a la copia del otro lado
      const g = sc._geom; if (!g) return; const L = 360 * g.ppd, lo = 10 * g.ppd;
      if (sc.scrollLeft < lo) sc.scrollLeft += L; else if (sc.scrollLeft >= lo + L) sc.scrollLeft -= L;
    }, { passive: true });
    el._cerrar = cerrar;
  }

  async function abrirPanorama(p) {
    if (!el) crea();
    const tok = ++tokenCalculo, sc = el.querySelector('#pan-scroll'), cv = el.querySelector('#pan-canvas');
    el.hidden = false; document.body.classList.add('pan-abierto');
    el.querySelector('#pan-titulo').textContent = `Panorama desde ${p.nombre}`; el.querySelector('#pan-sub').textContent = 'Calculando lo que se ve desde la cima…'; el.querySelector('#pan-nota').textContent = '';
    cv.width = 1; sc._geom = null;
    const bloques = await cargaN4(); if (tok !== tokenCalculo) return;
    await new Promise((r) => setTimeout(r, 30)); if (tok !== tokenCalculo) return;
    const alt = sampler(bloques), h0 = p.altitud + 2, r = calcula(alt, p.q.x, p.q.z, h0, p.id);
    if (tok !== tokenCalculo) return;
    const g = dibuja(cv, r, sc.clientWidth || 360, (sc.clientHeight || 520) - 18); sc._geom = g;
    el.querySelector('#pan-sub').textContent = r.vis.length ? `${g.n} cumbres con nombre a la vista. Desliza para girar; toca una para abrir su ficha.` : 'Desde aquí no se ve ninguna cumbre de la lista.';
    el.querySelector('#pan-nota').textContent = `Orientativo: calculado con el relieve de 120 m, sin nubes ni bosque. Las alturas están exageradas ×${g.exag.toFixed(1).replace('.', ',')} para que se lean. Las cumbres lejanas pueden faltar o sobrar.`;
    sc.scrollLeft = Math.max(0, (((g.mayor?.az ?? 0) + g.pad) * g.ppd) - sc.clientWidth / 2);
  }
  return { abrir: abrirPanorama, cerrar: () => el?._cerrar?.() };
}
