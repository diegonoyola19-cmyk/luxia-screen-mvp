import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { executeVertiluxSync } from '../_lib/apiSyncService.js';

function sendJson(res: any, statusCode: number, data: any) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow GET or POST for cron triggers
  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  // 1. Verify Vercel Cron authorization header
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      return sendJson(res, 401, { error: 'Unauthorized cron trigger' });
    }
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return sendJson(res, 500, { error: 'Server configuration error: Missing Supabase service credentials' });
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const result = await executeVertiluxSync({
      supabase: supabaseAdmin,
      trigger: 'scheduled',
      apiConfig: {
        apiKey: process.env.VERTILUX_API_KEY || '',
        user: process.env.VERTILUX_API_USER || '',
        password: process.env.VERTILUX_API_PASSWORD || '',
        country: process.env.VERTILUX_API_COUNTRY || 'SLV',
      },
    });

    if (result.status === 'failed') {
      return sendJson(res, 502, {
        success: false,
        message: 'Scheduled sync failed during execution',
        result,
      });
    }

    return sendJson(res, 200, {
      success: true,
      message: 'Scheduled sync executed successfully',
      result,
    });
  } catch (err: any) {
    console.error('[VercelCron:sync-inventory] Fatal error:', err);
    return sendJson(res, 500, {
      success: false,
      error: err?.message || 'Internal server error',
    });
  }
}
