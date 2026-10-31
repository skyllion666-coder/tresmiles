// Geometría del terreno: de lon/lat a metros locales y muestreo de alturas.
// Ejes: x = este, y = arriba, z = sur (el norte es -z). Unidades: metros.
export const EXAG = 1.3; // exageración vertical (se indica en «Acerca de»)

export function makeGeo(meta, store) {
  // el origen del mundo (x=0, z=0) es el centro de la rejilla ORIGINAL (nrows0 filas): al ampliar el mapa hacia el sur, nrows crece pero nada de lo ya
  // calculado (cumbres, ortofotos, rutas) se mueve; la rejilla ocupa ahora z en [zmin, zmax]
  const nrows0 = meta.nrows0 ?? meta.nrows;
  const latC = meta.lat0 - ((nrows0 - 1) * meta.step) / 2;
  const mLat = 111132;
  const mLon = 111320 * Math.cos((latC * Math.PI) / 180);
  const dx = meta.step * mLon;
  const dz = meta.step * mLat;
  const W = (meta.ncols - 1) * dx;
  const D = (meta.nrows - 1) * dz;
  const oz = ((nrows0 - 1) * dz) / 2, zmin = -oz, zmax = D - oz;
  const dentro = (x, z, m = 0) => Math.abs(x) <= W / 2 - m && z >= zmin + m && z <= zmax - m;   // dentro del mapa, a m metros del borde
  const hs = meta.hscale * EXAG;

  const toXZ = (lon, lat) => ({
    x: (lon - meta.lon0) * mLon - W / 2,
    z: (meta.lat0 - lat) * mLat - oz,
  });

  // altura bilineal en coordenadas locales (m, ya exagerada), con el nivel de detalle que haya cargado en ese punto
  const heightBase = (x, z) => store.sample((x + W / 2) / dx, (z + oz) / dz) * hs;
  // piezas locales de alta resolución (js/cumbres.js): si una cubre el punto, mandan; si no, el relieve general
  let extra = null, paq = null;   // paq: piezas del paquete de zona (js/paquete.js), que mandan sobre las de cumbre
  const heightAt = (x, z) => { if (paq) { const h = paq(x, z); if (h !== undefined) return h; } if (extra) { const h = extra(x, z); if (h !== undefined) return h; } return heightBase(x, z); };

  // cima real = máximo en un entorno pequeño (la malla de 30 m puede desplazar la cima unas celdas)
  const summitNear = (x, z, radius = 90) => {
    let best = -1, bx = x, bz = z;
    for (let ix = -radius; ix <= radius; ix += dx) for (let iz = -radius; iz <= radius; iz += dz) {
      const h = heightAt(x + ix, z + iz);
      if (h > best) { best = h; bx = x + ix; bz = z + iz; }
    }
    return { x: bx, y: best, z: bz };
  };

  return { latC, mLat, mLon, dx, dz, W, D, oz, zmin, zmax, dentro, hs, toXZ, heightAt, heightBase, setExtra: (f) => { extra = f; }, setPaquete: (f) => { paq = f; }, summitNear };
}
