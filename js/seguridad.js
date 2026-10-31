// «Seguridad» (solo en la app, ?app=1): un panel con dos ayudas que funcionan sin cobertura.
// 1. Enviar mi posición: coordenadas (grados decimales y UTM ETRS89), precisión, altitud del GPS y el sitio con nombre más cercano, listas para mandar
//    por WhatsApp o SMS, copiar o dictar al 112 (el SMS suele salir con muy poca señal).
// 2. ¿Llego antes de que anochezca?: hora de la puesta de sol y del fin del crepúsculo en tu posición, y el tiempo de bajada (método MIDE) hasta el inicio
//    de la ruta abierta (siguiendo la ruta, si estás sobre ella) o, si no, hasta el pueblo más cercano en línea recta (orientativo).
import { t, EN_INGLES } from './i18n.js?v=17';
import { EXAG } from './geo.js';

const RAD = Math.PI / 180;
const fmtN = (n, d = 0) => new Intl.NumberFormat(EN_INGLES ? 'en-GB' : 'es-ES', { maximumFractionDigits: d, minimumFractionDigits: d }).format(n);
const hhmm = (d) => d.toLocaleTimeString(EN_INGLES ? 'en-GB' : 'es-ES', { hour: '2-digit', minute: '2-digit' });
const dur = (h) => { const m = Math.max(0, Math.round(h * 60 / 5) * 5); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };
const RUMBOS = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'];

// UTM (WGS84 ≈ ETRS89): huso 30 al oeste del meridiano de Greenwich, 31 al este (el mapa cruza los dos)
function utm(lat, lon) {
  const huso = lon < 0 ? 30 : 31, a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const l0 = ((huso - 1) * 6 - 180 + 3) * RAD, la = lat * RAD, lo = lon * RAD;
  const N = a / Math.sqrt(1 - e2 * Math.sin(la) ** 2), T = Math.tan(la) ** 2, C = ep2 * Math.cos(la) ** 2, A = Math.cos(la) * (lo - l0);
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * la - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * la) + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * la) - (35 * e2 ** 3 / 3072) * Math.sin(6 * la));
  const x = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  const y = k0 * (M + N * Math.tan(la) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
  return `${huso}T ${Math.round(x)} ${Math.round(y)}`;
}

