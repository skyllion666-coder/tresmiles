#!/bin/bash
# «Nieve ahora»: recalcula data/nieve con las últimas imágenes de Sentinel-2 y, si hay alguna nueva, lo publica (solo esos ficheros).
# Pensado para ejecutarse una vez al día (p. ej. desde cron a las 13:30). Registro: ~/tresmiles-fuentes/nieve.log
R=~/tresmiles; L=~/tresmiles-fuentes/nieve.log; exec >> $L 2>&1
echo "$(date '+%F %T') empieza"
antes=$(python3 -c "import json;print(json.load(open('$R/data/nieve/nieve.json'))['ultima'])" 2>/dev/null)
cd $R && nice -n 15 timeout 3000 ~/.venvs/lidar/bin/python tools/nieve_ahora.py 20 | tail -3 || exit 1
despues=$(python3 -c "import json;print(json.load(open('$R/data/nieve/nieve.json'))['ultima'])")
if [ "$antes" = "$despues" ]; then echo "sin imagen nueva ($despues)"; git -C $R checkout -- data/nieve 2>/dev/null; exit 0; fi
git -C $R add data/nieve && git -C $R commit -qm "Nieve ahora: imagen de satélite del $despues

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FYGQb1RPCstTyuSjbogh86" -- data/nieve && git -C $R push -q origin main && echo "$(date '+%F %T') publicada $despues"
