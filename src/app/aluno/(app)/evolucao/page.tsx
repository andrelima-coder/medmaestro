import type * as React from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMinhaBancaAtiva, getArvore, type Arvore } from '@/lib/aluno/mentoria'
import { SemMatricula } from '@/components/aluno/sem-matricula'
import {
  getTrilha,
  getSemana,
  getDesempenhoModulo,
  getCustoOportunidade,
  getPercentil,
  getEficiencia,
  getCadernoErros,
  getDiarioErro,
  getDesafios,
  getEventosRecentes,
  type TrilhaEstagio,
  type Semana,
  type ModuloDesempenho,
  type Percentil,
  type Eficiencia,
  type ErroCaderno,
  type DiarioErro,
  type Desafio,
  type EventoRecente,
} from '@/lib/aluno/evolucao'

export const metadata = { title: 'Evolução — MedMaestro' }

const DIA_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

const CAUSAS = [
  { key: 'nao_sabia', label: 'Não sabia' },
  { key: 'me_confundi', label: 'Me confundi' },
  { key: 'li_mal', label: 'Li mal o enunciado' },
  { key: 'faltou_tempo', label: 'Faltou tempo' },
]

const TIPO_EVENTO_LABEL: Record<string, string> = {
  conceito_consolidado: 'Conceito consolidado',
  acerto_certeza: 'Acerto com certeza',
  ponto_cego_redimido: 'Ponto cego redimido',
  divida_paga: 'Dívida paga',
  simulado_no_tempo: 'Simulado no tempo',
  sessao: 'Sessão de estudo',
  desafio: 'Desafio concluído',
  flashcard_revisado: 'Flashcard revisado',
}

const TIPO_ERRO_LABEL: Record<string, string> = {
  ponto_cego: '🎯 Ponto cego',
  leech: '🔁 Travados (leech)',
  lacuna_assumida: '📖 Lacuna assumida',
}

function relTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

function letraDia(iso: string): string {
  const d = new Date(iso.length > 10 ? iso : iso + 'T00:00:00')
  return DIA_SEMANA[d.getDay()]
}

export default async function EvolucaoPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/aluno/login')

  const banca = await getMinhaBancaAtiva(supabase)
  if (!banca) return <SemMatricula />

  const hoje = new Date().toISOString().slice(0, 10)
  const seteDiasAtras = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)

  const [arvore, trilha, semana, modulos, custo, percentil, eficiencia, erros, diario, desafios, eventos] =
    await Promise.all([
      getArvore(supabase),
      getTrilha(supabase),
      getSemana(supabase),
      getDesempenhoModulo(supabase),
      getCustoOportunidade(supabase, 7),
      getPercentil(supabase),
      getEficiencia(supabase, seteDiasAtras, hoje),
      getCadernoErros(supabase, 60),
      getDiarioErro(supabase, 30),
      getDesafios(supabase),
      getEventosRecentes(supabase, 12),
    ])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-foreground">Evolução</h1>

      {arvore && <ArvoreCard arvore={arvore} />}
      {trilha.length > 0 && arvore && <TrilhaCard trilha={trilha} slugAtual={arvore.estagio.slug} />}
      {semana && <SemanaCard semana={semana} />}
      {modulos.length > 0 && <ModulosCard modulos={modulos} />}
      {custo.temAlerta && <CustoCard custo={custo} />}
      {percentil?.percentil != null && <PercentilCard percentil={percentil} />}
      <EficienciaCard eficiencia={eficiencia} />
      <CadernoCard erros={erros} />
      <DiarioCard diario={diario} />
      {desafios.length > 0 && <DesafiosCard desafios={desafios} />}
      <EventosCard eventos={eventos} />
    </div>
  )
}

