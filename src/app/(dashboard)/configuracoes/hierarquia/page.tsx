import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { HierarquiaManager } from '@/components/admin/hierarquia-manager'

export const metadata = { title: 'Hierarquia — MedMaestro' }

const ROLE_RANK: Record<string, number> = { analista: 0, professor: 1, admin: 2, superadmin: 3 }

export default async function HierarquiaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data: profile } = await service.from('user_profiles').select('role').eq('id', user.id).single()
  if ((ROLE_RANK[profile?.role ?? ''] ?? -1) < ROLE_RANK['admin']) redirect('/dashboard')

  const [{ data: boards }, { data: specialties }] = await Promise.all([
    service.from('exam_boards').select('id, name, short_name, slug').order('name'),
    service.from('specialties').select('id, name, slug').order('name'),
  ])

  const totalBoards = boards?.length ?? 0
  const totalSpecialties = specialties?.length ?? 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--mm-muted)]">
            Configurações
          </p>
          <h1 className="font-[family-name:var(--font-syne)] text-xl font-bold text-foreground">
            Hierarquia
          </h1>
          <p className="mt-1 text-[13px] text-[var(--mm-muted)]">
            Gerencie bancas e especialidades usadas no cadastro de provas.
          </p>
        </div>
        <span className="text-xs text-[var(--mm-muted)]">
          {totalBoards} bancas · {totalSpecialties} especialidades
        </span>
      </div>

      <HierarquiaManager
        initialBoards={(boards ?? []) as { id: string; name: string; short_name: string; slug: string }[]}
        initialSpecialties={(specialties ?? []) as { id: string; name: string; slug: string }[]}
      />
    </div>
  )
}
