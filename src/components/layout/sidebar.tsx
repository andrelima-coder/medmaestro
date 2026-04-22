import type { UserRole } from '@/types'
import { buildNavSections } from './nav-config'
import { SidebarClient } from './sidebar-client'

export function Sidebar({ role }: { role: UserRole }) {
  const sections = buildNavSections(role)
  return <SidebarClient sections={sections} />
}
