'use client'

import { useState, useTransition } from 'react'
import { KeyRound, LogOut, Target, Timer, User } from 'lucide-react'
import { logoutAluno, setGoalAction } from '../actions'
import { salvarMetaSemanalAction } from '../foco/actions'
import { alterarSenhaAlunoAction, salvarPerfilAlunoAction, salvarPomodoroAction } from './actions'

const inputCls =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary'
const labelCls = 'mb-1 block text-xs font-semibold text-muted-foreground'
const btnPrimaryCls =
  'rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60'

function Feedback({ msg }: { msg: string | null }) {
  if (!msg) return null
  const erro = msg.startsWith('Erro')
  return (
    <p className="text-xs font-semibold" style={{ color: erro ? '#D3402A' : 'var(--afya-green)' }}>
      {msg}
    </p>
  )
}

function CardHeader({
  Icone,
  titulo,
  subtitulo,
}: {
  Icone: typeof User
  titulo: string
  subtitulo: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-full"
        style={{ background: 'var(--afya-pink-tint)', color: 'var(--afya-magenta)' }}
      >
        <Icone className="size-4" />
      </span>
      <div>
        <h2 className="text-base font-bold text-foreground">{titulo}</h2>
        <p className="text-sm text-muted-foreground">{subtitulo}</p>
      </div>
    </div>
  )
}

