import type { UserRole } from '@/types'

export type NavItemDef = {
  label: string
  href: string
  iconKey: string
}

export type NavSectionDef = {
  title: string
  items: NavItemDef[]
}

const ROLE_RANK: Record<UserRole, number> = {
  analista: 0,
  professor: 1,
  admin: 2,
  superadmin: 3,
}

function can(userRole: UserRole, minRole: UserRole): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[minRole]
}

export function buildNavSections(role: UserRole): NavSectionDef[] {
  const geral: NavItemDef[] = [
    { label: 'Dashboard', href: '/dashboard', iconKey: 'LayoutDashboard' },
  ]

  const banco: NavItemDef[] = [
    { label: 'Questões', href: '/questoes', iconKey: 'BookOpen' },
    { label: 'Revisão', href: '/revisao', iconKey: 'ClipboardCheck' },
    ...(can(role, 'admin')
      ? [{ label: 'Lotes', href: '/lotes', iconKey: 'Upload' }]
      : []),
    ...(can(role, 'professor')
      ? [{ label: 'Simulados', href: '/simulados', iconKey: 'FileText' }]
      : []),
  ]

  const gerar: NavItemDef[] = can(role, 'admin')
    ? [
        { label: 'Comentários', href: '/comentarios', iconKey: 'MessageSquare' },
        { label: 'Variações', href: '/variacoes', iconKey: 'Copy' },
        { label: 'Flashcards', href: '/flashcards', iconKey: 'Layers' },
      ]
    : []

  const analise: NavItemDef[] = [
    { label: 'Análise', href: '/analise', iconKey: 'BarChart2' },
  ]

  const admin: NavItemDef[] = [
    ...(can(role, 'admin')
      ? [{ label: 'Auditoria', href: '/auditoria', iconKey: 'Shield' }]
      : []),
    ...(can(role, 'admin')
      ? [{ label: 'Usuários', href: '/configuracoes/usuarios', iconKey: 'Users' }]
      : []),
    ...(can(role, 'superadmin')
      ? [{ label: 'Hierarquia', href: '/configuracoes/hierarquia', iconKey: 'GitBranch' }]
      : []),
    ...(can(role, 'superadmin')
      ? [{ label: 'Tags', href: '/configuracoes/tags', iconKey: 'Tags' }]
      : []),
  ]

  const sections: NavSectionDef[] = [
    { title: 'Geral', items: geral },
    { title: 'Banco', items: banco },
  ]

  if (gerar.length > 0) {
    sections.push({ title: 'Gerar', items: gerar })
  }

  sections.push({ title: 'Análise', items: analise })

  if (admin.length > 0) {
    sections.push({ title: 'Admin', items: admin })
  }

  return sections
}
