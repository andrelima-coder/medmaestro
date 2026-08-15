import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getGoalAndToday, getStreak, getWeakestModule } from '@/lib/aluno/estudo'
import { getMinhaBancaAtiva, getArvore, getEngajamentoHoje, type Arvore, type EngajamentoHoje } from '@/lib/aluno/mentoria'
import { getRevisoesPendentes, getStreakMt, getMetasSemana, type MetasSemana } from '@/lib/aluno/inicio'
import { getSemana, getDesempenhoModulo, type ModuloDesempenho } from '@/lib/aluno/evolucao'
import { GoalSetter } from './home-client'

export const metadata = { title: 'Área do Aluno — MedMaestro' }

function formatHoras(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  if (h === 0) return `${m}min`
  return `${h}h${String(m).padStart(2, '0')}`
}

function statusMeta(pct: number): { label: string; cor: string; bg: string } {
  if (pct >= 100) return { label: 'Cumprida', cor: 'var(--afya-green)', bg: 'rgba(0,96,72,0.1)' }
  if (pct >= 80) return { label: 'Quase lá', cor: 'var(--afya-amber-deep)', bg: 'rgba(251,174,64,0.15)' }
  return { label: 'Em andamento', cor: 'var(--afya-magenta)', bg: 'rgba(212,7,84,0.08)' }
}

