import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { TagManager } from '@/components/admin/tag-manager'
import type { TagRow } from '@/components/admin/tag-manager'
import { NewTagForm } from '@/components/admin/new-tag-form'

export const metadata = { title: 'Tags — MedMaestro' }

const ROLE_RANK: Record<string, number> = { analista: 0, professor: 1, admin: 2, superadmin: 3 }

export default async function TagsPage() {
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

  const { data: tagsRaw } = await service
    .from('tags')
    .select('id, label, color, dimension, display_order, is_active')
    .order('dimension')
    .order('display_order')
    .order('label')

  const tags: TagRow[] = (tagsRaw ?? []) as TagRow[]

  const dimensionOrder = ['modulo', 'dificuldade', 'tipo_questao', 'recurso_visual']
  const sortedTags = [
    ...dimensionOrder.flatMap((d) => tags.filter((t) => t.dimension === d)),
    ...tags.filter((t) => !dimensionOrder.includes(t.dimension)),
  ]

  const activeCount = tags.filter((t) => t.is_active).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--mm-muted)]">
            Configurações
          </p>
          <h1 className="font-[family-name:var(--font-syne)] text-xl font-bold text-foreground">
            Tags Fixas de Classificação
          </h1>
          <p className="mt-1 text-[13px] text-[var(--mm-muted)]">
            {activeCount} ativas · {tags.length} total · agrupadas por dimensão
          </p>
        </div>
      </div>

      {/* Info banner purple — explica que tags são injetadas no system prompt */}
      <div className="flex items-center gap-3 rounded-[10px] border border-[rgba(139,92,246,0.20)] bg-[rgba(139,92,246,0.08)] px-4 py-3">
        <svg
          width="16"
          height="16"
          fill="none"
          stroke="var(--mm-purple)"
          strokeWidth="2"
          viewBox="0 0 24 24"
          className="flex-shrink-0"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4m0 4h.01" />
        </svg>
        <div className="text-[13px] text-[var(--mm-text2)]">
          As tags são injetadas no <strong className="text-foreground">system prompt do Claude</strong>{' '}
          durante a classificação. Alterações entram em vigor no próximo lote. Tags marcadas como{' '}
          <strong className="text-[var(--mm-gold)]">ativas</strong> aparecem nos filtros e na exportação.
        </div>
      </div>

      <NewTagForm />

      <TagManager tags={sortedTags} />
    </div>
  )
}
