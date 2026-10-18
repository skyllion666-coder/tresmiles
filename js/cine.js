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

  const video = $('#cine-video'), btnSaltar = $('#cine-saltar');
  let quiere = false, cuenta = 0, audio = null, acabado = false, raf = 0, vigilante = 0, parado = 0;

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
  btnSaltar.addEventListener('click', (e) => { e.stopPropagation(); fin(); });

  const sincroniza = () => { if (audio && !audio.paused && Math.abs(audio.currentTime - video.currentTime) > 0.35) audio.currentTime = Math.min(video.currentTime, DUR); };

  // título y luz final según el instante del vídeo
  function tick() {
    const t = video.currentTime; if (!(++cuenta % 30)) sincroniza();
    if (t > 5.0) cine.classList.add('t-in');
    if (t > DUR - 1.6) cine.classList.add('t-out');
    if (t > DUR - 0.9) cine.classList.add('luz');
    if (t >= DUR - 0.02) { fin(); return; }
    raf = requestAnimationFrame(tick);
  }

  video.muted = true; video.playsInline = true;
  video.addEventListener('playing', () => { clearTimeout(vigilante); clearTimeout(parado); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); sincroniza(); if (quiere && audio && audio.paused && !acabado) audio.play().catch(() => {}); });
  video.addEventListener('waiting', () => { if (quiere && audio) audio.pause(); clearTimeout(parado); parado = setTimeout(fin, 6000); });   // se atasca: se abre la web
  video.addEventListener('ended', fin);
  video.addEventListener('error', fin);
  video.src = matchMedia('(max-width: 760px)').matches ? 'video/intro-movil.mp4' : 'video/intro.mp4';
  const hint = $('#cine-hint');
  // el vídeo arranca ya (en silencio); si no arranca en 7 s se deja pasar a la web
  vigilante = setTimeout(fin, 7000);
  { const p = video.play(); if (p && p.catch) p.catch(fin); }

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
