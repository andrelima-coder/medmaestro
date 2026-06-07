export const metadata = { title: 'Resultado — MedMaestro' }

/**
 * Placeholder do resultado (feature 001). O conteúdo completo — score, mapa
 * verde/vermelho, distribuição por alternativa, gating de comentários e confete —
 * é entregue em T021/T022/T023.
 */
export default function ResultadoPage() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-border bg-card p-8 text-center">
      <h1 className="text-lg font-bold text-foreground">Prova entregue ✅</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Seu resultado detalhado aparecerá aqui em breve. Fique atento ao e-mail com o
        convite para a live de correção comentada.
      </p>
    </div>
  )
}
