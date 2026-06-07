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
  aluno: -1, // fora da hierarquia de staff; nunca passa nas checagens do back-office
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
    ...(can(role, 'professor')
      ? [{ label: 'Flashcards', href: '/banco-flashcards', iconKey: 'Layers' }]
      : []),
  ]

  const gerar: NavItemDef[] = can(role, 'admin')
    ? [
        { label: 'Comentários', href: '/comentarios', iconKey: 'MessageSquare' },
        { label: 'Variações', href: '/variacoes', iconKey: 'Copy' },
        { label: 'Gerar flashcards', href: '/flashcards', iconKey: 'Sparkles' },
      ]
    : []

  const analise: NavItemDef[] = [
    { label: 'Análise', href: '/analise', iconKey: 'BarChart2' },
  ]

  // Captação (camada do aluno — feature 001), admin+.
  const captacao: NavItemDef[] = can(role, 'admin')
    ? [
        { label: 'Campanhas', href: '/campanhas', iconKey: 'FileText' },
        { label: 'Leads', href: '/leads', iconKey: 'Users' },
        { label: 'Calibração', href: '/calibracao', iconKey: 'BarChart2' },
      ]
    : []

  const admin: NavItemDef[] = [
    ...(can(role, 'admin')
      ? [{ label: 'Auditoria', href: '/auditoria', iconKey: 'Shield' }]
      : []),
    ...(can(role, 'admin')
      ? [{ label: 'Usuários', href: '/configuracoes/usuarios', iconKey: 'Users' }]
      : []),
    ...(can(role, 'admin')
      ? [{ label: 'Anexos', href: '/configuracoes/anexos', iconKey: 'Paperclip' }]
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

  if (captacao.length > 0) {
    sections.push({ title: 'Captação', items: captacao })
  }

  if (admin.length > 0) {
    sections.push({ title: 'Admin', items: admin })
  }

  return sections
}
