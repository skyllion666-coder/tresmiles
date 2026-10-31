#!/bin/bash
# Baja las trazas GPS públicas de OpenStreetMap de cada zona del mapa de calor (api/0.6/trackpoints, 5.000 puntos por página) a tools/datos/calor/<zona>_<página>.gpx.
# Las zonas están en tools/calor_zonas.json (no se solapan: si no, una traza contaría dos veces). Se puede reanudar: salta las páginas ya bajadas enteras.
# Uso: tools/bajar_calor.sh [zona ...]   (sin zonas: todas, en el orden del archivo)
ZJ="$(cd "$(dirname "$0")" && pwd)/calor_zonas.json"
cd "$(dirname "$0")/datos/calor" || exit 1
zonas=("$@"); [ ${#zonas[@]} -eq 0 ] && mapfile -t zonas < <(python3 -c "import json;print('\n'.join(json.load(open('$ZJ'))))")
for z in "${zonas[@]}"; do
  bb=$(python3 -c "import json;print(','.join(str(v) for v in json.load(open('$ZJ'))['$z']))")
  for p in $(seq 0 3000); do
    [ -s "${z}_$p.gpx" ] && [ "$(grep -c '<trkpt' "${z}_$p.gpx")" -eq 5000 ] && continue
    [ -s "${z}_$p.gpx" ] && [ "$(grep -c '<trkpt' "${z}_$p.gpx")" -lt 5000 ] && grep -q '</gpx>' "${z}_$p.gpx" && break   # zona ya terminada
    curl -s -m 180 --retry 4 -A "tresmiles/1.0 (proyecto educativo)" -o "${z}_$p.gpx" "https://api.openstreetmap.org/api/0.6/trackpoints?bbox=$bb&page=$p"
    n=$(grep -c "<trkpt" "${z}_$p.gpx"); echo "$z pág $p: $n"
    [ "$n" -lt 5000 ] && break; sleep 1
  done
done
