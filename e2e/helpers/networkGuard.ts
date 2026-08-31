import type { Page, Route, Request } from '@playwright/test';
import { SandboxState, SandboxWorkOrder } from '../state/sandboxSeed';

export interface NetworkGuardOptions {
  sandboxState: SandboxState;
  currentPersona?: string;
  currentScenario?: string;
  onProductionAttempt?: (url: string, method: string) => void;
}

export function setupNetworkGuard(page: Page, options: NetworkGuardOptions) {
  const { sandboxState, currentPersona = 'Unknown', currentScenario = 'Unknown', onProductionAttempt } = options;

  page.route('**/*', async (route: Route, request: Request) => {
    const url = request.url();
    const method = request.method();

    // 1. Intercept external static images (CDN / S3 / Swatches) and fulfill with mock PNG
    if (
      url.includes('.jpg') ||
      url.includes('.png') ||
      url.includes('.jpeg') ||
      url.includes('.webp') ||
      url.includes('.gif') ||
      url.includes('s3.amazonaws.com') ||
      url.includes('vertilux-website')
    ) {
      const transparentPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: transparentPng,
      });
      return;
    }

    // 2. Allowlist: Localhost, 127.0.0.1, data, blob, Google Fonts
    const isLocal =
      url.startsWith('http://localhost') ||
      url.startsWith('http://127.0.0.1') ||
      url.startsWith('data:') ||
      url.startsWith('blob:') ||
      url.startsWith('ws://localhost') ||
      url.startsWith('ws://127.0.0.1') ||
      url.includes('fonts.googleapis.com') ||
      url.includes('fonts.gstatic.com');

    // 3. Intercept Supabase API calls for Sandbox
    if (url.includes('.supabase.co')) {
      await handleSupabaseMock(route, request, sandboxState);
      return;
    }

    // 4. Intercept local /api/sync-inventory or /api/cron/sync-inventory
    if (url.includes('/api/sync-inventory') || url.includes('/api/cron/sync-inventory')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Sandbox sync simulated',
          result: {
            logId: 'mock-log-1',
            status: 'success',
            trigger: 'manual',
            recordsReceived: 50,
            recordsCreated: 0,
            recordsUpdated: 50,
            recordsSkipped: 0,
            recordsReconciled: 0,
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            durationMs: 120,
          },
        }),
      });
      return;
    }

    // 5. External Production Guard: Block any forbidden external request
    if (!isLocal) {
      const alertMsg = `PRODUCTION NETWORK ACCESS ATTEMPTED: ${method} ${url} | Scenario: "${currentScenario}" | Persona: "${currentPersona}"`;
      console.error(`\x1b[31m[NETWORK GUARD BLOCK]\x1b[0m ${alertMsg}`);
      sandboxState.productionRequestsAttempted.push(`${method} ${url}`);
      if (onProductionAttempt) {
        onProductionAttempt(url, method);
      }
      await route.abort('blockedbyclient');
      return;
    }

    await route.continue();
  });
}

