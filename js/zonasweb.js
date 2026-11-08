// Paquetes de zona en la web (sin la app): se bajan de /paquete/<id> (functions/paquete/[id].js, el .zip de la Release de GitHub con CORS),
// se abren aquí (zip sin comprimir: las piezas ya van en webp y gzip) y cada archivo se guarda en la Cache Storage del navegador.
// Así se bajan una vez y se cargan solos al acercarse a la zona, como en la app (js/paquete.js lee con la «fuente» de cada paquete).
const CACHE = 'tresmiles-zonas', LISTA = 'tresmiles-zonas-web';
const clave = (id, n) => new URL(`zonas-web/${id}/${n}`, location.href).href;
const TIPO = { json: 'application/json', webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png', gz: 'application/gzip' };

export const zonasWebPosible = () => typeof caches !== 'undefined' && typeof DecompressionStream !== 'undefined';
export function listaWeb() { try { return JSON.parse(localStorage.getItem(LISTA) || '{}'); } catch { return {}; } }   // id -> versión
function guardaLista(l) { try { localStorage.setItem(LISTA, JSON.stringify(l)); } catch {} }

// lee una entrada del archivo .zip (formato «stored»: el contenido va tal cual)
function abreZip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf), td = new TextDecoder();
  let e = buf.byteLength - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('zip roto');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = [];
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip roto');
    const metodo = dv.getUint16(p + 10, true), tam = dv.getUint32(p + 20, true), ln = dv.getUint16(p + 28, true), le = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const nombre = td.decode(u8.subarray(p + 46, p + 46 + ln)); p += 46 + ln + le + lc;
    if (metodo !== 0) throw new Error('zip comprimido');
    const ini = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    out.push({ nombre, datos: u8.subarray(ini, ini + tam) });
  }
  return out;
}

// baja el paquete z (del catálogo) con avance(pct); al acabar queda en la lista
export async function bajaWeb(z, avance, senal) {
  try { await navigator.storage?.persist?.(); } catch {}
  // la función /paquete/ solo existe en tresmiles.pages.dev (Cloudflare Pages); desde la copia de GitHub Pages se pide allí
  const base = /\.pages\.dev$|^localhost$|^127\./.test(location.hostname) ? '' : 'https://tresmiles.pages.dev/';
  let r;
  try { r = await fetch(`${base}paquete/${z.id}?v=${z.version}`, { signal: senal }); }
  catch (e) { if (senal?.aborted) throw e; throw new Error('tresmiles.pages.dev no responde (en España, durante el fútbol las operadoras bloquean Cloudflare). Prueba más tarde'); }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const total = +r.headers.get('content-length') || z.mb * 1e6, partes = []; let llevo = 0, ult = -1;
  const lector = r.body.getReader();
  for (;;) {
    const { done, value } = await lector.read(); if (done) break;
    partes.push(value); llevo += value.length;
    const pct = Math.min(99, Math.floor((llevo / total) * 100)); if (pct !== ult) { ult = pct; avance(pct); }
  }
  const buf = new Uint8Array(llevo); let o = 0; for (const c of partes) { buf.set(c, o); o += c.length; } partes.length = 0;
  const c = await caches.open(CACHE), arch = abreZip(buf.buffer);
  arch.sort((a, b) => (a.nombre === 'index.json') - (b.nombre === 'index.json'));   // el índice, el último: si se corta a medias, el paquete no cuenta
  for (const { nombre, datos } of arch) {
    if (nombre.endsWith('/')) continue;
    await c.put(clave(z.id, nombre), new Response(datos.slice(), { headers: { 'content-type': TIPO[nombre.split('.').pop()] ?? 'application/octet-stream' } }));
  }
  const l = listaWeb(); l[z.id] = z.version; guardaLista(l); avance(100);
}

export async function borraWeb(id) {
  const l = listaWeb(); delete l[id]; guardaLista(l);
  const c = await caches.open(CACHE);
  for (const req of await c.keys()) if (req.url.includes(`/zonas-web/${id}/`)) await c.delete(req);
}

// «fuente» para js/paquete.js: abre(nombre) → Response
export function fuenteWeb(id) {
  let c = null;
  return async (n) => { c ??= await caches.open(CACHE); return (await c.match(clave(id, n))) ?? new Response(null, { status: 404 }); };
}
