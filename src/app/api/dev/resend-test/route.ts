import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Teste de conexão do Resend. Admin logado dispara um e-mail para o PRÓPRIO
// endereço (não aceita destinatário arbitrário, para não virar vetor de spam).
// Uso: GET /api/dev/resend-test  → retorna { ok, id } ou { ok:false, error }.

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
  }

  const service = createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!['admin', 'superadmin'].includes(profile?.role ?? '')) {
    return NextResponse.json({ ok: false, error: 'Sem permissão' }, { status: 403 })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: false, error: 'RESEND_API_KEY ausente' }, { status: 500 })
  }
  if (!user.email) {
    return NextResponse.json({ ok: false, error: 'Usuário sem e-mail' }, { status: 400 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { data, error } = await resend.emails.send({
    from: 'MedMaestro <noreply@medmaestro.com.br>',
    to: user.email,
    subject: 'Teste de conexão — MedMaestro (Resend)',
    html: `<div style="font-family:sans-serif">
      <h2>Funcionou ✅</h2>
      <p>Este é um e-mail de teste do MedMaestro para validar a integração com o Resend.</p>
      <p style="color:#777;font-size:12px">Enviado em ${new Date().toLocaleString('pt-BR')}.</p>
    </div>`,
  })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message ?? String(error) }, { status: 502 })
  }
  return NextResponse.json({ ok: true, id: data?.id, to: user.email })
}
