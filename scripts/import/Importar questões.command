#!/bin/bash
# Duplo-clique para importar o compilado de questões para o Supabase.
cd "$(dirname "$0")"
echo "============================================================"
echo " MedMaestro — Importação do compilado (Banco de questões TEMI)"
echo "============================================================"
python3 import_questions.py
echo ""
echo "Pressione ENTER para fechar esta janela."
read _
