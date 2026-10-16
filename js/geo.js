// Geometría del terreno: de lon/lat a metros locales y muestreo de alturas.
// Ejes: x = este, y = arriba, z = sur (el norte es -z). Unidades: metros.
export const EXAG = 1.3; // exageración vertical (se indica en «Acerca de»)

export function makeGeo(meta, heights) {
  const latC = meta.lat0 - ((meta.nrows - 1) * meta.step) / 2;
  const mLat = 111132;
  const mLon = 111320 * Math.cos((latC * Math.PI) / 180);
  const dx = meta.step * mLon;
  const dz = meta.step * mLat;
  const W = (meta.ncols - 1) * dx;
  const D = (meta.nrows - 1) * dz;
  const { ncols, nrows } = meta;
  const hs = meta.hscale * EXAG;

  const toXZ = (lon, lat) => ({
    x: (lon - meta.lon0) * mLon - W / 2,
    z: (meta.lat0 - lat) * mLat - D / 2,
  });

  // altura (m, ya exagerada) en la celda (c, r) con recorte a los bordes
  const hCell = (c, r) => {
    c = c < 0 ? 0 : c > ncols - 1 ? ncols - 1 : c;
    r = r < 0 ? 0 : r > nrows - 1 ? nrows - 1 : r;
    return heights[r * ncols + c] * hs;
  };

  // altura bilineal en coordenadas locales
  const heightAt = (x, z) => {
    const fc = (x + W / 2) / dx, fr = (z + D / 2) / dz;
    const c0 = Math.floor(fc), r0 = Math.floor(fr);
    const tc = fc - c0, tr = fr - r0;
    const a = hCell(c0, r0), b = hCell(c0 + 1, r0), c = hCell(c0, r0 + 1), d = hCell(c0 + 1, r0 + 1);
    return (a * (1 - tc) + b * tc) * (1 - tr) + (c * (1 - tc) + d * tc) * tr;
  };

  // cima real = máximo en un entorno pequeño (la malla de 30 m puede desplazar la cima unas celdas)
  const summitNear = (x, z, radius = 90) => {
    let best = -1, bx = x, bz = z;
    for (let ix = -radius; ix <= radius; ix += dx) for (let iz = -radius; iz <= radius; iz += dz) {
      const h = heightAt(x + ix, z + iz);
      if (h > best) { best = h; bx = x + ix; bz = z + iz; }
    }
    return { x: bx, y: best, z: bz };
  };

  return { latC, mLat, mLon, dx, dz, W, D, toXZ, hCell, heightAt, summitNear };
}
