export type UserRole = 'superadmin' | 'admin' | 'professor' | 'analista'

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  role: UserRole
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export type QuestionStatus =
  | 'pending_extraction'
  | 'pending_review'
  | 'in_review'
  | 'pending_approval'
  | 'approved'
  | 'published'
  | 'rejected'
  | 'needs_attention'

export const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  professor: 'Professor',
  analista: 'Analista',
}

export const STATUS_LABELS: Record<QuestionStatus, string> = {
  pending_extraction: 'Aguardando extração',
  pending_review: 'Aguardando revisão',
  in_review: 'Em revisão',
  pending_approval: 'Aguardando aprovação',
  approved: 'Aprovada',
  published: 'Publicada',
  rejected: 'Rejeitada',
  needs_attention: 'Atenção necessária',
}
