import { apiRequest } from './client'

interface UploadTarget {
  key: string
  url: string
  fields: Record<string, string>
}
const MAX_BYTES = 100 * 1024 * 1024
const ALLOWED_TYPES = ['video/mp4', 'video/quicktime']
export async function uploadVideo(file: File): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Дозволені тільки MP4 та MOV.')
  }
  if (file.size > MAX_BYTES) {
    throw new Error('Максимальний розмір відео — 100 МБ.')
  }
  const target = await apiRequest<UploadTarget>('/api/v1/comparisons/uploads', {
    method: 'POST',
    body: JSON.stringify({ content_type: file.type }),
  })
  const formData = new FormData()
  Object.entries(target.fields).forEach(([key, value]) => {
    formData.append(key, value)
  })
  formData.append('file', file)
  const response = await fetch(target.url, {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) {
    throw new Error('Не вдалося завантажити відео.')
  }
  return target.key
}

export function deleteUploadedVideo(key: string): Promise<void> {
  return apiRequest<void>(
    `/api/v1/comparisons/uploads?key=${encodeURIComponent(key)}`,
    { method: 'DELETE' },
  )
}

/** Temporary link for playing an exercise's reference video (doctor and patient). */
export async function getExerciseVideoUrl(exerciseId: string): Promise<string> {
  const response = await apiRequest<{ url: string }>(
    `/api/v1/exercises/${encodeURIComponent(exerciseId)}/video`,
  )
  return response.url
}
