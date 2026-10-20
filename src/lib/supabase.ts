import { createClient, type SupabaseClient } from '@supabase/supabase-js'
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
// Only treat Supabase as configured when real values are supplied
// (guards against placeholder values like "your-anon-key-here").
export const isSupabaseConfigured = Boolean(
  url && key && url.startsWith('https://') && !url.includes('your-project') && key.length > 20 && !key.includes('your-')
)
export const supabase: SupabaseClient | null = isSupabaseConfigured ? createClient(url!, key!) : null
