// «Dónde estoy» (solo en la app, ?app=1): el GPS del móvil pone un punto en el mapa con su círculo de precisión y, si se pide,
// la vista sigue la posición. Fuera del mapa, solo avisa de a cuánto se está. Un cono azul marca hacia dónde mira el móvil (brújula).
// Botón: 1.º toque, «Norte arriba» (te sigue con el norte arriba); 2.º, «El mapa gira contigo» (lo que tienes delante en el móvil es lo que tienes delante);
// 3.º, apagar. Mover el mapa con el dedo deja de seguir sin cambiar de modo; el siguiente toque vuelve a seguir.
import * as THREE from 'three';
import { leeOrientacion } from './panorama.js?v=9';
import { t, EN_INGLES } from './i18n.js?v=17';

const RAD = Math.PI / 180;
const km = (lat1, lon1, lat2, lon2) => {   // distancia en línea recta sobre la Tierra (km)
  const a = Math.sin(((lat2 - lat1) * RAD) / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(((lon2 - lon1) * RAD) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
};
const delPico = (n) => (EN_INGLES ? n : /^(La|Las|Los) /.test(n) ? `de ${n}` : /^El /.test(n) ? `del ${n.slice(3)}` : `del ${n}`);   // «del Aneto», «de La Munia» (en inglés, «from» va en la frase)
const fmtKm = (d) => (d < 10 ? d.toFixed(1).replace('.', EN_INGLES ? '.' : ',') : String(Math.round(d)));

export function crearUbicacion({ scene, geo, controls, camState, applyState, flyTo, boton, botonPanorama = null, abrePanorama = null, picos = [], picoAbierto = () => null }) {
  const st = { modo: 0, sigo: false, watch: null, pos: null, rumbo: null, abs: false, raf: 0, primera: true };   // modo: 0 apagado, 1 norte arriba, 2 el mapa gira con el móvil; sigo: la vista va con la posición

  // — marcador: punto (siempre del mismo tamaño en pantalla), círculo de precisión y cuña hacia donde se mira —
  const grupo = new THREE.Group(); grupo.visible = false; grupo.renderOrder = 20; scene.add(grupo);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  { const x = c.getContext('2d'); x.fillStyle = '#fff'; x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill(); x.fillStyle = '#2f80ed'; x.beginPath(); x.arc(32, 32, 21, 0, 7); x.fill(); }
  const punto = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, sizeAttenuation: false }));
  punto.scale.set(0.06, 0.06, 1); punto.renderOrder = 22; grupo.add(punto);
  const circulo = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0x2f80ed, transparent: true, opacity: 0.22, depthTest: false, depthWrite: false }));
  circulo.rotation.x = -Math.PI / 2; circulo.renderOrder = 20; grupo.add(circulo);
  const forma = new THREE.Shape(); forma.moveTo(0, 0); forma.lineTo(-0.38, 1); forma.lineTo(0.38, 1); forma.closePath();   // +y de la forma, tumbada con rotation.x = −90°, queda hacia −z (norte) antes de girar
  const cuna = new THREE.Mesh(new THREE.ShapeGeometry(forma), new THREE.MeshBasicMaterial({ color: 0x2f80ed, transparent: true, opacity: 0.45, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  cuna.rotation.x = -Math.PI / 2; const giro = new THREE.Group(); giro.add(cuna); giro.visible = false; giro.renderOrder = 21; grupo.add(giro);

  // — aviso breve abajo —
  const aviso = document.createElement('div'); aviso.id = 'ubic-aviso'; aviso.setAttribute('role', 'status'); aviso.hidden = true; document.body.appendChild(aviso);
  let tAviso = 0;
  const avisa = (txt, ms = 4500) => { aviso.textContent = txt; aviso.hidden = false; clearTimeout(tAviso); tAviso = setTimeout(() => { aviso.hidden = true; }, ms); };

  const pinta = () => {
    boton.setAttribute('aria-pressed', st.modo === 2 ? 'true' : 'false'); boton.dataset.modo = st.modo;
    boton.setAttribute('aria-label', t(!st.sigo && st.modo ? 'Volver a seguir mi posición' : ['Dónde estoy', 'Girar el mapa con el móvil', 'Apagar la ubicación'][st.modo]));
  };

  function colocaMarcador() {
    const p = st.pos; if (!p) return;
    const y = geo.heightAt(p.x, p.z);
    grupo.position.set(p.x, y + 25, p.z);
    const r = Math.max(15, p.prec); circulo.scale.set(r, r, 1);
    const largo = Math.max(700, r * 3); giro.scale.set(largo, 1, largo); giro.visible = st.rumbo != null; giro.rotation.y = -(st.rumbo ?? 0) * RAD;   // la cuña se tiene que ver con la cámara a 2–3 km
    grupo.visible = true;
    if (botonPanorama && abrePanorama) botonPanorama.hidden = false;   // «Qué montañas veo»: solo con la posición dentro del mapa
  }

  function enMapa(x, z) { return geo.dentro(x, z); }

  function alPosicion(e) {
    const { longitude: lon, latitude: lat, accuracy, altitude } = e.coords, q = geo.toXZ(lon, lat);
    if (!enMapa(q.x, q.z)) {
      grupo.visible = false; st.pos = null; if (botonPanorama) botonPanorama.hidden = true;
      const fx = Math.max(0, Math.abs(q.x) - geo.W / 2), fz = Math.max(0, geo.zmin - q.z, q.z - geo.zmax);
      if (st.primera) {   // con una cumbre abierta, la distancia a ella; si no, al borde del mapa y al tresmil más cercano
        const p = picoAbierto(), cerca = p ? null : picos.reduce((m, q) => { const d = km(lat, lon, q.lat, q.lon); return !m || d < m.d ? { q, d } : m; }, null);
        avisa(p ? t('Estás fuera del mapa, a {d} km en línea recta {p}.', { d: fmtKm(km(lat, lon, p.lat, p.lon)), p: delPico(p.nombre) })
          : t('Estás fuera del mapa, a {d} km de su borde.', { d: Math.round(Math.hypot(fx, fz) / 1000) }) + (cerca ? t(' El tresmil más cercano es {n}, a {d} km en línea recta.', { n: cerca.q.nombre, d: fmtKm(cerca.d) }) : ''), 7000);
      }
      st.primera = false; return;
    }
    st.pos = { x: q.x, z: q.z, prec: accuracy || 30, alt: altitude };
    colocaMarcador();
    if (st.primera) {
      st.primera = false;
      const destino = new THREE.Vector3(q.x, geo.heightAt(q.x, q.z), q.z);
      flyTo({ t: destino, theta: 0, phi: 0.95, r: 2600 });   // norte arriba
      const p = picoAbierto();
      avisa(t('Estás aquí (precisión ±{m} m{alt}){p}.', { m: Math.round(accuracy), alt: altitude != null ? t(' · altitud GPS {a} m', { a: Math.round(altitude) }) : '', p: p ? t(' · a {d} km {p}', { d: fmtKm(km(lat, lon, p.lat, p.lon)), p: delPico(p.nombre) }) : '' }));
    }
    if (st.sigo) sigue();
  }

  function alError(err) {
    const txt = err.code === 1 ? 'Sin permiso de ubicación: actívalo en los ajustes de la app.' : err.code === 3 ? 'El GPS tarda en responder: sal a cielo abierto y vuelve a probar.' : 'No se ha podido saber dónde estás.';
    avisa(txt, 6000); if (err.code === 1) apaga();
  }

  // — brújula: la vista gira con el móvil (rumbo suavizado) —
  function alOrientar(e) {
    if (e.type === 'deviceorientationabsolute') st.abs = true; else if (st.abs) return;   // en Android la relativa no vale
    const h = leeOrientacion(e); if (h == null) return;
    if (st.rumbo == null) st.rumbo = h; else { const d = ((h - st.rumbo + 540) % 360) - 180; st.rumbo = (st.rumbo + d * 0.15 + 360) % 360; }
    if (!st.raf) st.raf = requestAnimationFrame(() => { st.raf = 0; colocaMarcador(); if (st.sigo && st.modo === 2) sigue(); });
  }
  function sigue() {
    if (!st.pos) return;
    const a = camState(), destino = new THREE.Vector3(st.pos.x, geo.heightAt(st.pos.x, st.pos.z), st.pos.z);
    const theta = st.modo === 1 ? 0 : st.rumbo == null ? a.theta : -st.rumbo * RAD;   // norte arriba, o la cámara detrás del punto mirando hacia el rumbo
    applyState({ t: a.t.clone().lerp(destino, 0.25), theta: a.theta + Math.atan2(Math.sin(theta - a.theta), Math.cos(theta - a.theta)) * 0.25, phi: a.phi, r: a.r });
  }
  async function brujula(on) {
    if (on) {
      try { if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function' && (await DeviceOrientationEvent.requestPermission()) !== 'granted') throw new Error('permiso'); }
      catch { avisa('Sin permiso para la brújula.'); return; }
      st.rumbo = null; st.abs = false;
      addEventListener('deviceorientationabsolute', alOrientar, true); addEventListener('deviceorientation', alOrientar, true);
    } else {
      removeEventListener('deviceorientationabsolute', alOrientar, true); removeEventListener('deviceorientation', alOrientar, true); st.rumbo = null; giro.visible = false;
    }
  }

  function apaga() {
    if (st.watch != null) navigator.geolocation.clearWatch(st.watch);
    st.watch = null; st.modo = 0; st.sigo = false; st.pos = null; grupo.visible = false; brujula(false); pinta();
    if (botonPanorama) botonPanorama.hidden = true;
  }

  boton.addEventListener('click', () => {
    if (st.modo === 0) {
      if (!navigator.geolocation) { avisa('Este móvil no da la ubicación.'); return; }
      st.modo = 1; st.sigo = true; st.primera = true; pinta(); avisa('Buscando tu posición…', 15000); brujula(true);   // el cono de hacia dónde miras, desde el principio
      st.watch = navigator.geolocation.watchPosition(alPosicion, alError, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
    } else if (!st.sigo) {   // se había movido el mapa con el dedo: vuelve a seguir en el mismo modo
      st.sigo = true; pinta(); avisa(t(st.modo === 1 ? 'Te sigo otra vez, con el norte arriba.' : 'Te sigo otra vez: el mapa gira con el móvil.')); sigue();
    } else if (st.modo === 1) {
      if (!st.pos) { avisa('Aún no sé dónde estás: espera a que el GPS te encuentre.'); return; }
      st.modo = 2; pinta(); avisa(t('El mapa gira contigo: lo que tienes delante en el móvil es lo que tienes delante en el monte.')); sigue();
    } else apaga();
  });
  botonPanorama?.addEventListener('click', () => { if (st.pos) abrePanorama(st.pos.x, st.pos.z); });
  controls.addEventListener('start', () => { if (st.sigo && st.pos) { st.sigo = false; pinta(); avisa('Has movido el mapa: ya no te sigo (toca el botón para volver).'); } });
  pinta();
  window.tresmilesUbic = st;   // para revisar el estado desde la consola o una prueba
  return { apaga };
}
