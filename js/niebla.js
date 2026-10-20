// Niebla de valle: sobre la niebla lineal de la escena (que solo depende de la distancia) se añade una capa de bruma baja, que se ve a
// partir de unos kilómetros de distancia y solo en las alturas bajas (fondos de valle). Sustituye los trozos de niebla de three.js para todos
// los materiales con niebla (relieve, árboles, ibones…). Las alturas son del mundo (metros × la exageración vertical, 1,3).
import * as THREE from 'three';

export function instalaNiebla() {
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth; varying float vFogY;
#endif`;
  C.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogY = cameraPosition.y + dot(viewMatrix[1].xyz, mvPosition.xyz);   // altura del punto en el mundo
#endif`;
  C.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor; varying float vFogDepth; varying float vFogY;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear; uniform float fogFar;
  #endif
#endif`;
  C.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  float capaBruma = 1.0 - smoothstep( 1250.0 * 1.3, 2050.0 * 1.3, vFogY );
  float lejosBruma = smoothstep( 3000.0, 32000.0, vFogDepth );
  float bruma = capaBruma * lejosBruma * 0.30;
  gl_FragColor.rgb = mix( gl_FragColor.rgb, mix( fogColor, vec3( 0.93, 0.95, 0.97 ), 0.5 ), bruma );
#endif`;
}
