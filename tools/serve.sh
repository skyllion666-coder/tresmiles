#!/usr/bin/env bash
# Sirve la web en local: http://127.0.0.1:8765/   (Ctrl+C para parar)
# No sirve abrir index.html con doble clic: los módulos ES y fetch() necesitan http.
cd "$(dirname "$0")/.." && exec python3 -m http.server "${1:-8765}" --bind 127.0.0.1
