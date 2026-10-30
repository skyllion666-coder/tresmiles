// El tiempo real en la cumbre abierta: js/main.js le pasa la previsión de Open-Meteo (la misma de la ficha) y aquí se pinta alrededor de la cima
// (radio R): lluvia o nieve (si en la cima hace 1 °C o menos, la lluvia cae como nieve), tormenta con relámpagos, unas pocas nubes más (con tope y
// nunca entre la cámara y la cumbre), niebla en la cima y viento (inclina la lluvia y la nieve y arrastra las nubes). El resto del mapa no cambia.
// La lluvia y la nieve son una sola malla cada una y se mueven en el shader (sin cálculo por gota en JS).
import * as THREE from 'three';

const R = 2600;   // m alrededor de la cima
const ALTO = 3200;   // m de columna de lluvia/nieve (de 2.000 m bajo la cima a 1.200 m sobre ella)

// código WMO de Open-Meteo → intensidades 0–1
export function tipoTiempo(code, temp, mm) {
  const o = { lluvia: 0, nieve: 0, tormenta: 0, niebla: 0 };
  const L = { 51: 0.12, 53: 0.2, 55: 0.3, 56: 0.2, 57: 0.3, 61: 0.3, 63: 0.6, 65: 0.9, 66: 0.4, 67: 0.75, 80: 0.4, 81: 0.7, 82: 1, 95: 0.8, 96: 0.9, 99: 1 };
  const N = { 71: 0.3, 73: 0.6, 75: 1, 77: 0.2, 85: 0.5, 86: 1 };
  if (L[code]) o.lluvia = L[code];
  if (N[code]) o.nieve = N[code];
  if (mm > 0) { const k = Math.min(1, mm / 6); if (o.lluvia) o.lluvia = Math.max(o.lluvia, k); if (o.nieve) o.nieve = Math.max(o.nieve, k); }   // mm/h reales: cuanto más cae, más densa
  if (code >= 95) o.tormenta = 1;
  if (code === 45 || code === 48) o.niebla = 1;
  if (o.lluvia && temp != null && temp <= 1) { o.nieve = Math.max(o.nieve, o.lluvia); o.lluvia = 0; }   // en la cima, con frío, nieva
  return o;
}

function texturaPuff() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const x = 34 + Math.random() * 60, y = 44 + Math.random() * 40, r = 22 + Math.random() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const VS = `
  attribute vec3 aSeed; attribute float aPunta;
  uniform float uT, uVel, uLargo, uEsc, uTam; uniform vec3 uCentro; uniform vec2 uViento;
  varying float vA;
  void main() {
    float y = mod(aSeed.y * ${ALTO.toFixed(1)} - uT * uVel, ${ALTO.toFixed(1)});
    vec2 xz = aSeed.xz + uViento * ((${ALTO.toFixed(1)} - y) / uVel);   // lo que la ha llevado el viento desde que empezó a caer
    #ifdef NIEVE
      xz += vec2(sin(uT * 0.9 + aSeed.x * 0.05), cos(uT * 0.7 + aSeed.z * 0.05)) * 9.0;   // remolino
    #endif
    xz = mod(xz + ${R.toFixed(1)}, ${(2 * R).toFixed(1)}) - ${R.toFixed(1)};
    vec3 p = vec3(xz.x, y, xz.y);
    p -= normalize(vec3(uViento.x, -uVel, uViento.y)) * uLargo * aPunta;   // la cola de la gota, en la dirección de caída
    vec4 mv = modelViewMatrix * vec4(uCentro + p, 1.0);
    float d = -mv.z;
    vA = (1.0 - smoothstep(${(R * 0.55).toFixed(1)}, ${R.toFixed(1)}, length(xz))) * smoothstep(40.0, 260.0, d)
       * smoothstep(0.0, 300.0, y) * (1.0 - smoothstep(${(ALTO - 500).toFixed(1)}, ${ALTO.toFixed(1)}, y));
    gl_Position = projectionMatrix * mv;
    #ifdef NIEVE
      gl_PointSize = clamp(uTam * uEsc / d, 1.6, 6.0);
    #endif
  }`;
const FS = `
  uniform vec3 uColor; uniform float uOpac; varying float vA;
  void main() {
    float a = vA * uOpac;
    #ifdef NIEVE
      vec2 c = gl_PointCoord - 0.5; a *= 1.0 - smoothstep(0.25, 0.5, length(c));
    #endif
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }`;

