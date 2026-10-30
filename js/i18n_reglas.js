// Traducción al inglés por reglas de los textos con molde fijo de las fichas sencillas (cumbres de 2.000 a 3.000 m, data/menores.json):
// descripción automática, pueblo cercano, texto de la ruta de Wikiloc, situación, desnivel, acceso y enlace. Lo que no encaja se devuelve tal cual.
// zona(n): traduce el nombre de una zona o macizo (t de i18n.js).
const DIR = { norte: 'north', sur: 'south', este: 'east', oeste: 'west', noreste: 'north-east', noroeste: 'north-west', sureste: 'south-east', suroeste: 'south-west' };
const REG = { 'Aragón': 'Aragon', 'Cataluña': 'Catalonia', 'Catalunya': 'Catalonia', 'Navarra': 'Navarre' };
// 2.805 → 2,805 y 0,8 → 0.8
export const numEN = (s) => s.replace(/(\d),(\d)/g, '$1§$2').replace(/(\d)\.(\d{3})/g, '$1,$2').replace(/§/g, '.');
const ord = (n) => { const k = n % 100; return n + (k >= 11 && k <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')); };
const reg = (r) => REG[r] || r;

function frase(f, zona) {
  let m;
  if ((m = /^Cumbre de ([\d.]+) m de la zona (.+), (en territorio aragonés|en la frontera entre Aragón y Francia|en el límite de Aragón)\.$/.exec(f)))
    return `A ${numEN(m[1])} m summit in the ${zona(m[2])} area, ${{ 'en territorio aragonés': 'in Aragonese territory', 'en la frontera entre Aragón y Francia': 'on the border between Aragon and France', 'en el límite de Aragón': 'on the edge of Aragon' }[m[3]]}.`;
  if ((m = /^Es la (\d+)\.?ª más alta de las (\d+) cumbres de esta lista en la zona (.+)\.$/.exec(f)))
    return `It is ${+m[1] === 1 ? 'the' : `the ${ord(+m[1])}`} highest of the ${m[2]} summits on this list in the ${zona(m[3])} area.`;
  if ((m = /^Su vecina más alta es (.+) \(([\d.]+) m\), a ([\d,]+) km al (\w+)\.$/.exec(f)) && DIR[m[4]])
    return `Its nearest higher neighbour is ${m[1]} (${numEN(m[2])} m), ${numEN(m[3])} km to the ${DIR[m[4]]}.`;
  if ((m = /^Se alza unos ([\d.]+) m sobre (.+)\.$/.exec(f))) return `It rises about ${numEN(m[1])} m above ${m[2]}.`;
  if (f === 'Ficha sencilla: sin ruta ni recorrido en el mapa.') return 'Basic info: no route or track on the map.';
  if (f === 'Ruta orientativa por los senderos de OpenStreetMap.') return 'Guidance route along OpenStreetMap paths.';
  if (f === 'Con la ruta normal descrita abajo; sin recorrido dibujado en el mapa.') return 'With the normal route described below; no route drawn on the map.';
  if (f === 'Nombre, altitud y posición de OpenStreetMap.') return 'Name, altitude and position from OpenStreetMap.';
  if ((m = /^Esta (?:cumbre|cima) aparece en la ruta «(.*)», de (.+?) en Wikiloc, de ([\d.,]+) km y ([\d.,]+) m de desnivel acumulado\.$/.exec(f)))
    return `This summit appears on the route «${m[1]}», by ${m[2]} on Wikiloc, ${numEN(m[3])} km long with ${numEN(m[4])} m of total ascent.`;
  if ((m = /^Esta (?:cumbre|cima) aparece en la ruta «(.*)»,? de (.+?) en Wikiloc\.$/.exec(f))) return `This summit appears on the route «${m[1]}» by ${m[2]} on Wikiloc.`;
  if ((m = /^Está situada en (.+) \((.+)\)\.$/.exec(f))) return `It is located in ${m[1]} (${reg(m[2])}).`;
  if ((m = /^El autor tardó (.+) en total, con las paradas\.$/.exec(f))) return `The author took ${m[1]} in total, including stops.`;
  if (f === 'En el enlace de abajo están su recorrido completo y sus fotos.') return 'The link below has the full route and its photos.';
  return null;
}

// texto de varias frases: si alguna no encaja, se devuelve el original entero (mejor todo en español que mezclado)
export function reglaTexto(s, zona = (z) => z) {
  if (typeof s !== 'string') return s;
  const fr = []; let ini = 0, dentro = 0;   // frases: punto + espacio + mayúscula, pero no dentro de «…» (nombres de rutas con puntos)
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '«') dentro++; else if (s[i] === '»') dentro = Math.max(0, dentro - 1);
    else if (!dentro && s[i] === '.' && s[i + 1] === ' ' && /[A-ZÁÉÍÓÚ]/.test(s[i + 2] || '')) { fr.push(s.slice(ini, i + 1)); ini = i + 2; }
  }
  fr.push(s.slice(ini));
  const out = fr.map((f) => frase(f, zona));
  return out.every((x) => x != null) ? out.join(' ') : s;
}

export function reglaCampo(k, s) {
  if (typeof s !== 'string') return s;
  let m;
  if (k === 'cerca' && (m = /^(.+) \(([\d,]+) km en línea recta\)$/.exec(s))) return `${m[1]} (${numEN(m[2])} km in a straight line)`;
  if (k === 'situacion') return { 'Aragón': 'Aragon', 'Frontera Aragón–Francia': 'Aragon–France border', 'Límite de Aragón': 'Edge of Aragon' }[s] ?? s;
  if (k === 'desnivel' && (m = /^\+([\d.]+) m · ([\d,]+) km(, circular|, ida y vuelta)?$/.exec(s))) return `+${numEN(m[1])} m · ${numEN(m[2])} km${{ ', circular': ', loop', ', ida y vuelta': ', round trip' }[m[3]] ?? ''}`;
  if (k === 'acceso' && (m = /^Ruta en (.+)$/.exec(s))) return `Route in ${m[1]}`;
  if (k === 'pie' && (m = /^(.+), en una foto de su ruta\.$/.exec(s))) return `${m[1]}, in a photo from its route.`;
  if (k === 'pie' && (m = /^(.+), visto desde la ruta\.$/.exec(s))) return `${m[1]}, seen from the route.`;
  if (k === 'pie' && (m = /^Vista (?:desde|de) (?:la cima del |la cima de la |el |la )?(.+)\.$/.exec(s)) && !/[,;]/.test(m[1])) return `View from ${m[1]}.`;
  if (k === 'enlace' && (m = /^Ruta de (.+) en Wikiloc$/.exec(s))) return `Route by ${m[1]} on Wikiloc`;
  if (k === 'enlace' && (m = /^Ver la ruta en Wikiloc: (.+)$/.exec(s))) return `See the route on Wikiloc: ${m[1]}`;
  return s;
}
