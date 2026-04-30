import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getQuestionAttachmentUrl } from '@/lib/storage/signed-urls'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const storagePath = path.map(decodeURIComponent).join('/')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const url = await getQuestionAttachmentUrl(storagePath)
    return NextResponse.redirect(url, 302)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Falha ao gerar URL' },
      { status: 404 }
    )
  }
}
