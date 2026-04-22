import { createServiceClient } from '@/lib/supabase/service'

export type AuditAction =
  // Exames
  | 'exam_uploaded'
  | 'exam_status_changed'
  // Questões
  | 'question_tags_updated'
  | 'question_status_changed'
  | 'question_approved'
  | 'question_rejected'
  | 'question_flagged'
  // Comentários
  | 'comment_generated'
  | 'comment_edited'
  // Tags de catálogo
  | 'tag_created'
  | 'tag_updated'
  | 'tag_toggled'
  | 'tag_reordered'
  // Simulados
  | 'simulado_created'
  | 'simulado_deleted'
  | 'simulado_question_added'
  | 'simulado_question_removed'
  // Usuários
  | 'user_role_changed'

export async function logAudit(
  userId: string,
  entityType: string,
  entityId: string,
  action: AuditAction | string,
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null
): Promise<void> {
  try {
    const service = createServiceClient()
    await service.from('audit_logs').insert({
      user_id: userId,
      entity_type: entityType,
      entity_id: entityId,
      action,
      before_data: before ?? null,
      after_data: after ?? null,
    })
  } catch {
    // Auditoria nunca deve bloquear a operação principal
  }
}
