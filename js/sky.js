import * as THREE from 'three';

export const HORIZON = new THREE.Color('#cfdbe0');

// Cúpula de cielo con degradado
export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color('#3a6a9e') }, uMid: { value: new THREE.Color('#97b8d2') }, uHor: { value: HORIZON.clone() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uGlow: { value: new THREE.Color('#ffffff') }, uGlowK: { value: 0.1 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 uTop, uMid, uHor, uSunDir, uGlow; uniform float uGlowK;
      void main(){ vec3 vN = normalize(vP); float h = clamp(vN.y, 0.0, 1.0);   // la dirección se normaliza por fragmento (interpolada entre vértices dejaba facetas rectas en el resplandor)
        vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.18, h)); c = mix(c, uTop, smoothstep(0.12, 0.75, h));
        // resplandor del sol: halo ancho y núcleo, más fuertes cerca del horizonte
        float sd = max(dot(vN, normalize(uSunDir)), 0.0);
        c += uGlow * (pow(sd, 5.0) * 0.32 + pow(sd, 48.0) * 0.85) * uGlowK * (1.0 - 0.7 * smoothstep(0.25, 0.9, h));
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(200000, 48, 24), mat);
  m.renderOrder = -10; m.frustumCulled = false;
  return m;
}

function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 7; i++) {
    const x = 40 + Math.random() * 48, y = 46 + Math.random() * 36, r = 24 + Math.random() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Nubes bajas que derivan lentamente; se desvanecen cerca de la cámara para no tapar las cumbres.
export class Clouds {
  constructor(scene, geo, count = 34) {
    this.geo = geo; this.sprites = [];
    const tex = [puffTexture(), puffTexture(), puffTexture()];
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex[i % 3], transparent: true, depthWrite: false, opacity: 0.0 });
      const s = new THREE.Sprite(mat);
      const size = 4500 + Math.random() * 7000;
      s.scale.set(size, size * (0.45 + Math.random() * 0.2), 1);
      s.position.set((Math.random() - 0.5) * geo.W * 1.1, 3600 + Math.random() * 1500, (Math.random() - 0.5) * geo.D * 1.1);
      s.userData = { base: 0.3 + Math.random() * 0.3, speed: 18 + Math.random() * 22 };
      scene.add(s); this.sprites.push(s);
    }
  }
  setTinte(color, k) { this._tinte = this._tinte ?? new THREE.Color(1, 1, 1); this._tinte.lerp(color, k); for (const s of this.sprites) s.material.color.copy(this._tinte); }
  update(dt, cam, visible = true) {
    const lim = this.geo.W * 0.6;
    for (const s of this.sprites) {
      s.position.x += s.userData.speed * dt;
      if (s.position.x > lim) s.position.x = -lim;
      const d = s.position.distanceTo(cam.position);
      const near = THREE.MathUtils.smoothstep(d, 3500, 9000);
      s.material.opacity = visible ? s.userData.base * near : 0;
    }
  }
}
