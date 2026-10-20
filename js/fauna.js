// Fauna 3D hecha en Blender (tools/modelos/): quebrantahuesos y rebeco. Es una ilustración, no seguimiento real.
// Los quebrantahuesos planean en círculos sobre la cumbre abierta y de vez en cuando dan unos aleteos lentos;
// los rebecos (un rebaño, dos grupitos y machos sueltos) se quedan quietos, se ponen alerta y pasean por las laderas pedregosas de esa cumbre.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const ENVERGADURA = 2.84;   // m del modelo (de punta a punta)
const KM_REBECO = 42 * 1.275 * 0.75 * 0.75;   // un 25 % más pequeños que antes (18-10-2026) y otro 25 % (20-10-2026); los montañeros (ruta.js) van al doble
const pisa = (dist = 0) => 2.5 + Math.min(11.5, dist * 0.0015);   // margen sobre el relieve: pequeño de cerca (que las patas toquen el suelo) y algo mayor de lejos (el relieve lejano es más tosco)
const rnd = (() => { let a = 12345; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();

export function crearFauna({ scene, geo, centro, camera, sol, lagos = null }) {
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
  // pelaje según la época (fecha del dispositivo): invierno de noviembre a abril.
  // Un rebaño grande (19: hembras con crías y dos machos jóvenes), dos grupitos de cuatro y cinco machos viejos sueltos por ahí.
  const GRUPOS = [
    { tipos: ['macho', 'macho', ...Array(10).fill('hembra'), ...Array(7).fill('cria')], rad: 190 },
    { tipos: ['macho', 'hembra', 'hembra', 'cria'], rad: 90 },
    { tipos: ['hembra', 'hembra', 'hembra', 'cria'], rad: 90 },
    ...Array(5).fill({ tipos: ['macho'], rad: 0 }),
  ];
  const mes = new Date().getMonth(), pel = mes >= 10 || mes <= 3 ? 'invierno' : 'verano';
  const cargaGLB = (u) => new Promise((res) => new GLTFLoader().load(u, res, undefined, () => res(null)));
  Promise.all(['macho', 'hembra', 'cria'].map((t) => cargaGLB(`models/rebeco-${t}-${pel}.glb?v=2`))).then(([gm, gh, gc]) => {
    const por = { macho: gm, hembra: gh, cria: gc };
    if (!gm && !gh) return;   // sin modelos: no pasa nada
    const lista = GRUPOS.flatMap((gr, gi) => gr.tipos.map((tipo) => ({ tipo, gi })));
    for (const { tipo, gi } of lista) {
      const gltf = por[tipo] ?? gh ?? gm;
      const obj = clone(gltf.scene);
      obj.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.material = o.material.clone(); o.material.flatShading = true; } });
      const g = new THREE.Group(); g.add(obj); g.visible = false; scene.add(g);
      const mixer = new THREE.AnimationMixer(obj);
      const acc = Object.fromEntries(gltf.animations.map((a) => [a.name, mixer.clipAction(a)]));
      const cria = tipo === 'cria';
      const r = { g, obj, sombra: creaSombra(), mixer, acc, estado: 'Quieto', clip: 'Quieto', agua: null, yendo: false, resta: 2 + Math.random() * 8, rumbo: Math.random() * 6.28, cria, gi, ok: false, yaw: 0, nrm: new THREE.Vector3(0, 1, 0) };
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
  // busca laderas con pendiente moderada algo por debajo de la cumbre y reparte cada grupo en la suya (separadas entre sí)
  function colocaRebecos() {
    if (!anclaje || !rebecos.length) return;
    const bases = [];
    GRUPOS.forEach((gr, gi) => {
      let base = null;
      for (let i = 0; i < 160 && !base; i++) {
        const a = rnd() * 6.28, d = 250 + rnd() * 1650, x = anclaje.x + Math.cos(a) * d, z = anclaje.z + Math.sin(a) * d;
        const h = geo.heightAt(x, z), { s } = pendiente(x, z);
        if (s > 0.28 && s < 0.85 && h < anclaje.y - 200 && h > anclaje.y - 1000 && bases.every((b) => !b || Math.hypot(b.x - x, b.z - z) > 450)) base = { x, z };
      }
      bases[gi] = base;
    });
    for (const r of rebecos) {
      const base = bases[r.gi], rad = GRUPOS[r.gi].rad;
      if (!base) { r.ok = false; r.g.visible = false; r.sombra.visible = false; continue; }
      const a = rnd() * 6.28, d = 20 + rnd() * rad;
      r.x = base.x + Math.cos(a) * d; r.z = base.z + Math.sin(a) * d; r.ok = true; r.base = base;
      r.g.position.set(r.x, geo.heightAt(r.x, r.z) + pisa(4000), r.z);
      r.rumbo = rnd() * 6.28; r.yaw = r.rumbo; r.estado = 'Quieto'; r.clip = 'Quieto'; r.resta = 2 + rnd() * 8; r.agua = null; r.yendo = false;
      for (const n of Object.keys(r.acc)) r.acc[n].setEffectiveWeight(n === 'Quieto' ? 1 : 0);
    }
    colocaBebederos();
  }
  // Uno de los grupos de cuatro (y el rebaño grande, si hay otro ibón a mano) se instala junto a un ibón cercano a la cumbre
  // y de vez en cuando baja a la orilla a beber: cada animal tiene su sitio en la orilla, separados entre sí.
  const LARGO = 1.4;   // m de cuerpo del modelo adulto (para dejar la cabeza justo sobre el agua)
  function colocaBebederos() {
    if (!lagos?.orillaCerca) return;
    const usados = [];
    for (const gi of [1, 0]) {
      const lago = lagos.orillaCerca(anclaje.x, anclaje.z, 3500, 8000);
      const o = lago && (gi === 1 ? lago : lagos.orillaCerca(anclaje.x + (rnd() - 0.5) * 3000, anclaje.z + (rnd() - 0.5) * 3000, 3500, 8000));
      if (!o || usados.some((u) => u.pts === o.pts)) continue;
      usados.push(o);
      // sitios en la orilla a ~45 m unos de otros, alternando a un lado y a otro del vértice más cercano
      const n = o.pts.length, sitios = [];
      const sitio = (k) => {
        const p = o.pts[((k % n) + n) % n], ox = p.x - o.cx, oz = p.z - o.cz, l = Math.hypot(ox, oz) || 1;
        return { x: p.x, z: p.z, ux: ox / l, uz: oz / l };   // punto de la orilla y dirección hacia fuera del agua
      };
      let a = o.i, b = o.i, ultA = sitio(o.i), ultB = ultA; sitios.push(ultA);
      for (let paso = 0; paso < n && sitios.length < 20; paso++) {
        const sa = sitio(--a); if (Math.hypot(sa.x - ultA.x, sa.z - ultA.z) > 45) { sitios.push(sa); ultA = sa; }
        const sb = sitio(++b); if (Math.hypot(sb.x - ultB.x, sb.z - ultB.z) > 45) { sitios.push(sb); ultB = sb; }
      }
      const s0 = sitios[0], base = { x: s0.x + s0.ux * 160, z: s0.z + s0.uz * 160 };
      let k = 0;
      for (const r of rebecos) {
        if (r.gi !== gi) continue;
        const ang = rnd() * 6.28, d = 20 + rnd() * GRUPOS[gi].rad * 0.6;
        r.base = base; r.x = base.x + Math.cos(ang) * d; r.z = base.z + Math.sin(ang) * d; r.ok = true;
        r.agua = sitios[k++ % sitios.length]; r.resta = 3 + rnd() * 20;
        r.g.position.set(r.x, geo.heightAt(r.x, r.z) + pisa(4000), r.z);
      }
    }
  }
  // estado del animal; «Beber» usa la animación de pastar (cabeza abajo) mirando al agua
  function cambia(r, nuevo, resta) {
    if (nuevo !== 'Beber' && !r.acc[nuevo]) nuevo = 'Quieto';
    const clip = nuevo === 'Beber' ? (r.acc.Pastar ? 'Pastar' : 'Quieto') : nuevo;
    if (clip === 'Brinco') { r.acc.Brinco.setLoop(THREE.LoopOnce, 1); r.acc.Brinco.clampWhenFinished = true; }
    if (r.clip !== clip) { const f = clip === 'Brinco' || r.clip === 'Brinco' ? 0.15 : 0.45; r.acc[clip].reset().setEffectiveWeight(1).fadeIn(f).play(); r.acc[r.clip].fadeOut(f); }
    r.estado = nuevo; r.clip = clip; r.resta = resta;
    if (nuevo !== 'Andar') r.yendo = false;
  }
  // sitio donde se para a beber: la cabeza (media longitud por delante) queda sobre la orilla
  const puntoBeber = (r, esc) => { const a = r.agua, k = LARGO * 0.55 * esc; return { x: a.x + a.ux * k, z: a.z + a.uz * k }; };
  // paso bloqueado (pared, arista o demasiado lejos): prueba ocho direcciones y elige la más suave que baje; si está lejos de su sitio, prefiere volver hacia él
  function rumboLibre(r, volver) {
    const v = 0.9 * KM_REBECO * 1.5, lim = anclaje ? anclaje.y - 120 : 1e9;
    let mejor = r.rumbo + Math.PI, mp = 1e9;
    for (let k = 1; k <= 8; k++) {
      const a = r.rumbo + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 4, nx = r.x + Math.cos(a) * v, nz = r.z + Math.sin(a) * v;
      const { s } = pendiente(nx, nz), h = geo.heightAt(nx, nz);
      if (s > 1.5 || h > lim) continue;
      const pen = s + (volver ? Math.hypot(nx - r.base.x, nz - r.base.z) / 600 : 0) + h / 20000;
      if (pen < mp) { mp = pen; mejor = a; }
    }
    return mejor;
  }
  const _q = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
  let amenazas = () => [];   // posiciones (x, z) de los montañeros del recorrido abierto: los rebecos se alejan de ellos igual que de la cámara
  function actualizaRebecos(dt, ams = []) {
    for (const r of rebecos) {
      if (!r.ok) continue;
      const dist = camera.position.distanceTo(r.g.position);
      r.g.visible = dist < 14000; r.sombra.visible = r.g.visible; if (!r.g.visible) continue;
      const esc = KM_REBECO * Math.min(3, Math.max(0.8, dist / 4500)) * (r.cria ? 0.62 : 1);
      r.g.scale.setScalar(esc);
      r.resta -= dt;
      r.chk ??= { x: r.x, z: r.z, t: 0 };
      if ((r.chk.t += dt) > 10) {   // si anda pero lleva 10 s sin avanzar (atascado en una pared), se para a pastar y luego elige otro rumbo
        if (r.estado === 'Andar' && !r.yendo && Math.hypot(r.x - r.chk.x, r.z - r.chk.z) < 40) { r.rumbo = rumboLibre(r, true); cambia(r, 'Pastar', 6 + Math.random() * 6); }
        r.chk.x = r.x; r.chk.z = r.z; r.chk.t = 0;
      }
      let am = null, dm = 1e9;   // montañero más cercano a menos de 520 unidades
      for (const q of ams) { const dd = Math.hypot(q.x - r.x, q.z - r.z); if (dd < 520 && dd < dm) { dm = dd; am = q; } }
      const cerca = dist < 450 || !!am;
      if (cerca && (r.estado === 'Quieto' || r.estado === 'Pastar' || r.estado === 'Mirar' || r.estado === 'Beber' || r.yendo)) cambia(r, 'Alerta', 2 + Math.random() * 2);
      if (r.resta <= 0) {
        const z = Math.random();
        if (r.agua && !cerca && (r.estado === 'Quieto' || r.estado === 'Pastar') && z < 0.4) { cambia(r, 'Andar', 90); r.yendo = true; }   // baja a beber
        else if (r.estado === 'Beber') { r.rumbo += Math.PI * (0.7 + Math.random() * 0.6); cambia(r, Math.random() < 0.5 ? 'Mirar' : 'Andar', 3 + Math.random() * 5); }
        else if (r.estado === 'Quieto') cambia(r, z < 0.25 ? 'Alerta' : z < 0.55 ? 'Pastar' : z < 0.68 ? 'Mirar' : 'Andar', 4 + Math.random() * 6);
        else if (r.estado === 'Pastar') cambia(r, z < 0.5 ? 'Quieto' : z < 0.7 ? 'Mirar' : 'Andar', 4 + Math.random() * 6);
        else if (r.estado === 'Mirar') cambia(r, 'Quieto', 3 + Math.random() * 6);
        else if (r.estado === 'Alerta') {
          // si la cámara está cerca, da un brinco y se aleja de ella (no todos: el grupo reacciona a destiempo)
          if (cerca) { const o = am ?? camera.position; r.rumbo = Math.atan2(r.g.position.z - o.z, r.g.position.x - o.x); cambia(r, Math.random() < 0.6 ? 'Brinco' : 'Andar', 1.0); }
          else cambia(r, z < 0.3 ? 'Mirar' : 'Andar', 3 + Math.random() * 5);
        } else if (r.estado === 'Brinco') cambia(r, 'Andar', 4 + Math.random() * 4);
        else { if (Math.random() < 0.3) r.rumbo += (Math.random() - 0.5) * 1.5; cambia(r, z < 0.5 ? 'Quieto' : 'Pastar', 6 + Math.random() * 10); }
      }
      if (r.yendo) {   // camino de la orilla: rumbo a su sitio; al llegar, se para mirando al agua y bebe
        const t = puntoBeber(r, esc), dx = t.x - r.x, dz = t.z - r.z;
        r.rumbo = Math.atan2(dz, dx);
        if (Math.hypot(dx, dz) < Math.max(4, 1.2 * esc * dt)) { r.x = t.x; r.z = t.z; cambia(r, 'Beber', 12 + Math.random() * 18); r.rumbo = Math.atan2(-r.agua.uz, -r.agua.ux); }
      }
      if (r.estado === 'Beber') r.rumbo = Math.atan2(-r.agua.uz, -r.agua.ux);
      if (am && !r.yendo && (r.estado === 'Andar' || r.estado === 'Brinco')) r.rumbo = Math.atan2(r.z - am.z, r.x - am.x);   // huye de los montañeros mientras se acercan
      if (r.estado === 'Andar' || r.estado === 'Brinco') {
        const v = (r.estado === 'Brinco' ? 2.6 : 0.9) * esc * dt;
        const nx = r.x + Math.cos(r.rumbo) * v, nz = r.z + Math.sin(r.rumbo) * v;
        const { s } = pendiente(nx, nz), lejos = Math.hypot(nx - r.base.x, nz - r.base.z) > 600, alto = anclaje && geo.heightAt(nx, nz) > anclaje.y - 120;   // ni demasiado lejos de su sitio ni hasta la arista de la cumbre
        if (r.yendo && s <= 1.4) { r.x = nx; r.z = nz; }   // hacia el agua no se desvía (la orilla está a un paso de su sitio)
        else if (s > 1.5 || lejos || alto) { if (r.yendo) { r.yendo = false; r.resta = Math.min(r.resta, 4); } r.rumbo = rumboLibre(r, lejos); }
        else { r.x = nx; r.z = nz; }
      }
      // gira suavemente hacia su rumbo y se apoya en la ladera
      const objetivo = Math.atan2(Math.cos(r.rumbo), Math.sin(r.rumbo));   // el modelo mira a +Z: yaw = atan2(dx, dz)
      let d = objetivo - r.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      r.yaw += d * Math.min(1, dt * (r.estado === 'Andar' || r.estado === 'Brinco' ? 2.5 : 0.8));
      const y = geo.heightAt(r.x, r.z) + pisa(dist) + (r.estado === 'Brinco' ? 10 : 0);   // el brinco sí se despega del suelo
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
    setAmenazas(fn) { amenazas = fn; },
    update(t, dt) {
      actualizaRebecos(dt, amenazas());
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
