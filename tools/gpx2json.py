#!/usr/bin/env python3
"""Convierte un GPX en un JSON ligero para dibujar la ruta sobre el mapa.

Uso: python3 tools/gpx2json.py archivo.gpx salida.json "Nombre de la ruta" ["Autor"]
Se descartan las horas, se simplifica el trazado (Douglas-Peucker, ~EPS m) y se calculan
distancia, desnivel acumulado y altitud máxima. Solo se guardan lon, lat y altitud.
"""
import json, math, sys, xml.etree.ElementTree as ET

EPS = 4.0   # tolerancia de simplificación en metros
UMBRAL = 3.0  # histéresis para el desnivel acumulado (filtra ruido del GPS)

def local(lon, lat, lat0):
    return (lon * 111320 * math.cos(math.radians(lat0)), lat * 111132)

def dp(pts, eps):
    if len(pts) < 3: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = pts[a][:2], pts[b][:2]
        dx, dy = bx - ax, by - ay; L = math.hypot(dx, dy) or 1e-9
        dmax, im = 0, -1
        for i in range(a + 1, b):
            px, py = pts[i][:2]
            d = abs(dy * (px - ax) - dx * (py - ay)) / L
            if d > dmax: dmax, im = d, i
        if dmax > eps: keep[im] = True; stack += [(a, im), (im, b)]
    return [p for p, k in zip(pts, keep) if k]

def main(src, dst, nombre, autor=''):
    ns = {'g': 'http://www.topografix.com/GPX/1/1'}
    root = ET.parse(src).getroot()
    raw = [(float(p.get('lon')), float(p.get('lat')), float(p.findtext('g:ele', default='0', namespaces=ns)))
           for p in root.iterfind('.//g:trkpt', ns)]
    lat0 = raw[0][1]
    xy = [(*local(lo, la, lat0), el, lo, la) for lo, la, el in raw]
    simp = dp([(x, y, el, lo, la) for x, y, el, lo, la in xy], EPS)
    dist = 0; gain = 0; ref = simp[0][2]; mx = max(p[2] for p in simp)
    puntos = []
    for i, (x, y, el, lo, la) in enumerate(simp):
        if i: dist += math.hypot(x - simp[i-1][0], y - simp[i-1][1])
        if el - ref > UMBRAL: gain += el - ref; ref = el
        elif ref - el > UMBRAL: ref = el
        puntos.append([round(lo, 5), round(la, 5), round(el, 1), round(dist)])
    out = {'nombre': nombre, 'autor': autor, 'puntos': puntos,
           'distancia': round(dist), 'desnivel': round(gain), 'max': round(mx), 'min': round(min(p[2] for p in simp))}
    json.dump(out, open(dst, 'w'), separators=(',', ':'), ensure_ascii=False)
    print(f"{len(raw)} puntos -> {len(puntos)}; {dist/1000:.1f} km; +{gain:.0f} m; máx {mx:.0f} m")

if __name__ == '__main__':
    main(*sys.argv[1:5])
