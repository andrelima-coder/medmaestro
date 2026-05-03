---
name: medmaestro-frontend-component
description: Cria componentes React para o painel admin MedMaestro seguindo o design system Nexus SaaS Dashboard (dark theme, gold accent, Syne+DM Sans). Use quando o usuário pedir para criar componente UI, estilizar com tokens MedMaestro, montar página do admin, criar KPI card, tabela, gráfico Recharts, sidebar, ou qualquer elemento visual do frontend. Garante uso correto dos design tokens e convenções.
---

# Skill — Componentes Frontend MedMaestro

Padroniza criação de componentes React seguindo o design system Nexus
adaptado para a plataforma.

## Quando ativar

- "crie um KPI card de questões processadas"
- "monte a página de detalhe da questão"
- "preciso de uma tabela com filtros para listar batches"
- "estilize esse componente com os tokens do projeto"
- "como faço a sidebar Nexus-style?"

## Stack obrigatória

- Next.js 14+ App Router
- TypeScript strict
- Tailwind CSS (configurado com tokens MedMaestro)
- Radix UI primitives quando necessário (dropdown, dialog, tooltip, popover)
- Lucide React para ícones (consistência com Nexus)
- Recharts para gráficos (com tema dark)

## Tokens — copiar literalmente

### Cores (Tailwind classes)
```
bg-[var(--bg-primary)]      /* #0A0A0A */
bg-[var(--bg-surface)]      /* #111D35 */
bg-[var(--bg-elevated)]     /* #0D1526 */
text-[var(--text-primary)]  /* #E8EDF5 */
text-[var(--text-secondary)] /* #A8B4CC */
text-[var(--text-muted)]    /* #5A6880 */
border-[var(--border-default)]
text-[var(--accent-gold)]   /* #C9A84C */
text-[var(--accent-orange)] /* #FF6B35 */
```

### Spacing & shape
- `rounded-xl` (12px) em cards e containers
- `rounded-lg` (8px) em buttons e inputs
- `rounded-full` em badges e avatars
- Padding interno padrão: `p-6` (cards), `p-4` (small cards), `p-3` (badges)
- Gap entre elementos: `gap-4` (default), `gap-6` (entre seções)

### Tipografia
```
font-[var(--font-heading)]  /* Syne — headings, números grandes */
font-[var(--font-body)]     /* DM Sans — body, labels, tabelas */
```

## Componentes-padrão (referência)

### KPI Card

```tsx
import { TrendingUp, TrendingDown } from 'lucide-react';
import { ReactNode } from 'react';

interface KpiCardProps {
  label: string;
  value: string | number;
  variation?: { value: number; trend: 'up' | 'down' | 'flat' };
  icon?: ReactNode;
}

export function KpiCard({ label, value, variation, icon }: KpiCardProps) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)]
                    rounded-xl p-6 hover:border-[var(--border-hover)] transition">
      <div className="flex items-start justify-between mb-4">
        <span className="text-[var(--text-muted)] text-xs uppercase
                         tracking-wider font-[var(--font-body)]">
          {label}
        </span>
        {icon && <span className="text-[var(--text-secondary)]">{icon}</span>}
      </div>
      <div className="text-4xl font-[var(--font-heading)] font-bold
                      text-[var(--text-primary)]">
        {value}
      </div>
      {variation && (
        <div className={`mt-2 inline-flex items-center gap-1 text-xs
                         ${variation.trend === 'up'
                           ? 'text-[var(--color-success)]'
                           : variation.trend === 'down'
                             ? 'text-[var(--color-danger)]'
                             : 'text-[var(--text-muted)]'}`}>
          {variation.trend === 'up' ? <TrendingUp size={12} /> :
           variation.trend === 'down' ? <TrendingDown size={12} /> : null}
          {variation.value > 0 ? '+' : ''}{variation.value}%
        </div>
      )}
    </div>
  );
}
```

### Status Badge

