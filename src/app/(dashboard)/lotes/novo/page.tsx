import { createClient } from '@/lib/supabase/server'
import { UploadForm } from '@/components/lotes/upload-form'

export const metadata = { title: 'Novo lote — MedMaestro' }

export default async function NovoLotePage() {
  const supabase = await createClient()

  const { data: specialties } = await supabase
    .from('specialties')
    .select('id, name, exam_boards(name)')
    .order('name')

  return (
    <div className="aurora-bg flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Novo lote</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Envie o PDF da prova e, opcionalmente, o gabarito.
        </p>
      </div>

      <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-6">
        <UploadForm specialties={(specialties ?? []) as unknown as Parameters<typeof UploadForm>[0]['specialties']} />
      </div>
    </div>
  )
}
