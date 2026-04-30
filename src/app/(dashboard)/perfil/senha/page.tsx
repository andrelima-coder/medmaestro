import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SenhaForm } from './senha-form'

export const metadata = { title: 'Mudar senha — MedMaestro' }

export default async function SenhaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <div>
        <h1
          className="font-[family-name:var(--font-syne)]"
          style={{ fontSize: 20, fontWeight: 700, color: 'var(--mm-text)' }}
        >
          Mudar senha
        </h1>
        <p style={{ fontSize: 13, color: 'var(--mm-muted)', marginTop: 2 }}>
          Confirme a senha atual antes de definir uma nova
        </p>
      </div>

      <SenhaForm />
    </div>
  )
}
