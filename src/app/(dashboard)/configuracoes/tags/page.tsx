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

  return (
    <div className="aurora-bg flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Tags</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {tags.filter((t) => t.is_active).length} ativas · {tags.length} total
          </p>
        </div>
      </div>

      <NewTagForm />

      <TagManager tags={sortedTags} />
    </div>
  )
}
