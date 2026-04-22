import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { AuditFilters } from '@/components/admin/audit-filters'
import { Suspense } from 'react'

export const metadata = { title: 'Auditoria — MedMaestro' }

const PAGE_SIZE = 30

const ROLE_RANK: Record<string, number> = { analista: 0, professor: 1, admin: 2, superadmin: 3 }

type SearchParams = {
  entity_type?: string
  action?: string
  user_id?: string
  page?: string
}

const ACTION_LABELS: Record<string, string> = {
  exam_uploaded: 'Upload de prova',
  exam_status_changed: 'Status do exame alterado',
  question_tags_updated: 'Tags da questão atualizadas',
  question_approved: 'Questão aprovada',
  question_rejected: 'Questão rejeitada',
  question_flagged: 'Questão sinalizada',
  comment_generated: 'Comentário gerado por IA',
  comment_edited: 'Comentário editado',
  tag_created: 'Tag criada',
  tag_updated: 'Tag atualizada',
  tag_toggled: 'Tag ativada/desativada',
  tag_reordered: 'Tag reordenada',
  simulado_created: 'Simulado criado',
  simulado_deleted: 'Simulado excluído',
  simulado_question_added: 'Questão adicionada ao simulado',
  simulado_question_removed: 'Questão removida do simulado',
  user_role_changed: 'Role de usuário alterado',
  INSERT: 'Inserção (trigger)',
  UPDATE: 'Atualização (trigger)',
  DELETE: 'Exclusão (trigger)',
}