```tsx
const STATUS_STYLES = {
  publicada: 'bg-[var(--color-success)]/15 text-[var(--color-success)] border-[var(--color-success)]/30',
  pendente: 'bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] border-[var(--accent-gold)]/30',
  erro: 'bg-[var(--color-danger)]/15 text-[var(--color-danger)] border-[var(--color-danger)]/30',
  rascunho: 'bg-white/5 text-[var(--text-muted)] border-white/10',
} as const;

const STATUS_LABELS = {
  publicada: 'Publicada',
  pendente: 'Pendente',
  erro: 'Erro',
  rascunho: 'Rascunho',
} as const;

export function StatusBadge({ status }: { status: keyof typeof STATUS_STYLES }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px]
                      font-[var(--font-body)] font-medium border ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
```

### Data Table com header sticky

Use `<table>` semântico, não divs. Convenção:
- `thead` em `text-[var(--text-muted)]` uppercase 11px
- `tbody tr` com `hover:bg-[var(--bg-elevated)]` e `border-b border-[var(--border-default)]`
- Pagination embaixo com botões "Anterior/Próxima" e dropdown de items per page
- Loading state com skeleton (shimmer cinza-claro a cinza-escuro)

### Chart Card

```tsx
<div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-6">
  <div className="flex items-center justify-between mb-6">
    <div>
      <h3 className="text-[var(--text-primary)] font-[var(--font-heading)]
                     font-semibold text-lg">
        Distribuição por Módulo
      </h3>
      <p className="text-[var(--text-muted)] text-xs mt-1">
        Pareto histórico das provas 2020-2025
      </p>
    </div>
    <div className="flex gap-2">
      {/* Filter, Sort, Export buttons */}
    </div>
  </div>
  <ResponsiveContainer width="100%" height={300}>
    {/* Recharts */}
  </ResponsiveContainer>
</div>
```

### Recharts — tema dark

Sempre passar essas props para componentes Recharts:

```tsx
<CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" />
<XAxis stroke="var(--text-muted)" fontSize={11} />
<YAxis stroke="var(--text-muted)" fontSize={11} />
<Tooltip
  contentStyle={{
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
  }}
/>
```

Cores dos data points usam `--chart-1` até `--chart-6` em ordem.

## Convenções obrigatórias

1. **Server Component por padrão.** Adicione `'use client'` só se usar
   hooks (useState, useEffect, useQuery, etc.).
2. **Props tipadas com interface.** Sem `any`, sem `as` casts evitáveis.
3. **i18n em PT-BR via `lib/utils/constants.ts`** — nunca hardcodar string
   visível ao usuário.
4. **Acessibilidade**: `aria-label` em ícones-button, `role` semântico em
   custom widgets, contraste AA mínimo (já garantido pelos tokens).
5. **Loading + Empty + Error states** em qualquer componente que busca dados.
6. **Skeleton loaders** com shimmer animado durante loading (não spinner).

## Estrutura de arquivos

```
components/
├── ui/                    # Atomic — Button, Input, Select, Card, Badge
├── layout/                # Sidebar, Header, PageTitle
├── dashboard/             # KpiCard, ModuleChart, YearChart, PipelineStatus
├── questions/             # QuestionCard, QuestionDetail, FilterBar
├── batches/               # BatchTable, BatchUploadForm, ProgressBar
└── charts/                # Recharts wrappers tematizados
```

## Anti-padrões

- ❌ Hardcoda cores hex (`#0A0A0A`) — sempre `var(--bg-primary)`
- ❌ Cria classe Tailwind customizada — use as do tema (ex.: `bg-[var(--bg-primary)]`, `bg-[var(--accent-gold)]`)
- ❌ Mistura `font-sans` com Syne — atribua a font certa por elemento
- ❌ Esquece `'use client'` quando precisa de useState
- ❌ Componente sem prop tipada (`...props: any`)
- ❌ String visível hardcoded no JSX (use constants)
- ❌ Layout sem hierarquia (h1 → h2 → h3)
- ❌ Spinner em vez de skeleton durante loading
