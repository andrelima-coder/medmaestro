import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { UserRoleSelect } from '@/components/admin/user-role-select'
import { InviteUserForm } from '@/components/admin/invite-user-form'

export const metadata = { title: 'Usuários — MedMaestro' }

const ROLE_RANK: Record<string, number> = { analista: 0, professor: 1, admin: 2, superadmin: 3 }
const ROLE_LABELS: Record<string, string> = {
  analista: 'Analista',
  professor: 'Professor',
  admin: 'Admin',
  superadmin: 'Superadmin',
}

export default async function UsuariosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data: callerProfile } = await service
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if ((ROLE_RANK[callerProfile?.role ?? ''] ?? -1) < ROLE_RANK['admin']) redirect('/dashboard')

  const { data: profiles } = await service
    .from('user_profiles')
    .select('id, email, full_name, role, created_at')
    .order('created_at', { ascending: true })

  const callerRole = (callerProfile?.role ?? 'analista') as 'analista' | 'professor' | 'admin' | 'superadmin'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Usuários</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {profiles?.length ?? 0} usuário{(profiles?.length ?? 0) !== 1 ? 's' : ''} cadastrado{(profiles?.length ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex flex-col gap-1 min-w-0 w-72 shrink-0">
          <p className="text-xs text-muted-foreground">Convidar por e-mail</p>
          <InviteUserForm />
        </div>
      </div>

      <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/7">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Usuário</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Desde</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(profiles ?? []).map((p) => {
              const isSelf = p.id === user.id
              const date = new Date(p.created_at as string).toLocaleDateString('pt-BR', {
                day: '2-digit', month: '2-digit', year: '2-digit',
              })
              return (
                <tr key={p.id as string} className={isSelf ? 'bg-white/2' : 'hover:bg-white/2 transition-colors'}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground">
                        {(p.full_name as string | null) ?? '—'}
                      </span>
                      {isSelf && (
                        <span className="text-xs text-muted-foreground/50">(você)</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                    {p.email as string}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{date}</td>
                  <td className="px-4 py-3">
                    {isSelf ? (
                      <span className="text-xs text-[var(--mm-gold)]">
                        {ROLE_LABELS[p.role as string] ?? p.role}
                      </span>
                    ) : (
                      <UserRoleSelect
                        userId={p.id as string}
                        currentRole={(p.role as string ?? 'analista') as 'analista' | 'professor' | 'admin' | 'superadmin'}
                        callerRole={callerRole}
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
