import { supabase } from '../lib/supabase';

export async function syncApiCatalogToSupabase(): Promise<number> {
  const { data: sessionResp } = await supabase.auth.getSession();
  const token = sessionResp?.session?.access_token;

  const resp = await fetch('/api/sync-inventory', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const payload = await resp.json().catch(() => null);

  if (!resp.ok || !payload?.success) {
    const errorMsg = payload?.error || payload?.result?.errorMessage || `Error (${resp.status}): Error al sincronizar catálogo`;
    throw new Error(errorMsg);
  }

  const result = payload.result;
  return (result?.recordsCreated || 0) + (result?.recordsUpdated || 0);
}

