export type UserRole = 'superadmin' | 'admin' | 'professor' | 'analista' | 'aluno'

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  role: UserRole
  avatar_url: string | null
  // Camada do aluno (feature 001) — campos de lead/segmentação
  phone?: string | null
  origin?: string | null
  is_student_of?: 'ja_aluno' | 'nao_aluno' | 'aluno_outro_curso' | null
  created_at: string
  updated_at: string
}

export type QuestionStatus =
  | 'extracted'
  | 'reviewing'
  | 'approved'
  | 'flagged'
  | 'rejected'
  | 'commented'
  | 'published'
  | 'draft'

export const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  professor: 'Professor',
  analista: 'Analista',
  aluno: 'Aluno',
}

export const STATUS_LABELS: Record<QuestionStatus, string> = {
  extracted: 'Extraída',
  reviewing: 'Em revisão',
  approved: 'Aprovada',
  flagged: 'Sinalizada',
  rejected: 'Rejeitada',
  commented: 'Comentada',
  published: 'Publicada',
  draft: 'Rascunho (variante)',
}
