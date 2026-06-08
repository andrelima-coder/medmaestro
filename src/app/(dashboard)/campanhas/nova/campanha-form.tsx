'use client'

import { useActionState, useState } from 'react'
import {
  createCampaignAction,
  searchQuestionsAction,
  getQuestionPreviewAction,
  type CampaignState,
  type PickerOptions,
  type QSearchFilter,
  type QSearchResult,
  type QuestionPreview,
} from '../actions'

function buildEmbedSnippet(embedId: string, endpointBase: string, alunoBase: string): string {
  const endpoint = `${endpointBase || ''}/api/public/leads`
  const destino = `${alunoBase || endpointBase || ''}/login`
  return `<form id="mm-lead-form">
  <input name="name" placeholder="Nome" required />
  <input name="email" type="email" placeholder="E-mail" required />
  <input name="whatsapp" placeholder="WhatsApp" required />
  <label><input type="checkbox" name="consent" required /> Aceito os termos (LGPD)</label>
  <input type="text" name="hp" style="display:none" tabindex="-1" autocomplete="off" />
  <button type="submit">Quero fazer o simulado</button>
</form>
<script>
(function(){
  var f=document.getElementById('mm-lead-form');
  f.addEventListener('submit',function(e){
    e.preventDefault();
    var d=new FormData(f);
    fetch('${endpoint}',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        embed_id:'${embedId}',
        name:d.get('name'), email:d.get('email'), whatsapp:d.get('whatsapp'),
        consent:d.get('consent')==='on', consent_version:'v1', hp:d.get('hp')
      })
    }).then(function(r){return r.json()}).then(function(j){
      if(j.lead_id){ window.location.href='${destino}'; }
      else { alert('Não foi possível enviar. Verifique os campos.'); }
    });
  });
})();
</script>`
}

