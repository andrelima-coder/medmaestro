import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getQuestionAttachmentUrl } from '@/lib/storage/signed-urls'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// UUID v4-ish básico (8-4-4-4-12 hex); aceita também ULIDs alfanuméricos curtos
const ID_RE = /^[a-zA-Z0-9_-]{8,64}$/

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params

  // Validação 1: nenhum segmento pode conter null bytes, controle, ou ..
  for (const seg of path) {
    if (
      seg.length === 0 ||
      seg.includes('\0') ||
      seg === '..' ||
      seg === '.' ||
      seg.startsWith('/')
    ) {
      return NextResponse.json({ error: 'Caminho inválido' }, { status: 400 })
    }
  }

  // Validação 2: estrutura esperada é "<questionId>/<filename>" ou
  // "inline/<questionId>/<filename>"; max 4 segmentos.
  if (path.length < 2 || path.length > 4) {
    return NextResponse.json({ error: 'Caminho com profundidade inválida' }, { status: 400 })
  }

  // Validação 3: primeiro segmento deve ser ID válido OU literal "inline"
  const head = path[0]
  if (head !== 'inline' && !ID_RE.test(head)) {
    return NextResponse.json({ error: 'Caminho inválido' }, { status: 400 })
  }

  const storagePath = path.map(decodeURIComponent).join('/')

  // Validação 4 (defesa em profundidade): após decodeURIComponent, ainda
  // não pode haver .. ou null bytes
  if (storagePath.includes('..') || storagePath.includes('\0')) {
    return NextResponse.json({ error: 'Caminho inválido' }, { status: 400 })
  }

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
