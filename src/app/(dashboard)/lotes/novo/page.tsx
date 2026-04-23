import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { UploadForm } from '@/components/lotes/upload-form'

export const metadata = { title: 'Novo lote — MedMaestro' }

export default async function NovoLotePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const [{ data: specialties }, { data: boards }] = await Promise.all([
    service.from('specialties').select('id, name').order('name'),
    service.from('exam_boards').select('id, name, short_name').order('name'),
  ])

  return (
    <div className="aurora-bg flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Novo lote</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Envie o PDF da prova e, opcionalmente, o gabarito.
        </p>
      </div>

      <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-6">
        <UploadForm
          specialties={(specialties ?? []) as { id: string; name: string }[]}
          boards={(boards ?? []) as { id: string; name: string; short_name: string }[]}
        />
      </div>
    </div>
  )
}