const ENTITY_LABELS: Record<string, string> = {
  question: 'Questão',
  exam: 'Exame',
  tag: 'Tag',
  simulado: 'Simulado',
  tags: 'Tags (catálogo)',
  exams: 'Exames (catálogo)',
  exam_boards: 'Bancas',
  specialties: 'Especialidades',
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
  const { data: profile } = await service
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if ((ROLE_RANK[profile?.role ?? ''] ?? -1) < ROLE_RANK['admin']) {
    redirect('/dashboard')
  }

  const params = await searchParams
  const filterEntityType = params.entity_type ?? ''
  const filterAction = params.action ?? ''
  const filterUserId = params.user_id ?? ''
  const page = Math.max(1, parseInt(params.page ?? '1'))
  const offset = (page - 1) * PAGE_SIZE

  // Query principal com filtros
  let query = service
    .from('audit_logs')
    .select('id, user_id, entity_type, entity_id, action, before_data, after_data, created_at', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (filterEntityType) query = query.eq('entity_type', filterEntityType)
  if (filterAction) query = query.eq('action', filterAction)
  if (filterUserId) query = query.eq('user_id', filterUserId)

  const { data: logs, count } = await query
  const total = count ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Busca nomes dos usuários que aparecem nos logs
  const userIds = [...new Set((logs ?? []).map((l) => l.user_id).filter(Boolean) as string[])]
  const { data: profiles } = userIds.length
    ? await service
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)
    : { data: [] }

  const userMap = Object.fromEntries(
    (profiles ?? []).map((p) => [
      p.id,
      (p.full_name as string | null) ?? (p.email as string | null) ?? p.id,
    ])
  )

  // Distinct entity_types para filtro
  const { data: entityTypes } = await service
    .from('audit_logs')
    .select('entity_type')
    .limit(200)

  const distinctEntityTypes = [
    ...new Set((entityTypes ?? []).map((r) => r.entity_type as string)),
  ].sort()

  return (
    <div className="aurora-bg flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Auditoria</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {total} registro{total !== 1 ? 's' : ''}
        </p>
      </div>

      <Suspense>
        <AuditFilters
          entityTypes={distinctEntityTypes}
          current={{ entity_type: filterEntityType, action: filterAction }}
        />
      </Suspense>

      {total === 0 ? (
        <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-10 text-center text-sm text-muted-foreground">
          Nenhum registro encontrado.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {(logs ?? []).map((log) => {
            const userName = log.user_id ? (userMap[log.user_id] ?? log.user_id) : 'Sistema'
            const actionLabel = ACTION_LABELS[log.action as string] ?? (log.action as string)
            const entityLabel =
              ENTITY_LABELS[log.entity_type as string] ?? (log.entity_type as string)
            const date = new Date(log.created_at as string).toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })

            return (
              <div
                key={log.id as string}
                className="rounded-xl border border-white/5 bg-[var(--mm-surface)]/40 p-4 flex flex-col gap-2"
              >
                {/* Cabeçalho do evento */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-foreground">{actionLabel}</span>
                    <span className="text-xs text-muted-foreground/50">·</span>
                    <span className="text-xs text-muted-foreground">{entityLabel}</span>
                    <span className="text-xs font-mono text-muted-foreground/40 truncate max-w-[120px]">
                      {(log.entity_id as string).slice(0, 8)}…
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-right">
                    <span className="text-xs text-[var(--mm-gold)]">{userName}</span>
                    <span className="text-xs text-muted-foreground/50">{date}</span>
                  </div>
                </div>

                {/* Diff before/after */}
                {(log.before_data || log.after_data) && (
                  <AuditDiff
                    before={log.before_data as Record<string, unknown> | null}
                    after={log.after_data as Record<string, unknown> | null}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={buildUrl(params, page - 1)}
                className="rounded-lg border border-white/8 px-3 py-1.5 hover:text-foreground hover:bg-white/4 transition-colors"
              >
                ← Anterior
              </a>
            )}
            {page < totalPages && (
              <a
                href={buildUrl(params, page + 1)}
                className="rounded-lg border border-white/8 px-3 py-1.5 hover:text-foreground hover:bg-white/4 transition-colors"
              >
                Próximo →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function AuditDiff({
  before,
  after,
}: {
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}) {
  // Campos internos que não vale mostrar no diff
  const SKIP = new Set(['id', 'created_at', 'updated_at'])

  const keys = [
    ...new Set([
      ...Object.keys(before ?? {}).filter((k) => !SKIP.has(k)),
      ...Object.keys(after ?? {}).filter((k) => !SKIP.has(k)),
    ]),
  ]

  if (keys.length === 0) return null

  const changed = keys.filter(
    (k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])
  )

  if (changed.length === 0 && !(!before || !after)) return null

  return (
    <div className="rounded-lg border border-white/5 bg-black/20 p-3 flex flex-col gap-1">
      {changed.map((key) => (
        <div key={key} className="flex items-start gap-2 text-xs font-mono">
          <span className="text-muted-foreground/60 shrink-0 w-28 truncate">{key}</span>
          {before && key in before && (
            <span className="text-red-400/70 line-through truncate max-w-[200px]">
              {formatVal(before[key])}
            </span>
          )}
          {after && key in after && (
            <span className="text-green-400/80 truncate max-w-[200px]">
              {formatVal(after[key])}
            </span>
          )}
        </div>
      ))}
      {/* Para INSERT/DELETE mostra um resumo dos campos principais */}
      {changed.length === 0 && keys.slice(0, 4).map((key) => (
        <div key={key} className="flex items-start gap-2 text-xs font-mono">
          <span className="text-muted-foreground/60 shrink-0 w-28 truncate">{key}</span>
          <span className="text-foreground/70 truncate max-w-[300px]">
            {formatVal((after ?? before ?? {})[key])}
          </span>
        </div>
      ))}
    </div>
  )
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'sim' : 'não'
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 80)
  return String(v).slice(0, 80)
}

function buildUrl(params: SearchParams, newPage: number): string {
  const p = new URLSearchParams()
  if (params.entity_type) p.set('entity_type', params.entity_type)
  if (params.action) p.set('action', params.action)
  if (params.user_id) p.set('user_id', params.user_id)
  p.set('page', String(newPage))
  return `/auditoria?${p.toString()}`
}
