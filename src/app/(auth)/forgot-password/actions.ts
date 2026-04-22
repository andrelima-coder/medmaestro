'use server'

import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/service'

export type ForgotState = { success?: boolean; error?: string } | null

const resend = new Resend(process.env.RESEND_API_KEY)

export async function forgotPasswordAction(
  _prev: ForgotState,
  formData: FormData
): Promise<ForgotState> {
  const email = (formData.get('email') as string)?.trim()
  if (!email) return { error: 'Informe seu e-mail.' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const supabase = createServiceClient()
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: {
      redirectTo: `${appUrl}/api/auth/callback?next=/reset-password`,
    },
  })

  if (error || !data.properties?.action_link) {
    return { error: 'Não foi possível gerar o link. Verifique o e-mail informado.' }
  }

  const { error: sendError } = await resend.emails.send({
    from: 'MedMaestro <noreply@medmaestro.com.br>',
    to: email,
    subject: 'Redefinição de senha — MedMaestro',
    html: resetEmailHtml(data.properties.action_link),
  })

  if (sendError) {
    console.error('[resend]', sendError)
    return { error: 'Falha ao enviar o e-mail. Tente novamente.' }
  }

  return { success: true }
}

function resetEmailHtml(link: string) {
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
            <h1 style="color:#fff;font-size:18px;margin:0 0 12px">Redefinição de senha</h1>
            <p style="color:#888;font-size:14px;line-height:1.6;margin:0 0 24px">
              Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha.
            </p>
            <a href="${link}"
               style="display:inline-block;background:linear-gradient(90deg,#f5a623,#e8540a);color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:500">
              Redefinir senha
            </a>
            <p style="color:#555;font-size:12px;margin:24px 0 0;line-height:1.5">
              Este link expira em 1 hora. Se você não solicitou a redefinição, ignore este e-mail.
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `
}
