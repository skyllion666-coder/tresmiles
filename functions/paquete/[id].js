// Cloudflare Pages Function: /paquete/<id>?v=<versión> → el .zip del paquete de zona (Release de GitHub «paquete-<id>-<v>»), con CORS y caché.
// La web no puede bajarlo directamente de GitHub (sus descargas no dan CORS); así lo baja la web igual que la app, para verlo en alta calidad.
export async function onRequestGet({ params, request }) {
  const id = String(params.id || '');
  const v = new URL(request.url).searchParams.get('v') || '1';
  if (!/^[a-z0-9-]{2,80}$/.test(id) || !/^\d{1,3}$/.test(v)) return new Response('paquete no válido', { status: 400 });
  const r = await fetch(`https://github.com/skyllion666-coder/tresmiles/releases/download/paquete-${id}-${v}/${id}.zip`, { cf: { cacheEverything: true, cacheTtl: 2592000 } });
  if (!r.ok) return new Response('no existe', { status: 404, headers: { 'access-control-allow-origin': '*' } });
  const h = new Headers({ 'content-type': 'application/zip', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-length', 'cache-control': 'public, max-age=2592000, immutable' });
  const len = r.headers.get('content-length'); if (len) h.set('content-length', len);
  return new Response(r.body, { status: 200, headers: h });
}