export default async function AlunoHomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let nome: string | null = null
  let goal = 10
  let today = 0
  let streak = 0
  let weakest: { tagId: string; label: string; pct: number } | null = null
  let arvore: Arvore | null = null
  let engajamento: EngajamentoHoje | null = null
  let revisoesPendentes = 0
  let streakMt = 0
  let metasSemana: MetasSemana | null = null
  let semanaCumprida = false
  let moduloTop: ModuloDesempenho | null = null

  if (user) {
    const service = createServiceClient()
    const { data: profile } = await service
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()
    nome = profile?.full_name ?? null
    const gt = await getGoalAndToday(service, user.id)
    goal = gt.goal
    today = gt.today
    streak = await getStreak(service, user.id)
    weakest = await getWeakestModule(service, user.id)

    // Vertente 2: só carrega se o aluno tiver matrícula ativa em alguma banca.
    const banca = await getMinhaBancaAtiva(supabase)
    if (banca) {
      ;[arvore, engajamento, revisoesPendentes, streakMt, metasSemana] = await Promise.all([
        getArvore(supabase),
        getEngajamentoHoje(supabase),
        getRevisoesPendentes(supabase),
        getStreakMt(service, user.id),
        getMetasSemana(service, user.id),
      ])
      const [semana, modulos] = await Promise.all([getSemana(supabase), getDesempenhoModulo(supabase)])
      semanaCumprida = semana?.cumprida ?? false
      moduloTop = modulos[0] ?? null
    }
  }

  const matriculado = arvore !== null || engajamento !== null
  const pct = goal > 0 ? Math.min(100, Math.round((today / goal) * 100)) : 0

  const metas =
    matriculado && metasSemana
      ? [
          { icone: '🎯', titulo: 'Responder 150 questões', atual: metasSemana.questoesRespondidas, alvo: 150 },
          { icone: '📋', titulo: 'Revisar 80 flashcards', atual: metasSemana.flashcardsRevisados, alvo: 80 },
          moduloTop
            ? {
                icone: '📊',
                titulo: `Atingir 75% em ${moduloTop.modulo}`,
                atual: moduloTop.acertoPct,
                alvo: 75,
                sufixo: '%',
              }
            : null,
          { icone: '📝', titulo: 'Concluir 1 simulado completo', atual: metasSemana.simuladosConcluidos, alvo: 1 },
        ].filter((m): m is NonNullable<typeof m> => m !== null)
      : []

  return (
    <section className="mt-6 space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Olá{nome ? `, ${nome}` : ''} 👋</h1>

      {matriculado ? (
        <>
          {/* KPIs (Vertente 2 — matriculado) */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">Sequência de estudo</div>
              <div className="mt-1 text-2xl font-bold text-foreground">
                🔥 {streakMt} dia{streakMt === 1 ? '' : 's'}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">Meta de hoje · questões</div>
              <div className="mt-1 text-2xl font-bold text-foreground">
                {engajamento?.questoesHoje ?? 0}/{engajamento?.metaQuestoes ?? 5}
              </div>
              <div className="mt-2 h-2 w-full rounded bg-muted">
                <div
                  className="h-2 rounded bg-primary"
                  style={{
                    width: `${Math.min(100, Math.round((100 * (engajamento?.questoesHoje ?? 0)) / (engajamento?.metaQuestoes || 1)))}%`,
                  }}
                />
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">Revisões pendentes</div>
              <div className="mt-1 text-2xl font-bold text-foreground">↺ {revisoesPendentes}</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">Estudadas nesta semana</div>
              <div className="mt-1 text-2xl font-bold text-foreground">
                🕐 {formatHoras(metasSemana?.minutosEstudados ?? 0)}
              </div>
            </div>
          </div>

          {/* Metas da semana + Sua evolução */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-3">
              <h2 className="text-base font-bold text-foreground">Metas da semana</h2>
              <p className="mt-1 text-sm text-muted-foreground">Acompanhe seu progresso e conquiste seus objetivos</p>
              <div className="mt-4 flex flex-col gap-4">
                {metas.map((m) => {
                  const pctMeta = Math.min(100, Math.round((100 * m.atual) / m.alvo))
                  const st = statusMeta(pctMeta)
                  return (
                    <div key={m.titulo} className="flex items-center gap-3">
                      <span className="text-xl">{m.icone}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-foreground">{m.titulo}</span>
                          <span className="shrink-0 text-sm font-bold text-foreground">
                            {m.sufixo ? `${m.atual}${m.sufixo}` : `${m.atual} / ${m.alvo}`}
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 w-full rounded bg-muted">
                          <div className="h-2 rounded" style={{ width: `${pctMeta}%`, background: st.cor }} />
                        </div>
                      </div>
                      <span
                        className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold"
                        style={{ color: st.cor, background: st.bg }}
                      >
                        {st.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {arvore && (
              <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-foreground">Sua evolução</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Cuide da sua trilha e veja seu progresso crescer
                    </p>
                  </div>
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-[var(--afya-mint)] px-3 py-1 text-xs font-semibold text-[var(--afya-green)]">
                    {arvore.estagio.emoji} {arvore.estagio.nome}
                  </span>
                </div>

                <ArvoreIlustrada imagemUrl={arvore.imagemUrl} estagioNome={arvore.estagio.nome} />

                <div className="text-center">
                  <div className="text-3xl font-bold text-foreground">{arvore.pontos} pontos</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {arvore.proximo ? `Faltam ${arvore.faltam} pontos para o próximo estágio` : 'Estágio máximo alcançado'}
                  </div>
                  <div className="mt-3 h-2 w-full rounded bg-muted">
                    <div className="h-2 rounded bg-primary" style={{ width: `${arvore.progressoPct}%` }} />
                  </div>
                  {arvore.proximo && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {arvore.pontos} / {arvore.pontos + arvore.faltam} pts
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {streakMt > 0 && (
                    <span className="rounded-full bg-[rgba(251,174,64,0.15)] px-3 py-1 text-xs font-semibold text-[var(--afya-amber-deep)]">
                      🔥 {streakMt} dia{streakMt === 1 ? '' : 's'} de consistência
                    </span>
                  )}
                  {semanaCumprida && (
                    <span className="rounded-full bg-[rgba(212,7,84,0.08)] px-3 py-1 text-xs font-semibold text-[var(--afya-magenta)]">
                      ⭐ Meta cumprida
                    </span>
                  )}
                </div>

                {arvore.murchando && (
                  <div className="mt-4 rounded-lg bg-[rgba(211,64,42,0.08)] p-3 text-xs text-[#D3402A]">
                    🥀 {arvore.divida} conceitos vencidos — a árvore está murchando. Nenhum ponto foi perdido, mas
                    vale colocar a fila em dia.
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Sequência</div>
            <div className="mt-1 text-2xl font-bold text-foreground">
              🔥 {streak} dia{streak === 1 ? '' : 's'}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Meta de hoje</div>
            <div className="mt-1 text-2xl font-bold text-foreground">
              {today}/{goal}
            </div>
            <div className="mt-2 h-2 w-full rounded bg-muted">
              <div className="h-2 rounded bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Ajustar meta diária</div>
            <GoalSetter initial={goal} />
          </div>
        </div>
      )}

      {/* Recomendação adaptativa (ponto fraco) */}
      {weakest && (
        <a
          href={`/aluno/praticar?modulo=${weakest.tagId}`}
          className="block rounded-2xl border border-[#FBAE40] bg-[rgba(251,174,64,0.05)] p-5 transition hover:bg-[rgba(251,174,64,0.1)]"
        >
          <div className="text-xs font-semibold text-[#9E6606]">🎯 Recomendado para você</div>
          <div className="mt-1 font-semibold text-foreground">Praticar seu ponto fraco: {weakest.label}</div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            Seu acerto neste módulo é {weakest.pct}%. Bora melhorar?
          </div>
        </a>
      )}

      {/* Atalhos */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Atalho href="/aluno/praticar" titulo="Praticar" desc="Questões avulsas com correção na hora" />
        <Atalho href="/aluno/revisao" titulo="Revisão de erros" desc="Revise o que você errou" />
        <Atalho href="/aluno/desempenho" titulo="Meu desempenho" desc="Radar por módulo e evolução" />
        {matriculado && (
          <>
            <Atalho href="/aluno/agenda" titulo="Agenda" desc="Organize seus horários de estudo" />
            <Atalho href="/aluno/foco" titulo="Foco" desc="Cronometre uma sessão e ganhe XP" />
          </>
        )}
      </div>
    </section>
  )
}

function Atalho({ href, titulo, desc }: { href: string; titulo: string; desc: string }) {
  return (
    <a href={href} className="rounded-2xl border border-border bg-card p-5 transition hover:border-primary">
      <div className="font-semibold text-foreground">{titulo}</div>
      <div className="mt-1 text-sm text-muted-foreground">{desc}</div>
    </a>
  )
}

/** Ilustração do estágio da árvore (bucket app-assets via mt_estagios); círculos CSS como fallback. */
function ArvoreIlustrada({ imagemUrl, estagioNome }: { imagemUrl: string | null; estagioNome: string }) {
  if (imagemUrl) {
    return (
      <img
        src={imagemUrl}
        alt={`Árvore no estágio ${estagioNome}`}
        className="mx-auto my-4 h-44 w-auto object-contain"
      />
    )
  }
  return (
    <div className="relative mx-auto my-4 h-36 w-44">
      <div className="absolute bottom-2 left-1/2 h-4 w-28 -translate-x-1/2 rounded-full bg-[var(--afya-mint)]" />
      <div className="absolute bottom-4 left-1/2 h-10 w-3.5 -translate-x-1/2 rounded-sm bg-[var(--afya-navy)]" />
      <div className="absolute bottom-10 left-1/2 size-24 -translate-x-1/2 rounded-full bg-[var(--afya-teal-deep)] opacity-90" />
      <div className="absolute bottom-16 left-[32%] size-16 -translate-x-1/2 rounded-full bg-[var(--afya-teal)]" />
      <div className="absolute bottom-16 left-[68%] size-14 -translate-x-1/2 rounded-full bg-[var(--afya-green)]" />
      <div className="absolute bottom-24 left-1/2 size-6 -translate-x-1/2 rounded-full bg-[var(--afya-magenta)]" />
      <div className="absolute bottom-28 left-[22%] size-1.5 rounded-full bg-[var(--afya-magenta)]" />
      <div className="absolute bottom-20 left-[78%] size-1.5 rounded-full bg-[var(--afya-magenta)]" />
      <div className="absolute bottom-32 left-[54%] size-1.5 rounded-full bg-[var(--afya-magenta)]" />
    </div>
  )
}
