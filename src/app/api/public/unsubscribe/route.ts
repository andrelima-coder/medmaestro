import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// Descadastro de e-mails de lembrete (opt-out). Público e anônimo: o link no
// rodapé dos e-mails aponta para cá com o id do lead. Marca leads.unsubscribed_at.

function page(title: string, message: string) {
  return new NextResponse(
    `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8" />
     <meta name="viewport" content="width=device-width,initial-scale=1" />
     <title>${title}</title></head>
     <body style="font-family:-apple-system,sans-serif;background:#0d0d0d;color:#eee;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
       <div style="max-width:420px;padding:32px;text-align:center">
         <h1 style="font-size:20px;margin:0 0 8px">${title}</h1>
         <p style="color:#aaa;line-height:1.5">${message}</p>
       </div>
     </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

export async function GET(request: NextRequest) {
  const leadId = request.nextUrl.searchParams.get('lead')
  if (!leadId) {
    return page('Link inválido', 'Não foi possível identificar o cadastro.')
  }

  const service = createServiceClient()
  const { error } = await service
    .from('leads')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('id', leadId)

  if (error) {
    return page('Algo deu errado', 'Tente novamente mais tarde ou responda ao e-mail solicitando o descadastro.')
  }

  return page(
    'Descadastro confirmado',
    'Você não receberá mais e-mails de lembrete desta campanha do MedMaestro.'
  )
}
