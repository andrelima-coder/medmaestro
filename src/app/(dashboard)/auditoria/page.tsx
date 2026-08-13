import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const metadata = { title: 'Auditoria — MedMaestro' }

const PAGE_SIZE = 30
const ROLE_RANK: Record<string, number> = { analista: 0, professor: 1, admin: 2, superadmin: 3 }

type SearchParams = {
  action?: string
  page?: string
}

// Configuração de badges por tipo de ação
const ACTION_CONFIG: Record<
  string,
  { label: string; bg: string; color: string; border: string }
> = {
  // Extrações
  exam_uploaded: {
    label: 'Upload',
    bg: 'rgba(251,174,64,0.1)',
    color: '#9E6606',
    border: 'rgba(251,174,64,0.25)',
  },
  exam_status_changed: {
    label: 'Extração',
    bg: 'rgba(251,174,64,0.1)',
    color: '#9E6606',
    border: 'rgba(251,174,64,0.25)',
  },
  // Classificações
  question_tags_updated: {
    label: 'Classificação',
    bg: 'rgba(32,105,115,0.1)',
    color: '#206973',
    border: 'rgba(32,105,115,0.25)',
  },
  // Comentários
  comment_generated: {
    label: 'Comentário IA',
    bg: 'rgba(123,63,160,0.1)',
    color: '#7B3FA0',
    border: 'rgba(123,63,160,0.25)',
  },
  comment_edited: {
    label: 'Comentário',
    bg: 'rgba(123,63,160,0.1)',
    color: '#7B3FA0',
    border: 'rgba(123,63,160,0.25)',
  },
  // Publicações / Validações
  question_approved: {
    label: 'Validação',
    bg: 'rgba(0,96,72,0.1)',
    color: '#006048',
    border: 'rgba(0,96,72,0.25)',
  },
  question_rejected: {
    label: 'Rejeição',
    bg: 'rgba(211,64,42,0.1)',
    color: '#D3402A',
    border: 'rgba(211,64,42,0.25)',
  },
  question_published: {
    label: 'Publicação',
    bg: 'rgba(0,96,72,0.15)',
    color: '#006048',
    border: 'rgba(0,96,72,0.3)',
  },
  // Edições
  question_flagged: {
    label: 'Edição manual',
    bg: 'rgba(32,105,115,0.1)',
    color: '#206973',
    border: 'rgba(32,105,115,0.25)',
  },
  tag_created: {
    label: 'Edição',
    bg: 'rgba(32,105,115,0.1)',
    color: '#206973',
    border: 'rgba(32,105,115,0.25)',
  },
  tag_updated: {
    label: 'Edição',
    bg: 'rgba(32,105,115,0.1)',
    color: '#206973',
    border: 'rgba(32,105,115,0.25)',
  },
  user_role_changed: {
    label: 'Edição manual',
    bg: 'rgba(32,105,115,0.1)',
    color: '#206973',
    border: 'rgba(32,105,115,0.25)',
  },
  // Triggers DB
  INSERT: {
    label: 'Inserção',
    bg: 'var(--mm-gold-bg)',
    color: 'var(--mm-gold)',
    border: 'var(--mm-gold-border)',
  },
  UPDATE: {
    label: 'Atualização',
    bg: 'rgba(32,105,115,0.1)',
    color: '#206973',
    border: 'rgba(32,105,115,0.25)',
  },
  DELETE: {
    label: 'Exclusão',
    bg: 'rgba(211,64,42,0.1)',
    color: '#D3402A',
    border: 'rgba(211,64,42,0.25)',
  },
}

// Grupos de filtro para chips
const FILTER_TABS = [
  { key: '', label: 'Todos' },
  { key: 'exam_uploaded,exam_status_changed', label: 'Extrações' },
  { key: 'question_tags_updated', label: 'Classificações' },
  { key: 'comment_generated,comment_edited', label: 'Comentários' },
  { key: 'question_approved,question_published', label: 'Publicações' },
  { key: 'tag_created,tag_updated,user_role_changed,question_flagged', label: 'Edições manuais' },
]

function getActionBadge(action: string) {
  return (
    ACTION_CONFIG[action] ?? {
      label: action,
      bg: 'var(--mm-gold-bg)',
      color: 'var(--mm-gold)',
      border: 'var(--mm-gold-border)',
    }
  )
}

function buildUrl(params: SearchParams, overrides: Partial<SearchParams>): string {
  const p = new URLSearchParams()
  const merged = { ...params, ...overrides }
  if (merged.action) p.set('action', merged.action)
  if (merged.page) p.set('page', merged.page)
  return `/auditoria${p.toString() ? '?' + p.toString() : ''}`
}

