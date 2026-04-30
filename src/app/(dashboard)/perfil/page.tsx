import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ROLE_LABELS, type UserRole } from '@/types'
import { PerfilForm } from './perfil-form'

export const metadata = { title: 'Perfil — MedMaestro' }

export default async function PerfilPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, role, created_at')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1
          className="font-[family-name:var(--font-syne)]"
          style={{ fontSize: 20, fontWeight: 700, color: 'var(--mm-text)' }}
        >
          Perfil
        </h1>
        <p style={{ fontSize: 13, color: 'var(--mm-muted)', marginTop: 2 }}>
          Edite suas informações ou mude sua senha
        </p>
      </div>

      <div
        style={{
          background: 'var(--mm-surface)',
          border: '1px solid var(--mm-line)',
          borderRadius: 12,
          padding: 20,
        }}
      >
        <h3 style={sectionTitle}>Conta</h3>
        <dl style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, fontSize: 13 }}>
          <dt style={{ color: 'var(--mm-muted)' }}>E-mail</dt>
          <dd style={{ color: 'var(--mm-text)' }}>{profile?.email ?? user.email}</dd>
          <dt style={{ color: 'var(--mm-muted)' }}>Função</dt>
          <dd style={{ color: 'var(--mm-text)' }}>
            {ROLE_LABELS[(profile?.role ?? 'analista') as UserRole]}
          </dd>
          <dt style={{ color: 'var(--mm-muted)' }}>Membro desde</dt>
          <dd style={{ color: 'var(--mm-text)' }}>
            {profile?.created_at
              ? new Date(profile.created_at).toLocaleDateString('pt-BR')
              : '—'}
          </dd>
        </dl>
      </div>

      <PerfilForm initialFullName={profile?.full_name ?? ''} />
    </div>
  )
}

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--mm-muted)',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  marginBottom: 12,
}
