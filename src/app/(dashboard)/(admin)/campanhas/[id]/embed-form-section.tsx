'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateCampaignFormAction,
  createCampaignFormAction,
  type CampaignFormField,
} from '../actions'
import { buildIframeSnippet } from '@/lib/marketing/embed-snippet'

// Seção "Formulário de captação" da campanha: snippet iframe copiável para a
// equipe de design + edição pós-criação (campos extras, domínios, verificação).

const BASE_KEYS = ['name', 'email', 'whatsapp']

type ExtraField = { label: string; required: boolean }

export function EmbedFormSection({
  campaignId,
  embedId,
  fields,
  allowedDomains,
  requireEmailVerification,
  askSegment,
  appUrl,
}: {
  campaignId: string
  embedId: string | null
  fields: CampaignFormField[]
  allowedDomains: string[]
  requireEmailVerification: boolean
  askSegment: boolean
  appUrl: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const [extras, setExtras] = useState<ExtraField[]>(
    fields
      .filter((f) => !BASE_KEYS.includes(f.key))
      .map((f) => ({ label: f.label, required: f.required }))
  )
  const [domains, setDomains] = useState(allowedDomains.join(', '))
  const [reqVerif, setReqVerif] = useState(requireEmailVerification)
  const [askSeg, setAskSeg] = useState(askSegment)

  if (!embedId) {
    return (
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Formulário de captação (embed)</h2>
        <p className="text-xs text-muted-foreground">
          Esta campanha foi criada sem formulário embedável.
        </p>
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const r = await createCampaignFormAction(campaignId)
              if (!r.ok) setMessage({ ok: false, text: r.error ?? 'Falha ao gerar.' })
              else router.refresh()
            })
          }
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {isPending ? 'Gerando…' : 'Gerar formulário'}
        </button>
        {message && !message.ok && <p className="text-xs text-[#D3402A]">{message.text}</p>}
      </section>
    )
  }

  const snippet = buildIframeSnippet(embedId, appUrl)
  const previewUrl = `${appUrl.replace(/\/$/, '')}/f/${embedId}`

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setMessage({ ok: false, text: 'Não foi possível copiar. Selecione o código manualmente.' })
    }
  }

  function save() {
    setMessage(null)
    startTransition(async () => {
      const r = await updateCampaignFormAction(campaignId, {
        extraFields: extras,
        allowedDomains: domains.split(',').map((d) => d.trim()).filter(Boolean),
        requireEmailVerification: reqVerif,
        askSegment: askSeg,
      })
      setMessage(
        r.ok
          ? { ok: true, text: 'Formulário atualizado. O embed nas landings já reflete a mudança.' }
          : { ok: false, text: r.error ?? 'Falha ao salvar.' }
      )
      if (r.ok) router.refresh()
    })
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Formulário de captação (embed)</h2>
        <p className="text-xs text-muted-foreground">
          Entregue o código abaixo para a equipe de design colar na landing page. O formulário é
          hospedado pelo MedMaestro: qualquer edição feita aqui vale na hora, sem trocar o código.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copySnippet}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            {copied ? 'Copiado ✓' : 'Copiar código'}
          </button>
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-border px-4 py-2 text-sm text-foreground"
          >
            Abrir preview
          </a>
          <span className="text-xs text-muted-foreground">
            embed_id: <code>{embedId}</code>
          </span>
        </div>
        <pre className="max-h-56 overflow-auto rounded-lg bg-background p-3 text-xs text-foreground">
          {snippet}
        </pre>
      </div>

      <div className="space-y-3 rounded-xl border border-border p-4">
        <h3 className="text-xs font-semibold text-foreground">Configuração do formulário</h3>

        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={reqVerif}
            onChange={(e) => setReqVerif(e.target.checked)}
            className="mt-0.5 accent-primary"
          />
          <span>
            Exigir verificação de e-mail
            <span className="block text-xs text-muted-foreground">
              O lead recebe um código de 6 dígitos e só avança para o simulado após confirmar.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={askSeg}
            onChange={(e) => setAskSeg(e.target.checked)}
            className="mt-0.5 accent-primary"
          />
          <span>
            Perguntar se já é aluno(a) do produto
            <span className="block text-xs text-muted-foreground">
              Adiciona ao formulário a pergunta &quot;Você já é aluno(a) do MedMaestro?&quot; (Ainda não
              sou / Já sou / Sou de outro curso) e grava no segmento do lead — filtrável na aba Leads
              e no export.
            </span>
          </span>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-foreground">
            Domínios permitidos <span className="text-xs text-muted-foreground">(separados por vírgula; vazio = qualquer site)</span>
          </span>
          <input
            value={domains}
            onChange={(e) => setDomains(e.target.value)}
            placeholder="landing.exemplo.com.br, www.exemplo.com.br"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>

        <div className="space-y-2">
          <span className="block text-sm font-medium text-foreground">
            Campos extras <span className="text-xs text-muted-foreground">(além de nome, e-mail e WhatsApp)</span>
          </span>
          {extras.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={f.label}
                onChange={(e) =>
                  setExtras((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                }
                placeholder="Rótulo do campo (ex.: Cidade)"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) =>
                    setExtras((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x))
                    )
                  }
                  className="accent-primary"
                />
                obrigatório
              </label>
              <button
                type="button"
                onClick={() => setExtras((prev) => prev.filter((_, j) => j !== i))}
                className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                aria-label="Remover campo"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setExtras((prev) => [...prev, { label: '', required: false }])}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground"
          >
            + Adicionar campo
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={save}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {isPending ? 'Salvando…' : 'Salvar formulário'}
          </button>
          {message && (
            <p className={`text-xs ${message.ok ? 'text-[#006048]' : 'text-[#D3402A]'}`}>
              {message.text}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
