// Datos que cambian sin cambiar la app: dentro de la APK (?app=1), las rutas, las «Otras subidas» y las fuentes se piden primero a la web
// (tresmiles.pages.dev y, si no responde, la copia de GitHub Pages) y se guardan en el móvil (Cache Storage); sin conexión se usa lo último guardado
// y, si no hay nada, lo que trae la APK. Así una ruta o subida nueva llega a la app sin instalar otra versión. En la web, lo de siempre.
const EN_APP = /[?&]app=1\b/.test(location.search);
const BASES = ['https://tresmiles.pages.dev/', 'https://skyllion666-coder.github.io/tresmiles/'];
const REMOTO = /^data\/(subidas\/|rutas\/[^/]+\.json$|fuentes\.json$)/;
const CACHE = 'tresmiles-datos';
const conV = (u) => u + (u.includes('?') ? '&' : '?') + 'dv=' + (window.DATOS_V || 0);
let buena = null;   // la base que respondió la última vez (durante el fútbol, la de Cloudflare no contesta: no esperarla en cada archivo)

async function remoto(u) {
  const orden = buena ? [buena, ...BASES.filter((b) => b !== buena)] : BASES;
  for (const b of orden) {
    try {
      const r = await fetch(`${b}${u}?r=${Date.now() >> 16}`, { cache: 'no-cache', signal: AbortSignal.timeout?.(buena === b ? 6000 : 3500) });
      if (r.status === 404) { buena = b; return null; }   // no existe (aún) en la web: vale lo de la APK
      if (!r.ok) continue;
      const txt = await r.text(), j = JSON.parse(txt); buena = b;
      caches.open(CACHE).then((c) => c.put(new URL(u, location.href), new Response(txt, { headers: { 'content-type': 'application/json' } }))).catch(() => {});
      return j;
    } catch {}
  }
  try { const r = await (await caches.open(CACHE)).match(new URL(u, location.href)); if (r) return await r.json(); } catch {}
  return null;
}

export async function datoJson(u) {
  if (EN_APP && REMOTO.test(u) && typeof caches !== 'undefined') { const j = await remoto(u); if (j) return j; }
  const r = await fetch(conV(u), { cache: 'no-cache' });
  if (!r.ok) throw new Error(u + ' ' + r.status);
  return r.json();
}
