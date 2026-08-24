import { describe, it, expect } from 'vitest';

function checkSyncAuthorization(profile: { role: string; is_active: boolean } | null, hasAuthHeader: boolean): { status: number; allowed: boolean } {
  if (!hasAuthHeader) {
    return { status: 401, allowed: false };
  }
  if (!profile || profile.is_active === false) {
    return { status: 403, allowed: false };
  }
  if (profile.role === 'admin' || profile.role === 'produccion' || profile.role === 'bodega') {
    return { status: 200, allowed: true };
  }
  return { status: 403, allowed: false };
}

describe('Sync Inventory Role Authorization', () => {
  it('allows admin role', () => {
    const res = checkSyncAuthorization({ role: 'admin', is_active: true }, true);
    expect(res.status).toBe(200);
    expect(res.allowed).toBe(true);
  });

  it('allows produccion role', () => {
    const res = checkSyncAuthorization({ role: 'produccion', is_active: true }, true);
    expect(res.status).toBe(200);
    expect(res.allowed).toBe(true);
  });

  it('allows bodega role', () => {
    const res = checkSyncAuthorization({ role: 'bodega', is_active: true }, true);
    expect(res.status).toBe(200);
    expect(res.allowed).toBe(true);
  });

  it('rejects consulta role with 403', () => {
    const res = checkSyncAuthorization({ role: 'consulta', is_active: true }, true);
    expect(res.status).toBe(403);
    expect(res.allowed).toBe(false);
  });

  it('rejects anonymous / missing auth header with 401', () => {
    const res = checkSyncAuthorization(null, false);
    expect(res.status).toBe(401);
    expect(res.allowed).toBe(false);
  });

  it('rejects inactive user with 403', () => {
    const res = checkSyncAuthorization({ role: 'admin', is_active: false }, true);
    expect(res.status).toBe(403);
    expect(res.allowed).toBe(false);
  });
});
