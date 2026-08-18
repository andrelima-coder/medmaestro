'use client'

import { useState, useTransition } from 'react'
import {
  updateCampaignAction,
  setCampaignStatusAction,
  type CampaignConfig,
} from '../actions'

// Configurações editáveis da campanha (janela de acesso, liberações, modo de
// prova, publicação). Datas trafegam como ISO UTC; os inputs datetime-local
// são SEMPRE interpretados como horário de Brasília (UTC-3 fixo desde 2019),
// independentemente do fuso do navegador — mesma regra da criação no servidor.

function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

function localInputToIso(v: string): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null
  const d = new Date(`${v}:00-03:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function ConfigSection({
  campaignId,
  status,
  initial,
}: {
  campaignId: string
  status: string
  initial: CampaignConfig
}) {
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [name, setName] = useState(initial.name)
  const [duration, setDuration] = useState(String(initial.durationMinutes))
  const [accessMode, setAccessMode] = useState(initial.accessMode)
  const [windowStart, setWindowStart] = useState(isoToLocalInput(initial.windowStart))
  const [windowEnd, setWindowEnd] = useState(isoToLocalInput(initial.windowEnd))
  const [pauseAllowed, setPauseAllowed] = useState(initial.pauseAllowed)
  const [liveAt, setLiveAt] = useState(isoToLocalInput(initial.liveAt))
  const [liveUrl, setLiveUrl] = useState(initial.liveUrl ?? '')
  const [relNota, setRelNota] = useState(initial.releases.nota_gabarito)
  const [comentMode, setComentMode] = useState(initial.releases.comentarios_mode)
  const [comentAt, setComentAt] = useState(isoToLocalInput(initial.releases.comentarios_release_at))
  const [comentUntil, setComentUntil] = useState(
    isoToLocalInput(initial.releases.comentarios_release_until)
  )
  const [relRevisao, setRelRevisao] = useState(initial.releases.revisao)
  const [relDashboard, setRelDashboard] = useState(initial.releases.dashboard)

  function save() {
    setMsg(null)
    startTransition(async () => {
      const res = await updateCampaignAction(campaignId, {
        name,
        durationMinutes: Number(duration),
        accessMode,
        windowStart: localInputToIso(windowStart),
        windowEnd: localInputToIso(windowEnd),
        pauseAllowed,
        liveAt: localInputToIso(liveAt),
        liveUrl: liveUrl || null,
        releases: {
          nota_gabarito: relNota,
          comentarios_mode: comentMode,
          comentarios_release_at: localInputToIso(comentAt),
          comentarios_release_until: localInputToIso(comentUntil),
          revisao: relRevisao,
          dashboard: relDashboard,
        },
      })
      setMsg(
        res.ok
          ? { ok: true, text: 'Configurações salvas.' }
          : { ok: false, text: res.error ?? 'Falha ao salvar.' }
      )
    })
  }

  function togglePublish() {
    setMsg(null)
    startTransition(async () => {
      const res = await setCampaignStatusAction(campaignId, status !== 'publicada')
      if (!res.ok) setMsg({ ok: false, text: res.error ?? 'Falha ao alterar o status.' })
    })
  }

  const published = status === 'publicada'
  const inputCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm'

  return (
    <section className="space-y-4 rounded-xl border border-border p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-foreground">Configurações da prova</h2>
        <button
          type="button"
          onClick={togglePublish}
          disabled={isPending}
          className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
            published
              ? 'border border-border text-foreground hover:bg-muted'
              : 'bg-primary text-primary-foreground'
          }`}
        >
          {published ? 'Despublicar' : 'Publicar para participantes'}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium text-foreground">Nome</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">Duração (minutos)</span>
          <input
            type="number"
            min={1}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className={inputCls}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">Modo de acesso</span>
          <select
            value={accessMode}
            onChange={(e) => setAccessMode(e.target.value as CampaignConfig['accessMode'])}
            className={inputCls}
          >
            <option value="imediato">Imediato (assim que publicada)</option>
            <option value="data_unica">A partir de uma data</option>
            <option value="janela">Janela (início e fim)</option>
          </select>
        </label>

        {accessMode !== 'imediato' && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">Início do acesso</span>
            <input
              type="datetime-local"
              value={windowStart}
              onChange={(e) => setWindowStart(e.target.value)}
              className={inputCls}
            />
          </label>
        )}
        {accessMode === 'janela' && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">Fim do acesso</span>
            <input
              type="datetime-local"
              value={windowEnd}
              onChange={(e) => setWindowEnd(e.target.value)}
              className={inputCls}
            />
          </label>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={pauseAllowed}
          onChange={(e) => setPauseAllowed(e.target.checked)}
        />
        Permitir pausar e retomar
        <span className="text-xs text-muted-foreground">
          (desmarcado = modo realista: a prova segue ininterrupta)
        </span>
      </label>

      <div className="space-y-3 rounded-lg border border-border/60 p-3">
        <p className="text-xs font-semibold text-muted-foreground">Liberações pós-prova</p>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={relNota} onChange={(e) => setRelNota(e.target.checked)} />
          Liberar nota e gabarito
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={relRevisao}
            onChange={(e) => setRelRevisao(e.target.checked)}
          />
          Liberar revisão das questões (com distribuição por alternativa)
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={relDashboard}
            onChange={(e) => setRelDashboard(e.target.checked)}
          />
          Liberar dashboard de desempenho
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">Comentários das questões</span>
          <select
            value={comentMode}
            onChange={(e) =>
              setComentMode(e.target.value as CampaignConfig['releases']['comentarios_mode'])
            }
            className={inputCls}
          >
            <option value="oculto">Ocultos (gancho da live)</option>
            <option value="imediato">Liberados logo após o término</option>
            <option value="data">Liberados em um intervalo de datas</option>
          </select>
        </label>
        {comentMode === 'data' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">Liberar a partir de</span>
              <input
                type="datetime-local"
                value={comentAt}
                onChange={(e) => setComentAt(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">
                Até (opcional)
              </span>
              <input
                type="datetime-local"
                value={comentUntil}
                onChange={(e) => setComentUntil(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>
        )}
        {comentMode === 'imediato' && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">
              Visíveis até (opcional)
            </span>
            <input
              type="datetime-local"
              value={comentUntil}
              onChange={(e) => setComentUntil(e.target.value)}
              className={inputCls}
            />
          </label>
        )}

        {accessMode === 'janela' && (relNota || comentMode === 'imediato') && (
          <p className="rounded-lg bg-[rgba(158,102,6,0.08)] p-2 text-xs text-[#9E6606]">
            Atenção: com janela de acesso aberta e nota/comentários liberados logo após o término,
            quem entrega cedo vê o gabarito enquanto outros ainda podem iniciar a prova. Para uma
            aplicação isonômica, libere nota e comentários só depois do fim da janela.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">Data da live</span>
          <input
            type="datetime-local"
            value={liveAt}
            onChange={(e) => setLiveAt(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">Link da live</span>
          <input value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)} className={inputCls} />
        </label>
      </div>

      {msg && (
        <p role="alert" className={`text-sm ${msg.ok ? 'text-[#006048]' : 'text-[#D3402A]'}`}>
          {msg.text}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={isPending}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {isPending ? 'Salvando…' : 'Salvar configurações'}
      </button>
    </section>
  )
}