function caida(n, nieve) {
  const g = new THREE.BufferGeometry(), por = nieve ? 1 : 2, seed = new Float32Array(n * por * 3), punta = new Float32Array(n * por);
  for (let i = 0; i < n; i++) {
    const x = (Math.random() * 2 - 1) * R, y = Math.random(), z = (Math.random() * 2 - 1) * R;
    for (let k = 0; k < por; k++) { seed.set([x, y, z], (i * por + k) * 3); punta[i * por + k] = k; }
  }
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3)); g.setAttribute('aPunta', new THREE.BufferAttribute(punta, 1));
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * por * 3), 3));   // three.js la pide; la posición real sale del shader
  const u = { uT: { value: 0 }, uVel: { value: nieve ? 9 : 70 }, uLargo: { value: nieve ? 0 : 34 }, uEsc: { value: 800 }, uTam: { value: 22 },
    uCentro: { value: new THREE.Vector3() }, uViento: { value: new THREE.Vector2() }, uColor: { value: new THREE.Color(nieve ? '#ffffff' : '#d3dde6') }, uOpac: { value: 0 } };
  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, defines: nieve ? { NIEVE: '' } : {} });
  const o = nieve ? new THREE.Points(g, m) : new THREE.LineSegments(g, m);
  o.frustumCulled = false; o.visible = false; o.renderOrder = 3;
  return { o, u, n, por };
}