function formatDetail(after_data: unknown, action: string): string {
  if (!after_data || typeof after_data !== 'object') return action
  const obj = after_data as Record<string, unknown>
  // Mostra campos relevantes
  const interesting = ['status', 'role', 'label', 'dimension', 'name', 'title']
  for (const key of interesting) {
    if (obj[key] !== undefined) {
      return `${key}: ${String(obj[key]).slice(0, 40)}`
    }
  }
  return JSON.stringify(obj).slice(0, 60)
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single()
  if ((ROLE_RANK[profile?.role ?? ''] ?? -1) < ROLE_RANK['admin']) redirect('/dashboard')

  const params = await searchParams
  const actionFilter = params.action ?? ''
  const page = Math.max(1, parseInt(params.page ?? '1'))
  const offset = (page - 1) * PAGE_SIZE

  // Query principal
  let query = service
    .from('audit_logs')
    .select('id, user_id, entity_type, entity_id, action, before_data, after_data, created_at', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  // Filtro: action pode ser uma lista separada por vírgula
  if (actionFilter) {
    const actions = actionFilter.split(',').map((a) => a.trim()).filter(Boolean)
    if (actions.length === 1) {
      query = query.eq('action', actions[0])
    } else if (actions.length > 1) {
      query = query.in('action', actions)
    }
  }

  const { data: logs, count } = await query
  const total = count ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Resolve nomes de usuários
  const userIds = [
    ...new Set((logs ?? []).map((l) => l.user_id).filter(Boolean) as string[]),
  ]
  const userMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await service
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds)
    for (const p of profiles ?? []) {
      userMap[p.id] = (p.full_name as string | null) ?? (p.email as string | null) ?? p.id
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1
          className="font-[family-name:var(--font-syne)]"
          style={{ fontSize: 20, fontWeight: 700, color: 'var(--mm-text)' }}
        >
          Logs e Auditoria
        </h1>
        <p style={{ fontSize: 13, color: 'var(--mm-muted)', marginTop: 2 }}>
          {total.toLocaleString('pt-BR')} registro{total !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Chips de filtro */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {FILTER_TABS.map((tab) => {
          const isActive = actionFilter === tab.key
          return (
            <Link
              key={tab.key}
              href={buildUrl(params, { action: tab.key, page: '1' })}
              style={{
                padding: '5px 14px',
                borderRadius: 20,
                fontSize: 11,
                textDecoration: 'none',
                border: isActive
                  ? '1px solid var(--mm-gold-border)'
                  : '1px solid var(--mm-line2)',
                background: isActive ? 'var(--mm-gold-bg)' : 'transparent',
                color: isActive ? 'var(--mm-gold)' : 'var(--mm-text2)',
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      {/* Tabela */}
      {total === 0 ? (
        <div
          style={{
            background: 'var(--mm-surface)',
            border: '1px solid var(--mm-line)',
            borderRadius: 12,
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--mm-muted)',
            fontSize: 13,
          }}
        >
          Nenhum registro encontrado.
        </div>
      ) : (
        <div
          style={{
            background: 'var(--mm-surface)',
            border: '1px solid var(--mm-line)',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['DATA/HORA', 'USUÁRIO', 'AÇÃO', 'ENTIDADE', 'CAMPO', 'DETALHE'].map((col) => (
                  <th
                    key={col}
                    style={{
                      textAlign: 'left',
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'var(--mm-muted)',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      padding: '10px 12px',
                      borderBottom: '1px solid var(--mm-line2)',
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(logs ?? []).map((log) => {
                const userName = log.user_id
                  ? (userMap[log.user_id as string] ?? (log.user_id as string).slice(0, 8))
                  : 'Sistema'
                const action = log.action as string
                const badge = getActionBadge(action)
                const entityId = (log.entity_id as string | null) ?? ''
                const entityType = (log.entity_type as string | null) ?? ''
                const detail = formatDetail(log.after_data, action)

                const date = new Date(log.created_at as string).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })

                return (
                  <tr
                    key={log.id as string}
                    style={{ borderBottom: '1px solid var(--mm-line)' }}
                  >
                    {/* DATA/HORA */}
                    <td
                      style={{
                        padding: '10px 12px',
                        fontSize: 11,
                        color: 'var(--mm-muted)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {date}
                    </td>

                    {/* USUÁRIO */}
                    <td
                      style={{
                        padding: '10px 12px',
                        fontSize: 12,
                        color: 'var(--mm-gold)',
                        maxWidth: 120,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {userName}
                    </td>

                    {/* AÇÃO badge */}
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          background: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.border}`,
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 20,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {badge.label}
                      </span>
                    </td>

                    {/* ENTIDADE / ID curto */}
                    <td
                      style={{
                        padding: '10px 12px',
                        fontSize: 11,
                        color: 'var(--mm-text2)',
                        fontFamily: 'var(--font-geist-mono)',
                      }}
                    >
                      {entityId ? entityId.slice(0, 8) + '…' : '—'}
                    </td>

                    {/* CAMPO / entity_type */}
                    <td
                      style={{
                        padding: '10px 12px',
                        fontSize: 11,
                        color: 'var(--mm-muted)',
                      }}
                    >
                      {entityType || '—'}
                    </td>

                    {/* DETALHE */}
                    <td
                      style={{
                        padding: '10px 12px',
                        fontSize: 11,
                        color: 'var(--mm-text2)',
                        maxWidth: 220,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {detail}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--mm-muted)' }}>
            Página {page} de {totalPages}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {page > 1 && (
              <Link
                href={buildUrl(params, { page: String(page - 1) })}
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  border: '1px solid var(--mm-line2)',
                  color: 'var(--mm-text2)',
                  textDecoration: 'none',
                }}
              >
                ← Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildUrl(params, { page: String(page + 1) })}
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  border: '1px solid var(--mm-line2)',
                  color: 'var(--mm-text2)',
                  textDecoration: 'none',
                }}
              >
                Próximo →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
