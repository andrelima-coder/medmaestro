import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { WorkflowStepper } from '@/components/layout/workflow-stepper'
import type { UserRole } from '@/types'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, email')
    .eq('id', user.id)
    .single()

  const role = (profile?.role ?? 'analista') as UserRole

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar role={role} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
          role={role}
          fullName={profile?.full_name ?? null}
          email={profile?.email ?? user.email ?? null}
        />
        <WorkflowStepper />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}
