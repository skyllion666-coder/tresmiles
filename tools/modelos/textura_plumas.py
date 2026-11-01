#!/usr/bin/env python3
"""Textura repetible de plumas (escamas solapadas con raquis y barbas) para multiplicar por los colores del modelo.

Gris claro (media ~0,9): solo da relieve de plumaje, el color lo ponen los vértices.
Uso: python3 tools/modelos/textura_plumas.py tools/modelos/plumas.png
"""
import sys

import numpy as np
from PIL import Image

N = 256           # lado de la textura (repetible)
FILAS, COLS = 4, 4  # plumas por lado; filas al tresbolillo


def plumas():
    y, x = np.mgrid[0:N, 0:N] / N
    out = np.full((N, N), 0.0)
    cubierta = np.full((N, N), -1.0)  # «profundidad» de la pluma que tapa cada píxel (la de más abajo tapa a la de arriba)
    for fila in range(-1, FILAS + 1):
        for col in range(-1, COLS + 1):
            cx = (col + 0.5 * (fila % 2) + 0.5) / COLS
            cy = (fila + 0.5) / FILAS
            for ox in (-1, 0, 1):          # copias desplazadas: la textura casa por los bordes
                for oy in (-1, 0, 1):
                    dx = (x - cx - ox) * COLS
                    dy = (y - cy - oy) * FILAS
                    # pluma: elipse con la punta redondeada hacia +y (hacia la cola o el borde de fuga)
                    r = np.sqrt((dx / 0.62) ** 2 + (np.clip(dy, None, 0) / 1.05) ** 2 + (np.clip(dy, 0, None) / 0.78) ** 2)
                    dentro = r < 1.0
                    prof = cy + oy + 0.001 * col
                    tapa = dentro & (prof > cubierta)
                    if not tapa.any():
                        continue
                    # tono: más oscuro en la base (tapada), claro hacia la punta; borde fino oscuro; raquis claro; barbas en diagonal
                    t = np.clip((dy + 1.05) / 1.83, 0, 1)
                    tono = 0.72 + 0.26 * t
                    tono -= 0.16 * np.clip((r - 0.86) / 0.14, 0, 1)                         # borde de la pluma
                    raquis = np.exp(-(dx / 0.035) ** 2) * (dy < 0.55)
                    tono += 0.07 * raquis
                    barbas = 0.5 + 0.5 * np.sin((np.abs(dx) * 2.2 - dy) * 34.0)
                    tono -= 0.035 * barbas * (1 - raquis)
                    out = np.where(tapa, tono, out)
                    cubierta = np.where(tapa, prof, cubierta)
    rng = np.random.default_rng(7)
    ruido = rng.normal(0, 0.012, (N, N))
    out = np.clip(out + ruido, 0.55, 1.0)
    out[cubierta < -0.5] = 0.85
    return out


if __name__ == "__main__":
    destino = sys.argv[1] if len(sys.argv) > 1 else "plumas.png"
    g = (plumas() * 255).astype(np.uint8)
    Image.fromarray(np.stack([g, g, g], -1)).save(destino)
    print("textura", destino, g.mean() / 255)
