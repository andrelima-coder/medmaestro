import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getModuleTags } from '@/lib/aluno/estudo'
import { PraticarClient } from './praticar-client'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Praticar — MedMaestro' }

export default async function PraticarPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/aluno/login')

  const service = createServiceClient()
  const modules = await getModuleTags(service)

  return <PraticarClient modules={modules} />
}
