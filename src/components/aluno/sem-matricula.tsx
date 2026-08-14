export function SemMatricula() {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center">
      <div className="text-3xl">🔒</div>
      <h1 className="mt-2 text-lg font-bold text-foreground">Sem matrícula ativa</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Sua conta ainda não tem uma matrícula vinculada a nenhuma banca. Essa área é
        exclusiva de quem está matriculado — fale com a organização pra liberar o acesso.
      </p>
    </div>
  )
}
