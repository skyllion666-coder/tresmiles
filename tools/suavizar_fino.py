#!/usr/bin/env python3
"""Suaviza el temblor del GPS de una ruta y la densifica para que la línea vaya pegada al relieve.

1. Pasa el track a metros y lo remuestrea cada 2,5 m a lo largo del camino.
2. Media gaussiana de la posición (sigma SIGMA m, por defecto 6): quita el zigzag de pocos metros del GPS
   sin comerse las revueltas de verdad (las lazadas de una canal miden decenas de metros).
   El inicio, el final y el punto más alto no se mueven.
3. Vuelve a remuestrear cada PASO m (por defecto 5). La altura del GPS se interpola; en la web la línea toma
   la altura del relieve (geo.heightAt), así que con puntos cada 5 m sigue el terreno en vez de cortarlo.

Guarda una copia del original en data/rutas/_originales/<id>.json la primera vez.
Uso: python3 tools/suavizar_fino.py <id> [--sigma 6] [--paso 5] [--prueba]"""
import argparse, json, math, os, shutil

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


def remuestrea(xy, ele, paso):
    """Puntos cada `paso` m a lo largo de la polilínea (incluye el último)."""
    acum = [0.0]
    for k in range(1, len(xy)):
        acum.append(acum[-1] + math.dist(xy[k - 1], xy[k]))
    total = acum[-1]
    n = max(2, int(total // paso) + 1)
    sal_xy, sal_e, sal_d = [], [], []
    j = 0
    for i in range(n):
        d = min(total, i * paso)
        while j < len(acum) - 2 and acum[j + 1] < d:
            j += 1
        seg = acum[j + 1] - acum[j] or 1e-9
        t = (d - acum[j]) / seg
        sal_xy.append((xy[j][0] + (xy[j + 1][0] - xy[j][0]) * t, xy[j][1] + (xy[j + 1][1] - xy[j][1]) * t))
        sal_e.append(ele[j] + (ele[j + 1] - ele[j]) * t)
        sal_d.append(d)
    if sal_d[-1] < total:
        sal_xy.append(xy[-1]); sal_e.append(ele[-1]); sal_d.append(total)
    return sal_xy, sal_e, sal_d


def gauss(xy, d, sigma, fijos):
    """Media gaussiana por distancia a lo largo del camino; los índices de `fijos` no se mueven
    (y el peso del suavizado crece suave desde ellos para que no quede un pico)."""
    n, r = len(xy), 3 * sigma
    out = []
    j0 = 0
    for i in range(n):
        while d[i] - d[j0] > r:
            j0 += 1
        sx = sy = sw = 0.0
        j = j0
        while j < n and d[j] - d[i] <= r:
            w = math.exp(-0.5 * ((d[j] - d[i]) / sigma) ** 2)
            sx += w * xy[j][0]; sy += w * xy[j][1]; sw += w
            j += 1
        out.append((sx / sw, sy / sw))
    # cerca de los puntos fijos se mezcla con el original
    res = []
    for i in range(n):
        cerca = min(abs(d[i] - d[f]) for f in fijos)
        a = min(1.0, cerca / r)
        res.append((xy[i][0] + (out[i][0] - xy[i][0]) * a, xy[i][1] + (out[i][1] - xy[i][1]) * a))
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('id'); ap.add_argument('--sigma', type=float, default=6.0); ap.add_argument('--paso', type=float, default=5.0)
    ap.add_argument('--prueba', action='store_true', help='no escribe nada, solo informa')
    a = ap.parse_args()
    f = os.path.join(ROOT, 'data', 'rutas', a.id + '.json')
    r = json.load(open(f))
    P = r['puntos']
    lon0, lat0 = P[0][0], P[0][1]
    mx, my = 111320 * math.cos(math.radians(lat0)), 111132
    xy = [((p[0] - lon0) * mx, (p[1] - lat0) * my) for p in P]
    ele = [p[2] for p in P]

    fino_xy, fino_e, fino_d = remuestrea(xy, ele, 2.5)
    icima = max(range(len(fino_e)), key=lambda k: fino_e[k])
    suave = gauss(fino_xy, fino_d, a.sigma, [0, icima, len(fino_xy) - 1])
    # desplazamiento medio y máximo respecto al track original remuestreado
    desv = [math.dist(p, q) for p, q in zip(fino_xy, suave)]
    sal_xy, sal_e, _ = remuestrea(suave, fino_e, a.paso)

    acum, d = [], 0.0
    for k in range(len(sal_xy)):
        if k:
            d += math.dist(sal_xy[k - 1], sal_xy[k])
        acum.append(d)
    # la distancia de la ficha y del perfil se queda la del track original (la que da Wikiloc): se escala la acumulada
    total = r.get('distancia') or round(d)
    esc = total / (d or 1)
    puntos = [[round(lon0 + x / mx, 6), round(lat0 + y / my, 6), round(sal_e[k]), round(acum[k] * esc)] for k, (x, y) in enumerate(sal_xy)]
    print(f'{a.id}: {len(P)} → {len(puntos)} puntos; distancia del camino suavizado {round(d)} m (se mantiene {total} m); '
          f'desplazamiento medio {sum(desv) / len(desv):.1f} m, máximo {max(desv):.1f} m')
    if a.prueba:
        return
    orig = os.path.join(ROOT, 'data', 'rutas', '_originales')
    os.makedirs(orig, exist_ok=True)
    if not os.path.exists(os.path.join(orig, a.id + '.json')):
        shutil.copy2(f, orig)
    r['puntos'] = puntos; r['distancia'] = total
    r['suavizadoFino'] = {'sigma': a.sigma, 'paso': a.paso}
    json.dump(r, open(f, 'w'), ensure_ascii=False, separators=(',', ':'))


if __name__ == '__main__':
    main()
