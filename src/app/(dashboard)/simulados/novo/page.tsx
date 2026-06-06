import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NovoSimuladoForm } from '@/components/simulados/novo-simulado-form'

export const metadata = { title: 'Novo simulado — MedMaestro' }

const ALLOWED_STATUSES = ['pending_review', 'in_review', 'pending_approval', 'approved', 'published']

export default async function NovoSimuladoPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const [modulosRes, poolRes, variationsRes] = await Promise.all([
    service
      .from('tags')
      .select('id, slug, label')
      .eq('dimension', 'modulo')
      .order('display_order'),
    service
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .in('status', ALLOWED_STATUSES),
    service
      .from('question_variations')
      .select('id', { count: 'exact', head: true })
      .eq('approved', true),
  ])

  const modulosRaw = (modulosRes.data ?? []).map((m) => ({
    id: m.id as string,
    slug: m.slug as string,
    label: m.label as string,
  }))

  const modulos = modulosRaw.map(({ slug, label }) => ({ slug, label }))

  const countsBySlug: Record<string, number> = {}
  await Promise.all(
    modulosRaw.map(async (m) => {
      const { count } = await service
        .from('question_tags')
        .select('question_id, questions!inner(status)', { count: 'exact', head: true })
        .eq('tag_id', m.id)
        .in('questions.status', ALLOWED_STATUSES)
      countsBySlug[m.slug] = count ?? 0
    })
  )

  const poolCount = poolRes.count ?? 0
  const variationsCount = variationsRes.count ?? 0

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link
          href="/simulados"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Simulados
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-foreground">Novo simulado</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Defina tamanho, mistura de fontes e distribuição por módulo.
        </p>
      </div>

      <NovoSimuladoForm
        modulos={modulos}
        countsBySlug={countsBySlug}
        poolCount={poolCount}
        variationsCount={variationsCount}
      />
    </div>
  )
}
