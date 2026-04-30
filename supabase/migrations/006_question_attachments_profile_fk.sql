-- Adiciona FK adicional de question_attachments.uploaded_by -> profiles.id
-- para que PostgREST resolva o embed `profiles:uploaded_by(full_name)`.
-- A FK existente para auth.users(id) é mantida; ambas coexistem porque
-- profiles.id é PK e tem FK 1:1 para auth.users(id).

ALTER TABLE public.question_attachments
  ADD CONSTRAINT question_attachments_uploaded_by_profile_fkey
  FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
