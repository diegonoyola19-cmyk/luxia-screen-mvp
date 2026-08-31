import type { Page } from '@playwright/test';
import { FreezeDetector } from '../helpers/freezeDetector';

export class WarehouseBot {
  page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async login(email = 'bodega@luxia.com', password = 'password123') {
    await this.page.goto('/');
    await this.page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {}
    });
    await this.page.goto('/');
    await FreezeDetector.assertNoHangingSpinners(this.page);

    const emailInput = this.page.locator('#email');
    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const passwordInput = this.page.locator('#password');
      const submitBtn = this.page.locator('button[type="submit"]');

      await emailInput.fill(email);
      await passwordInput.fill(password);
      await submitBtn.click();
    }

    await this.page.waitForSelector('.app-sidebar__nav, .app-layout, nav', { timeout: 10000 });
    await FreezeDetector.assertNoHangingSpinners(this.page);
  }

  async navigateToInventory() {
    const invNavBtn = this.page.locator('.app-sidebar__link[aria-label="Bodega"], button:has-text("Bodega")').first();
    if (await invNavBtn.isVisible()) {
      await invNavBtn.click();
    }
    await this.page.waitForSelector('.inventory-v2-root, .inventory-card, .tabs', { timeout: 8000 });
    await FreezeDetector.assertEventLoopResponsive(this.page);
  }

  async filterCategory(category: 'fabric' | 'linear') {
    const text = category === 'fabric' ? 'Retazos de Tela' : 'Sobrantes Lineales';
    const tabBtn = this.page.locator('.tab', { hasText: text }).first();
    if (await tabBtn.isVisible()) {
      await tabBtn.click();
      await FreezeDetector.assertEventLoopResponsive(this.page);
    }
  }

  async search(query: string) {
    const searchInput = this.page.locator('input.search, input[placeholder*="Buscar"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill(query);
      await FreezeDetector.assertEventLoopResponsive(this.page);
    }
  }

  async triggerSync() {
    const syncBtn = this.page.locator('button:has-text("Sincronizar ahora"), button:has-text("Sincronizar")').first();
    if (await syncBtn.isVisible()) {
      await syncBtn.click();
      await FreezeDetector.assertNoHangingSpinners(this.page);
    }
  }
}
