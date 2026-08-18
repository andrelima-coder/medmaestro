'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Coffee, Pencil, Play, SlidersHorizontal, Square, Timer, Trophy, X } from 'lucide-react'
import { registrarSessaoAction, salvarMetaSemanalAction } from './actions'

const POMODORO_MIN = 25
const PAUSA_CURTA_MIN = 5
const PAUSA_LONGA_MIN = 15
const MAX_MINUTOS_SESSAO = 480 // CHECK sessoes_estudo_minutos_check

type Modo = 'livre' | 'pomodoro'
type Fase = 'idle' | 'foco' | 'pausa'

function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

function fmtHoras(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}min`
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

function Anel({
  progresso,
  size,
  stroke,
  gradienteId,
  children,
}: {
  progresso: number
  size: number
  stroke: number
  gradienteId: string
  children?: React.ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.min(1, Math.max(0, progresso))
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradienteId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="#F26A9A" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradienteId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: 'stroke-dashoffset 0.3s linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

export function FocoClient({
  modulos,
  minutosSemanaInicial,
  metaSemanalMinInicial,
  focoMin = POMODORO_MIN,
  pausaCurtaMin = PAUSA_CURTA_MIN,
  pausaLongaMin = PAUSA_LONGA_MIN,
}: {
  modulos: { slug: string; label: string }[]
  minutosSemanaInicial: number
  metaSemanalMinInicial: number
  focoMin?: number
  pausaCurtaMin?: number
  pausaLongaMin?: number
}) {
  const [modo, setModo] = useState<Modo>('pomodoro')
  const [fase, setFase] = useState<Fase>('idle')
  const [emSessao, setEmSessao] = useState(false)
  const [ms, setMs] = useState(focoMin * 60_000)
  const [pausaMin, setPausaMin] = useState(pausaCurtaMin)
  const [modulo, setModulo] = useState('')
  const [status, setStatus] = useState('Pronto pra começar')
  const [salvando, setSalvando] = useState(false)
  const [minutosSemana, setMinutosSemana] = useState(minutosSemanaInicial)
  const [metaSemanalMin, setMetaSemanalMin] = useState(metaSemanalMinInicial)
  const [editandoMeta, setEditandoMeta] = useState(false)
  const [metaHorasInput, setMetaHorasInput] = useState('')
  const [salvandoMeta, setSalvandoMeta] = useState(false)
  const [erroMeta, setErroMeta] = useState('')

  // Cronômetro de foco: focoAcumuladoRef guarda o tempo dos segmentos já
  // encerrados (antes de cada pausa); segInicioRef marca o segmento corrente.
  const segInicioRef = useRef(0)
  const focoAcumuladoRef = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  function limparIntervalo() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  function msInicial(m: Modo): number {
    return m === 'pomodoro' ? focoMin * 60_000 : 0
  }

  function elapsedFocoAgora(faseAtual: Fase): number {
    let elapsed = focoAcumuladoRef.current
    if (faseAtual === 'foco') elapsed += Date.now() - segInicioRef.current
    return elapsed
  }

  function trocarModo(m: Modo) {
    if (fase !== 'idle' || emSessao || salvando) return
    setModo(m)
    setMs(msInicial(m))
    setStatus('Pronto pra começar')
  }

  function iniciarIntervaloFoco() {
    limparIntervalo()
    segInicioRef.current = Date.now()
    intervalRef.current = setInterval(() => {
      const elapsed = focoAcumuladoRef.current + (Date.now() - segInicioRef.current)
      if (modo === 'pomodoro') {
        const restante = focoMin * 60_000 - elapsed
        if (restante <= 0) {
          setMs(0)
          limparIntervalo()
          void finalizarFoco(true)
        } else {
          setMs(restante)
        }
      } else {
        setMs(elapsed)
      }
    }, 250)
  }

  function iniciarFoco() {
    focoAcumuladoRef.current = 0
    setEmSessao(true)
    setFase('foco')
    setMs(msInicial(modo))
    setStatus(modo === 'pomodoro' ? 'Sessão em andamento — foco total' : 'Cronômetro livre em andamento…')
    iniciarIntervaloFoco()
  }

  function retomarFoco() {
    setFase('foco')
    setStatus('De volta ao foco — sessão em andamento')
    if (modo === 'pomodoro') {
      setMs(Math.max(0, focoMin * 60_000 - focoAcumuladoRef.current))
    } else {
      setMs(focoAcumuladoRef.current)
    }
    iniciarIntervaloFoco()
  }

  async function finalizarFoco(completouPomodoro = false) {
    const elapsed = elapsedFocoAgora(fase)
    limparIntervalo()
    const minutos = completouPomodoro
      ? focoMin
      : Math.min(MAX_MINUTOS_SESSAO, Math.max(1, Math.round(elapsed / 60_000)))
    setEmSessao(false)
    setFase('idle')
    focoAcumuladoRef.current = 0
    setSalvando(true)
    setStatus('Registrando…')
    const res = await registrarSessaoAction(modulo || null, minutos)
    setSalvando(false)
    setMs(msInicial(modo))
    if (!res.ok) {
      setStatus('Erro ao registrar: ' + res.error)
      return
    }
    setMinutosSemana((m) => m + minutos)
    setStatus(
      completouPomodoro
        ? `Pomodoro completo! ${minutos} min registrados · +${res.pontos} pontos`
        : `Sessão de ${minutos} min registrada · +${res.pontos} pontos`
    )
  }

  function iniciarPausa(min: number) {
    // Durante o foco, congela o cronômetro: acumula o segmento corrente e a
    // sessão retoma sozinha quando a pausa terminar.
    const veioDoFoco = fase === 'foco'
    if (veioDoFoco) {
      focoAcumuladoRef.current += Date.now() - segInicioRef.current
    }
    limparIntervalo()
    setFase('pausa')
    setPausaMin(min)
    setMs(min * 60_000)
    const rotulo = min === pausaCurtaMin ? 'Pausa curta' : 'Pausa longa'
    setStatus(
      veioDoFoco
        ? `${rotulo} — ${Math.round(focoAcumuladoRef.current / 60_000)} min de foco guardados`
        : `${rotulo} — respira e volta`
    )
    const fim = Date.now() + min * 60_000
    const retomarAoFim = veioDoFoco || emSessao
    intervalRef.current = setInterval(() => {
      const restante = fim - Date.now()
      if (restante <= 0) {
        setMs(0)
        limparIntervalo()
        if (retomarAoFim) {
          retomarFoco()
        } else {
          setFase('idle')
          setMs(msInicial(modo))
          setStatus('Pausa concluída — bora voltar!')
        }
      } else {
        setMs(restante)
      }
    }, 250)
  }

  function encerrarPausa() {
    limparIntervalo()
    if (emSessao) {
      retomarFoco()
      return
    }
    setFase('idle')
    setMs(msInicial(modo))
    setStatus('Pronto pra começar')
  }

  function abrirEdicaoMeta() {
    setMetaHorasInput(String(Math.round((metaSemanalMin / 60) * 10) / 10))
    setErroMeta('')
    setEditandoMeta(true)
  }

  async function salvarMeta() {
    const horas = Number(metaHorasInput.replace(',', '.'))
    if (!Number.isFinite(horas) || horas < 1 || horas > 72) {
      setErroMeta('Informe entre 1 e 72 horas.')
      return
    }
    const minutos = Math.round(horas * 60)
    setSalvandoMeta(true)
    setErroMeta('')
    const res = await salvarMetaSemanalAction(minutos)
    setSalvandoMeta(false)
    if (!res.ok) {
      setErroMeta(res.error ?? 'Falha ao salvar.')
      return
    }
    setMetaSemanalMin(minutos)
    setEditandoMeta(false)
  }

  const progresso =
    fase === 'foco'
      ? modo === 'pomodoro'
        ? 1 - ms / (focoMin * 60_000)
        : (ms % 3_600_000) / 3_600_000
      : fase === 'pausa'
        ? 1 - ms / (pausaMin * 60_000)
        : 0

  const pctSemana = metaSemanalMin > 0 ? Math.min(100, Math.round((minutosSemana / metaSemanalMin) * 100)) : 0
  const msgSemana =
    pctSemana >= 100
      ? 'Meta batida! Excelente semana.'
      : pctSemana >= 50
        ? 'Continue assim! Você está no caminho certo.'
        : pctSemana > 0
          ? 'Bom começo — mantenha o ritmo.'
          : 'Comece sua primeira sessão da semana.'

  const podePausar = (fase === 'idle' || fase === 'foco') && !salvando

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="text-2xl font-bold text-foreground">Foco</h1>

      {/* Seletor de modo */}
      <div className="flex gap-1 rounded-full border border-border bg-muted p-1">
        {(
          [
            { valor: 'livre', label: 'Livre', Icone: SlidersHorizontal },
            { valor: 'pomodoro', label: 'Pomodoro', Icone: Timer },
          ] as { valor: Modo; label: string; Icone: typeof Timer }[]
        ).map(({ valor, label, Icone }) => (
          <button
            key={valor}
            onClick={() => trocarModo(valor)}
            disabled={fase !== 'idle' || emSessao || salvando}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
              modo === valor
                ? 'border border-primary/30 bg-card text-primary shadow-sm'
                : 'text-muted-foreground'
            }`}
          >
            <Icone className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <h2 className="text-base font-bold text-foreground">
          {fase === 'pausa' ? 'Pausa' : 'Sessão de foco'}
        </h2>

        <div className="mt-5 flex justify-center">
          <Anel progresso={progresso} size={260} stroke={14} gradienteId="anel-foco">
            <div className="font-mono text-5xl font-extrabold tabular-nums text-foreground">{fmt(ms)}</div>
            <select
              value={modulo}
              onChange={(e) => setModulo(e.target.value)}
              disabled={emSessao || fase !== 'idle' || salvando}
              className="mt-3 max-w-[180px] truncate rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground outline-none disabled:opacity-60"
            >
              <option value="">Sem módulo específico</option>
              {modulos.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.label}
                </option>
              ))}
            </select>
          </Anel>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">{status}</p>

        <div className="mt-5 flex flex-col gap-2">
          {fase === 'idle' && (
            <button
              onClick={iniciarFoco}
              disabled={salvando}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <Play className="h-4 w-4 fill-current" />
              Iniciar sessão
            </button>
          )}
          {fase === 'foco' && (
            <button
              onClick={() => void finalizarFoco(false)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Square className="h-4 w-4 fill-current" />
              Parar e registrar
            </button>
          )}
          {fase === 'pausa' && emSessao && (
            <>
              <button
                onClick={encerrarPausa}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Play className="h-4 w-4 fill-current" />
                Retomar sessão
              </button>
              <button
                onClick={() => void finalizarFoco(false)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary py-3 text-sm font-semibold text-primary transition-colors hover:bg-accent"
              >
                <Square className="h-4 w-4" />
                Parar e registrar
              </button>
            </>
          )}
          {fase === 'pausa' && !emSessao && (
            <button
              onClick={encerrarPausa}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary py-3.5 text-sm font-semibold text-primary transition-colors hover:bg-accent"
            >
              <Square className="h-4 w-4" />
              Encerrar pausa
            </button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            onClick={() => iniciarPausa(pausaCurtaMin)}
            disabled={!podePausar}
            className="flex flex-col items-center gap-1 rounded-xl border border-border bg-background p-3 transition-colors hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Coffee className="h-4 w-4 text-primary" />
              Pausa curta
            </span>
            <span className="text-xs text-muted-foreground">{pausaCurtaMin} min</span>
          </button>
          <button
            onClick={() => iniciarPausa(pausaLongaMin)}
            disabled={!podePausar}
            className="flex flex-col items-center gap-1 rounded-xl border border-border bg-background p-3 transition-colors hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Coffee className="h-4 w-4 text-primary" />
              Pausa longa
            </span>
            <span className="text-xs text-muted-foreground">{pausaLongaMin} min</span>
          </button>
        </div>
        {fase === 'foco' && (
          <p className="mt-2 text-xs text-muted-foreground">
            Pausar não zera a sessão — o cronômetro congela e retoma sozinho ao fim da pausa.
          </p>
        )}
      </div>

      {/* Progresso semanal */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Trophy className="h-4 w-4 text-primary" />
            Progresso semanal
          </div>
          {!editandoMeta && (
            <button
              onClick={abrirEdicaoMeta}
              className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
              title="Editar meta semanal"
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar meta
            </button>
          )}
        </div>
        {editandoMeta && (
          <div className="mt-3 rounded-xl border border-border bg-background p-3">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="meta-horas">
              Meta semanal (horas)
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id="meta-horas"
                type="number"
                min={1}
                max={72}
                step={0.5}
                value={metaHorasInput}
                onChange={(e) => setMetaHorasInput(e.target.value)}
                disabled={salvandoMeta}
                className="w-24 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
              />
              <button
                onClick={() => void salvarMeta()}
                disabled={salvandoMeta}
                className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
              >
                <Check className="h-3.5 w-3.5" />
                {salvandoMeta ? 'Salvando…' : 'Salvar'}
              </button>
              <button
                onClick={() => setEditandoMeta(false)}
                disabled={salvandoMeta}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground disabled:opacity-60"
              >
                <X className="h-3.5 w-3.5" />
                Cancelar
              </button>
            </div>
            {erroMeta && <p className="mt-1.5 text-xs font-medium text-destructive">{erroMeta}</p>}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between gap-4">
          <div>
            <div className="text-xl font-bold text-foreground">
              {fmtHoras(minutosSemana)} de {fmtHoras(metaSemanalMin)}
            </div>
            <div className="text-xs text-muted-foreground">Meta semanal</div>
            <div className="mt-2 text-xs font-semibold text-primary">{msgSemana}</div>
          </div>
          <Anel progresso={pctSemana / 100} size={84} stroke={9} gradienteId="anel-semana">
            <span className="text-sm font-bold text-foreground">{pctSemana}%</span>
          </Anel>
        </div>
      </div>
    </div>
  )
}
