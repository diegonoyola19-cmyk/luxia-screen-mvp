import { describe, it, expect } from 'vitest';
import { syncApiCatalogToSupabase } from '../syncApiCatalogToSupabase';

describe('Test Sync', () => {
  it('runs sync', async () => {
    try {
      const count = await syncApiCatalogToSupabase();
      console.log('SYNCED COUNT:', count);
    } catch (e) {
      console.error('SYNC ERROR:', e);
    }
  });
});
