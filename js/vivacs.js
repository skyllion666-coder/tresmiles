// Vivacs de piedra (los «Vivac» de OpenStreetMap: parapetos sin techo, como los de Góriz): de cerca, el modelo 3D de Blender (models/vivac.glb)
// en su sitio GPS, a tamaño real (~4 m) y girado al azar para que no salgan todos iguales. Solo se cargan con la cámara a menos de 1,5 km.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const CERCA = 1500, ESCALA = 0.45;   // el modelo mide ~9,3 m de lado; los de verdad, unos 4 m
export function crearVivacs({ scene, geo, puntos }) {
  if (!puntos.length) return { update() {}, reajusta() {} };
  let modelo = null, pidiendo = false, ult = -1e9;
  const grupo = new THREE.Group(); scene.add(grupo);
  const pon = () => {
    grupo.clear();
    puntos.forEach((p, i) => {
      const m = modelo.clone(); m.scale.setScalar(ESCALA); m.rotation.y = (i * 2.399) % (2 * Math.PI);
      m.position.set(p.x, geo.heightAt(p.x, p.z), p.z); grupo.add(m);
    });
  };
  return {
    update(objetivo, camara) {
      const now = performance.now(); if (now - ult < 600) return; ult = now;
      const cerca = puntos.some((p) => Math.hypot(p.x - objetivo.x, p.z - objetivo.z) < CERCA) && camara.position.distanceTo(objetivo) < CERCA;
      grupo.visible = cerca;
      if (cerca && !modelo && !pidiendo) {
        pidiendo = true;
        new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load('models/vivac.glb?v=2', (g) => {
          modelo = g.scene; modelo.traverse((o) => { if (o.isMesh) { o.material.roughness = 1; o.material.metalness = 0; } }); pon();
        }, undefined, () => {});
      }
    },
    reajusta() { if (modelo) pon(); },   // el relieve cambió (paquete): se vuelven a posar en el suelo
  };
}
