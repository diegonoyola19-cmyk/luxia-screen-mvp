import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { executeVertiluxSync } from '../src/services/apiSyncService';

function sendJson(res: any, statusCode: number, data: any) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return sendJson(res, 500, { error: 'Server configuration error: Missing Supabase credentials' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return sendJson(res, 401, { error: 'Unauthorized: Missing Authorization header' });
  }

  try {
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) {
      return sendJson(res, 401, { error: 'Unauthorized: Invalid token' });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single();

    if (!profile || profile.is_active === false || (profile.role !== 'admin' && profile.role !== 'produccion')) {
      return sendJson(res, 403, { error: 'Forbidden: No tienes permisos para sincronizar el catálogo' });
    }

    const result = await executeVertiluxSync({
      supabase: supabaseAdmin,
      trigger: 'manual',
      triggeredByUserId: user.id,
      apiConfig: {
        apiKey: process.env.VERTILUX_API_KEY || '',
        user: process.env.VERTILUX_API_USER || '',
        password: process.env.VERTILUX_API_PASSWORD || '',
        country: process.env.VERTILUX_API_COUNTRY || 'SLV',
      },
    });

    return sendJson(res, 200, {
      success: result.status === 'success',
      result,
    });
  } catch (err: any) {
    console.error('[Api:sync-inventory] Fatal error:', err);
    return sendJson(res, 500, {
      success: false,
      error: err?.message || 'Internal server error',
    });
  }
}
