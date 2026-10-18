#!/usr/bin/env python3
"""Genera los fotogramas PNG de la introducción con tools/intro/render.html (servidor local en :8765).
Uso: render.py SALIDA_DIR [fps=24] [t1 t2 ...]   (sin tiempos: todos los fotogramas de 0 a 13,5 s)"""
import sys, os, time
from playwright.sync_api import sync_playwright
out = sys.argv[1]; fps = int(sys.argv[2]) if len(sys.argv) > 2 else 24
ts = [float(x) for x in sys.argv[3:]] or [i / fps for i in range(int(13.5 * fps) + 1)]
os.makedirs(out, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={'width': 1280, 'height': 720}); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type in ('error',) else None); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:8765/tools/intro/render.html'); pg.wait_for_function('window.__ok', timeout=120000)
    for n, t in enumerate(ts):
        pg.evaluate(f'setT({t})'); t0 = time.time()
        while not pg.evaluate('listo()'):
            pg.wait_for_timeout(120)
            if time.time() - t0 > 90: print('timeout carga', t); break
        pg.evaluate('draw()')
        name = f'{out}/f{n:04d}.png' if len(sys.argv) <= 3 else f'{out}/t{t:05.2f}.png'
        pg.locator('#gl').screenshot(path=name)
        if n % 24 == 0: print(n, len(ts), errs[:2], flush=True)
    print('errores:', errs[:5]); b.close()
