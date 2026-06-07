import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Export de leads (feature 001 — T026). Admin-gated; respeita consentimento LGPD
// (só exporta leads com consentimento registrado). Formatos: csv | xlsx.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type LeadRow = {
  email: string
  fields: Record<string, unknown> | null
  segment: string | null
  origin: string | null
  created_at: string
  campaign_id: string
  lead_consents: { id: string }[] | null
  campaigns: { name: string | null } | null
}

const COLUMNS = ['email', 'nome', 'whatsapp', 'segmento', 'origem', 'campanha', 'criado_em']

function rowValues(l: LeadRow): string[] {
  const f = l.fields ?? {}
  return [
    l.email,
    String((f as Record<string, unknown>).name ?? ''),
    String((f as Record<string, unknown>).whatsapp ?? ''),
    l.segment ?? '',
    l.origin ?? '',
    l.campaigns?.name ?? '',
    l.created_at,
  ]
}

function toCsv(rows: LeadRow[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const lines = [COLUMNS.map(esc).join(',')]
  for (const l of rows) lines.push(rowValues(l).map(esc).join(','))
  return lines.join('\r\n')
}

export async function GET(req: NextRequest) {
  // Auth + papel admin.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const rank: Record<string, number> = { analista: 0, professor: 1, admin: 2, superadmin: 3 }
  if ((rank[profile?.role ?? ''] ?? -1) < rank['admin']) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const campaign = sp.get('campaign')
  const segment = sp.get('segment')
  const format = sp.get('format') === 'xlsx' ? 'xlsx' : 'csv'

  let query = service
    .from('leads')
    .select('email, fields, segment, origin, created_at, campaign_id, lead_consents(id), campaigns(name)')
    .order('created_at', { ascending: false })
    .limit(10000)
  if (campaign) query = query.eq('campaign_id', campaign)
  if (segment) query = query.eq('segment', segment)

  const { data } = await query
  // RF-06: só leads com consentimento registrado.
  const rows = ((data ?? []) as unknown as LeadRow[]).filter(
    (l) => (l.lead_consents?.length ?? 0) > 0
  )

  if (format === 'csv') {
    return new NextResponse(toCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="leads.csv"',
      },
    })
  }

  // XLSX
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Leads')
  ws.addRow(COLUMNS)
  for (const l of rows) ws.addRow(rowValues(l))
  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="leads.xlsx"',
    },
  })
}
