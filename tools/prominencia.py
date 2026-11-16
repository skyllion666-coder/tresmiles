#!/usr/bin/env python3
"""Prominencia de los 181 tresmiles calculada con nuestro relieve, su collado clave y su «cima madre».

Relieve: ~/Tresmiles/web/data/near_h.bin (malla de 1" ≈ 30 m; Copernicus GLO-30 con el MDT05 del IGN en las cumbres)
y, si el collado queda fuera de esa malla, far_h.bin (≈ 150 m, de -2,6° a 2,6°).
Método: la prominencia es lo que hay que bajar desde la cima para poder llegar a terreno más alto. Se busca (por bisección,
al metro) la cota L más alta tal que la zona continua de terreno ≥ L que contiene la cima llega a un punto más alto que ella;
L es la cota del collado clave. Prominencia = altitud oficial de la cima − L.
La «cima madre» es el tresmil más alto más cercano dentro de esa zona.
Salida: tools/datos/prominencia.json (lo lee tools/ficha_terreno.py).
Uso: python3 tools/prominencia.py [id ...]
"""
import json, math, os, sys
import numpy as np
from scipy import ndimage

AQUI = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.expanduser('~/Tresmiles/web/data')
meta = json.load(open(os.path.join(SRC, 'meta.json')))


def carga(nombre, m):
    return np.fromfile(os.path.join(SRC, nombre), dtype='<u2').reshape(m['nrows'], m['ncols']).astype(np.float32) * 0.1


MALLAS = [dict(m=meta['near'], h=carga('near_h.bin', meta['near']), nombre='30 m'),
          dict(m=meta['far'], h=carga('far_h.bin', meta['far']), nombre='150 m')]
for M in MALLAS:
    M['h'][M['h'] <= 0] = np.nan   # sin dato
OCHO = np.ones((3, 3), bool)

picos = json.load(open(os.path.join(AQUI, '..', 'data', 'peaks.json')))['picos']
# candidatas a cima madre: los tresmiles y los picos con nombre y altitud de OpenStreetMap
OSM = [dict(id=None, nombre=n, lon=lo, lat=la, altitud=a) for n, lo, la, a in json.load(open(os.path.join(AQUI, '..', 'data', 'picos_osm.json'))) if a]
CANDIDATAS = [dict(id=q['id'], nombre=q['nombre'], lon=q['lon'], lat=q['lat'], altitud=q['altitud'], clase=q['clase']) for q in picos] + OSM


def celda(M, lon, lat):
    m = M['m']
    return (m['lat0'] - lat) / m['step'], (lon - m['lon0']) / m['step']


def lonlat(M, r, c):
    m = M['m']
    return m['lon0'] + c * m['step'], m['lat0'] - r * m['step']


CACHE = {}
def cima_en_malla(M, p, radio_m=None):
    """cima del relieve: desde las coordenadas, sube por la máxima pendiente (8 vecinas) hasta un máximo local"""
    k = (M['nombre'], p['lon'], p['lat'])
    if k in CACHE: return CACHE[k]
    r, c = celda(M, p['lon'], p['lat'])
    r, c = int(round(r)), int(round(c))
    H = M['h']; res = None
    if 1 <= r < H.shape[0] - 1 and 1 <= c < H.shape[1] - 1 and not np.isnan(H[r, c]):
        k = max(1, int(round(90 / (M['m']['step'] * 111000))))   # punto más alto a menos de 90 m
        v = np.nan_to_num(H[r - k:r + k + 1, c - k:c + k + 1], nan=-1); i = int(np.argmax(v))
        r, c = r - k + i // v.shape[1], c - k + i % v.shape[1]
        for _ in range(60):
            v = np.nan_to_num(H[r - 1:r + 2, c - 1:c + 2], nan=-1)
            i = int(np.argmax(v)); dr, dc = i // 3 - 1, i % 3 - 1
            if (dr, dc) == (0, 0) or not (2 <= r + dr < H.shape[0] - 2 and 2 <= c + dc < H.shape[1] - 2): break
            r, c = r + dr, c + dc
        res = (r, c, float(H[r, c]))
    CACHE[k] = res
    return res


