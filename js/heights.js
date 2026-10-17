// Alturas del relieve por bloques y por niveles de detalle (paso 8, 4, 2 y 1 celdas).
// El nivel 8 de todos los bloques viene en `overview.bin` (vista general); los demás se piden al acercarse.
// Cada nivel lleva 1 muestra de margen por lado, así las normales y las alturas enlazan entre bloques.
export class HeightStore {
  constructor(meta, base) {
    this.meta = meta; this.base = base;
    this.CH = meta.chunk; this.nci = meta.nci; this.ncj = meta.ncj;
    this.cells = Array.from({ length: this.nci * this.ncj }, () => ({ 8: null, 4: null, 2: null, 1: null, esperando: {} }));
    this.listeners = [];
    this.activas = 0;   // descargas en curso
  }

  async init() {
    const buf = new Uint16Array(await (await fetch(`${this.base}/overview.bin`)).arrayBuffer());
    const dim = this.CH / 8 + 3, n = dim * dim;
    this.cells.forEach((c, k) => { c[8] = buf.subarray(k * n, (k + 1) * n); });
  }

  cell(i, j) { return this.cells[j * this.nci + i]; }
  has(i, j, s) { return !!this.cell(i, j)[s]; }
  mejor(i, j) { const c = this.cell(i, j); return c[1] ? 1 : c[2] ? 2 : c[4] ? 4 : 8; }
  onLevel(fn) { this.listeners.push(fn); }

  // pide el nivel s de un bloque (una sola vez); devuelve una promesa
  load(i, j, s) {
    const c = this.cell(i, j);
    if (c[s]) return Promise.resolve();
    if (c.esperando[s]) return c.esperando[s];
    this.activas++;
    c.esperando[s] = fetch(`${this.base}/h/c_${i}_${j}_${s}.bin`).then((r) => r.arrayBuffer()).then((b) => {
      c[s] = new Uint16Array(b); this.activas--; delete c.esperando[s];
      for (const f of this.listeners) f(i, j, s);
    }).catch(() => { this.activas--; delete c.esperando[s]; });
    return c.esperando[s];
  }

  // altura (u16, decímetros) bilineal en coordenadas de celda globales fraccionarias, con el nivel más fino cargado en ese bloque
  sample(fc, fr) {
    const { CH, nci, ncj } = this, maxC = nci * CH, maxR = ncj * CH;
    fc = fc < 0 ? 0 : fc > maxC ? maxC : fc; fr = fr < 0 ? 0 : fr > maxR ? maxR : fr;
    const i = Math.min(nci - 1, Math.floor(fc / CH)), j = Math.min(ncj - 1, Math.floor(fr / CH));
    const c = this.cells[j * nci + i], s = c[1] ? 1 : c[2] ? 2 : c[4] ? 4 : 8, a = c[s], dim = CH / s + 3;
    const lx = (fc - i * CH) / s + 1, ly = (fr - j * CH) / s + 1;
    const x0 = Math.min(dim - 2, Math.floor(lx)), y0 = Math.min(dim - 2, Math.floor(ly)), tx = lx - x0, ty = ly - y0, k = y0 * dim + x0;
    return (a[k] * (1 - tx) + a[k + 1] * tx) * (1 - ty) + (a[k + dim] * (1 - tx) + a[k + dim + 1] * tx) * ty;
  }
}
