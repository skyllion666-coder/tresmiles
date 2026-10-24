#!/bin/bash
# Hace la cima <id> con Blender (tools/modelos/cima_<id>.py), la comprime con meshopt en models/cima-<id>.glb y deja una vista en <dir>/<id>.png.
# Uso: tools/modelos/hacer_cima.sh <id> [dir de trabajo]   (después: python3 tools/modelos/registra_cima.py <id> ...)
set -e
cd "$(dirname "$0")/../.."
ID=$1; D=${2:-/tmp/cimas}; mkdir -p "$D"
blender -b --python tools/modelos/cima_${ID//-/_}.py -- "$D/cima-$ID.glb" "$D/$ID.png" 2>&1 | grep -E "^OK|Error|Traceback|line [0-9]+" || true
test -f "$D/cima-$ID.glb"
npx -y @gltf-transform/cli@4 meshopt "$D/cima-$ID.glb" "models/cima-$ID.glb" --level medium 2>&1 | tail -1
