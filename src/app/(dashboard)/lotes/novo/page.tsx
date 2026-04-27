import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { UploadForm } from '@/components/lotes/upload-form'

export const metadata = { title: 'Novo lote — MedMaestro' }

export default async function NovoLotePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data: boards } = await service
    .from('exam_boards')
    .select('id, name, short_name, supports_booklet_colors, default_specialty_id')
    .order('name')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1
          className="font-[family-name:var(--font-syne)]"
          style={{ fontSize: 20, fontWeight: 700, color: 'var(--mm-text)' }}
        >
          Novo lote de importação
        </h1>
        <p style={{ fontSize: 13, color: 'var(--mm-muted)', marginTop: 4 }}>
          Envie o caderno de prova e o gabarito correspondente
        </p>
      </div>

      <UploadForm
        boards={
          (boards ?? []) as {
            id: string
            name: string
            short_name: string
            supports_booklet_colors: boolean
            default_specialty_id: string | null
          }[]
        }
      />
    </div>
  )
}