async function handleSupabaseMock(route: Route, request: Request, state: SandboxState) {
  const url = new URL(request.url());
  const pathname = url.pathname;
  const method = request.method();

  const sendJson = (data: any, status = 200, headers: Record<string, string> = {}) => {
    return route.fulfill({
      status,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        ...headers,
      },
      body: JSON.stringify(data),
    });
  };

  const getSafeBody = () => {
    try {
      const raw = request.postData();
      if (raw) return JSON.parse(raw);
    } catch {}
    try {
      return request.postDataJSON() || {};
    } catch {
      return {};
    }
  };

  // 1. Auth: Token / Password Login / Refresh
  if ((pathname.includes('/auth/v1/token') || pathname.includes('/auth/v1/signup') || pathname.endsWith('/token')) && method === 'POST') {
    const postData = getSafeBody();
    const rawEmail = (postData.email || 'bodega@luxia.com').toLowerCase().trim();
    const user =
      state.users[rawEmail] ||
      Object.values(state.users).find((u) => u.email.toLowerCase() === rawEmail) || {
        id: `user-${rawEmail.split('@')[0]}-001`,
        email: rawEmail,
        role:
          rawEmail.includes('admin') || rawEmail.includes('supervisor')
            ? 'admin'
            : rawEmail.includes('bodega')
            ? 'bodega'
            : 'produccion',
        role_id:
          rawEmail.includes('admin') || rawEmail.includes('supervisor')
            ? 'role-admin'
            : rawEmail.includes('bodega')
            ? 'role-bodega'
            : 'role-produccion',
        is_active: true,
      };

    state.activeSessionUser = user;
    return sendJson({
      access_token: `mock-jwt-token-for-${user.id}`,
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: `mock-refresh-token-${user.id}`,
      user: {
        id: user.id,
        email: user.email,
        role: 'authenticated',
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      },
    });
  }

  // 2. Auth: Get User / Session
  if (pathname.includes('/auth/v1/user') && method === 'GET') {
    const user = state.activeSessionUser || Object.values(state.users)[0];
    return sendJson({
      id: user.id,
      email: user.email,
      role: 'authenticated',
      aud: 'authenticated',
    });
  }

  // 3. Auth: Sign Out
  if (pathname.includes('/auth/v1/logout') && method === 'POST') {
    state.activeSessionUser = null;
    return sendJson({}, 200);
  }

  // 4. Profiles Table (Supports both maybeSingle object and array)
  if (pathname.includes('/rest/v1/profiles')) {
    if (method === 'GET') {
      const idMatch = url.searchParams.get('id');
      const targetId = idMatch?.startsWith('eq.') ? idMatch.replace('eq.', '') : state.activeSessionUser?.id;
      const user =
        Object.values(state.users).find((u) => u.id === targetId) ||
        state.activeSessionUser ||
        Object.values(state.users)[0];
      const profile = {
        id: user.id,
        email: user.email,
        role: user.role,
        role_id: user.role_id,
        is_active: user.is_active,
        created_at: new Date().toISOString(),
      };
      
      const accept = request.headers()['accept'] || '';
      if (accept.includes('application/vnd.pgrst.object+json')) {
        return sendJson(profile);
      }
      return sendJson([profile], 200, { 'content-range': '0-1/1' });
    }
    return sendJson({}, 200);
  }

  // 5. Roles & Role Permissions Table
  if (
    pathname.includes('/rest/v1/role_permissions') ||
    pathname.includes('/rest/v1/roles') ||
    pathname.includes('/rest/v1/permissions')
  ) {
    if (pathname.includes('role_permissions')) {
      const roleIdParam = url.searchParams.get('role_id');
      const roleId = roleIdParam?.startsWith('eq.')
        ? roleIdParam.replace('eq.', '')
        : state.activeSessionUser?.role_id || 'role-produccion';
      const role = roleId.replace('role-', '');
      const perms = state.getPermissionsForRole(role);
      return sendJson(
        perms.map((p, idx) => ({
          id: `rp-${role}-${idx}`,
          role_id: roleId,
          permission_id: p,
        }))
      );
    }
    return sendJson([], 200);
  }

  // 6. RPC Functions
  if (pathname.includes('/rest/v1/rpc/')) {
    const rpcName = pathname.split('/rest/v1/rpc/')[1]?.split('?')[0];

    if (rpcName === 'get_user_permissions') {
      const role = state.activeSessionUser?.role || 'produccion';
      return sendJson(state.getPermissionsForRole(role));
    }

    if (rpcName === 'process_order_inventory_tx') {
      const payload = getSafeBody();
      const orderPayload = payload.p_order_payload || payload;
      const orderId = orderPayload.id || `ord-${Date.now()}`;
      const orderNumber = orderPayload.orderNumber || orderPayload.order_number || `ORD-${Date.now()}`;

      const existingIdx = state.orders.findIndex((o) => o.id === orderId || o.order_number === orderNumber);
      const newRecord: SandboxWorkOrder = {
        id: orderId,
        order_number: orderNumber,
        status: orderPayload.status || 'ready_for_production',
        payload: orderPayload,
        created_at: orderPayload.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: state.activeSessionUser?.id || 'user-operador-001',
      };
      if (existingIdx >= 0) {
        state.orders[existingIdx] = newRecord;
      } else {
        state.orders.unshift(newRecord);
      }

      const consumptionPlan = payload.p_consumption_plan || {};
      const requiredRolls = consumptionPlan.fabrics || [];
      for (const item of requiredRolls) {
        const inv = state.inventory.find((i) => i.id === item.rollId || i.code === item.itemCode);
        if (inv && inv.payload?.available_yd2) {
          inv.payload.available_yd2 = Math.max(0, inv.payload.available_yd2 - (item.requiredYd2 || 0));
        }
      }

      return sendJson({
        success: true,
        order_id: orderId,
        movements_count: requiredRolls.length,
      });
    }

    if (rpcName === 'cancel_order_inventory_tx') {
      const payload = getSafeBody();
      const orderId = payload.p_order_id;
      const order = state.orders.find((o) => o.id === orderId || o.order_number === orderId);

      if (orderId === 'order-seed-002' || order?.order_number === 'ORD-2026-002') {
        return sendJson(
          {
            code: 'SCRAP_ALREADY_USED',
            message:
              'No se puede cancelar la orden automáticamente porque el retazo generado ya fue utilizado total o parcialmente en otra orden.',
          },
          400
        );
      }

      if (order) {
        order.status = 'cancelled';
        order.payload.status = 'cancelled';
        order.updated_at = new Date().toISOString();
      }

      return sendJson({ success: true, rolled_back: true });
    }

    return sendJson({ success: true });
  }

  // 7. Work Orders Table
  if (pathname.includes('/rest/v1/work_orders')) {
    if (method === 'GET') {
      const activeOrders = state.orders.map((o) => ({
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        payload: o.payload,
        created_at: o.created_at,
        updated_at: o.updated_at,
        user_id: o.user_id,
      }));
      return sendJson(activeOrders, 200, {
        'content-range': `0-${activeOrders.length}/${activeOrders.length}`,
      });
    }

    if (method === 'POST') {
      const body = getSafeBody();
      const items = Array.isArray(body) ? body : [body];
      for (const item of items) {
        const orderNumber = item.order_number || item.payload?.orderNumber || `ORD-${Date.now()}`;
        const existingIdx = state.orders.findIndex((o) => o.id === item.id || o.order_number === orderNumber);
        const newRecord: SandboxWorkOrder = {
          id: item.id || `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          order_number: orderNumber,
          status: item.status || item.payload?.status || 'ready_for_production',
          payload: item.payload || item,
          created_at: item.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          user_id: state.activeSessionUser?.id || 'user-operador-001',
        };
        if (existingIdx >= 0) {
          state.orders[existingIdx] = newRecord;
        } else {
          state.orders.unshift(newRecord);
        }
      }
      return sendJson(items, 201);
    }

    if (method === 'PATCH') {
      const body = getSafeBody();
      const idMatch = url.searchParams.get('id');
      if (idMatch && idMatch.startsWith('eq.')) {
        const targetId = idMatch.replace('eq.', '');
        const target = state.orders.find((o) => o.id === targetId);
        if (target) {
          if (body.status) target.status = body.status;
          if (body.payload) target.payload = { ...target.payload, ...body.payload };
          target.updated_at = new Date().toISOString();
        }
      }
      return sendJson(body, 200);
    }

    if (method === 'DELETE') {
      return sendJson({}, 200);
    }
  }

  // 8. Inventory Items Table
  if (pathname.includes('/rest/v1/inventory_items')) {
    if (method === 'GET') {
      const items = state.inventory.map((i) => ({
        id: i.id,
        code: i.code,
        category: i.category,
        kind: i.kind,
        status: i.status,
        payload: i.payload,
        source: i.source,
        created_at: i.created_at,
        updated_at: i.updated_at,
      }));
      return sendJson(items, 200, {
        'content-range': `0-${items.length}/${items.length}`,
      });
    }

    if (method === 'POST') {
      const body = getSafeBody();
      const newItems = Array.isArray(body) ? body : [body];
      for (const item of newItems) {
        state.inventory.unshift({
          id: item.id || `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          code: item.code || `CODE-${Date.now()}`,
          category: item.category || 'fabric',
          kind: item.kind || 'scrap',
          status: item.status || 'available',
          payload: item.payload || {},
          source: item.source || 'manual',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
      return sendJson(newItems, 201);
    }

    if (method === 'PATCH') {
      const body = getSafeBody();
      return sendJson(body, 200);
    }
  }

  // 9. Inventory Movements Table
  if (pathname.includes('/rest/v1/inventory_movements')) {
    if (method === 'GET') {
      return sendJson(state.movements, 200, {
        'content-range': `0-${state.movements.length}/${state.movements.length}`,
      });
    }
    if (method === 'POST') {
      const body = getSafeBody();
      const list = Array.isArray(body) ? body : [body];
      for (const m of list) {
        state.movements.push({
          id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          item_id: m.item_id || 'item-unknown',
          order_id: m.order_id,
          action: m.action || 'consume',
          quantity: m.quantity || 0,
          unit: m.unit || 'm',
          user_id: state.activeSessionUser?.id || 'user-unknown',
          created_at: new Date().toISOString(),
        });
      }
      return sendJson(list, 201);
    }
  }

  // 10. User Activity Log Table
  if (pathname.includes('/rest/v1/user_activity_log')) {
    if (method === 'POST') {
      const body = getSafeBody();
      state.activityLogs.push({
        id: `act-${Date.now()}`,
        event_type: body.event_type || 'user.action',
        user_id: body.user_id || state.activeSessionUser?.id,
        metadata: body.metadata || {},
        created_at: new Date().toISOString(),
      });
      return sendJson(body, 201);
    }
    return sendJson([], 200);
  }

  // 11. Sync logs / API audit
  if (pathname.includes('/rest/v1/api_sync_logs')) {
    return sendJson([
      {
        id: 'sync-log-latest',
        source: 'vertilux_api',
        started_at: new Date(Date.now() - 3600000).toISOString(),
        finished_at: new Date(Date.now() - 3590000).toISOString(),
        status: 'success',
        records_received: 240,
        records_created: 5,
        records_updated: 235,
        records_skipped: 0,
        error_message: null,
        trigger: 'scheduled',
        triggered_by: null,
        metadata: {},
        created_at: new Date(Date.now() - 3600000).toISOString(),
      },
    ]);
  }

  return sendJson([], 200);
}
