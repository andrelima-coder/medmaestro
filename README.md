# MedMaestro — Projeto Modular v2

Conjunto de skills e workflows do **Antigravity** alinhado ao **schema real**
do banco `medmaestro` (Supabase project_id `ibavtxzlejizsbtztyvl`).

## O que mudou da v1 para a v2

Esta v2 foi reescrita após inspeção direta do banco em produção, que revelou
um schema diferente (e mais elegante) do projetado anteriormente. Veja
`MIGRACAO_GUIA.md` para o diff completo.

Principais alinhamentos:

- Tabela `exams` (não `batches`) com chave `(board_id, specialty_id, year, booklet_color)`
- Coluna `stem` (não `statement`) + `stem_html` + `stem_tsv` (full-text)
- Coluna `alternatives` JSONB único (não 5 colunas A-E)
- Tabela `answer_keys` separada — gabarito propaga via trigger `sync_correct_answers()`
- `extraction_confidence` smallint **0-100** (não float)
- `extraction_method` text (cobre o antigo `precisa_vision`)
- `question_images` com `full_page_path` + `cropped_path` opcional + `use_cropped` flag
- Sistema de tags `taxonomies` + `tags` + `question_tags` (multi-dimensão, hierárquico)
- Múltiplos `question_comments` por questão (5 tipos via enum `comment_type`)
- `question_variations` (não `generated_questions`) com workflow de promoção
- `simulados` (não `mock_exams`) com `filters_used` JSONB
- `flashcards` com SRS (Spaced Repetition System)
- `api_usage` rastreia prompt caching (cache_creation/read tokens)

## Estrutura

```
projeto_modular_v2/
├── AGENTS.md                       # Manifest do projeto (lido a cada sessão)
├── MIGRACAO_GUIA.md                # Diff v1 → v2
├── README.md                       # Este arquivo
├── requirements.txt                # Deps Python para os scripts
├── .gitignore
├── .agents/
│   ├── skills/
│   │   ├── temi-question-extractor/   # WF01 — extração 3 estágios
│   │   ├── temi-question-classifier/  # WF02 — tags multi-dimensão
│   │   ├── temi-question-commenter/   # WF03 — comentários multi-tipo
│   │   ├── temi-question-generator/   # WF04 — variações + promoção
│   │   ├── temi-mock-exam-builder/    # Simulados Pareto
│   │   ├── temi-export/                # PDF/DOCX
│   │   └── medmaestro-frontend-component/  # Design system Next.js
│   └── workflows/
│       ├── processar_novo_caderno.md       # Pipeline de ingestão
│       └── pipeline_pos_extracao.md        # Classify → Comment → Review → Publish
├── docs/                                    # Documentação adicional
└── extracao/
    ├── cadernos/                            # Coloque os PDFs aqui
    └── output/                              # Saídas dos estágios
```

## Como usar no Antigravity

1. **Substitua** o `AGENTS.md` antigo pelo desta v2 (na raiz do seu projeto Next.js).
2. **Substitua** a pasta `.agents/` pela desta v2.
3. **Mantenha** o `extracao/` com seus PDFs/JPEGs onde está.
4. Inicie uma nova sessão no Antigravity. O AGENTS.md será lido automaticamente.
5. Para invocar uma skill, fale naturalmente: *"extraia o caderno 2026"* ou
   *"rode o pipeline pós-extração para o exam X"*.

## Setup do ambiente Python (para Estágio 3)

```bash
# Da raiz do projeto:
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Configure as envs:
export SUPABASE_URL=https://ibavtxzlejizsbtztyvl.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<service_role_key>  # service role, server-side only
export ANTHROPIC_API_KEY=<sua_chave>
```

⚠️ **Nunca commite** o `.env` ou exporte `SERVICE_ROLE_KEY` para o frontend.

## Estado atual (snapshot do banco)

- 18 migrations aplicadas (última: `005_api_usage`)
- **180 questões** + 90 answer_keys + 35 question_images + 50 question_comments + 332 question_tags + 701 audit_logs
- 3 exams cadastrados (TEMI 2024 amarelo, 2025 rosa, 2026 rosa)
- TEMI 2024 amarelo: pipeline rodando agora (status `classifying`, fase `commenting` 48/90)
- TEMI 2025/2026 rosa: status `error` — pendente investigação

Ver detalhes em `AGENTS.md`.

## Próximos passos sugeridos

1. **Investigar bug Auth** ("login is not defined") — alerta vermelho no dashboard
2. **Investigar TEMI 2025 rosa em status `error`** — 90 questões parciais
3. **Implementar API Routes** Next.js para WF02/WF03/WF04 (substituem o n8n descartado)
4. **Popular dimensões `habilidade` e `topico_edital`** em tags (atualmente vazias)
