import { createClient } from '@supabase/supabase-js'

/**
 * Service role client — bypasses RLS. Use only in API routes/workers, never on client.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}
