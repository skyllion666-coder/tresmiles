// Pantalla de carga: maqueta 3D del macizo de la Maladeta-Aneto que se va iluminando de las cumbres hacia abajo del 0 al 100 %.
// Script clásico y sin dependencias (canvas 2D) para que salga al instante, antes de que se descargue three.js. El relieve va en carga-datos.js (tools/build_carga.py).
// Window.Carga.paso(i, texto): main.js avisa de cada hito real del arranque; entre hitos el porcentaje avanza despacio sin pasar del siguiente. Carga.fin() devuelve una promesa que se cumple al llegar al 100 %.
(() => {
  const D = window.CARGA_DATOS, cv = document.getElementById('load-maqueta'), pctEl = document.getElementById('load-pct'), txt = document.getElementById('load-text'), aviso = document.getElementById('load-aviso');
  const HITOS = [0, 8, 24, 38, 52, 92, 100];   // % al llegar a cada paso (0: inicio; 1: datos; 2: relieve general; 3: lagos; 4: fichas; 5: relieve de detalle; 6: listo)
  let paso = 0, mostrado = 0, ultimo = performance.now(), terminado = false, resolverFin = null, anim = 0, fps = 0;
  const reducido = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = cv && cv.getContext && cv.getContext('2d');

  window.Carga = {
    paso(i, texto) { if (i > paso) { paso = i; ultimo = performance.now(); if (aviso) aviso.hidden = true; } if (texto && txt) txt.textContent = texto; },
    fin() { paso = HITOS.length - 1; return new Promise((res) => { if (!ctx) return res(); resolverFin = res; setTimeout(() => { mostrado = 100; terminado = true; pinta(); res(); }, 1200); }); },
  };
  const pinta = () => { if (pctEl) pctEl.textContent = Math.round(mostrado) + ' %'; };
  if (!D || !ctx) { setInterval(() => { mostrado = Math.min(99, mostrado + (HITOS[paso] - mostrado) * 0.2 + 0.05); if (!terminado) pinta(); }, 300); return; }   // sin canvas: solo el porcentaje

  // — relieve —
  const nx = D.nx, nz = D.nz, bin = atob(D.h), alt = new Float32Array(nx * nz);
  for (let k = 0; k < alt.length; k++) alt[k] = bin.charCodeAt(k) / 255;
  for (let it = 0; it < 2; it++) for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) { const k = j * nx + i; alt[k] = 0.5 * alt[k] + 0.125 * (alt[k - 1] + alt[k + 1] + alt[k - nx] + alt[k + nx]); }   // suaviza el escalonado de los bytes
  const NC = (nx - 1) * (nz - 1), ch = new Float32Array(NC), claro = new Array(NC), alto = new Array(NC), sombra = new Float32Array(NC);
  const mezcla = (a, b, t) => a.map((v, n) => v + (b[n] - v) * t);
  const BAJO = [168, 184, 160], MEDIO = [226, 218, 190], CIMA = [252, 249, 238], ORO = [240, 190, 110];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const c = j * (nx - 1) + i, a = alt[j * nx + i], b = alt[j * nx + i + 1], d = alt[(j + 1) * nx + i], e = alt[(j + 1) * nx + i + 1];
    ch[c] = (a + b + d + e) / 4;
    const dx = (b + e - a - d) / 2, dz = (d + e - a - b) / 2, s = Math.max(0.35, Math.min(1.1, 0.72 - (dx * -0.7 + dz * -0.7) * 9)); sombra[c] = s;   // luz desde el noroeste
    const base = ch[c] < 0.5 ? mezcla(BAJO, MEDIO, ch[c] / 0.5) : mezcla(MEDIO, CIMA, (ch[c] - 0.5) / 0.5);
    claro[c] = `rgb(${base.map((v) => Math.min(255, Math.round(v * s))).join(',')})`;
    const oro = mezcla(base, ORO, 0.7); alto[c] = `rgb(${oro.map((v) => Math.min(255, Math.round(v * Math.max(s, 0.8)))).join(',')})`;
  }
  const orden = Float32Array.from(ch).sort(), cuantil = (p) => (p <= 0 ? -1 : p >= 1 ? 2 : orden[Math.min(orden.length - 1, Math.floor(p * orden.length))]);   // la luz baja desde las cumbres: el área iluminada crece con el porcentaje
  // — vista —
  let w = 0, h = 0, dpr = 1;
  const ajusta = () => { dpr = Math.min(window.devicePixelRatio || 1, 2); w = cv.clientWidth || 300; h = cv.clientHeight || 190; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); };
  ajusta(); addEventListener('resize', ajusta);
  const PIT = 0.74, CP = Math.cos(PIT), SP = Math.sin(PIT), EX = 1.05, ASP = D.H / D.W;
  const sx = new Float32Array(nx * nz), sy = new Float32Array(nx * nz);
  function dibuja(t, nivel) {
    const yaw = reducido ? 0.7 : 0.55 + t * 0.00022, cy = Math.cos(yaw), sn = Math.sin(yaw), S = Math.min(w * 0.74, h * 1.12);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, X = i / (nx - 1) - 0.5, Z = (j / (nz - 1) - 0.5) * ASP, Y = alt[k] * 0.5 * EX;
      const xr = X * cy - Z * sn, zr = X * sn + Z * cy;   // zr > 0: hacia el espectador
      sx[k] = w / 2 + xr * S; sy[k] = h * 0.56 + (-Y * CP + zr * SP) * S * 0.82;
    }
    const iAsc = sn >= 0, jAsc = cy >= 0, jFuera = Math.abs(cy) >= Math.abs(sn);   // de lejos a cerca
    const celda = (i, j) => {
      const c = j * (nx - 1) + i, a = j * nx + i, b = a + 1, d = a + nx, e = d + 1, lleno = ch[c] >= nivel;
      ctx.beginPath(); ctx.moveTo(sx[a], sy[a]); ctx.lineTo(sx[b], sy[b]); ctx.lineTo(sx[e], sy[e]); ctx.lineTo(sx[d], sy[d]); ctx.closePath();
      if (lleno) { ctx.fillStyle = ch[c] - nivel < 0.03 && nivel > -0.5 ? alto[c] : claro[c]; ctx.fill(); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.6; ctx.stroke(); }
      else { ctx.fillStyle = '#2f4c45'; ctx.fill(); ctx.strokeStyle = 'rgba(214,226,214,.22)'; ctx.lineWidth = 0.5; ctx.stroke(); }
    };
    const I = (n) => (iAsc ? n : nx - 2 - n), J = (n) => (jAsc ? n : nz - 2 - n);
    if (jFuera) for (let nj = 0; nj < nz - 1; nj++) for (let ni = 0; ni < nx - 1; ni++) celda(I(ni), J(nj));
    else for (let ni = 0; ni < nx - 1; ni++) for (let nj = 0; nj < nz - 1; nj++) celda(I(ni), J(nj));
    if (nivel < 1.5) {   // la cumbre se enciende cuando el relieve llega arriba
      const X = D.ax - 0.5, Z = (D.az - 0.5) * ASP, Y = D.ah * 0.5 * EX, xr = X * cy - Z * sn, zr = X * sn + Z * cy, px = w / 2 + xr * S, py = h * 0.56 + (-Y * CP + zr * SP) * S * 0.82;
      const g = ctx.createRadialGradient(px, py, 0, px, py, 16); g.addColorStop(0, 'rgba(255,226,160,.95)'); g.addColorStop(1, 'rgba(255,226,160,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 16, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#fff7df'; ctx.beginPath(); ctx.arc(px, py, 2.4, 0, 6.3); ctx.fill();
    }
  }
  let previo = 0;
  function bucle(t) {
    const dt = Math.min(0.1, (t - previo) / 1000 || 0.016); previo = t;
    if (!terminado) {
      const meta = HITOS[paso], limite = Math.max(meta, (HITOS[paso + 1] ?? 100) - 3);
      if (mostrado < meta) mostrado += (meta - mostrado) * Math.min(1, dt * 4) + dt * 2;   // alcanza el hito real
      else if (paso < HITOS.length - 1) mostrado = Math.min(limite, mostrado + dt * Math.max(0.2, (limite - mostrado) * 0.06));   // sigue avanzando despacio hasta el siguiente hito
      mostrado = Math.min(mostrado, 100);
      if (aviso && performance.now() - ultimo > 22000) { aviso.hidden = false; }
      if (paso === HITOS.length - 1 && mostrado >= 99.5) { mostrado = 100; terminado = true; resolverFin && resolverFin(); }
      pinta();
    }
    if (t - fps >= 33) { fps = t; dibuja(t, cuantil(1 - mostrado / 100)); }   // ≈30 imágenes por segundo
    if (document.body.classList.contains('is-loading') || performance.now() < parar) anim = requestAnimationFrame(bucle);
  }
  let parar = 0;
  new MutationObserver(() => { if (!document.body.classList.contains('is-loading')) parar = performance.now() + 1000; }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  anim = requestAnimationFrame(bucle);
})();