export function ConfiguracoesClient({
  nomeInicial,
  email,
  bancaLabel,
  dailyGoalInicial,
  metaFocoMinInicial,
  focoMinInicial,
  pausaCurtaMinInicial,
  pausaLongaMinInicial,
}: {
  nomeInicial: string
  email: string
  bancaLabel: string | null
  dailyGoalInicial: number
  metaFocoMinInicial: number
  focoMinInicial: number
  pausaCurtaMinInicial: number
  pausaLongaMinInicial: number
}) {
  // Perfil
  const [nome, setNome] = useState(nomeInicial)
  const [msgPerfil, setMsgPerfil] = useState<string | null>(null)
  const [pendPerfil, startPerfil] = useTransition()

  // Metas
  const [dailyGoal, setDailyGoal] = useState(String(dailyGoalInicial))
  const [metaFocoHoras, setMetaFocoHoras] = useState(String(Math.round((metaFocoMinInicial / 60) * 10) / 10))
  const [msgMetas, setMsgMetas] = useState<string | null>(null)
  const [pendMetas, startMetas] = useTransition()

  // Pomodoro
  const [foco, setFoco] = useState(String(focoMinInicial))
  const [pausaCurta, setPausaCurta] = useState(String(pausaCurtaMinInicial))
  const [pausaLonga, setPausaLonga] = useState(String(pausaLongaMinInicial))
  const [msgPomodoro, setMsgPomodoro] = useState<string | null>(null)
  const [pendPomodoro, startPomodoro] = useTransition()

  // Senha
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmaSenha, setConfirmaSenha] = useState('')
  const [msgSenha, setMsgSenha] = useState<string | null>(null)
  const [pendSenha, startSenha] = useTransition()

  function salvarPerfil() {
    setMsgPerfil(null)
    startPerfil(async () => {
      const r = await salvarPerfilAlunoAction(nome)
      setMsgPerfil(r.ok ? '✓ Perfil salvo' : `Erro: ${r.error}`)
    })
  }

  function salvarMetas() {
    setMsgMetas(null)
    const meta = Number(dailyGoal)
    const horas = Number(metaFocoHoras.replace(',', '.'))
    if (!Number.isFinite(meta) || meta < 1 || meta > 500) {
      setMsgMetas('Erro: meta diária deve ficar entre 1 e 500 questões.')
      return
    }
    if (!Number.isFinite(horas) || horas < 1 || horas > 72) {
      setMsgMetas('Erro: meta de foco deve ficar entre 1 e 72 horas por semana.')
      return
    }
    startMetas(async () => {
      const [rGoal, rFoco] = await Promise.all([
        setGoalAction(meta),
        salvarMetaSemanalAction(Math.round(horas * 60)),
      ])
      if (!rGoal.ok) setMsgMetas(`Erro: ${rGoal.error}`)
      else if (!rFoco.ok) setMsgMetas(`Erro: ${rFoco.error}`)
      else setMsgMetas('✓ Metas salvas')
    })
  }

  function salvarPomodoro() {
    setMsgPomodoro(null)
    startPomodoro(async () => {
      const r = await salvarPomodoroAction(Number(foco), Number(pausaCurta), Number(pausaLonga))
      setMsgPomodoro(r.ok ? '✓ Pomodoro salvo — vale a partir da próxima sessão de Foco' : `Erro: ${r.error}`)
    })
  }

  function alterarSenha() {
    setMsgSenha(null)
    if (novaSenha !== confirmaSenha) {
      setMsgSenha('Erro: nova senha e confirmação não conferem.')
      return
    }
    startSenha(async () => {
      const r = await alterarSenhaAlunoAction(senhaAtual, novaSenha)
      if (r.ok) {
        setMsgSenha('✓ Senha alterada com sucesso')
        setSenhaAtual('')
        setNovaSenha('')
        setConfirmaSenha('')
      } else {
        setMsgSenha(`Erro: ${r.error}`)
      }
    })
  }

  return (
    <section className="mt-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        {email && <p className="mt-1 text-sm text-muted-foreground">Conectado como {email}</p>}
      </div>

      {/* Perfil */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <CardHeader Icone={User} titulo="Perfil" subtitulo="Nome de exibição e dados da sua conta." />
        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="cfg-nome" className={labelCls}>
              Nome
            </label>
            <input
              id="cfg-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={120}
              className={inputCls}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cfg-email" className={labelCls}>
                E-mail
              </label>
              <input id="cfg-email" value={email} disabled className={`${inputCls} opacity-60`} />
            </div>
            <div>
              <span className={labelCls}>Banca</span>
              {bancaLabel ? (
                <span
                  className="inline-flex rounded-full px-3 py-1.5 text-sm font-semibold"
                  style={{ background: 'var(--afya-pink-tint)', color: 'var(--afya-magenta-deep)' }}
                >
                  {bancaLabel}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">Sem matrícula ativa</span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            <Feedback msg={msgPerfil} />
            <button onClick={salvarPerfil} disabled={pendPerfil} className={btnPrimaryCls}>
              {pendPerfil ? 'Salvando…' : 'Salvar perfil'}
            </button>
          </div>
        </div>
      </div>

      {/* Metas de estudo */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <CardHeader
          Icone={Target}
          titulo="Metas de estudo"
          subtitulo="Quanto você quer estudar por dia e por semana."
        />
        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cfg-meta-diaria" className={labelCls}>
                Meta diária (questões)
              </label>
              <input
                id="cfg-meta-diaria"
                type="number"
                min={1}
                max={500}
                value={dailyGoal}
                onChange={(e) => setDailyGoal(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="cfg-meta-foco" className={labelCls}>
                Meta semanal de foco (horas)
              </label>
              <input
                id="cfg-meta-foco"
                type="number"
                min={1}
                max={72}
                step="0.5"
                value={metaFocoHoras}
                onChange={(e) => setMetaFocoHoras(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            <Feedback msg={msgMetas} />
            <button onClick={salvarMetas} disabled={pendMetas} className={btnPrimaryCls}>
              {pendMetas ? 'Salvando…' : 'Salvar metas'}
            </button>
          </div>
        </div>
      </div>

      {/* Pomodoro */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <CardHeader Icone={Timer} titulo="Pomodoro" subtitulo="Personalize foco e pausas do timer." />
        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="cfg-foco" className={labelCls}>
                Foco (min)
              </label>
              <input
                id="cfg-foco"
                type="number"
                min={5}
                max={180}
                value={foco}
                onChange={(e) => setFoco(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="cfg-pausa-curta" className={labelCls}>
                Pausa curta (min)
              </label>
              <input
                id="cfg-pausa-curta"
                type="number"
                min={1}
                max={60}
                value={pausaCurta}
                onChange={(e) => setPausaCurta(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="cfg-pausa-longa" className={labelCls}>
                Pausa longa (min)
              </label>
              <input
                id="cfg-pausa-longa"
                type="number"
                min={5}
                max={120}
                value={pausaLonga}
                onChange={(e) => setPausaLonga(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            <Feedback msg={msgPomodoro} />
            <button onClick={salvarPomodoro} disabled={pendPomodoro} className={btnPrimaryCls}>
              {pendPomodoro ? 'Salvando…' : 'Salvar Pomodoro'}
            </button>
          </div>
        </div>
      </div>

      {/* Segurança */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <CardHeader Icone={KeyRound} titulo="Segurança" subtitulo="Troque sua senha de acesso." />
        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="cfg-senha-atual" className={labelCls}>
              Senha atual
            </label>
            <input
              id="cfg-senha-atual"
              type="password"
              autoComplete="current-password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cfg-senha-nova" className={labelCls}>
                Nova senha
              </label>
              <input
                id="cfg-senha-nova"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                className={inputCls}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Mínimo 8 caracteres</p>
            </div>
            <div>
              <label htmlFor="cfg-senha-confirma" className={labelCls}>
                Confirmar nova senha
              </label>
              <input
                id="cfg-senha-confirma"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirmaSenha}
                onChange={(e) => setConfirmaSenha(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            <Feedback msg={msgSenha} />
            <button
              onClick={alterarSenha}
              disabled={pendSenha || !senhaAtual || !novaSenha || !confirmaSenha}
              className={btnPrimaryCls}
            >
              {pendSenha ? 'Alterando…' : 'Alterar senha'}
            </button>
          </div>
        </div>
      </div>

      {/* Sessão */}
      <div className="rounded-2xl border border-[rgba(211,64,42,0.35)] bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <CardHeader Icone={LogOut} titulo="Sessão" subtitulo="Sair desconecta este dispositivo." />
          <form action={logoutAluno}>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: '#D3402A' }}
            >
              <LogOut className="size-4" />
              Sair da conta
            </button>
          </form>
        </div>
      </div>
    </section>
  )
}
