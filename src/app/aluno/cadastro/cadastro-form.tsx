'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { cadastroAlunoAction } from './actions'

export function CadastroForm() {
  const [state, formAction, isPending] = useActionState(cadastroAlunoAction, null)

  return (
    <div className="mx-auto mt-10 w-full max-w-[420px] rounded-2xl border border-border bg-card p-8">
      <h1 className="text-xl font-bold text-foreground">Criar conta</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Cadastre-se para fazer o simulado gratuito.
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        <Field label="Nome completo" name="full_name" type="text" autoComplete="name" />
        <Field label="E-mail" name="email" type="email" autoComplete="email" />
        <Field label="WhatsApp" name="phone" type="tel" autoComplete="tel" />
        <Field label="Senha (mín. 8 caracteres)" name="password" type="password" autoComplete="new-password" />

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
          {isPending ? 'Criando…' : 'Criar conta'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Já tem conta?{' '}
        <Link href="/aluno/login" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  )
}

function Field({
  label,
  name,
  type,
  autoComplete,
}: {
  label: string
  name: string
  type: string
  autoComplete?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      <input
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
      />
    </label>
  )
}
