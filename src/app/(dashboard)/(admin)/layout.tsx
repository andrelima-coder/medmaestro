import type { ReactNode } from 'react'
import { requireStaffPage } from '@/lib/auth/page-guard'

/**
 * Guard único pra todas as seções admin-only (análise, auditoria, calibração,
 * campanhas, configurações, lotes) — antes cada page.tsx colava
 * `await requireStaffPage('admin')` individualmente, e uma página nova podia
 * nascer sem o guard se quem escreveu esquecesse a linha. Route group não
 * muda a URL (ex: continua servindo em /calibracao), só agrupa o layout.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireStaffPage('admin')
  return children
}
