// Banderines de cumbre: el usuario marca los tresmiles que ha subido y en la cima aparece un banderín triangular clásico con los colores
// de la bandera de Aragón (cuatro barras rojas sobre amarillo) ondeando al viento. Se guarda solo en este dispositivo (localStorage),
// con copia exportable/importable en un archivo .json.
import * as THREE from 'three';

const CLAVE = 'tresmiles-hechos';
export function leerHechos() { try { const v = JSON.parse(localStorage.getItem(CLAVE) || '[]'); return new Set(Array.isArray(v) ? v : []); } catch { return new Set(); } }
export function guardarHechos(s) { try { localStorage.setItem(CLAVE, JSON.stringify([...s])); } catch { /* sin almacenamiento */ } }

function texturaAragon() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  // tela (de mástil a punta, la u va de 0 a 1): 9 franjas horizontales, 5 amarillas y 4 rojas
  for (let i = 0; i < 9; i++) { x.fillStyle = i % 2 ? '#d7261b' : '#f6c315'; x.fillRect(0, (i * 128) / 9, 256, 128 / 9 + 1); }
  // ribete del mástil, algo más oscuro
  x.fillStyle = 'rgba(80, 40, 10, .35)'; x.fillRect(0, 0, 6, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function crearBanderines({ scene, geo }) {
  const tex = texturaAragon();
  const ALTO = 2.6, TELA_L = 1.5, TELA_H = 0.95;   // metros de un banderín real (se escalan para verse)
  // tela triangular subdividida para poder ondear: u a lo largo (0 = mástil), v de arriba abajo
  const NU = 12, NV = 4, gTela = new THREE.BufferGeometry(), pos = [], uv = [], idx = [];
  for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) {
    const u = i / NU, v = j / NV, h = TELA_H * (1 - u);   // se estrecha hasta la punta
    pos.push(u * TELA_L, ALTO - 0.05 - (TELA_H - h) / 2 - v * h, 0); uv.push(u, 1 - (0.5 - (0.5 - v) * (1 - u)));
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const a = i * (NV + 1) + j, b = a + NV + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  gTela.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gTela.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); gTela.setIndex(idx); gTela.computeVertexNormals();
  const uT = { value: 0 };
  const mTela = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
  mTela.onBeforeCompile = (sh) => {   // ondeo en el propio shader (sin cálculo por fotograma en JS)
    sh.uniforms.uT = uT;
    sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float u = clamp(position.x / ${TELA_L.toFixed(2)}, 0.0, 1.0);
      transformed.z += u * (0.16 * sin(uT * 5.0 - u * 6.0) + 0.05 * sin(uT * 11.0 - u * 13.0 + position.y * 3.0));
      transformed.y -= u * u * 0.06 * (1.0 + sin(uT * 3.0));`);
  };
  mTela.customProgramCacheKey = () => 'banderin-tela';
  const gMastil = new THREE.CylinderGeometry(0.022, 0.03, ALTO, 8).translate(0, ALTO / 2, 0);
  const mMastil = new THREE.MeshLambertMaterial({ color: 0x8b8f94 });
  const gPomo = new THREE.SphereGeometry(0.05, 10, 8).translate(0, ALTO + 0.03, 0), mPomo = new THREE.MeshLambertMaterial({ color: 0xd8b44a });
  const gPiedras = new THREE.IcosahedronGeometry(0.22, 0).scale(1.4, 0.6, 1.2), mPiedras = new THREE.MeshLambertMaterial({ color: 0x77736c, flatShading: true });
  const lista = new Map();   // id -> { g, p }

  function pone(p, cerca) {
    if (lista.has(p.id)) return;
    const g = new THREE.Group(); g.add(new THREE.Mesh(gMastil, mMastil), new THREE.Mesh(gTela, mTela), new THREE.Mesh(gPomo, mPomo), new THREE.Mesh(gPiedras, mPiedras));
    // un poco apartado del punto exacto de la cima para no tapar la cruz, el pilar o el marcador
    const x = p.w.x + 9, z = p.w.z - 7; g.position.set(x, geo.heightAt(x, z), z); g.rotation.y = 0.6;
    g.userData.nace = cerca ? performance.now() : 0;
    scene.add(g); lista.set(p.id, { g, p, x, z });
  }
  function quita(id) { const b = lista.get(id); if (!b) return; scene.remove(b.g); lista.delete(id); }
  return {
    pone, quita,
    update(cam, t) {
      uT.value = t;
      for (const b of lista.values()) {
        b.g.position.y = geo.heightAt(b.x, b.z) - 0.2;   // por si llega el relieve fino de la cima
        const d = cam.position.distanceTo(b.g.position);
        // tamaño: real ×11,5 de cerca (igual que montañeros y cruces); de lejos crece para seguir viéndose como un punto de color
        let s = Math.max(11.5, d * 0.012);
        if (b.g.userData.nace) { const k = Math.min(1, (performance.now() - b.g.userData.nace) / 900); s *= 0.2 + 0.8 * (1 - Math.pow(1 - k, 3)); if (k >= 1) b.g.userData.nace = 0; }
        b.g.scale.setScalar(s);
      }
    },
  };
}
