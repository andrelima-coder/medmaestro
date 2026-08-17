import { CadastroForm } from './cadastro-form'
import { verifyLeadToken } from '@/lib/marketing/lead-verification'
import { createServiceClient } from '@/lib/supabase/service'

export const metadata = { title: 'Criar conta — MedMaestro' }

// `lt` = token assinado (HMAC) do lead vindo do formulário embedável após a
// verificação de e-mail; pré-preenche o cadastro para não redigitar os dados.

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ lt?: string }>
}) {
  const { lt } = await searchParams

  let defaults: { fullName?: string; email?: string; phone?: string } | undefined
  if (lt) {
    const leadId = verifyLeadToken(lt)
    if (leadId) {
      const service = createServiceClient()
      const { data: lead } = await service
        .from('leads')
        .select('email, fields')
        .eq('id', leadId)
        .single()
      if (lead) {
        const f = (lead.fields ?? {}) as Record<string, unknown>
        defaults = {
          fullName: typeof f.name === 'string' ? f.name : undefined,
          email: lead.email,
          phone: typeof f.whatsapp === 'string' ? f.whatsapp : undefined,
        }
      }
    }
  }

  return <CadastroForm defaults={defaults} />
}
