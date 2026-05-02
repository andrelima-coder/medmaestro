# Workflow — Processar Novo Caderno TEMI

> Roteiro executável passo-a-passo. Invoque dizendo:
> *"Rode o workflow `processar_novo_caderno` para o caderno X."*

## Pré-condições

- [ ] Caderno está em `extracao/cadernos/<nome>.pdf`
- [ ] `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no `.env.local`
- [ ] `ANTHROPIC_API_KEY` no `.env.local`
- [ ] `exam_boards` contém AMIB (slug `'amib'`) e `specialties` contém Medicina Intensiva (`'medicina-intensiva'`)
- [ ] Bucket `question-images` existe (script cria automaticamente)
- [ ] Há gabarito disponível (na última página do PDF ou em `.docx` separado)

## Etapas

### 1. Indexação (Estágio 1) — Python local, custo zero

```bash
python .agents/skills/temi-question-extractor/scripts/stage1_indexacao.py \
    --caderno extracao/cadernos/<nome>.pdf \
    --gabarito extracao/cadernos/<nome>_gabarito.docx \
    --output extracao/output/<nome>_stage1.json
```

**Gate de qualidade — validar antes de prosseguir:**
- Total de questões bate com esperado (90 para TEMI)?
- Formato detectado correto (A para 2021/2024/2025-rosa, B para 2020/2023, C para 2022)?
- `pct_alternativas_completas` ≥ 50%?

Se algo está fora do padrão, **pare** e investigue antes do Estágio 2.

### 2. Estimar custo do Estágio 2

Pegar `precisa_vision = true` count → multiplicar por ~$0.01. Se passar de
$5, pedir confirmação ao usuário antes de continuar.

### 3. Calibração com amostra (5 questões)

```bash
python .agents/skills/temi-question-extractor/scripts/stage2_vision.py \
    --input extracao/output/<nome>_stage1.json \
    --sample 5 \
    --output extracao/output/<nome>_amostra.json
```

Validar manualmente os 5 outputs:
- Enunciado faz sentido clínico?
- Alternativas estão completas e na ordem certa (A B C D)?
- Bbox da imagem cobre a região correta?
- Confidence ≥ 0.85?

Se OK, processar tudo:

```bash
python .agents/skills/temi-question-extractor/scripts/stage2_vision.py \
    --input extracao/output/<nome>_stage1.json \
    --output extracao/output/<nome>_completo.json
```

### 4. Métricas de qualidade — gate obrigatório

```bash
python .agents/skills/temi-question-extractor/scripts/metricas.py \
    --input extracao/output/<nome>_completo.json
```

**Gates:**
- `pct_alternativas_completas` ≥ 90%
- `pct_match_gabarito` ≥ 95%
- `pct_confidence_>=85` ≥ 80%

Abaixo: revisar prompts ou regex. Não prossiga.

### 5. Persistência — Estágio 3 com schema real

⚠️ **Pedir confirmação explícita ao usuário antes desta etapa.**

**Dry-run primeiro** (zero rede, mostra plano completo):

```bash
python .agents/skills/temi-question-extractor/scripts/stage3_persistencia.py \
    --input extracao/output/<nome>_completo.json \
    --caderno-extracted extracao/work/<nome>/ \
    --year 2024 --booklet-color amarelo \
    --dry-run
```

O dry-run imprime cada operação que seria feita. Inclui:
- Resolução de `board_id` e `specialty_id` por slug
- Criação ou reúso de `exam`
- Para cada questão: upsert em `questions`, em `answer_keys` e em
  `question_images` com paths corretos do Storage
- Tamanho total dos uploads

Se OK e usuário confirmou:

```bash
python .agents/skills/temi-question-extractor/scripts/stage3_persistencia.py \
    --input ... --caderno-extracted ... \
    --year 2024 --booklet-color amarelo \
    --commit
```

Idempotente: re-rodar com `--commit` não duplica
(`on_conflict (exam_id, question_number)`).

Para calibrar com poucas questões antes do batch completo:

```bash
... --commit --limit 5
```

### 6. Verificação pós-deploy

Via Supabase MCP:

```sql
-- 1. Total de questões inseridas pro exam
SELECT COUNT(*) FROM questions
WHERE exam_id = (
  SELECT id FROM exams
  WHERE year = 2024 AND booklet_color = 'amarelo'
);

-- 2. Confiança e métodos
SELECT
  extraction_method,
  AVG(extraction_confidence) AS avg_conf,
  COUNT(*) AS n
FROM questions
WHERE exam_id = $1
GROUP BY extraction_method;

-- 3. Questões para revisão prioritária
SELECT id, question_number, LEFT(stem, 80) AS stem_preview,
       extraction_confidence, extraction_method
FROM questions
WHERE exam_id = $1 AND extraction_confidence < 85
ORDER BY extraction_confidence ASC;

-- 4. Gabarito presente
SELECT COUNT(*) FROM answer_keys WHERE exam_id = $1;
-- Deve bater com COUNT em questions

-- 5. Status do exam
SELECT status, extraction_progress FROM exams WHERE id = $1;
-- Esperado: status='extracted' e progress phase='done'
```

### 7. Próximos passos no pipeline

Após persistência bem-sucedida, rodar:
- **Workflow `pipeline_pos_extracao`** — classifica + comenta + revisa

### 8. Atualizar AGENTS.md

Mover o caderno na seção "Estado da configuração" de "⏳" para "✅".

## Tempo estimado

- Etapas 1-4 (automáticas): ~30 min para 90 questões
- Etapa 5 (persistência): ~2-5 min (depende de uploads de imagens)
- Etapa 6 (verificação): ~5 min

**Total: ~40 min por caderno.**
