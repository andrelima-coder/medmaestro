'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { loginAlunoAction } from './actions'

export function AlunoLoginForm() {
  const [state, formAction, isPending] = useActionState(loginAlunoAction, null)

  return (
    <div className="mx-auto mt-10 w-full max-w-[420px] rounded-2xl border border-border bg-card p-8">
      <h1 className="text-xl font-bold text-foreground">Entrar</h1>
      <p className="mt-1 text-sm text-muted-foreground">Acesse sua área de simulados.</p>

      <form action={formAction} className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">E-mail</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">Senha</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
          />
        </label>

        {state?.error && (
          <p role="alert" className="text-sm text-[#D3402A]">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {isPending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Ainda não tem conta?{' '}
        <Link href="/aluno/cadastro" className="font-medium text-primary hover:underline">
          Criar conta
        </Link>
      </p>
    </div>
  )
}
