'use server'

import { createServiceClient } from '@/lib/supabase/service'

export interface QuestionImage {
  id: string
  image_scope: string
  image_type: string
  full_page_path: string
  cropped_path: string | null
  use_cropped: boolean
  page_number: number | null
}

export async function getQuestionImages(questionId: string): Promise<QuestionImage[]> {
  const service = createServiceClient()
  const { data } = await service
    .from('question_images')
    .select('id, image_scope, image_type, full_page_path, cropped_path, use_cropped, page_number')
    .eq('question_id', questionId)
    .order('page_number', { ascending: true })
  return (data ?? []) as QuestionImage[]
}

export async function getSignedImageUrl(
  path: string
): Promise<{ url: string | null; error?: string }> {
  const service = createServiceClient()
  const { data, error } = await service.storage
    .from('question-images')
    .createSignedUrl(path, 60 * 5) // 5 min
  if (error) return { url: null, error: error.message }
  return { url: data.signedUrl }
}

export async function toggleImageCrop(
  imageId: string,
  useCropped: boolean
): Promise<{ ok: boolean; error?: string }> {
  const service = createServiceClient()
  const { error } = await service
    .from('question_images')
    .update({ use_cropped: useCropped })
    .eq('id', imageId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
