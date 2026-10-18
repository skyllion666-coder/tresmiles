// Introducción cinematográfica (vídeo + título + música opcional). Capa independiente: no usa el motor 3D ni
// cambia nada del mapa; al acabar se retira del todo y la web aparece tal cual estaba.
(() => {
  'use strict';
  const DUR = 13.5, KEY = 'tresmiles-intro-vista';
  const $ = (s, r = document) => r.querySelector(s);
  const cine = $('#cine');
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } } };
  const marcaVista = () => {
    store.set(KEY, '1');
    if (store.get(KEY) !== '1') { try { document.cookie = KEY + '=1; max-age=31536000; path=/; SameSite=Lax'; } catch { /* sin cookies */ } }
  };
  // «Ver introducción» en la cabecera (a la izquierda, discreto): recarga con ?intro, que la repite desde el principio
  const cabecera = $('header.top');
  if (cabecera) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'textbtn'; b.id = 'btn-reintro';
    b.setAttribute('aria-label', 'Ver introducción'); b.title = 'Ver introducción';
    b.innerHTML = '<svg viewBox="0 0 48 32" width="17" height="12" aria-hidden="true"><path d="M2 30 16 6l7 11 5-8 18 21z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg><span>Ver introducción</span>';
    b.addEventListener('click', () => { location.href = location.pathname + '?intro'; });
    cabecera.appendChild(b);
  }
  if (!cine || document.documentElement.classList.contains('sin-cine')) { cine?.remove(); return; }

  const video = $('#cine-video'), btnSaltar = $('#cine-saltar');
  // los recursos de la introducción solo se piden cuando de verdad se va a reproducir
  video.poster = 'img/intro-poster.webp';
  // la dirección queda limpia: recargar después no repite la introducción
  try { const u = new URL(location.href); if (u.searchParams.has('intro')) { u.searchParams.delete('intro'); history.replaceState(null, '', u.pathname + u.search + u.hash); } } catch { /* nada */ }
  let quiere = false, cuenta = 0, audio = null, acabado = false, raf = 0, vigilante = 0, parado = 0;

  const tecla = (e) => { if (e.key === 'Escape') fin(true); };
  document.addEventListener('keydown', tecla);
  btnSaltar.addEventListener('click', (e) => { e.stopPropagation(); fin(true); });
  // visto = true cuando se llega al final o se salta; con un fallo del vídeo se abre la web pero NO se da por vista
  function fin(visto) {
    if (acabado) return; acabado = true; if (visto === true) marcaVista();
    cancelAnimationFrame(raf); clearTimeout(vigilante); clearTimeout(parado);
    
    cine.classList.add('fuera');
    // libera el vídeo y el audio: la capa se elimina por completo
    if (audio) { try { audio.pause(); } catch { /* ya parado */ } audio.removeAttribute('src'); audio.load(); audio = null; }
    video.pause(); video.removeAttribute('src'); video.removeAttribute('poster'); video.load();
    let hecho = false; const quita = () => { if (hecho) return; hecho = true; cine.remove(); document.removeEventListener('keydown', tecla); };
    cine.addEventListener('transitionend', (e) => { if (e.target === cine) quita(); });
    setTimeout(quita, 1300);
  }

  const sincroniza = () => { if (audio && !audio.paused && Math.abs(audio.currentTime - video.currentTime) > 0.35) audio.currentTime = Math.min(video.currentTime, DUR); };

  // título y luz final según el instante del vídeo
  function tick() {
    const t = video.currentTime; if (!(++cuenta % 30)) sincroniza();
    if (t > 5.0) cine.classList.add('t-in');
    if (t > DUR - 1.6) cine.classList.add('t-out');
    if (t > DUR - 0.9) cine.classList.add('luz');
    if (t >= DUR - 0.02) { fin(true); return; }
    raf = requestAnimationFrame(tick);
  }

  video.muted = true; video.playsInline = true;
  video.addEventListener('playing', () => { clearTimeout(vigilante); clearTimeout(parado); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); sincroniza(); if (quiere && audio && audio.paused && !acabado) audio.play().catch(() => {}); });
  video.addEventListener('waiting', () => { if (quiere && audio) audio.pause(); clearTimeout(parado); parado = setTimeout(() => fin(false), 6000); });   // se atasca: se abre la web
  video.addEventListener('ended', () => fin(true));
  video.addEventListener('error', () => fin(false));
  video.src = matchMedia('(max-width: 760px)').matches ? 'video/intro-movil.mp4' : 'video/intro.mp4';
  const hint = $('#cine-hint');
  // el vídeo arranca ya (en silencio); si no arranca en 7 s se deja pasar a la web
  vigilante = setTimeout(() => fin(false), 7000);
  { const p = video.play(); if (p && p.catch) p.catch(() => fin(false)); }

  // música: se intenta a la vez. Si el navegador la deja sonar, entra sincronizada con el vídeo; si no, se avisa con un
  // texto casi invisible y cualquier toque en la introducción la activa sin reiniciar nada.
  const sonando = () => { quiere = true; sincroniza(); if (hint) { hint.classList.remove('ver', 'tenue'); hint.classList.add('quita'); } cine.classList.remove('sin-sonido'); };
  const pideAudio = () => {
    if (acabado) return Promise.resolve();
    audio = audio || new Audio('audio/intro.mp3');
    if (!audio.paused) return Promise.resolve();
    try { audio.currentTime = Math.min(video.currentTime || 0, DUR); } catch { /* aún sin metadatos */ }
    return audio.play().then(() => { if (!acabado) sonando(); });
  };
  const bloqueado = () => {
    if (acabado || !hint) return;
    cine.classList.add('sin-sonido'); hint.classList.add('ver');
    setTimeout(() => hint.classList.add('tenue'), 7000);   // pasados unos segundos queda solo la notita ♪
  };
  // solo un bloqueo real (NotAllowedError) muestra el aviso; cualquier otro fallo se reintenta una vez
  pideAudio().catch((e) => { if (e && e.name === 'NotAllowedError') bloqueado(); else setTimeout(() => { audio = audio || null; pideAudio().catch(bloqueado); }, 400); });
  cine.addEventListener('click', (e) => {
    if (e.target.closest('#cine-saltar') || !cine.classList.contains('sin-sonido')) return;
    pideAudio().catch(() => { /* sigue sin sonido: la animación continúa */ });
  });
})();
