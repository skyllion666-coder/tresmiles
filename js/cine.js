// Introducción cinematográfica (vídeo + título + música opcional). Capa independiente: no usa el motor 3D ni
// cambia nada del mapa; al acabar (o al saltarla) se retira del todo y la web aparece tal cual estaba.
(() => {
  'use strict';
  const DUR = 13.5, KEY = 'tresmiles-intro-vista';
  const $ = (s, r = document) => r.querySelector(s);
  const cine = $('#cine');
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } } };
  // botón de la cabecera para volver a verla (recarga con ?intro; el mapa no se inicia dos veces)
  const cabecera = $('header.top');
  if (cabecera) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'textbtn'; b.id = 'btn-reintro';
    b.setAttribute('aria-label', 'Ver la introducción'); b.title = 'Ver la introducción';
    b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
    b.addEventListener('click', () => { location.href = location.pathname + '?intro'; });
    cabecera.insertBefore(b, $('#btn-about'));
  }
  if (!cine || document.documentElement.classList.contains('sin-cine')) { cine?.remove(); return; }

  const video = $('#cine-video'), btnSonido = $('#cine-sonido'), btnSaltar = $('#cine-saltar');
  let audio = null, acabado = false, raf = 0, vigilante = 0, parado = 0;

  function fin() {
    if (acabado) return; acabado = true;
    cancelAnimationFrame(raf); clearTimeout(vigilante); clearTimeout(parado);
    store.set(KEY, '1');
    cine.classList.add('fuera');
    // libera el vídeo y el audio: la capa se elimina por completo
    if (audio) { try { audio.pause(); } catch { /* ya parado */ } audio.removeAttribute('src'); audio.load(); audio = null; }
    video.pause(); video.removeAttribute('src'); video.removeAttribute('poster'); video.load();
    let hecho = false; const quita = () => { if (hecho) return; hecho = true; cine.remove(); document.removeEventListener('keydown', tecla); };
    cine.addEventListener('transitionend', (e) => { if (e.target === cine) quita(); });
    setTimeout(quita, 1300);
  }
  const tecla = (e) => { if (e.key === 'Escape') fin(); };
  document.addEventListener('keydown', tecla);
  btnSaltar.addEventListener('click', fin);

  // sonido opcional: el archivo no se descarga hasta que se pulsa el botón
  btnSonido.addEventListener('click', () => {
    if (acabado) return;
    if (!audio) {
      audio = new Audio('audio/intro.mp3'); audio.preload = 'auto';
      audio.currentTime = Math.min(video.currentTime || 0, DUR);
      audio.play().then(() => { btnSonido.setAttribute('aria-pressed', 'true'); btnSonido.textContent = 'Silenciar'; }).catch(() => { audio = null; });
    } else if (!audio.paused) { audio.pause(); btnSonido.setAttribute('aria-pressed', 'false'); btnSonido.textContent = 'Sonido'; }
    else { audio.currentTime = Math.min(video.currentTime || 0, DUR); audio.play().then(() => { btnSonido.setAttribute('aria-pressed', 'true'); btnSonido.textContent = 'Silenciar'; }).catch(() => {}); }
  });

  // título y luz final según el instante del vídeo
  function tick() {
    const t = video.currentTime;
    if (t > 5.0) cine.classList.add('t-in');
    if (t > DUR - 1.6) cine.classList.add('t-out');
    if (t > DUR - 0.9) cine.classList.add('luz');
    if (t >= DUR - 0.02) { fin(); return; }
    raf = requestAnimationFrame(tick);
  }

  video.muted = true; video.playsInline = true;
  video.addEventListener('playing', () => { clearTimeout(vigilante); clearTimeout(parado); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); if (audio && audio.paused && !acabado) audio.play().catch(() => {}); });
  video.addEventListener('waiting', () => { if (audio) audio.pause(); clearTimeout(parado); parado = setTimeout(fin, 6000); });   // se atasca: se abre la web
  video.addEventListener('ended', fin);
  video.addEventListener('error', fin);
  // si no arranca en 7 s (red lenta, vídeo bloqueado…) se deja pasar a la web
  vigilante = setTimeout(fin, 7000);
  video.src = matchMedia('(max-width: 760px)').matches ? 'video/intro-movil.mp4' : 'video/intro.mp4';
  const p = video.play(); if (p && p.catch) p.catch(fin);
})();
