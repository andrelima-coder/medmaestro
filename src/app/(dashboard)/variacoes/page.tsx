import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Variações — MedMaestro' }

export default async function VariacoesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1
          className="font-[family-name:var(--font-syne)]"
          style={{ fontSize: 20, fontWeight: 700, color: 'var(--mm-text)' }}
        >
          Variações
        </h1>
        <p style={{ fontSize: 13, color: 'var(--mm-muted)', marginTop: 2 }}>
          Gere variações de questões existentes (mesma habilidade, dificuldade
          ajustável)
        </p>
      </div>
      <div
        style={{
          background: 'var(--mm-surface)',
          border: '1px solid var(--mm-line)',
          borderRadius: 12,
          padding: 32,
          textAlign: 'center',
          color: 'var(--mm-muted)',
          fontSize: 13,
        }}
      >
        Em construção — implementação na próxima sprint.
      </div>
    </div>
  )
}
