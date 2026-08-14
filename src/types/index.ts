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
  | 'pending_extraction'
  | 'pending_review'
  | 'in_review'
  | 'pending_approval'
  | 'approved'
  | 'flagged'
  | 'rejected'
  | 'published'
  | 'draft'
  | 'needs_attention'

export const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  professor: 'Professor',
  analista: 'Analista',
  aluno: 'Aluno',
}

export const STATUS_LABELS: Record<QuestionStatus, string> = {
  pending_extraction: 'Extraída',
  pending_review: 'Pendente',
  in_review: 'Em revisão',
  pending_approval: 'Aguardando aprovação',
  approved: 'Aprovada',
  flagged: 'Sinalizada',
  rejected: 'Rejeitada',
  published: 'Publicada',
  draft: 'Rascunho (variante)',
  needs_attention: 'Requer atenção',
}