export function crearSeguridad({ geo, boton, solAhora, tramoMIDE, lugares, rutaAbierta }) {
  const panel = document.createElement('div'); panel.id = 'seg-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', t('Seguridad'));
  document.body.appendChild(panel);
  const cierra = () => { panel.hidden = true; boton.setAttribute('aria-expanded', 'false'); };
  const dist = (a, b) => Math.hypot((a.lon - b.lon) * geo.mLon, (a.lat - b.lat) * geo.mLat);

  // sitio con nombre más cercano (refugios, cumbres, pueblos) y hacia dónde estás de él
  function cerca(p) {
    let m = null;
    for (const l of lugares()) { const d = dist(p, l); if (d < 4000 && (!m || d < m.d)) m = { l, d }; }
    if (!m) return null;
    const az = (Math.atan2((p.lon - m.l.lon) * geo.mLon, (p.lat - m.l.lat) * geo.mLat) / RAD + 360) % 360;
    return { ...m, rumbo: RUMBOS[Math.round(az / 45) % 8] };
  }
  // puesta de sol (−0,833°) y fin del crepúsculo civil (−6°) a partir de ahora, en la posición
  function luz(p) {
    const ahora = new Date(); let ps = null, cr = null;
    if (solAhora(ahora, p.lat, p.lon).el < -6) return { noche: true };
    for (let m = 0; m <= 18 * 60; m += 2) {
      const d = new Date(ahora.getTime() + m * 6e4), el = solAhora(d, p.lat, p.lon).el;
      if (!ps && el < -0.833) ps = d;
      if (el < -6) { cr = d; break; }
    }
    return { ps, cr };
  }
  // tiempo de bajada: por la ruta abierta si estás a menos de 300 m de ella; si no, al pueblo más cercano en línea recta (×1,4 por las vueltas del camino)
  function bajada(p) {
    const q = geo.toXZ(p.lon, p.lat), alt = geo.heightAt(q.x, q.z) / EXAG;
    const r = rutaAbierta();
    if (r?.puntos?.length) {
      let im = 0, dm = 1e18; r.puntos.forEach((pt, i) => { const d = dist(p, { lon: pt[0], lat: pt[1] }); if (d < dm) { dm = d; im = i; } });
      if (dm < 300) {
        const tramo = r.puntos.slice(0, im + 1).reverse().map((pt) => [pt[0], pt[1], pt[2], r.puntos[im][3] - pt[3]]);
        return { h: tramo.length > 1 ? tramoMIDE(tramo) + dm / 4000 : dm / 4000, a: t('el inicio de la ruta'), porRuta: true };
      }
    }
    const pu = lugares().filter((l) => l.pueblo).map((l) => ({ l, d: dist(p, l) })).sort((a, b) => a.d - b.d)[0];
    if (!pu) return null;
    const qp = geo.toXZ(pu.l.lon, pu.l.lat), ap = geo.heightAt(qp.x, qp.z) / EXAG, dh = pu.d * 1.4 / 4000, dv = Math.max(0, alt - ap) / 600 + Math.max(0, ap - alt) / 400;
    return { h: Math.max(dh, dv) + Math.min(dh, dv) / 2, a: pu.l.nombre, recta: true };
  }

  async function abre() {
    boton.setAttribute('aria-expanded', 'true'); panel.hidden = false;
    panel.innerHTML = `<div class="seg-caja"><button type="button" class="seg-cerrar" aria-label="${t('Cerrar')}">×</button><h2>${t('Seguridad')}</h2><p class="seg-espera">${t('Buscando tu posición…')}</p></div>`;
    panel.querySelector('.seg-cerrar').onclick = cierra;
    let pos;
    try { pos = await new Promise((ok, ko) => navigator.geolocation.getCurrentPosition(ok, ko, { enableHighAccuracy: true, maximumAge: 30000, timeout: 25000 })); }
    catch (e) { panel.querySelector('.seg-espera').textContent = t(e?.code === 1 ? 'Sin permiso de ubicación: actívalo en los ajustes de la app.' : 'No se ha podido saber dónde estás. Sal a cielo abierto y vuelve a probar.'); return; }
    const p = { lat: pos.coords.latitude, lon: pos.coords.longitude }, prec = Math.round(pos.coords.accuracy || 0), alt = pos.coords.altitude;
    const c = cerca(p), dec = `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`, U = utm(p.lat, p.lon), ahora = new Date();
    const cercaTxt = c ? t('a {d} al {r} de {n}', { d: c.d < 1000 ? `${Math.round(c.d / 10) * 10} m` : `${fmtN(c.d / 1000, 1)} km`, r: t(c.rumbo), n: c.l.nombre }) : '';
    const msg = [t('Mi posición en la montaña ({h}):', { h: hhmm(ahora) }), `${dec} (±${prec} m)`, `UTM ETRS89: ${U}`, alt != null ? t('Altitud GPS: {a} m', { a: fmtN(alt) }) : '', cercaTxt ? t('Cerca de: {c}', { c: cercaTxt }) : '', `https://www.google.com/maps?q=${p.lat.toFixed(5)},${p.lon.toFixed(5)}`].filter(Boolean).join('\n');
    // luz y bajada
    const L = luz(p), B = bajada(p);
    let veredicto = '', clase = '';
    if (L.noche) { veredicto = t('Ya es de noche: usa el frontal, abrígate y, si no conoces el camino, pide ayuda.'); clase = 'mal'; }
    else if (L.ps && B) {
      const queda = (L.cr - ahora) / 36e5, margen = queda - B.h;
      if (margen < 0) { veredicto = t('No llegas con luz: baja ya, saca el frontal y avisa a alguien de por dónde vas.'); clase = 'mal'; }
      else if (margen < 0.75) { veredicto = t('Vas justo: empieza a bajar ya y ten el frontal a mano.'); clase = 'justo'; }
      else { veredicto = t('Tienes luz de sobra para bajar, si no hay contratiempos.'); clase = 'bien'; }
    }
    const enc = encodeURIComponent(msg);
    panel.innerHTML = `<div class="seg-caja"><button type="button" class="seg-cerrar" aria-label="${t('Cerrar')}">×</button><h2>${t('Seguridad')}</h2>
      <h3>${t('Enviar mi posición')}</h3>
      <pre class="seg-msg">${msg.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>
      <div class="seg-botones">
        <a class="seg-btn" href="https://wa.me/?text=${enc}">WhatsApp</a>
        <a class="seg-btn" href="sms:?body=${enc}">SMS</a>
        <button type="button" class="seg-btn" data-copiar>${t('Copiar')}</button>
        <a class="seg-btn seg-112" href="tel:112">${t('Llamar al 112')}</a>
      </div>
      <h3>${t('¿Llego antes de que anochezca?')}</h3>
      ${L.noche ? '' : L.ps ? `<p>${t('Puesta de sol a las {h} (dentro de {d}); luz útil hasta las {c}.', { h: hhmm(L.ps), d: dur((L.ps - ahora) / 36e5), c: hhmm(L.cr) })}</p>` : `<p>${t('Hoy el sol ya no se pone antes de 18 horas.')}</p>`}
      ${B ? `<p>${t(B.porRuta ? 'Bajada por la ruta hasta su inicio: unas {d}.' : 'Bajada hasta {a}: unas {d} (orientativo, en línea recta: abre una cumbre con ruta para calcularlo por el camino).', { a: B.a, d: dur(B.h) })}</p>` : ''}
      ${veredicto ? `<p class="seg-veredicto ${clase}">${veredicto}</p>` : ''}
      <p class="seg-nota">${t('Tiempos del método MIDE sin paradas; con nieve, cansancio o mal tiempo, más. La luz del crepúsculo depende de las nubes y de si estás en una ladera en sombra.')}</p></div>`;
    panel.querySelector('.seg-cerrar').onclick = cierra;
    panel.querySelector('[data-copiar]').onclick = async (e) => {
      try { await navigator.clipboard.writeText(msg); } catch { const ta = document.createElement('textarea'); ta.value = msg; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
      e.currentTarget.textContent = t('Copiado');
    };
  }
  boton.hidden = false;
  boton.addEventListener('click', () => (panel.hidden ? abre() : cierra()));
  return { abre, cierra };
}