export function CampanhaForm({
  options,
  appUrl,
  alunoUrl = '',
}: {
  options: PickerOptions
  appUrl: string
  alunoUrl?: string
}) {
  const [state, formAction, isPending] = useActionState<CampaignState, FormData>(
    createCampaignAction,
    null
  )
  const [accessMode, setAccessMode] = useState('imediato')

  // ── Seletor de questões ──
  const [moduloTagId, setModuloTagId] = useState('')
  const [specialtyId, setSpecialtyId] = useState('')
  const [examId, setExamId] = useState('')
  const [year, setYear] = useState('')
  const [onlyReady, setOnlyReady] = useState(false)
  const [results, setResults] = useState<QSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [selected, setSelected] = useState<QSearchResult[]>([])
  const [fillN, setFillN] = useState(20)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<Record<string, QuestionPreview | 'loading'>>({})

  async function togglePreview(id: string) {
    if (previewId === id) {
      setPreviewId(null)
      return
    }
    setPreviewId(id)
    if (!previewData[id]) {
      setPreviewData((p) => ({ ...p, [id]: 'loading' }))
      const d = await getQuestionPreviewAction(id)
      setPreviewData((p) => ({
        ...p,
        [id]: d ?? { stem: '', alternatives: {}, correctAnswer: null, comments: [] },
      }))
    }
  }

  const selectedIds = new Set(selected.map((q) => q.id))
  const currentFilter: QSearchFilter = {
    moduloTagId: moduloTagId || null,
    specialtyId: specialtyId || null,
    examId: examId || null,
    year: year ? Number(year) : null,
    onlyReady,
  }

  async function runSearch() {
    setSearching(true)
    try {
      const r = await searchQuestionsAction(currentFilter)
      setResults(r)
      setSearched(true)
    } finally {
      setSearching(false)
    }
  }

  function toggle(q: QSearchResult) {
    setSelected((prev) =>
      prev.some((x) => x.id === q.id) ? prev.filter((x) => x.id !== q.id) : [...prev, q]
    )
  }

  function fillRandom() {
    const pool = results.filter((q) => !selectedIds.has(q.id))
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    const add = pool.slice(0, Math.max(0, fillN))
    setSelected((prev) => [...prev, ...add])
  }

  if (state?.ok && state.embedId) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-bold text-foreground">Campanha criada ✅</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cole este código na landing page externa para captar leads desta campanha.
        </p>
        <pre className="mt-4 max-h-80 overflow-auto rounded-lg bg-background p-4 text-xs text-foreground">
          {buildEmbedSnippet(state.embedId, appUrl, alunoUrl)}
        </pre>
        <p className="mt-2 text-xs text-muted-foreground">
          embed_id: <code>{state.embedId}</code>
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      <Section title="Campanha">
        <Text label="Nome da campanha" name="name" required />
        <Text label="Duração (minutos)" name="duration_minutes" type="number" required />
      </Section>

      <Section title="Questões do simulado">
        <p className="text-xs text-muted-foreground">
          Filtre o banco, marque as questões e/ou use “preencher aleatórias”. A ordem de seleção é a
          ordem em que aparecem na prova.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Módulo"
            value={moduloTagId}
            onChange={setModuloTagId}
            options={[
              { value: '', label: 'Todos' },
              ...options.modulos.map((m) => ({ value: m.id, label: m.label })),
            ]}
          />
          <Select
            label="Especialidade"
            value={specialtyId}
            onChange={setSpecialtyId}
            options={[
              { value: '', label: 'Todas' },
              ...options.especialidades.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <Select
            label="Prova"
            value={examId}
            onChange={setExamId}
            options={[
              { value: '', label: 'Todas' },
              ...options.provas.map((p) => ({ value: p.id, label: p.label })),
            ]}
          />
          <Select
            label="Ano"
            value={year}
            onChange={setYear}
            options={[
              { value: '', label: 'Todos' },
              ...options.anos.map((y) => ({ value: String(y), label: String(y) })),
            ]}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={onlyReady}
            onChange={(e) => setOnlyReady(e.target.checked)}
            className="size-4"
          />
          Apenas questões com gabarito e comentário
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runSearch}
            disabled={searching}
            className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground disabled:opacity-60"
          >
            {searching ? 'Buscando…' : 'Buscar questões'}
          </button>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              value={fillN}
              onChange={(e) => setFillN(Number(e.target.value))}
              className="w-20 rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground"
            />
            <button
              type="button"
              onClick={fillRandom}
              disabled={results.length === 0}
              className="rounded-lg border border-border px-3 py-2 text-sm text-foreground disabled:opacity-50"
            >
              Preencher aleatórias
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-sm">
          <span className="font-medium text-foreground">
            {selected.length} questão(ões) selecionada(s)
          </span>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => setSelected([])}
              className="text-xs text-red-500 underline"
            >
              Limpar seleção
            </button>
          )}
        </div>

        {searched && (
          <div className="max-h-80 space-y-1 overflow-auto rounded-lg border border-border p-2">
            {results.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">
                Nenhuma questão encontrada para esse filtro.
              </p>
            ) : (
              results.map((q) => {
                const checked = selectedIds.has(q.id)
                const open = previewId === q.id
                const pv = previewData[q.id]
                return (
                  <div
                    key={q.id}
                    className={`rounded-md ${checked ? 'bg-primary/10' : ''}`}
                  >
                    <div className="flex items-start gap-2 p-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(q)}
                        className="mt-0.5 size-4 cursor-pointer"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-foreground">
                          {q.number ? `Q${q.number} · ` : ''}
                          {q.stem || '(sem enunciado)'}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {q.examLabel}
                          {q.hasAnswer ? ' · gabarito' : ' · sem gabarito'}
                          {q.hasComment ? ' · comentário' : ''}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => togglePreview(q.id)}
                        className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-card"
                      >
                        {open ? 'Fechar' : 'Ver'}
                      </button>
                    </div>
                    {open && (
                      <div className="border-t border-border/50 px-3 py-3">
                        {!pv || pv === 'loading' ? (
                          <p className="text-xs text-muted-foreground">Carregando…</p>
                        ) : (
                          <QuestionPreviewView pv={pv} />
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}

        <input type="hidden" name="question_ids" value={selected.map((q) => q.id).join(',')} />
        <input type="hidden" name="question_filters" value={JSON.stringify(currentFilter)} />
      </Section>

      <Section title="Acesso">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">Modo de acesso</span>
          <select
            name="access_mode"
            value={accessMode}
            onChange={(e) => setAccessMode(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="imediato">Imediato</option>
            <option value="data_unica">Data única</option>
            <option value="janela">Janela (faixa de dias)</option>
          </select>
        </label>
        {accessMode !== 'imediato' && (
          <div className="grid grid-cols-2 gap-3">
            <Text label="Início" name="window_start" type="datetime-local" />
            {accessMode === 'janela' && (
              <Text label="Fim" name="window_end" type="datetime-local" />
            )}
          </div>
        )}
        <Check label="Permitir pausar e retomar" name="pause_allowed" defaultChecked />
      </Section>

      <Section title="Liberações pós-prova">
        <Check label="Liberar nota e gabarito" name="rel_nota" />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">Comentários</span>
          <select
            name="rel_coment_mode"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="oculto">Oculto (gancho da live)</option>
            <option value="imediato">Imediato</option>
            <option value="data">Liberar em data</option>
          </select>
        </label>
        <Text label="Data de liberação dos comentários (se aplicável)" name="rel_coment_at" type="datetime-local" />
        <Check label="Permitir revisão das questões/alternativas" name="rel_revisao" />
        <Check label="Liberar dashboard de desempenho (Fase 2)" name="rel_dashboard" />
      </Section>

      <Section title="Live">
        <Text label="Data da live" name="live_at" type="datetime-local" />
        <Text label="Link da live (YouTube)" name="live_url" />
      </Section>

      <Section title="Formulário de captação (embed)">
        <Text label="Domínios autorizados (separados por vírgula)" name="allowed_domains" />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">
            Campos extras (um por linha)
          </span>
          <textarea
            name="extra_fields"
            rows={3}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder={'Cidade\nAno de conclusão da residência'}
          />
        </label>
        <Check label="Exigir verificação de e-mail" name="require_email_verification" />
      </Section>

      <Section title="Rastreamento / Pixel (por campanha)">
        <Text label="Meta Pixel ID" name="meta_pixel_id" />
        <Text label="Meta Access Token (Conversions API)" name="meta_access_token" />
        <Text label="Google Measurement ID (GA4)" name="ga_measurement_id" />
        <Text label="Google API Secret (GA4)" name="ga_api_secret" />
      </Section>

      <Check label="Publicar imediatamente" name="publish" />

      {state?.error && (
        <p role="alert" className="text-sm text-red-500">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {isPending ? 'Criando…' : 'Criar campanha'}
      </button>
    </form>
  )
}

function QuestionPreviewView({ pv }: { pv: QuestionPreview }) {
  const letters = ['A', 'B', 'C', 'D', 'E']
  return (
    <div className="space-y-3 text-sm">
      <p className="whitespace-pre-wrap text-foreground">{pv.stem || '(sem enunciado)'}</p>
      <ul className="space-y-1">
        {letters.map((L) => {
          const text = pv.alternatives?.[L]
          if (!text) return null
          const correct = pv.correctAnswer === L
          return (
            <li
              key={L}
              className={`rounded-md px-2 py-1 ${
                correct ? 'bg-green-500/15 font-medium text-green-600' : 'text-foreground'
              }`}
            >
              <strong>{L})</strong> {text}
              {correct ? ' ✓' : ''}
            </li>
          )
        })}
      </ul>
      {pv.correctAnswer == null && (
        <p className="text-xs text-amber-500">Sem gabarito cadastrado.</p>
      )}
      <div>
        <p className="mb-1 text-xs font-semibold text-muted-foreground">Comentários</p>
        {pv.comments.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem comentários.</p>
        ) : (
          <div className="space-y-2">
            {pv.comments.map((c, i) => (
              <div key={i} className="rounded-md bg-background p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {c.type || 'comentário'}
                </p>
                <p className="whitespace-pre-wrap text-foreground">{c.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-border p-4">
      <legend className="px-1 text-sm font-semibold text-foreground">{title}</legend>
      {children}
    </fieldset>
  )
}

function Text({
  label,
  name,
  type = 'text',
  required,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
      />
    </label>
  )
}

function Check({
  label,
  name,
  defaultChecked,
}: {
  label: string
  name: string
  defaultChecked?: boolean
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-foreground">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4" />
      {label}
    </label>
  )
}