def prominencia(M, p, ventana):
    """devuelve (L, r_col, c_col, mascara_zona, origen) o None si la zona toca el borde sin encontrar nada más alto"""
    s = cima_en_malla(M, p)
    if not s: return None
    r, c, hs = s
    H = M['h']
    r0, r1 = max(0, r - ventana), min(H.shape[0], r + ventana + 1)
    c0, c1 = max(0, c - ventana), min(H.shape[1], c + ventana + 1)
    W = np.nan_to_num(H[r0:r1, c0:c1], nan=-1)
    rr, cc = r - r0, c - c0
    borde_malla = (r0 == 0, r1 == H.shape[0], c0 == 0, c1 == H.shape[1])

    # terreno que cuenta como «más alto»: fuera de 250 m alrededor de la cima (el relieve de 30 m tiene jorobas falsas junto a las cumbres)
    # y fuera de la cima de las vecinas que oficialmente son más bajas (el relieve a veces las pone más altas)
    paso_m = M['m']['step'] * 111000
    yy, xx = np.mgrid[0:W.shape[0], 0:W.shape[1]]
    valido = (W > hs + 0.05) & (np.hypot((yy - rr), (xx - cc) * math.cos(math.radians(42.7))) * paso_m > 250)
    for q in picos:
        if q['altitud'] >= p['altitud'] or q['id'] == p['id']: continue
        sq = cima_en_malla(M, q)
        if not sq: continue
        qy, qx = sq[0] - r0, sq[1] - c0
        if 0 <= qy < W.shape[0] and 0 <= qx < W.shape[1]:
            k = max(1, int(round(90 / paso_m)))
            valido[max(0, qy - k):qy + k + 1, max(0, qx - k):qx + k + 1] = False
    for q in picos:   # pero la cima de las más altas siempre cuenta (en la malla de 150 m una vecina baja tapaba el Aneto)
        if q['altitud'] <= p['altitud']: continue
        sq = cima_en_malla(M, q)
        if sq and 0 <= sq[0] - r0 < W.shape[0] and 0 <= sq[1] - c0 < W.shape[1] and W[sq[0] - r0, sq[1] - c0] > hs + 0.05:
            valido[sq[0] - r0, sq[1] - c0] = True

    def zona(L):
        lab, _ = ndimage.label(W >= L, structure=OCHO)
        return lab == lab[rr, cc]

    def escapa(L):
        z = zona(L)
        if np.any(valido[z]): return True
        toca = (z[0].any() and not borde_malla[0]) or (z[-1].any() and not borde_malla[1]) or (z[:, 0].any() and not borde_malla[2]) or (z[:, -1].any() and not borde_malla[3])
        return None if toca else False   # None: la zona sale de la ventana sin hallar nada más alto

    lo, hi = float(np.nanmin(W[W > 0])), hs   # en lo escapa (o sale), en hi no
    e = escapa(lo)
    if e is not True: return ('sin_mas_alto' if e is False else 'borde', hs, borde_malla)
    while hi - lo > 0.5:
        mid = (lo + hi) / 2
        e = escapa(mid)
        if e is None: return ('borde', hs, borde_malla)
        if e: lo = mid
        else: hi = mid
    L = lo
    arriba = zona(hi)                  # la zona de la cima justo antes de unirse
    z = zona(L)
    # collado: donde la zona de la cima toca la parte (de la zona unida) que lleva a terreno más alto
    resto, _ = ndimage.label(z & ~arriba, structure=OCHO)
    ids_altos = np.unique(resto[valido & z & ~arriba]); ids_altos = ids_altos[ids_altos > 0]
    vecina = ndimage.binary_dilation(arriba, structure=OCHO) & np.isin(resto, ids_altos)
    ys, xs = np.nonzero(vecina)
    if len(ys):
        j = np.argmax(W[ys, xs]); rc, ccol = ys[j] + r0, xs[j] + c0
    else:
        rc, ccol = r, c
    # puntos más altos que la cima dentro de la zona unida (para la cima madre)
    ys, xs = np.nonzero(z & valido)
    altos = [lonlat(M, y + r0, x + c0) for y, x in zip(ys[::7], xs[::7])]
    return ('ok', L, hs, lonlat(M, rc, ccol), altos, z, (r0, c0))