export function crearTiempo({ scene, geo, movil = false, reducido = false, sonido = null }) {
  const N = movil ? 9000 : 20000;
  const lluvia = caida(N, false), nieve = caida(Math.round(N * 0.9), true);
  scene.add(lluvia.o, nieve.o);
  // nubes y niebla de la cima: sprites que se apartan de la línea cámara–cumbre
  const tex = [texturaPuff(), texturaPuff(), texturaPuff()], nubes = [];
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex[i % 3], transparent: true, depthWrite: false, opacity: 0, fog: true }));
    s.visible = false; s.userData = { op: 0, base: 0 }; scene.add(s); nubes.push(s);
  }
  // rayo visible (como en el barco en la botella): canal en zigzag con ramas, núcleo blanco y halo azulado aditivo; cae de la nube al relieve cerca de la cima
  const matNucleo = new THREE.MeshBasicMaterial({ color: 0xf4f7ff, fog: false, transparent: true, depthWrite: false });
  const matHalo = new THREE.MeshBasicMaterial({ color: 0x7f9cff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const rayoG = new THREE.Group(); rayoG.visible = false; rayoG.renderOrder = 4; scene.add(rayoG);
  const al = (a, b) => a + Math.random() * (b - a);
  function zigzag(a, b, nivel, desv, out) {
    if (nivel === 0) { out.push(b.clone()); return; }
    const dir = b.clone().sub(a), L = dir.length(), r = new THREE.Vector3(al(-1, 1), al(-1, 1), al(-1, 1));
    r.addScaledVector(dir, -r.dot(dir) / Math.max(L * L, 1e-6)); if (r.lengthSq() > 1e-8) r.normalize().multiplyScalar(L * desv * al(0.3, 1));
    const m = a.clone().lerp(b, al(0.4, 0.6)).add(r);
    zigzag(a, m, nivel - 1, desv, out); zigzag(m, b, nivel - 1, desv, out);
  }
  const tubo = (pts, radio) => { const c = new THREE.CurvePath(); for (let i = 0; i < pts.length - 1; i++) c.add(new THREE.LineCurve3(pts[i], pts[i + 1])); return new THREE.TubeGeometry(c, (pts.length - 1) * 2, radio, 5, false); };
  function rayo(cam) {
    for (const m of rayoG.children) m.geometry.dispose(); rayoG.clear();
    // a un lado de la cumbre visto desde la cámara (nunca delante de ella), a 0,8–2,5 km
    const lado = new THREE.Vector3().subVectors(est.c, cam.position).setY(0).normalize(), perp = new THREE.Vector3(-lado.z, 0, lado.x);
    const d = al(800, 2500), x = est.c.x + perp.x * d * (Math.random() < 0.5 ? -1 : 1) + lado.x * al(500, 2500), z = est.c.z + perp.z * d * (Math.random() < 0.5 ? -1 : 1) + lado.z * al(500, 2500);
    const E = new THREE.Vector3(x, geo.heightAt(x, z), z), S = new THREE.Vector3(x + al(-500, 500), est.c.y + al(900, 1400), z + al(-500, 500));
    const pts = [S.clone()]; zigzag(S, E, 6, 0.18, pts);
    const g = Math.max(1, cam.position.distanceTo(E) / 6000);   // más grueso de lejos para que se vea
    rayoG.add(new THREE.Mesh(tubo(pts, 4 * g), matNucleo), new THREE.Mesh(tubo(pts, 16 * g), matHalo));
    for (let k = 0, n = 1 + Math.floor(Math.random() * 3); k < n; k++) {
      const a = pts[Math.floor(al(0.15, 0.6) * pts.length)], b = a.clone().add(new THREE.Vector3(al(-500, 500), -al(300, 900), al(-500, 500))), rama = [a.clone()];
      zigzag(a, b, 4, 0.25, rama); rayoG.add(new THREE.Mesh(tubo(rama, 2.5 * g), matNucleo), new THREE.Mesh(tubo(rama, 9 * g), matHalo));
    }
    return cam.position.distanceTo(E);
  }
  const est = { activo: false, c: null, w: { lluvia: 0, nieve: 0, tormenta: 0, niebla: 0 }, viento: new THREE.Vector2(), cubierto: 0, cubObj: 0, destello: 0, prox: 0, rayo: [], k: 0 };
  const tmp = new THREE.Vector3(), aCum = new THREE.Vector3(), aNub = new THREE.Vector3();

  function colocaNubes(cobertura, w) {
    const nN = Math.min(7, Math.round(cobertura / 100 * 5) + (w.lluvia || w.nieve ? 2 : 0)), nB = w.niebla ? 5 : 0;
    const gris = w.lluvia || w.nieve || w.tormenta ? 0.62 : 0.92;
    nubes.forEach((s, i) => {
      const niebla = i >= 12 - nB, usada = i < nN || niebla;
      s.visible = usada; s.userData.base = !usada ? 0 : niebla ? 0.5 : 0.75 + Math.random() * 0.2;
      if (!usada) return;
      const a = Math.random() * Math.PI * 2, r = niebla ? 500 + Math.random() * 900 : 1400 + Math.random() * 3000;
      const sz = niebla ? 1300 + Math.random() * 900 : 1800 + Math.random() * 1800;
      s.scale.set(sz, sz * (niebla ? 0.35 : 0.5), 1);
      s.position.set(est.c.x + Math.sin(a) * r, est.c.y + (niebla ? -150 + Math.random() * 250 : 350 + Math.random() * 800), est.c.z + Math.cos(a) * r);
      s.userData.niebla = niebla; s.userData.r = r;
      s.material.color.setScalar(niebla ? 0.95 : gris);
    });
  }

  return {
    get destello() { return est.destello; },
    get cubierto() { return est.cubierto; },
    get activo() { return est.activo; },
    get _est() { return est; },   // para las pruebas
    // d: respuesta de Open-Meteo (current con weather_code, temperature_2m, cloud_cover, wind_speed_10m, wind_direction_10m, wind_gusts_10m); p: la cumbre (p.w)
    set(d, p) {
      if (!d || !p?.w) { est.activo = false; est.cubObj = 0; sonido?.setTiempo?.({ lluvia: 0, viento: 0 }); return; }
      const c = d.current, w = tipoTiempo(c.weather_code, c.temperature_2m, c.precipitation);
      est.activo = true; est.c = new THREE.Vector3(p.w.x, p.w.y, p.w.z); est.w = w;
      // viento: de dónde sopla (grados desde el norte) → hacia dónde va, en el mundo (x este, z sur); velocidad en m/s, exagerada para que se note de lejos
      const hacia = ((c.wind_direction_10m ?? 0) + 180) * Math.PI / 180, ms = (c.wind_speed_10m ?? 0) / 3.6;
      est.viento.set(Math.sin(hacia), -Math.cos(hacia)).multiplyScalar(ms);
      est.cubObj = Math.min(1, (c.cloud_cover ?? 0) / 100 * 0.75 + (w.lluvia || w.nieve ? 0.25 : 0) + w.niebla * 0.3);
      colocaNubes(c.cloud_cover ?? 0, w);
      est.prox = performance.now() + 2500 + Math.random() * 5000;
      sonido?.setTiempo?.({ lluvia: w.lluvia, viento: Math.min(1, (c.wind_gusts_10m ?? 0) / 90) });
    },
    // alturaPx: alto del lienzo en píxeles (para el tamaño de los copos)
    update(dt, cam, alturaPx) {
      const t = performance.now();
      est.k += ((est.activo ? 1 : 0) - est.k) * Math.min(1, dt * 0.8);   // aparece y desaparece con suavidad
      est.cubierto += ((est.activo ? est.cubObj : 0) - est.cubierto) * Math.min(1, dt * 0.6);
      const esc = alturaPx / (2 * Math.tan((cam.fov * Math.PI) / 360));
      for (const [s, w, vx] of [[lluvia, est.w.lluvia, 2.6], [nieve, est.w.nieve, 1.4]]) {
        const v = w * est.k; s.o.visible = v > 0.01; if (!s.o.visible) continue;
        s.u.uT.value = t / 1000; s.u.uEsc.value = esc; s.u.uOpac.value = (s === lluvia ? 0.7 : 0.95) * Math.min(1, 0.55 + 0.6 * v);
        s.u.uCentro.value.set(est.c.x, est.c.y - 2000, est.c.z); s.u.uViento.value.copy(est.viento).multiplyScalar(vx);
        s.o.geometry.setDrawRange(0, Math.round(s.n * Math.min(1, 0.08 + 0.92 * v)) * s.por);
      }
      // nubes: derivan con el viento dentro de un anillo; transparentes de cerca y si quedan entre la cámara y la cumbre
      if (est.c) {
        aCum.copy(est.c).sub(cam.position); const dCum = aCum.length(); aCum.normalize();
        for (const s of nubes) {
          if (!s.visible) continue;
          s.position.x += est.viento.x * dt * 3; s.position.z += est.viento.y * dt * 3;
          const dx = s.position.x - est.c.x, dz = s.position.z - est.c.z, r = Math.hypot(dx, dz), lim = s.userData.niebla ? 1600 : 4600;
          if (r > lim) { s.position.x = est.c.x - dx * 0.9; s.position.z = est.c.z - dz * 0.9; s.userData.op = 0; }   // sale por un lado, vuelve por el otro (sin salto visible: entra transparente)
          aNub.copy(s.position).sub(cam.position); const dN = aNub.length(); aNub.normalize();
          let obj = s.userData.base * est.k * THREE.MathUtils.smoothstep(dN, 1200, 3500);
          if (dN < dCum + 300) {   // delante de la cumbre: si en pantalla la taparía, se aclara (la niebla deja un velo fino)
            const ang = Math.acos(Math.min(1, aNub.dot(aCum))), radio = Math.atan(s.scale.x * 0.42 / dN);
            obj *= Math.max(s.userData.niebla ? 0.25 : 0, Math.min(1, (ang - radio * 0.6) / Math.max(0.02, radio * 0.5)));
          }
          s.userData.op += (obj - s.userData.op) * Math.min(1, dt * 1.5); s.material.opacity = s.userData.op;
          if (!est.activo && s.userData.op < 0.01) s.visible = false;
        }
      }
      // relámpagos: dos o tres fogonazos seguidos y el trueno unos segundos después (sin fogonazos si se pide menos movimiento)
      if (est.activo && est.w.tormenta && t > est.prox) {
        est.prox = t + 5000 + Math.random() * 9000;
        let dist = 6000;
        if (!reducido) { est.rayo = [t, t + 120 + Math.random() * 80, t + 330 + Math.random() * 150].slice(0, 2 + (Math.random() < 0.5 ? 1 : 0)); dist = rayo(cam); }
        const tr = Math.min(6, dist / 1700) * 1000;   // el trueno llega con el retraso del sonido (~340 m/s, acortado)
        setTimeout(() => sonido?.trueno?.(Math.max(0, Math.min(1, 1 - dist / 9000))), tr);
      }
      est.destello = 0;
      for (const r0 of est.rayo) { const u = (t - r0) / 110; if (u > 0 && u < 1) est.destello = Math.max(est.destello, 1 - u); }
      if (est.rayo.length && t > est.rayo[est.rayo.length - 1] + 200) est.rayo = [];
      rayoG.visible = est.destello > 0.02; matNucleo.opacity = Math.min(1, est.destello * 1.6); matHalo.opacity = est.destello * 0.8;
    },
  };
}
