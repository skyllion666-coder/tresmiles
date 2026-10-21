#!/usr/bin/env bash
# Publica la web en Cloudflare Pages (subida directa, sin pasar por GitHub).
# Primera vez: `npx wrangler login` (abre el navegador; lo hace el usuario con su cuenta de Cloudflare).
# Uso: tools/publicar_cloudflare.sh [nombre-del-proyecto]     → https://<nombre>.pages.dev   (por defecto «tresmiles»; p. ej. «montanas-aragonesas»)
# Copia a /tmp/tresmiles-dist solo lo que necesita la web (sin tools/, analisis/, notas ni .git) y la sube. Límites de Pages (gratis): 20.000 archivos y 25 MB por archivo; hoy ≈1.500 archivos y el mayor ≈4,5 MB.
set -euo pipefail
cd "$(dirname "$0")/.."
NOMBRE="${1:-tresmiles}"; DIST=/tmp/tresmiles-dist
rm -rf "$DIST"; mkdir -p "$DIST"
rsync -a --exclude='.git' --exclude='tools' --exclude='analisis' --exclude='NOTAS.md' --exclude='README.md' --exclude='__pycache__' --exclude='data/rutas/local' --exclude='*.gpx' ./ "$DIST"/
echo "Archivos: $(find "$DIST" -type f | wc -l); tamaño: $(du -sh "$DIST" | cut -f1)"
npx --yes wrangler@3 pages deploy "$DIST" --project-name="$NOMBRE" --branch=main --commit-dirty=true
