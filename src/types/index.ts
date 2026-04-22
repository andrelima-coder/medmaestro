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
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'published'

export const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  professor: 'Professor',
  analista: 'Analista',
}

export const STATUS_LABELS: Record<QuestionStatus, string> = {
  pending_extraction: 'Aguardando revisão',
  in_review: 'Em revisão',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
  published: 'Publicada',
}
