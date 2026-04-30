import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getQuestionAttachmentUrl } from '@/lib/storage/signed-urls'
import { AttachmentRow } from '@/components/admin/attachment-row'

export const metadata = { title: 'Anexos — MedMaestro' }

const ROLE_RANK: Record<string, number> = {
  analista: 0,
  professor: 1,
  admin: 2,
  superadmin: 3,
}

export default async function AnexosAdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data: callerProfile } = await service
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if ((ROLE_RANK[callerProfile?.role ?? ''] ?? -1) < ROLE_RANK['admin']) {
    redirect('/dashboard')
  }

  const params = (await searchParams) ?? {}
  const q = (params.q ?? '').trim()

  let query = service
    .from('question_attachments')
    .select(
      'id, question_id, file_name, mime_type, size_bytes, caption, storage_path, created_at, uploaded_by, profiles:uploaded_by(full_name, email), questions:question_id(question_number, exam_id, exams(year, booklet_color, specialties(name)))'
    )
    .order('created_at', { ascending: false })
    .limit(200)

  if (q) {
    query = query.or(
      `file_name.ilike.%${q}%,caption.ilike.%${q}%`
    )
  }

  const { data: rows } = await query

  const items = await Promise.all(
    (rows ?? []).map(async (r) => {
      let signed = ''
      try {
        signed = await getQuestionAttachmentUrl(r.storage_path as string)
      } catch {
        /* ignore */
      }
      const profileRaw = r.profiles as
        | { full_name: string | null; email: string | null }
        | { full_name: string | null; email: string | null }[]
        | null
      const profile = Array.isArray(profileRaw) ? profileRaw[0] ?? null : profileRaw
      type QuestionRel = {
        question_number: number
        exam_id: string
        exams:
          | {
              year: number
              booklet_color: string | null
              specialties: { name: string } | { name: string }[] | null
            }
          | {
              year: number
              booklet_color: string | null
              specialties: { name: string } | { name: string }[] | null
            }[]
          | null
      }
      const questionRaw = r.questions as QuestionRel | QuestionRel[] | null
      const question = Array.isArray(questionRaw) ? questionRaw[0] ?? null : questionRaw
      const examsRel = question?.exams
      const exam = Array.isArray(examsRel) ? examsRel[0] ?? null : examsRel ?? null
      const specialtiesRel = exam?.specialties
      const specialty = Array.isArray(specialtiesRel)
        ? specialtiesRel[0] ?? null
        : specialtiesRel ?? null
      return {
        id: r.id as string,
        question_id: r.question_id as string,
        file_name: r.file_name as string,
        mime_type: r.mime_type as string,
        size_bytes: r.size_bytes as number,
        caption: (r.caption as string | null) ?? null,
        signed_url: signed,
        created_at: r.created_at as string,
        uploaded_by_name: profile?.full_name ?? profile?.email ?? null,
        question_number: question?.question_number ?? null,
        exam_label: exam
          ? [
              specialty?.name,
              exam.year,
              exam.booklet_color
                ? exam.booklet_color.charAt(0).toUpperCase() +
                  exam.booklet_color.slice(1)
                : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : '',
      }
    })
  )

  const totalBytes = items.reduce((s, a) => s + a.size_bytes, 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Anexos do banco</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {items.length} arquivo{items.length !== 1 ? 's' : ''} ·{' '}
            {(totalBytes / 1024 / 1024).toFixed(1)} MB
          </p>
        </div>

        <form action="" className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome ou legenda…"
            className="rounded-md border border-white/8 bg-white/4 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-[var(--mm-gold)]/40"
          />
          <button
            type="submit"
            className="rounded-md border border-white/8 bg-white/5 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white/10"
          >
            Filtrar
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/7">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Arquivo
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Questão
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Enviado por
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Data
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Tamanho
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Nenhum anexo encontrado.
                </td>
              </tr>
            ) : (
              items.map((a) => (
                <tr key={a.id} className="border-b border-white/5 last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {a.mime_type.startsWith('image/') ? (
                        <a
                          href={a.signed_url}
                          target="_blank"
                          rel="noreferrer"
                          className="block w-10 h-10 rounded overflow-hidden bg-black/30 border border-white/10 shrink-0"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={a.signed_url}
                            alt={a.file_name}
                            className="w-full h-full object-cover"
                          />
                        </a>
                      ) : (
                        <a
                          href={a.signed_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-center w-10 h-10 rounded bg-red-500/10 border border-red-500/20 text-[10px] font-bold text-red-400 shrink-0"
                        >
                          PDF
                        </a>
                      )}
                      <div className="min-w-0">
                        <a
                          href={a.signed_url}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-xs font-medium text-foreground hover:text-[var(--mm-gold)] truncate"
                        >
                          {a.file_name}
                        </a>
                        {a.caption && (
                          <p className="text-[11px] text-muted-foreground truncate">
                            {a.caption}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {a.question_number != null ? (
                      <Link
                        href={`/revisao/${a.question_id}`}
                        className="text-foreground hover:text-[var(--mm-gold)]"
                      >
                        Q{a.question_number}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {a.exam_label && (
                      <p className="text-[11px] text-muted-foreground">{a.exam_label}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {a.uploaded_by_name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                    {(a.size_bytes / 1024).toFixed(0)} KB
                  </td>
                  <td className="px-4 py-3">
                    <AttachmentRow attachmentId={a.id} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
