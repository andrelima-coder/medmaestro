#!/bin/bash
# Duplo-clique para rodar o piloto do Docling na prova TEMI 2025 ROSA.
# 1ª execução: cria ambiente isolado, instala o Docling e baixa modelos (~2-5 GB).
# Execuções seguintes: reutiliza tudo (rápido).
cd "$(dirname "$0")" || exit 1
echo "============================================================"
echo " MedMaestro — Piloto Docling (extração de tabelas/figuras)"
echo "============================================================"

PYBIN="python3"
command -v python3 >/dev/null 2>&1 || { echo "❌ python3 não encontrado. Instale o Python 3 (python.org)."; echo "Pressione ENTER."; read _; exit 1; }

if [ ! -d ".venv" ]; then
  echo "==> Criando ambiente isolado (.venv)..."
  $PYBIN -m venv .venv || { echo "❌ Falha ao criar venv"; echo "Pressione ENTER."; read _; exit 1; }
fi
# shellcheck disable=SC1091
source .venv/bin/activate

echo "==> Instalando Docling (pode demorar na 1ª vez)..."
pip install --quiet --upgrade pip
pip install --quiet docling pypdf || { echo "❌ Falha ao instalar docling"; echo "Pressione ENTER."; read _; exit 1; }

echo "==> Rodando o piloto..."
python pilot.py "$@"

echo ""
echo "Pressione ENTER para fechar."
read _