def dist(a, b):
    return math.hypot((a[0] - b[0]) * 111.32 * math.cos(math.radians(42.7)), (a[1] - b[1]) * 111.32)


def calcula(p):
    M = MALLAS[0]; sp = cima_en_malla(M, p)
    if sp:
        d0 = dist((p['lon'], p['lat']), lonlat(M, sp[0], sp[1]))
        for q in picos:
            if q['id'] == p['id'] or q['altitud'] < p['altitud']: continue
            sq = cima_en_malla(M, q)
            if sq and sq[:2] == sp[:2]:
                return dict(id=p['id'], prom=None, nota='no se distingue', con=q['id'], malla=M['nombre'])
    for M in MALLAS:
        for ventana in ((400, 1200) if M is MALLAS[0] else (400, 4000)):
            res = prominencia(M, p, ventana)
            if res is None: break
            if res[0] == 'ok':
                _, L, hs, col, altos, z, (r0, c0) = res
                # cima madre: tresmil más alto (altitud oficial) dentro de la zona unida, el más cercano
                madre = None
                for fase in (0, 1, 2):   # 0: tresmil principal más alto en el relieve; 1: cualquier cima más alta en el relieve; 2: más alta por altitud oficial
                    for q in CANDIDATAS:
                        if q['id'] == p['id']: continue
                        if fase == 0 and (q['id'] is None or q.get('clase') != 'principal'): continue
                        if q['id'] is None and any(dist((q['lon'], q['lat']), (t['lon'], t['lat'])) < 0.08 for t in picos): continue   # ya está como tresmil
                        if fase < 2:
                            if q['altitud'] <= p['altitud']: continue
                            sq = cima_en_malla(M, q)
                            if not sq or sq[2] <= hs + 0.05: continue
                            rq, cq = sq[0] - r0, sq[1] - c0
                        else:
                            if q['altitud'] <= p['altitud']: continue
                            rq, cq = celda(M, q['lon'], q['lat']); rq, cq = int(round(rq)) - r0, int(round(cq)) - c0
                        if 0 <= rq < z.shape[0] and 0 <= cq < z.shape[1] and z[max(0, rq - 1):rq + 2, max(0, cq - 1):cq + 2].any():
                            d = dist((p['lon'], p['lat']), (q['lon'], q['lat']))
                            if madre is None or d < madre[1]: madre = (q, d)
                    if madre: break
                if p['altitud'] - L < 0: return dict(id=p['id'], prom=None, nota='no se distingue', con=madre[0]['id'] if madre else None, malla=M['nombre'])
                return dict(id=p['id'], prom=round(p['altitud'] - L), col=round(L), colLon=round(col[0], 5), colLat=round(col[1], 5),
                            cimaMalla=round(hs, 1), madre=madre[0]['id'] if madre else None, madreNombre=madre[0]['nombre'] if madre else None, madreAlt=madre[0]['altitud'] if madre else None, madreKm=round(madre[1], 2) if madre else None,
                            masAltoKm=round(min(dist((p['lon'], p['lat']), a) for a in altos), 2) if altos else None, malla=M['nombre'])
            if res[0] == 'sin_mas_alto' and M is MALLAS[-1]:
                return dict(id=p['id'], prom=None, nota='la más alta de la malla', malla=M['nombre'])
            if res[0] == 'sin_mas_alto' and not any(res[2]):
                return dict(id=p['id'], prom=None, nota='la más alta de la zona', malla=M['nombre'])
            if res[0] == 'borde' and ventana >= 1200: break
    return dict(id=p['id'], prom=None, nota='sin resultado')


if __name__ == '__main__':
    ids = set(sys.argv[1:])
    sal = os.path.join(AQUI, 'datos', 'prominencia.json')
    previo = {x['id']: x for x in json.load(open(sal))} if os.path.exists(sal) and ids else {}
    for p in picos:
        if ids and p['id'] not in ids: continue
        r = calcula(p); previo[p['id']] = r
        print(p['id'], p['altitud'], r.get('prom'), r.get('col'), r.get('madre') or r.get('madreNombre'), r.get('nota', ''), r.get('malla'), flush=True)
    json.dump([previo[p['id']] for p in picos if p['id'] in previo], open(sal, 'w'), ensure_ascii=False, indent=0)
