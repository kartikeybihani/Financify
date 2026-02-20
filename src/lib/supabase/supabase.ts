// app/lib/supabase.ts
import AppStorage from '@/src/utils/storage/storage'
import { createClient } from '@supabase/supabase-js'
import Constants from 'expo-constants'

// Get from env (Expo bakes EXPO_PUBLIC_* into extra at build time)
const rawSupabaseUrl =
  Constants.expoConfig?.extra?.supabaseUrl ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL

// Normalize: strip /rest/v1 (dashboard sometimes shows this) and trailing slash
export const supabaseUrl = rawSupabaseUrl
  ? rawSupabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '')
  : ''

const supabaseAnonKey =
  Constants.expoConfig?.extra?.supabaseAnonKey ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AppStorage, // AppStorage provides AsyncStorage-compatible async API
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
})

// Add a default export to satisfy TypeScript
export default supabase