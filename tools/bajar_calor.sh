#!/bin/bash
# Baja las trazas GPS públicas de OpenStreetMap de cada zona del mapa de calor (api/0.6/trackpoints, 5.000 puntos por página) a tools/datos/calor/<zona>_<página>.gpx.
# Las zonas no se solapan (si no, una traza contaría dos veces). Uso: tools/bajar_calor.sh [zona ...]
cd "$(dirname "$0")/datos/calor" || exit 1
declare -A Z=( [aneto]="0.55,42.58,0.76,42.72" [benasque]="0.40,42.55,0.55,42.74" [posets]="0.25,42.55,0.40,42.75" [perdido-e]="0.05,42.60,0.25,42.76" [perdido-o]="-0.06,42.60,0.05,42.76" [vignemale]="-0.18,42.64,-0.06,42.82" [balaitus]="-0.38,42.72,-0.18,42.88" )
for z in "${@:-${!Z[@]}}"; do
  for p in $(seq 0 3000); do
    [ -s "${z}_$p.gpx" ] && [ "$(grep -c '<trkpt' "${z}_$p.gpx")" -eq 5000 ] && continue   # ya bajada (se puede reanudar)
    curl -s -m 180 --retry 4 -A "tresmiles/1.0 (proyecto educativo)" -o "${z}_$p.gpx" "https://api.openstreetmap.org/api/0.6/trackpoints?bbox=${Z[$z]}&page=$p"
    n=$(grep -c "<trkpt" "${z}_$p.gpx"); echo "$z pág $p: $n"
    [ "$n" -lt 5000 ] && break; sleep 1
  done
done
