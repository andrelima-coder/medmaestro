import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getErrorCards } from '@/lib/aluno/estudo'
import { RevisaoClient } from './revisao-client'

export const metadata = { title: 'Revisão de erros — MedMaestro' }

export default async function RevisaoPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/aluno/login')

  const service = createServiceClient()
  const cards = await getErrorCards(service, user.id)

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-foreground">Revisão de erros</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Questões que você errou (na prática e nos simulados). Revise e marque as que já dominou.
      </p>
      <RevisaoClient cards={cards} />
    </div>
  )
}