function ArvoreCard({ arvore }: { arvore: Arvore }) {
  return (
    <div className="mm-animate-in rounded-2xl border border-border bg-card p-6 shadow-[var(--mm-shadow-sm)]">
      <h2 className="text-base font-bold text-foreground">Sua árvore</h2>
      <div className="mt-3 flex items-center gap-4">
        {arvore.imagemUrl ? (
          <img
            src={arvore.imagemUrl}
            alt={`Árvore no estágio ${arvore.estagio.nome}`}
            className="mm-sway h-24 w-24 shrink-0 object-contain"
          />
        ) : (
          <span className="mm-sway inline-block text-5xl">{arvore.estagio.emoji}</span>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-foreground">
            {arvore.estagio.nome} · {arvore.pontos} pts
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">{arvore.estagio.frase}</div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded bg-muted">
            <div className="mm-grow-x h-2 rounded bg-primary" style={{ width: `${arvore.progressoPct}%` }} />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {arvore.proximo
              ? `Faltam ${arvore.faltam} pts para ${arvore.proximo.nome} ${arvore.proximo.emoji}`
              : 'Estágio máximo alcançado'}
          </div>
        </div>
      </div>
      {arvore.murchando && (
        <div className="mt-3 rounded-lg bg-[rgba(211,64,42,0.08)] p-3 text-xs text-[#D3402A]">
          🥀 {arvore.divida} conceitos vencidos — a árvore está murchando. Nenhum ponto foi perdido, mas vale colocar
          a fila em dia.
        </div>
      )}
    </div>
  )
}

function TrilhaCard({ trilha, slugAtual }: { trilha: TrilhaEstagio[]; slugAtual: string }) {
  return (
    <div className="mm-animate-in rounded-2xl border border-border bg-card p-6 shadow-[var(--mm-shadow-sm)]">
      <h2 className="text-base font-bold text-foreground">Trilha de estágios</h2>
      <p className="mt-1 text-sm text-muted-foreground">Seu caminho até o estágio máximo</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {trilha.map((t, i) => (
          <div
            key={t.slug}
            style={{ '--stagger': i } as React.CSSProperties}
            className={
              'mm-pop-in mm-chip flex w-24 flex-col items-center rounded-xl border p-3 text-center ' +
              (t.slug === slugAtual
                ? 'border-primary bg-[rgba(212,7,84,0.05)] shadow-[0_2px_12px_rgba(212,7,84,0.12)]'
                : t.atingido
                  ? 'border-border'
                  : 'border-border opacity-40')
            }
          >
            <div className="text-2xl">🌳</div>
            <div className="mt-1 text-xs font-semibold text-foreground">{t.nome}</div>
            <div className="text-[11px] text-muted-foreground">{t.pontosMin} pts</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SemanaCard({ semana }: { semana: Semana }) {
  return (
    <div className="mm-animate-in rounded-2xl border border-border bg-card p-6 shadow-[var(--mm-shadow-sm)]">
      <h2 className="text-base font-bold text-foreground">Semana</h2>
      <div className="mt-3 flex justify-between gap-2">
        {semana.dias.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">{letraDia(d.dia)}</span>
            <span
              style={{ '--stagger': i } as React.CSSProperties}
              className={
                'mm-pop-in size-6 rounded-full ' +
                (d.ativo ? 'bg-primary' : d.plantao ? 'bg-[var(--afya-amber)]' : 'bg-muted')
              }
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-foreground">
          {semana.ativos + semana.plantoes} de 7 · meta {semana.meta}
          {semana.cumprida ? ' · cumprida ✓' : ''}
        </span>
        <span className="text-muted-foreground">{semana.plantoesRestantesMes} plantão(ões) restante(s)</span>
      </div>
    </div>
  )
}

function ModulosCard({ modulos }: { modulos: ModuloDesempenho[] }) {
  return (
    <div className="mm-animate-in rounded-2xl border border-border bg-card p-6 shadow-[var(--mm-shadow-sm)]">
      <h2 className="text-base font-bold text-foreground">Desempenho por módulo</h2>
      <p className="mt-1 text-sm text-muted-foreground">Seu acerto vs. meta · ordenado pelo peso na prova</p>
      <div className="mt-4 flex flex-col gap-4">
        {modulos.map((m) => (
          <div key={m.moduloSlug}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-foreground">
                {m.modulo} <span className="font-normal text-muted-foreground">· {m.pesoPct}% da prova</span>
              </span>
              {m.respostas > 0 && (
                <span
                  className={
                    'text-xs font-bold ' +
                    (m.gap >= 0 ? 'text-[#1E8E5A]' : m.gap >= -15 ? 'text-[#9E6606]' : 'text-[#D3402A]')
                  }
                >
                  {m.gap >= 0 ? '+' : ''}
                  {m.gap} pp
                </span>
              )}
            </div>
            {m.respostas > 0 ? (
              <>
                <div className="relative mt-1.5 h-2 w-full rounded bg-muted">
                  <div className="mm-grow-x h-2 rounded bg-primary" style={{ width: `${m.acertoPct}%` }} />
                  <div
                    className="absolute top-0 h-2 w-0.5 bg-foreground"
                    style={{ left: `${m.metaPct}%` }}
                    title={`Meta: ${m.metaPct}%`}
                  />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {m.respostas} resposta{m.respostas === 1 ? '' : 's'} · {m.coberturaPct}% dos conceitos em dia
                </div>
              </>
            ) : (
              <div className="mt-1.5 text-xs italic text-muted-foreground">ainda não estudado</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function CustoCard({
  custo,
}: {
  custo: { temAlerta: true; modulo: string; minutos: number; pesoPct: number; sugestao: string }
}) {
  return (
    <div className="rounded-2xl border border-[var(--afya-amber)] bg-[rgba(158,102,6,0.05)] p-5 text-sm text-foreground">
      Você investiu <b>{custo.minutos} min</b> em <b>{custo.modulo}</b> — módulo que vale só <b>{custo.pesoPct}%</b>{' '}
      da prova. Essa hora rende mais em <b>{custo.sugestao}</b>.
    </div>
  )
}

function PercentilCard({ percentil }: { percentil: Percentil }) {
  return (
    <div className="mm-animate-in rounded-2xl border border-border bg-card p-6 shadow-[var(--mm-shadow-sm)]">
      <h2 className="text-base font-bold text-foreground">Posição na turma</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Percentil <b className="text-foreground">{percentil.percentil}</b> entre {percentil.alunosComparados} alunos
        comparados (anônimo) · seu acerto: {percentil.acertoPct}%
      </p>
    </div>
  )
}

function EficienciaCard({ eficiencia }: { eficiencia: Eficiencia }) {
  const cor =
    eficiencia?.eficiencia == null
      ? 'bg-muted-foreground/30'
      : eficiencia.eficiencia < 30
        ? 'bg-[#D3402A]'
        : eficiencia.eficiencia < 60
          ? 'bg-[var(--afya-amber)]'
          : 'bg-[#1E8E5A]'
  return (
    <div className="mm-animate-in rounded-2xl border border-border bg-card p-6 shadow-[var(--mm-shadow-sm)]">
      <h2 className="text-base font-bold text-foreground">Eficiência dos últimos 7 dias</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Ganho de intervalo ponderado pelo peso da prova ÷ horas investidas
      </p>
      {eficiencia && eficiencia.eficiencia != null ? (
        <>
          <div className="mt-3 h-3 w-full overflow-hidden rounded bg-muted">
            <div className={'mm-grow-x h-3 rounded ' + cor} style={{ width: `${eficiencia.eficiencia}%` }} />
          </div>
          <div className="mt-2 text-sm text-foreground">{eficiencia.eficiencia}/100</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {eficiencia.minutosTotal} min investidos · {eficiencia.respostas} revisões · {eficiencia.acertoPct ?? 0}%
            de acerto
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Sem sessões de estudo registradas nos últimos 7 dias.</p>
      )}
    </div>
  )
}

function CadernoCard({ erros }: { erros: ErroCaderno[] }) {
  const grupos: Record<ErroCaderno['tipo'], ErroCaderno[]> = { ponto_cego: [], leech: [], lacuna_assumida: [] }
  for (const e of erros) grupos[e.tipo]?.push(e)
  const vazio = Object.values(grupos).every((v) => v.length === 0)

  return (
    <div className="mm-animate-in rounded-2xl border border-border bg-card p-6 shadow-[var(--mm-shadow-sm)]">
      <h2 className="text-base font-bold text-foreground">Caderno de erros</h2>
      {vazio ? (
        <p className="mt-2 text-sm text-muted-foreground">Nenhum erro registrado ainda — bom sinal.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {(Object.entries(grupos) as [ErroCaderno['tipo'], ErroCaderno[]][])
            .filter(([, lista]) => lista.length > 0)
            .map(([tipo, lista]) => (
              <div key={tipo}>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {TIPO_ERRO_LABEL[tipo]}
                  <span className="rounded-full bg-[var(--afya-teal)]/15 px-2 py-0.5 text-xs text-[var(--afya-teal)]">
                    {lista.length}
                  </span>
                </div>
                <div className="mt-2 flex flex-col gap-1.5">
                  {lista.slice(0, 5).map((e) => (
                    <div key={e.conceitoId} className="flex justify-between gap-3 text-sm">
                      <span className="text-foreground">{e.proposicao}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {e.erros} erro{e.erros === 1 ? '' : 's'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

function DiarioCard({ diario }: { diario: DiarioErro }) {
  if (!diario) {
    return (
      <div className="mm-animate-in rounded-2xl border border-border bg-card p-6 shadow-[var(--mm-shadow-sm)]">
        <h2 className="text-base font-bold text-foreground">Conteúdo vs. skill de prova</h2>
        <p className="mt-2 text-sm text-muted-foreground">Nenhum erro registrado nos últimos 30 dias.</p>
      </div>
    )
  }
  return (
    <div className="mm-animate-in rounded-2xl border border-border bg-card p-6 shadow-[var(--mm-shadow-sm)]">
      <h2 className="text-base font-bold text-foreground">Conteúdo vs. skill de prova</h2>
      <p className="mt-1 text-sm text-muted-foreground">Dos {diario.total} erros nos últimos 30 dias</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-[rgba(211,64,42,0.06)] p-4 text-center">
          <div className="text-2xl font-bold text-[#D3402A]">{diario.conteudo}</div>
          <div className="mt-1 text-xs text-muted-foreground">Lacuna de conteúdo</div>
        </div>
        <div className="rounded-xl bg-muted/40 p-4 text-center">
          <div className="text-2xl font-bold text-foreground">{diario.skillProva}</div>
          <div className="mt-1 text-xs text-muted-foreground">Skill de prova</div>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {CAUSAS.map((c) => {
          const n = diario.porCausa[c.key] ?? 0
          const pct = diario.total ? Math.round((100 * n) / diario.total) : 0
          return (
            <div key={c.key} className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0 text-muted-foreground">{c.label}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded bg-muted">
                <span
                  className="mm-grow-x block h-1.5 rounded bg-primary"
                  style={{ width: `${pct}%`, '--stagger': CAUSAS.indexOf(c) } as React.CSSProperties}
                />
              </span>
              <span className="w-6 shrink-0 text-right text-foreground">{n}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DesafiosCard({ desafios }: { desafios: Desafio[] }) {
  return (
    <div className="mm-animate-in rounded-2xl border border-border bg-card p-6 shadow-[var(--mm-shadow-sm)]">
      <h2 className="text-base font-bold text-foreground">Desafios</h2>
      <div className="mt-3 flex flex-col gap-3">
        {desafios.map((d) => {
          const alvo = Math.max(1, d.alvo)
          const pct = Math.min(100, Math.round((100 * d.atual) / alvo))
          return (
            <div key={d.slug} className="rounded-xl bg-muted/40 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">{d.titulo}</span>
                <span className="text-xs font-bold text-primary">+{d.pontos} pts</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{d.descricao}</p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-muted">
                <div className="mm-grow-x h-1.5 rounded bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {d.atual} de {d.alvo}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EventosCard({ eventos }: { eventos: EventoRecente[] }) {
  return (
    <div className="mm-animate-in rounded-2xl border border-border bg-card p-6 shadow-[var(--mm-shadow-sm)]">
      <h2 className="text-base font-bold text-foreground">Eventos recentes</h2>
      {eventos.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nenhum evento recente.</p>
      ) : (
        <div className="mt-3 flex flex-col">
          {eventos.map((ev, i) => {
            const extra = ev.conceito ?? ev.modulo
            return (
              <div
                key={i}
                className="flex items-center justify-between gap-3 border-b border-border py-2.5 text-sm transition-colors duration-150 last:border-b-0 hover:bg-muted/30"
              >
                <span className="text-foreground">
                  <b>+{ev.pontos}</b> · {TIPO_EVENTO_LABEL[ev.tipo] ?? ev.tipo}
                  {extra ? ` · ${extra}` : ''}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{relTime(ev.quando)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
