import { CampanhaForm } from './campanha-form'
import { listSimuladosForSelect } from '../actions'

export const metadata = { title: 'Nova campanha — MedMaestro' }

export default async function NovaCampanhaPage() {
  const simulados = await listSimuladosForSelect()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-foreground">Simulado Aberto para Alunos</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Monte a campanha de captação e gere o código do formulário para a landing page.
      </p>
      <CampanhaForm simulados={simulados} appUrl={appUrl} />
    </div>
  )
}
