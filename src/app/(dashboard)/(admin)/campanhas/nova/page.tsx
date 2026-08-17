import { CampanhaForm } from './campanha-form'
import { getPickerOptions, getSimuladoSeed } from '../actions'

export const metadata = { title: 'Nova campanha — MedMaestro' }

export default async function NovaCampanhaPage({
  searchParams,
}: {
  searchParams: Promise<{ simulado?: string }>
}) {
  const { simulado: simuladoId } = await searchParams
  const [options, rawSeed] = await Promise.all([
    getPickerOptions(),
    simuladoId ? getSimuladoSeed(simuladoId) : Promise.resolve(null),
  ])
  // Simulado vazio (ou só com questões bloqueadas) não semeia nada.
  const seed = rawSeed && rawSeed.questions.length > 0 ? rawSeed : null
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-foreground">Simulado Aberto para Alunos</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Monte a campanha de captação, escolha as questões do simulado e gere o código do formulário
        para a landing page.
      </p>
      <CampanhaForm options={options} appUrl={appUrl} seed={seed} />
    </div>
  )
}
