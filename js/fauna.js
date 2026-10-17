// Fauna 3D: quebrantahuesos de `models/quebrantahuesos.glb` (hecho en Blender, tools/modelos/quebrantahuesos.py).
// Planean en círculos sobre la cumbre abierta y de vez en cuando dan unos aleteos lentos. Es una ilustración, no seguimiento real.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const ENVERGADURA = 2.84;   // m del modelo (de punta a punta)

export function crearFauna({ scene, geo, centro, camera }) {
  const defs = [
    { env: 130, rx: 2100, rz: 1500, vel: 0.050, fase: 0.0, alt: 520, rot: 0.4, flap: 14 },
    { env: 118, rx: 3000, rz: 2100, vel: -0.038, fase: 2.4, alt: 760, rot: -0.8, flap: 31 },
  ];
  const c = { x: centro.x, z: centro.z }, destino = { x: centro.x, z: centro.z };
  const aves = [];
  let listo = false;

  new GLTFLoader().load('models/quebrantahuesos.glb?v=2', (gltf) => {
    for (const d of defs) {
      const obj = clone(gltf.scene);
      obj.scale.setScalar(d.env / ENVERGADURA);
      obj.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.material = o.material.clone(); o.material.flatShading = true; } });
      const g = new THREE.Group(); g.add(obj); g.visible = false; scene.add(g);
      const mixer = new THREE.AnimationMixer(obj);
      const acc = Object.fromEntries(gltf.animations.map((a) => [a.name, mixer.clipAction(a)]));
      acc.Planeo.play(); acc.Planeo.time = Math.random() * acc.Planeo.getClip().duration;
      acc.Aleteo.setEffectiveWeight(0).play();
      aves.push({ g, d, mixer, acc, aleteando: false, proximo: d.flap });
    }
    listo = true;
  }, undefined, () => { /* sin modelo: las aves sencillas de vida.js siguen volando */ });

  const pos = (d, t) => {
    const ang = d.fase + t * d.vel;
    const lx = Math.cos(ang) * d.rx, lz = Math.sin(ang) * d.rz, cs = Math.cos(d.rot), sn = Math.sin(d.rot);
    const x = c.x + lx * cs - lz * sn, z = c.z + lx * sn + lz * cs;
    return { x, z, y: geo.heightAt(x, z) + d.alt * (0.55 + 0.45 * Math.sin(t * 0.11 + d.fase * 1.7)) + 220 };
  };
  const mira = new THREE.Vector3();

  return {
    get listo() { return listo; },
    aves,
    setCentro(x, z) { destino.x = x; destino.z = z; },
    update(t, dt) {
      if (!listo) return;
      const k = 1 - Math.exp(-dt * 0.35);
      c.x += (destino.x - c.x) * k; c.z += (destino.z - c.z) * k;
      for (const a of aves) {
        const p = pos(a.d, t), q = pos(a.d, t + 0.4);
        a.g.position.set(p.x, p.y, p.z);
        const lejos = camera.position.distanceToSquared(a.g.position) > 45000 * 45000;
        a.g.visible = !lejos; if (lejos) continue;
        mira.set(q.x - p.x, q.y - p.y, q.z - p.z);
        a.g.rotation.set(0, Math.atan2(mira.x, mira.z), 0, 'YXZ');
        a.g.rotateX(-Math.asin(mira.y / mira.length()) * 0.6);
        a.g.rotateZ(-Math.sign(a.d.vel) * 0.30);
        // cada cierto tiempo, unos aleteos lentos; el resto del vuelo es planeo
        if (t > a.proximo) {
          a.aleteando = !a.aleteando;
          const [de, a2] = a.aleteando ? ['Planeo', 'Aleteo'] : ['Aleteo', 'Planeo'];
          a.acc[de].crossFadeTo(a.acc[a2], 0.9, false); a.acc[a2].setEffectiveWeight(1).play();
          a.proximo = t + (a.aleteando ? 6.6 : 25 + Math.random() * 25);
        }
        a.mixer.update(dt);
      }
    },
  };
}
