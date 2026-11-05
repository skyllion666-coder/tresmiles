#!/bin/bash
# Datos que cambian cada día, para ejecutar una vez al día (p. ej. desde cron a las 13:30, cuando ya está el boletín de AEMET y las pasadas de la mañana):
#   - «Nieve ahora»: tools/nieve_ahora.py (Sentinel-2) → data/nieve
#   - peligro de aludes: tools/aludes.py (boletín de AEMET) → data/aludes.json
# Publica (solo esos ficheros) si algo ha cambiado. Registro: ~/tresmiles-fuentes/diario.log
R=~/tresmiles; exec >> ~/tresmiles-fuentes/diario.log 2>&1
echo "$(date '+%F %T') empieza"; cd $R || exit 1
python3 tools/aludes.py || git checkout -- data/aludes.json
nice -n 15 timeout 3000 ~/.venvs/lidar/bin/python tools/nieve_ahora.py 20 | tail -2 || git checkout -- data/nieve
# solo cuenta como cambio una imagen de nieve nueva o un boletín nuevo (no la hora de lectura)
cambio=$(git diff --quiet -- data/nieve || echo nieve; python3 -c "
import json,subprocess
v=json.loads(subprocess.run(['git','show','HEAD:data/aludes.json'],capture_output=True,text=True).stdout or '{}'); n=json.load(open('data/aludes.json'))
for d in (v,n): d.pop('leido',None)
print('aludes' if v!=n else '')")
if [ -z "$(echo $cambio | tr -d ' ')" ]; then echo "sin cambios"; git checkout -- data/nieve data/aludes.json 2>/dev/null; exit 0; fi
git add data/nieve data/aludes.json && git commit -qm "Datos del día ($(date +%F)): $cambio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FYGQb1RPCstTyuSjbogh86" -- data/nieve data/aludes.json && git push -q origin main && echo "$(date '+%F %T') publicado: $cambio"
