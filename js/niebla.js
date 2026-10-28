// Niebla de valle: sobre la niebla lineal de la escena (que solo depende de la distancia) se añade una capa de bruma baja, que se ve a
// partir de unos kilómetros de distancia y solo en las alturas bajas (fondos de valle). Sustituye los trozos de niebla de three.js para todos
// los materiales con niebla (relieve, árboles, ibones…). Las alturas son del mundo (metros × la exageración vertical, 1,3).
import * as THREE from 'three';

export function instalaNiebla() {
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth; varying float vFogY; varying vec2 vFogXZ;
#endif`;
  C.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogY = cameraPosition.y + dot(viewMatrix[1].xyz, mvPosition.xyz);   // altura del punto en el mundo
  vFogXZ = vec2( cameraPosition.x + dot(viewMatrix[0].xyz, mvPosition.xyz), cameraPosition.z + dot(viewMatrix[2].xyz, mvPosition.xyz) );
#endif`;
  C.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor; varying float vFogDepth; varying float vFogY; varying vec2 vFogXZ;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear; uniform float fogFar;
  #endif
#endif`;
  C.fog_pars_fragment = C.fog_pars_fragment + `
#ifdef USE_FOG
  float nbRnd(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float nbRuido(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(nbRnd(i), nbRnd(i + vec2(1.0, 0.0)), f.x), mix(nbRnd(i + vec2(0.0, 1.0)), nbRnd(i + vec2(1.0, 1.0)), f.x), f.y); }
#endif`;
  // La fuerza de la bruma (0–1) y su tinte cálido (0–1) viajan en las partes decimales de fogNear y fogFar (24000,k y 100000,t):
  // así se cambian con la luz del día sin tocar los uniformes de cada material.
  C.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    float kB = 0.2, tB = 0.0;
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    float kB = fract( fogNear ), tB = fract( fogFar );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  // bruma de valle / mar de nubes: capa baja con el borde superior irregular (más alta y densa cuanto mayor es kB)
  // al sur del Pirineo (z de 20 a 45 km, hacia la Sierra de Guara) el techo baja hasta 950 m: allí las cimas llegan solo a 1.000–2.078 m y quedarían todas bajo la bruma
  float surB = smoothstep( 20000.0, 45000.0, vFogXZ.y );
  float topeB = ( 1450.0 + 700.0 * kB - 950.0 * surB + 120.0 * ( nbRuido( vFogXZ * 0.00045 ) - 0.5 ) * 2.0 + 40.0 * ( nbRuido( vFogXZ * 0.0021 ) - 0.5 ) * 2.0 ) * 1.3;
  float capaB = 1.0 - smoothstep( topeB - 340.0, topeB, vFogY );
  float vistaB = smoothstep( 700.0, 7000.0, vFogDepth );
  float bruma = capaB * vistaB * ( 0.10 + 0.82 * kB );
  vec3 colB = mix( mix( fogColor, vec3( 0.93, 0.95, 0.97 ), 0.55 ), vec3( 1.0, 0.82, 0.62 ), tB * 0.55 );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, colB, clamp( bruma, 0.0, 0.92 ) );
#endif`;
}
