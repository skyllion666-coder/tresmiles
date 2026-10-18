// Fauna 3D hecha en Blender (tools/modelos/): quebrantahuesos y rebeco. Es una ilustración, no seguimiento real.
// Los quebrantahuesos planean en círculos sobre la cumbre abierta y de vez en cuando dan unos aleteos lentos;
// los rebecos (un grupito) se quedan quietos, se ponen alerta y pasean por las laderas pedregosas de esa cumbre.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const ENVERGADURA = 2.84;   // m del modelo (de punta a punta)
const KM_REBECO = 42 * 1.275;   // misma exageración que los montañeros (ruta.js), para que se vean a la vez
const rnd = (() => { let a = 12345; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();

export function crearFauna({ scene, geo, centro, camera, sol }) {
  // rapaces carroñeras (tools/modelos/aves.py): envergadura real × 46 para que se vean desde lejos, igual que antes.
  // Quebrantahuesos en pareja; un bando de buitres leonados girando en la misma térmica, más alto; un buitre negro solitario y,
  // de marzo a septiembre (cuando está en el Pirineo), un alimoche.
  const X = 46, mesA = new Date().getMonth(), alimocheAqui = mesA >= 2 && mesA <= 8;
  const defs = [
    { esp: 'quebrantahuesos', env: 2.8 * X, rx: 2100, rz: 1500, vel: 0.050, fase: 0.0, alt: 520, rot: 0.4, flap: 14 },
    { esp: 'quebrantahuesos', env: 2.65 * X, rx: 3000, rz: 2100, vel: -0.038, fase: 2.4, alt: 760, rot: -0.8, flap: 31 },
    ...[0, 1, 2, 3].map((k) => ({ esp: 'leonado', env: (2.5 + 0.06 * k) * X, rx: 1500 + 260 * k, rz: 1300 + 200 * k, vel: 0.034 + 0.003 * k, fase: 1.1 * k, alt: 1150 + 140 * k, rot: 2.0, flap: 22 + 9 * k, cx: 2600, cz: -1800 })),
    { esp: 'negro', env: 2.85 * X, rx: 3800, rz: 2600, vel: -0.026, fase: 4.0, alt: 1300, rot: 1.2, flap: 40 },
    ...(alimocheAqui ? [{ esp: 'alimoche', env: 1.6 * X, rx: 1700, rz: 1200, vel: 0.06, fase: 5.2, alt: 420, rot: -0.3, flap: 18, cx: -1500, cz: 900 }] : []),
  ];
  const c = { x: centro.x, z: centro.z }, destino = { x: centro.x, z: centro.z };
  const aves = [];
  let listo = false;

  const glb = (u) => new Promise((res) => new GLTFLoader().load(u, res, undefined, () => res(null)));
  const modelos = {};
  Promise.all([...new Set(defs.map((d) => d.esp))].map((e) => glb(`models/${e}-v2.glb?v=1`).then((g) => { modelos[e] = g; }))).then(() => {
    for (const d of defs) {
      const gltf = modelos[d.esp]; if (!gltf) continue;   // sin modelo: las aves sencillas de vida.js siguen volando
      const obj = clone(gltf.scene);
      obj.scale.setScalar(d.env / ENVERGADURA);
      obj.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.material = o.material.clone(); o.material.flatShading = true; } });
      const g = new THREE.Group(); g.add(obj); g.visible = false; scene.add(g);
      const mixer = new THREE.AnimationMixer(obj);
      const acc = Object.fromEntries(gltf.animations.map((a) => [a.name, mixer.clipAction(a)]));
      acc.Planeo.play(); acc.Planeo.time = Math.random() * acc.Planeo.getClip().duration;
      acc.Aleteo.setEffectiveWeight(0).play();
      aves.push({ g, d, esp: d.esp, mixer, acc, aleteando: false, proximo: d.flap });
    }
    listo = aves.length > 0;
  });


  // — rebecos —
  const rebecos = [];
  let anclaje = null;       // { x, z, y } de la cumbre abierta
  const R_CANTIDAD = 4;
  // pelaje según la época (fecha del dispositivo): invierno de noviembre a abril; grupo de un macho, dos hembras y una cría
  const mes = new Date().getMonth(), pel = mes >= 10 || mes <= 3 ? 'invierno' : 'verano';
  const TIPOS = ['macho', 'hembra', 'hembra', 'cria'];
  const cargaGLB = (u) => new Promise((res) => new GLTFLoader().load(u, res, undefined, () => res(null)));
  Promise.all(['macho', 'hembra', 'cria'].map((t) => cargaGLB(`models/rebeco-${t}-${pel}.glb?v=2`))).then(([gm, gh, gc]) => {
    const por = { macho: gm, hembra: gh, cria: gc };
    if (!gm && !gh) return;   // sin modelos: no pasa nada
    for (let i = 0; i < R_CANTIDAD; i++) {
      const gltf = por[TIPOS[i]] ?? gh ?? gm;
      const obj = clone(gltf.scene);
      obj.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.material = o.material.clone(); o.material.flatShading = true; } });
      const g = new THREE.Group(); g.add(obj); g.visible = false; scene.add(g);
      const mixer = new THREE.AnimationMixer(obj);
      const acc = Object.fromEntries(gltf.animations.map((a) => [a.name, mixer.clipAction(a)]));
      const cria = TIPOS[i] === 'cria';
      const r = { g, obj, sombra: creaSombra(), mixer, acc, estado: 'Quieto', resta: 2 + Math.random() * 8, rumbo: Math.random() * 6.28, cria, ok: false, yaw: 0, nrm: new THREE.Vector3(0, 1, 0) };
      acc.Quieto.play(); acc.Quieto.time = Math.random() * 6;
      rebecos.push(r);
    }
    if (anclaje) colocaRebecos();
  });

  // sombra de contacto: una mancha elíptica difuminada (textura de canvas compartida) que se apoya en la ladera
  const texSombra = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(48,38,30,1)'); g.addColorStop(0.35, 'rgba(48,38,30,.62)'); g.addColorStop(0.7, 'rgba(48,38,30,.18)'); g.addColorStop(1, 'rgba(48,38,30,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const matSombra = new THREE.MeshBasicMaterial({ map: texSombra, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true });
  const geoSombra = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  function creaSombra() {
    const m = new THREE.Mesh(geoSombra, matSombra); m.renderOrder = 2; m.frustumCulled = false; m.visible = false; scene.add(m); return m;
  }

  const pendiente = (x, z) => {
    const e = 40, hx = geo.heightAt(x + e, z) - geo.heightAt(x - e, z), hz = geo.heightAt(x, z + e) - geo.heightAt(x, z - e);
    return { s: Math.hypot(hx, hz) / (2 * e), n: new THREE.Vector3(-hx / (2 * e), 1, -hz / (2 * e)).normalize() };
  };
  // busca laderas con pendiente moderada algo por debajo de la cumbre y reparte el grupo
  function colocaRebecos() {
    if (!anclaje || !rebecos.length) return;
    let base = null;
    for (let i = 0; i < 90 && !base; i++) {
      const a = rnd() * 6.28, d = 250 + rnd() * 1250, x = anclaje.x + Math.cos(a) * d, z = anclaje.z + Math.sin(a) * d;
      const h = geo.heightAt(x, z), { s } = pendiente(x, z);
      if (s > 0.28 && s < 0.85 && h < anclaje.y - 80 && h > anclaje.y - 900) base = { x, z };
    }
    for (const r of rebecos) {
      if (!base) { r.ok = false; r.g.visible = false; r.sombra.visible = false; continue; }
      const a = rnd() * 6.28, d = 30 + rnd() * 140;
      r.x = base.x + Math.cos(a) * d; r.z = base.z + Math.sin(a) * d; r.ok = true; r.base = base;
      r.g.position.set(r.x, geo.heightAt(r.x, r.z) + 14, r.z);
      r.rumbo = rnd() * 6.28; r.yaw = r.rumbo; r.estado = 'Quieto'; r.resta = 2 + rnd() * 8;
      for (const n of Object.keys(r.acc)) r.acc[n].setEffectiveWeight(n === 'Quieto' ? 1 : 0);
    }
  }
  function cambia(r, nuevo, resta) {
    if (!r.acc[nuevo]) nuevo = 'Quieto';
    if (nuevo === 'Brinco') { r.acc.Brinco.setLoop(THREE.LoopOnce, 1); r.acc.Brinco.clampWhenFinished = true; }
    if (r.estado !== nuevo) { const f = nuevo === 'Brinco' || r.estado === 'Brinco' ? 0.15 : 0.45; r.acc[nuevo].reset().setEffectiveWeight(1).fadeIn(f).play(); r.acc[r.estado].fadeOut(f); }
    r.estado = nuevo; r.resta = resta;
  }
  const _q = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
  function actualizaRebecos(dt) {
    for (const r of rebecos) {
      if (!r.ok) continue;
      const dist = camera.position.distanceTo(r.g.position);
      r.g.visible = dist < 14000; r.sombra.visible = r.g.visible; if (!r.g.visible) continue;
      const esc = KM_REBECO * Math.min(3, Math.max(0.8, dist / 4500)) * (r.cria ? 0.62 : 1);
      r.g.scale.setScalar(esc);
      r.resta -= dt;
      const cerca = dist < 450;
      if (cerca && (r.estado === 'Quieto' || r.estado === 'Pastar' || r.estado === 'Mirar')) cambia(r, 'Alerta', 2 + Math.random() * 2);
      if (r.resta <= 0) {
        const z = Math.random();
        if (r.estado === 'Quieto') cambia(r, z < 0.25 ? 'Alerta' : z < 0.55 ? 'Pastar' : z < 0.68 ? 'Mirar' : 'Andar', 4 + Math.random() * 6);
        else if (r.estado === 'Pastar') cambia(r, z < 0.5 ? 'Quieto' : z < 0.7 ? 'Mirar' : 'Andar', 4 + Math.random() * 6);
        else if (r.estado === 'Mirar') cambia(r, 'Quieto', 3 + Math.random() * 6);
        else if (r.estado === 'Alerta') {
          // si la cámara está cerca, da un brinco y se aleja de ella (no todos: el grupo reacciona a destiempo)
          if (cerca) { r.rumbo = Math.atan2(r.g.position.z - camera.position.z, r.g.position.x - camera.position.x); cambia(r, Math.random() < 0.6 ? 'Brinco' : 'Andar', 1.0); }
          else cambia(r, z < 0.3 ? 'Mirar' : 'Andar', 3 + Math.random() * 5);
        } else if (r.estado === 'Brinco') cambia(r, 'Andar', 4 + Math.random() * 4);
        else { if (Math.random() < 0.3) r.rumbo += (Math.random() - 0.5) * 1.5; cambia(r, z < 0.5 ? 'Quieto' : 'Pastar', 6 + Math.random() * 10); }
      }
      if (r.estado === 'Andar' || r.estado === 'Brinco') {
        const v = (r.estado === 'Brinco' ? 2.6 : 0.9) * esc * dt;
        const nx = r.x + Math.cos(r.rumbo) * v, nz = r.z + Math.sin(r.rumbo) * v;
        const { s } = pendiente(nx, nz), lejos = Math.hypot(nx - r.base.x, nz - r.base.z) > 600;
        if (s > 1.1 || lejos) { r.rumbo = lejos ? Math.atan2(r.base.z - r.z, r.base.x - r.x) : r.rumbo + 2.2; }
        else { r.x = nx; r.z = nz; }
      }
      // gira suavemente hacia su rumbo y se apoya en la ladera
      const objetivo = Math.atan2(Math.cos(r.rumbo), Math.sin(r.rumbo));   // el modelo mira a +Z: yaw = atan2(dx, dz)
      let d = objetivo - r.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      r.yaw += d * Math.min(1, dt * (r.estado === 'Andar' || r.estado === 'Brinco' ? 2.5 : 0.8));
      const y = geo.heightAt(r.x, r.z) + 14;
      r.g.position.set(r.x, y, r.z);
      const { n } = pendiente(r.x, r.z);
      _qy.setFromAxisAngle(_up, r.yaw);
      r.nrm.lerp(n, Math.min(1, dt * 3));
      _q.setFromUnitVectors(_up, r.nrm.clone().lerp(_up, 0.6).normalize());
      r.g.quaternion.copy(_q).multiply(_qy);
      r.mixer.update(dt);
      // sombra: bajo el animal, alineada con su cuerpo, apoyada en la pendiente y desplazada un poco al contrario del sol
      const sm = r.sombra, k = esc * (r.cria ? 1 : 1);
      const sx = sol ? -sol.x : 0, sz = sol ? -sol.z : 0, sl = Math.hypot(sx, sz) || 1;
      const ox = r.x + (sx / sl) * 0.12 * esc, oz = r.z + (sz / sl) * 0.12 * esc;
      sm.position.set(ox, geo.heightAt(ox, oz) + 2.5, oz);
      sm.quaternion.setFromUnitVectors(_up, r.nrm).multiply(_qy);
      sm.scale.set(0.62 * k, 1, 1.65 * k);
    }
  }

  const pos = (d, t) => {
    const ang = d.fase + t * d.vel;
    const lx = Math.cos(ang) * d.rx, lz = Math.sin(ang) * d.rz, cs = Math.cos(d.rot), sn = Math.sin(d.rot);
    const x = c.x + (d.cx ?? 0) + lx * cs - lz * sn, z = c.z + (d.cz ?? 0) + lx * sn + lz * cs;
    return { x, z, y: geo.heightAt(x, z) + d.alt * (0.55 + 0.45 * Math.sin(t * 0.11 + d.fase * 1.7)) + 220 };
  };
  const mira = new THREE.Vector3();

  return {
    get listo() { return listo; },
    aves,
    rebecos,
    // x, z: cumbre; y (opcional): su altura, para repartir los rebecos por sus laderas
    setCentro(x, z, y) { destino.x = x; destino.z = z; if (y != null) { anclaje = { x, z, y }; colocaRebecos(); } },
    update(t, dt) {
      actualizaRebecos(dt);
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
