#!/usr/bin/env bash
# Monta GESTAO-FRAGRANCIAS.html a partir das partes em app/.
#
# O sistema é um arquivo HTML único, de propósito: abre com duplo clique,
# sem servidor, sem instalação, sem passo de build para quem usa. Mas 500 KB
# num arquivo só é impossível de manter, então o código-fonte fica dividido
# em oito partes e este script apenas concatena, na ordem.
#
#   ./scripts/build.sh
set -euo pipefail
cd "$(dirname "$0")/.."

PARTES=(app/part1.html app/part2.js app/part3.js app/part4.js
        app/part5.js app/part6.js app/part7.js app/part8.js)

for f in "${PARTES[@]}"; do
  [ -f "$f" ] || { echo "✗ arquivo ausente: $f" >&2; exit 1; }
done

cat "${PARTES[@]}" > GESTAO-FRAGRANCIAS.html

# Carimbo de versão. Sem isso não dá para saber, olhando a tela, se a cópia
# aberta é a mais nova — e cópia velha aberta por engano já custou caro.
VERSAO="$(date +%Y.%m.%d).$(date +%H%M)"
if command -v perl >/dev/null 2>&1; then
  perl -pi -e "s/__VERSAO__/$VERSAO/g" GESTAO-FRAGRANCIAS.html
else
  sed -i.bak "s/__VERSAO__/$VERSAO/g" GESTAO-FRAGRANCIAS.html && rm -f GESTAO-FRAGRANCIAS.html.bak
fi
echo "✓ GESTAO-FRAGRANCIAS.html gerado ($(wc -c < GESTAO-FRAGRANCIAS.html) bytes) · versão $VERSAO"

# public/index.html é o que a Vercel publica. Mesmo arquivo, outro nome:
# na web o navegador procura index.html; no computador o nome descritivo ajuda.
mkdir -p public
cp GESTAO-FRAGRANCIAS.html public/index.html
echo "✓ public/index.html atualizado (é o que vai para o ar)"

# Conferência de sintaxe: o navegador só reclamaria depois de abrir.
if command -v node >/dev/null 2>&1; then
  node -e '
    const fs = require("fs");
    const s = fs.readFileSync("GESTAO-FRAGRANCIAS.html", "utf8");
    const i = s.indexOf("<script>\n/* ═"), j = s.lastIndexOf("</script>");
    try { new Function(s.slice(i + 8, j)); console.log("✓ sintaxe do JavaScript conferida"); }
    catch (e) { console.error("✗ erro de sintaxe: " + e.message); process.exit(1); }
  '
fi

# Nenhuma credencial pode entrar no arquivo publicado.
if grep -qiE "service_role|sb_secret_|encrypted_password" GESTAO-FRAGRANCIAS.html; then
  echo "✗ credencial encontrada no arquivo gerado — corrija antes de publicar" >&2
  exit 1
fi
echo "✓ nenhuma credencial no arquivo gerado"
