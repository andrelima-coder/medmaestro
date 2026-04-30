# Extrator universal de provas

Sistema modular de extração de questões e gabaritos de PDFs de provas médicas.

```
extrator/
├── core/
│   ├── types.ts          # Interface BancaParser, GabaritoResult
│   ├── text-first.ts     # Extração textual (pdftotext) parametrizada por banca
│   ├── pipeline.ts       # Pipeline completo: text-first → Vision → recovery → classify → comments
│   └── index.ts
├── bancas/
│   ├── amib_temi.ts      # AMIB / TEMI (4 versões coloridas)
│   ├── generico.ts       # Fallback heurístico (qualquer banca)
│   ├── registry.ts       # Auto-detecção pelo texto do PDF
│   └── index.ts
└── gabarito/
    └── run.ts            # Orchestração do parse + persistência (Supabase)
```

## Adicionar uma nova banca

1. Crie `bancas/<slug>.ts` exportando `BancaParser`:
   ```ts
   import type { BancaParser, GabaritoResult } from '../core/types'
   export const bancaMinha: BancaParser = {
     id: 'minha_banca',
     nome: 'Minha Banca',
     versoesConhecidas: [],
     vocabImagens: ['ecg','radiografia','outro'],
     detectar: (text) => /MINHA BANCA/i.test(text) ? 0.9 : 0,
     detectarVersao: () => null,
     regexQuestao: () => /(?:^|\n)\s*Quest[ãa]o\s+(\d+)/gi,
     regexAlternativa: () => /(^|\n)\s*([A-E])[\s.\)\-:]+/g,
     promptVision: () => `...`,
     parseGabarito: (text): GabaritoResult => ({ byVersion: {}, alteracoes: [], raw: text }),
   }
   ```
2. Registre em `bancas/registry.ts` no array `BANCAS`.
3. Reexporte em `bancas/index.ts`.

O `registry.detectarBanca(text)` retorna o plugin com maior `score`. `generico` é o fallback (sempre 0.1).

## Banco

`exams.extractor_id` (text) controla qual plugin é usado por prova. NULL = auto-detectar no próximo run (resultado fica gravado).

## Compat layer

Os arquivos antigos `lib/extraction/pipeline.ts`, `lib/extraction/text-first.ts`, `lib/gabarito/run.ts` e `lib/gabarito/parser.ts` foram convertidos em **shims** que re-exportam do `extrator/`. Rotas API (`/api/extract`, `/api/parse-gabarito`) e server actions continuam funcionando sem alteração.
