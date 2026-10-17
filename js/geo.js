// Geometría del terreno: de lon/lat a metros locales y muestreo de alturas.
// Ejes: x = este, y = arriba, z = sur (el norte es -z). Unidades: metros.
export const EXAG = 1.3; // exageración vertical (se indica en «Acerca de»)

export function makeGeo(meta, store) {
  const latC = meta.lat0 - ((meta.nrows - 1) * meta.step) / 2;
  const mLat = 111132;
  const mLon = 111320 * Math.cos((latC * Math.PI) / 180);
  const dx = meta.step * mLon;
  const dz = meta.step * mLat;
  const W = (meta.ncols - 1) * dx;
  const D = (meta.nrows - 1) * dz;
  const hs = meta.hscale * EXAG;

  const toXZ = (lon, lat) => ({
    x: (lon - meta.lon0) * mLon - W / 2,
    z: (meta.lat0 - lat) * mLat - D / 2,
  });

  // altura bilineal en coordenadas locales (m, ya exagerada), con el nivel de detalle que haya cargado en ese punto
  const heightAt = (x, z) => store.sample((x + W / 2) / dx, (z + D / 2) / dz) * hs;

  // cima real = máximo en un entorno pequeño (la malla de 30 m puede desplazar la cima unas celdas)
  const summitNear = (x, z, radius = 90) => {
    let best = -1, bx = x, bz = z;
    for (let ix = -radius; ix <= radius; ix += dx) for (let iz = -radius; iz <= radius; iz += dz) {
      const h = heightAt(x + ix, z + iz);
      if (h > best) { best = h; bx = x + ix; bz = z + iz; }
    }
    return { x: bx, y: best, z: bz };
  };

  return { latC, mLat, mLon, dx, dz, W, D, hs, toXZ, heightAt, summitNear };
}
