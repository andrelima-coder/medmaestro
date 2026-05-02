'use server'

import { revalidatePath } from 'next/cache'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'

const resend = new Resend(process.env.RESEND_API_KEY)

const ROLES = ['analista', 'professor', 'admin', 'superadmin'] as const
type Role = typeof ROLES[number]

const ROLE_RANK: Record<string, number> = { analista: 0, professor: 1, admin: 2, superadmin: 3 }

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const service = createServiceClient()
  const { data: profile } = await service.from('user_profiles').select('role').eq('id', user.id).single()
  if ((ROLE_RANK[profile?.role ?? ''] ?? -1) < ROLE_RANK['admin']) return null
  return { user, role: profile?.role as Role }
}

export async function changeUserRole(
  targetUserId: string,
  newRole: Role
): Promise<{ ok: boolean; error?: string }> {
  const caller = await assertAdmin()
  if (!caller) return { ok: false, error: 'Sem permissão' }

  if (!ROLES.includes(newRole)) return { ok: false, error: 'Role inválido' }

  // Apenas superadmin pode promover a superadmin ou rebaixar superadmin
  const service = createServiceClient()
  const { data: target } = await service
    .from('user_profiles')
    .select('role, email')
    .eq('id', targetUserId)
    .single()

  if (!target) return { ok: false, error: 'Usuário não encontrado' }

  const callerRank = ROLE_RANK[caller.role] ?? -1
  const targetCurrentRank = ROLE_RANK[target.role ?? ''] ?? -1
  const newRoleRank = ROLE_RANK[newRole] ?? -1

  if (callerRank < ROLE_RANK['superadmin']) {
    if (newRoleRank >= ROLE_RANK['superadmin']) {
      return { ok: false, error: 'Apenas superadmin pode atribuir esse nível' }
    }
    if (targetCurrentRank >= ROLE_RANK['superadmin']) {
      return { ok: false, error: 'Apenas superadmin pode alterar outro superadmin' }
    }
  }

  const { error } = await service
    .from('user_profiles')
    .update({ role: newRole, updated_at: new Date().toISOString() })
    .eq('id', targetUserId)

  if (error) return { ok: false, error: error.message }

  await logAudit(caller.user.id, 'profiles', targetUserId, 'user_role_changed',
    { role: target.role },
    { role: newRole }
  )

  revalidatePath('/configuracoes/usuarios')
  return { ok: true }
}

export async function inviteUserAction(
  _prev: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const caller = await assertAdmin()
  if (!caller) return { ok: false, error: 'Sem permissão' }

  const email = (formData.get('email') as string)?.trim().toLowerCase()
  if (!email || !email.includes('@')) return { ok: false, error: 'E-mail inválido' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const service = createServiceClient()

  const { data, error } = await service.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${appUrl}/api/auth/callback?next=/reset-password` },
  })

  if (error || !data.properties?.action_link) {
    return { ok: false, error: error?.message ?? 'Falha ao gerar convite' }
  }

  const { error: sendError } = await resend.emails.send({
    from: 'MedMaestro <noreply@medmaestro.com.br>',
    to: email,
    subject: 'Convite para o MedMaestro',
    html: inviteEmailHtml(data.properties.action_link),
  })

  if (sendError) {
    console.error('[resend invite]', sendError)
    return { ok: false, error: 'Falha ao enviar o e-mail' }
  }

  await logAudit(caller.user.id, 'profiles', email, 'user_invited', null, { email })
  revalidatePath('/configuracoes/usuarios')
  return { ok: true }
}

function inviteEmailHtml(link: string) {
  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
    <body style="background:#0d0d0d;margin:0;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto">
        <tr>
          <td style="text-align:center;padding-bottom:32px">
            <span style="font-size:24px;font-weight:600;color:#fff">Med<span style="color:#f5a623">Maestro</span></span>
          </td>
        </tr>
        <tr>
          <td style="background:#1a1a1a;border-radius:12px;padding:32px;border:1px solid rgba(255,255,255,0.08)">
            <h1 style="color:#fff;font-size:18px;margin:0 0 12px">Você foi convidado</h1>
            <p style="color:#888;font-size:14px;line-height:1.6;margin:0 0 24px">
              Você recebeu um convite para acessar o MedMaestro. Clique no botão abaixo para criar sua senha e começar.
            </p>
            <a href="${link}"
               style="display:inline-block;background:linear-gradient(90deg,#f5a623,#e8540a);color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:500">
              Aceitar convite
            </a>
            <p style="color:#555;font-size:12px;margin:24px 0 0;line-height:1.5">
              Este link expira em 24 horas. Se você não esperava este convite, pode ignorar este e-mail.
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `
}
