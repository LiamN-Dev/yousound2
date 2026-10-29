import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Cache client instance
let supabaseClient: SupabaseClient | null = null;

export interface SupabaseConfig {
  url?: string;
  anonKey?: string;
  serviceRoleKey?: string;
  dbUrl?: string;
  connected?: boolean;
}

export const getSupabaseConfig = (): SupabaseConfig => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

  return {
    url,
    anonKey,
    serviceRoleKey,
    dbUrl,
    connected: Boolean((url && (anonKey || serviceRoleKey)) || dbUrl),
  };
};

export const getSupabaseClient = (customUrl?: string, customKey?: string): SupabaseClient | null => {
  const config = getSupabaseConfig();
  const url = customUrl || config.url;
  const key = customKey || config.serviceRoleKey || config.anonKey;

  if (!url || !key) {
    return null;
  }

  if (supabaseClient && !customUrl && !customKey) {
    return supabaseClient;
  }

  try {
    const client = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    if (!customUrl && !customKey) {
      supabaseClient = client;
    }

    return client;
  } catch (err) {
    console.warn('[Supabase] Failed to initialize client:', err);
    return null;
  }
};

export const isSupabaseConfigured = (): boolean => {
  const config = getSupabaseConfig();
  return Boolean((config.url && (config.anonKey || config.serviceRoleKey)) || config.dbUrl);
};
