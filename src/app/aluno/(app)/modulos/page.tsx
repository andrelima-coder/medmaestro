import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getModulosComDesempenho } from '@/lib/aluno/estudo'

export const metadata = { title: 'Módulos — MedMaestro' }

export default async function ModulosPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/aluno/login')

  const service = createServiceClient()
  const modulos = await getModulosComDesempenho(service, user.id)

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-foreground">Módulos</h1>
      <p className="text-sm text-muted-foreground">
        Seu desempenho por módulo do edital. Toque em um módulo para praticar questões dele.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modulos.map((m) => (
          <Link
            key={m.tagId}
            href={`/aluno/praticar?modulo=${m.tagId}`}
            className="rounded-2xl border border-border bg-card p-5 transition hover:border-primary"
          >
            <div className="font-semibold text-foreground">{m.label}</div>
            {m.total > 0 ? (
              <>
                <div className="mt-2 text-2xl font-bold text-foreground">{m.pct}%</div>
                <div className="mt-1 text-xs text-muted-foreground">{m.total} questões respondidas</div>
                <div className="mt-2 h-1.5 w-full rounded bg-muted">
                  <div className="h-1.5 rounded bg-primary" style={{ width: `${m.pct}%` }} />
                </div>
              </>
            ) : (
              <div className="mt-3 text-sm text-muted-foreground">Ainda não praticado</div>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
