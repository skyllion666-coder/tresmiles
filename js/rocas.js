import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { EXAG } from './geo.js';

// Rocas de las cimas: la web coloca sola, sobre el relieve fino de cada cumbre (1 m, data/terrain/cumbres/detalles.json), rocas de una biblioteca hecha en Blender
// con texturas escaneadas (models/rocas-<tipo>[-m].glb, tools/modelos/rocas_biblioteca.py; Poly Haven, CC0): granito, caliza, oscura o neutra según la cumbre.
// Cada roca se apoya en el punto más bajo del relieve bajo su huella y se hunde un poco (nunca queda en el aire); donde la ladera es demasiado empinada no se pone.
// En las cimas sin modelo propio se levanta además un mojón de piedras en el punto más alto. Todo con InstancedMesh (una llamada de dibujo por forma).
const TONO = { granito: [0.95, 0.98, 1.04], caliza: [0.92, 0.93, 0.95], oscura: [0.96, 0.98, 1.02], neutra: [0.95, 0.97, 1.02] };   // tono frío contra la luz cálida (la caliza escaneada es algo rosada)
const SAT = { caliza: 0.45 };   // cuánto se le quita de saturación a la textura

export function crearRocas({ movil, archivosM = movil }) {
  const libs = {};
  const biblioteca = (tipo) => (libs[tipo] ??= new Promise((res) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(`models/rocas-${tipo}${archivosM ? '-m' : ''}.glb?v=${window.WEB_V || 0}`, (g) => {
    const formas = []; g.scene.traverse((o) => { if (o.isMesh && /^roca\d/.test(o.name)) formas.push(o); });
    formas.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
    res(formas.map((o) => {
      const m = o.material; if (!m.userData.luz) {
        m.userData.luz = true; m.color.setRGB(...(TONO[tipo] ?? TONO.neutra)); m.emissive.setRGB(0.14, 0.14, 0.15); m.emissiveMap = m.map;
        if (SAT[tipo]) m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(.3, .59, .11))), ${SAT[tipo].toFixed(2)});`); };
        m.needsUpdate = true;
      }
      return { geo: o.geometry, mat: m, tipo: Number(o.name.slice(4)) };   // 0-3 bloques, 4-6 lajas, 7-9 cantos
    }));
  }, undefined, () => res(null))));

  // generador determinista por cumbre (las rocas salen siempre igual)
  const azar = (id) => { let h = 2166136261; for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  /** Pone las rocas de una cumbre. det = { H, sl, n, paso, x0, z0 } (alturas del mundo, pendiente física); evita = { x, z, r } (un modelo de Blender: ahí no se pone nada). */
  async function poner(id, det, tipo, { mojon = true, evita = null } = {}) {
    const formas = await biblioteca(tipo); if (!formas?.length) { (window.__rocas ??= {})[id] = 'sin biblioteca ' + tipo; return null; }
    const { H, sl, n, paso, x0, z0 } = det, A = azar(id), alto = (x, z) => {
      const fx = Math.min(n - 1.001, Math.max(0, (x - x0) / paso)), fz = Math.min(n - 1.001, Math.max(0, (z - z0) / paso)), i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
      return (H[j * n + i] * (1 - tx) + H[j * n + i + 1] * tx) * (1 - tz) + (H[(j + 1) * n + i] * (1 - tx) + H[(j + 1) * n + i + 1] * tx) * tz;
    };
    let km = 0; for (let k = 1; k < n * n; k++) if (H[k] > H[km]) km = k;
    const cx = x0 + (km % n) * paso, cz = z0 + Math.floor(km / n) * paso, hmax = H[km];
    const porForma = formas.map(() => []), puestos = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qy = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    const lejos = (x, z) => !evita || Math.hypot(x - evita.x, z - evita.z) > evita.r;
    // una roca de tamaño s (m) en (x, z): base en lo más bajo de su huella, algo hundida; devuelve la altura de su parte de arriba o null si no cabe
    function roca(x, z, s, f, yBase = null, inclina = 0.5, forzar = false) {
      const r = 0.45 * s, hs = [alto(x, z), alto(x + r, z), alto(x - r, z), alto(x, z + r), alto(x, z - r)], hmin = Math.min(...hs);
      if (yBase === null && !forzar && hs[0] - hmin > 0.6 * s) return null;   // demasiado empinado: quedaría colgando
      const y = yBase ?? hmin - 0.18 * s;
      nrm.set(hs[2] - hs[1], 2 * r, hs[4] - hs[3]).normalize(); q.setFromUnitVectors(up, nrm); q.slerp(new THREE.Quaternion(), 1 - inclina);
      qy.setFromAxisAngle(up, A() * Math.PI * 2); q.multiply(qy);
      const k = 0.85 + A() * 0.3; sv.set(s * k, s * (0.8 + A() * 0.35), s * (1.9 - k)); pv.set(x, y, z);
      porForma[f].push(m4.compose(pv, q, sv).clone()); return y + s * 0.6;
    }
    const bloques = formas.map((f, i) => i).filter((i) => formas[i].tipo <= 3 || formas[i].tipo >= 7);
    // mojón en el punto más alto: tres hileras de piedras de menos a más pequeñas
    if (mojon && lejos(cx, cz)) {
      let y0 = null;
      const anillo = (nn, rad, s, y) => { const a0 = A() * 6.28; let top = y; for (let i = 0; i < nn; i++) { const a = a0 + (i / nn) * 6.28, x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad; const t = roca(x, z, s * (0.9 + A() * 0.2), bloques[Math.floor(A() * bloques.length)], y, y === null ? 0.5 : 0.15, true); if (t !== null) top = Math.max(top ?? t, t); } return top; };
      const M = 2.2;   // mojón a escala ×2,2 (como las rocas): ~9 m de alto en el mapa
      y0 = Math.min(alto(cx + 2 * M, cz), alto(cx - 2 * M, cz), alto(cx, cz + 2 * M), alto(cx, cz - 2 * M), hmax) - 0.5 * M;
      anillo(7, 2.3 * M, 2.3 * M, null);   // la hilera de abajo se apoya en el relieve; las de encima, sobre ella
      anillo(5, 1.3 * M, 1.9 * M, y0 + 1.2 * M); anillo(3, 0.6 * M, 1.5 * M, y0 + 2.2 * M); roca(cx, cz, 1.2 * M, bloques[0], y0 + 3.0 * M, 0);
      puestos.push([cx, cz, 4.5 * M]);
    }
    // rocas sueltas por la zona de la cumbre: hasta 9 m por debajo del punto más alto, a menos de 55 m y sin pendientes extremas
    const cand = [];
    for (let j = 0; j < n; j += 2) for (let i = 0; i < n; i += 2) {
      const k = j * n + i, x = x0 + i * paso, z = z0 + j * paso;
      if (Math.hypot(x - cx, z - cz) < 55 && H[k] > hmax - 9 * EXAG && sl[k] < 0.95 && lejos(x, z)) cand.push([x + (A() - 0.5) * 2, z + (A() - 0.5) * 2]);
    }
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(A() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
    const N = movil ? 35 : 60;
    for (const [x, z] of cand) {
      if (puestos.length >= N) break;
      const s = 2.8 + 7 * A() ** 2;   // 3–10 m en el mapa: el doble de lo real, para que se lean desde la distancia normal de la cámara (los montañeros van a ×16)
      if (puestos.some(([px, pz, ps]) => Math.hypot(x - px, z - pz) < (s + ps) * 0.75)) continue;
      if (roca(x, z, s, Math.floor(A() * formas.length)) !== null) puestos.push([x, z, s]);
    }
    (window.__rocas ??= {})[id] = { puestos: puestos.length, cand: cand.length, formas: formas.length };   // para comprobarlo desde la consola
    const g = new THREE.Group(); g.name = 'rocas-' + id;
    porForma.forEach((ms, f) => {
      if (!ms.length) return;
      const im = new THREE.InstancedMesh(formas[f].geo, formas[f].mat, ms.length); ms.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); g.add(im);
    });
    return g;
  }
  const quitar = (g) => { if (!g) return; g.removeFromParent(); g.traverse((o) => { if (o.isInstancedMesh) o.dispose(); }); };
  return { poner, quitar };
}
