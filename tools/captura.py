#!/usr/bin/env python3
"""Capturas de la web (o de las vistas de tools/) con Firefox en una pantalla virtual, para revisar cambios sin abrir el navegador a mano.
En este equipo Chromium y Firefox sin pantalla (headless) se cuelgan al crear un contexto WebGL; con Xvfb, Firefox usa el render por software de Mesa y funciona.
Uso (con tools/serve.sh en marcha):
  xvfb-run -a -s "-screen 0 1280x800x24" python3 tools/captura.py nombre=URL [nombre2=URL2 ...]
Espera hasta 90 s a que el título de la página sea «ok» (las vistas lo ponen al terminar) o, si no lo pone nunca, hace la captura al acabar el plazo.
Guarda /tmp/captura/<nombre>.png. Variables: ANCHO, ALTO (por defecto 1200 × 640), ESPERA (s, por defecto 90)."""
import json, os, subprocess, sys, time, base64, urllib.request
ANCHO, ALTO, ESPERA = int(os.environ.get('ANCHO', 1200)), int(os.environ.get('ALTO', 640)), int(os.environ.get('ESPERA', 90))
OUT = '/tmp/captura'; os.makedirs(OUT, exist_ok=True)
def req(metodo, ruta, cuerpo=None):
    r = urllib.request.Request('http://127.0.0.1:4444' + ruta, method=metodo, data=None if cuerpo is None else json.dumps(cuerpo).encode(), headers={'Content-Type': 'application/json'})
    return json.loads(urllib.request.urlopen(r, timeout=60).read())['value']
gd = subprocess.Popen(['geckodriver', '--port', '4444'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(2)
try:
    # pageLoadStrategy «none»: los módulos con await en el nivel superior retrasan el evento load
    s = req('POST', '/session', {'capabilities': {'alwaysMatch': {'pageLoadStrategy': 'none', 'moz:firefoxOptions': {'args': [f'-width={ANCHO}', f'-height={ALTO}'], 'prefs': {'webgl.force-enabled': True}}}}})['sessionId']
    req('POST', f'/session/{s}/window/rect', {'width': ANCHO, 'height': ALTO})
    for nombre, url in (a.split('=', 1) for a in sys.argv[1:]):
        req('POST', f'/session/{s}/url', {'url': url}); t0 = time.time()
        while time.time() - t0 < ESPERA and req('GET', f'/session/{s}/title') != 'ok': time.sleep(2)
        open(f'{OUT}/{nombre}.png', 'wb').write(base64.b64decode(req('GET', f'/session/{s}/screenshot')))
        print(nombre, f'{OUT}/{nombre}.png', round(time.time() - t0), 's', flush=True)
    req('DELETE', f'/session/{s}')
finally:
    gd.kill()
