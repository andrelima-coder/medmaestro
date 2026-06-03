#!/bin/bash
# Duplo-clique para importar as IMAGENS do compilado (rode DEPOIS de importar as questões).
cd "$(dirname "$0")"
echo "============================================================"
echo " MedMaestro — Importação das IMAGENS do compilado"
echo "============================================================"
python3 import_images.py
echo ""
echo "Pressione ENTER para fechar esta janela."
read _
