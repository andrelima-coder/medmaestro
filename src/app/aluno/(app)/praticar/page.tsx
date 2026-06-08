import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getModuleTags, getWeakestModule } from '@/lib/aluno/estudo'
import { PraticarClient } from './praticar-client'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Praticar — MedMaestro' }

export default async function PraticarPage({
  searchParams,
}: {
  searchParams: Promise<{ modulo?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/aluno/login')

  const service = createServiceClient()
  const modules = await getModuleTags(service)
  const weakest = await getWeakestModule(service, user.id)

  return <PraticarClient modules={modules} weakest={weakest} initialModule={sp.modulo ?? ''} />
}
