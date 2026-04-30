import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listPendingVariations } from '../variacoes/actions'
import { RevisaoVariacoesClient } from './revisao-variacoes-client'

export const metadata = { title: 'Revisar variações — MedMaestro' }

export default async function RevisaoVariacoesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const variations = await listPendingVariations()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1
          className="font-[family-name:var(--font-syne)]"
          style={{ fontSize: 20, fontWeight: 700, color: 'var(--mm-text)' }}
        >
          Revisar variações
        </h1>
        <p style={{ fontSize: 13, color: 'var(--mm-muted)', marginTop: 2 }}>
          {variations.length} variação{variations.length === 1 ? '' : 'ões'} pendente
          {variations.length === 1 ? '' : 's'} · A=aprovar · P=promover ao banco · D=descartar
        </p>
      </div>

      {variations.length === 0 ? (
        <div
          style={{
            background: 'var(--mm-surface)',
            border: '1px solid var(--mm-line)',
            borderRadius: 12,
            padding: 40,
            textAlign: 'center',
            color: 'var(--mm-muted)',
            fontSize: 13,
          }}
        >
          Nenhuma variação pendente. Vá para Variações → gerar novas.
        </div>
      ) : (
        <RevisaoVariacoesClient variations={variations} />
      )}
    </div>
  )
}
