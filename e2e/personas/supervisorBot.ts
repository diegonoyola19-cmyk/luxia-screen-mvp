import type { Page } from '@playwright/test';
import { FreezeDetector } from '../helpers/freezeDetector';

export class SupervisorBot {
  page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async login(email = 'supervisor@luxia.com', password = 'password123') {
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

  async navigateToSavedOrders() {
    const ordersNavBtn = this.page.locator('.app-sidebar__link[aria-label="Ordenes"], button:has-text("Ordenes")').first();
    if (await ordersNavBtn.isVisible()) {
      await ordersNavBtn.click();
    }
    await this.page.waitForSelector('.orders-table-container, .orders-data-table', { timeout: 8000 });
    await FreezeDetector.assertEventLoopResponsive(this.page);
  }

  async filterByTab(tab: 'all' | 'workshop' | 'review' | 'sage') {
    const tabMap: Record<string, string> = {
      all: 'Todas',
      workshop: 'En Taller',
      review: 'Por Revisar',
      sage: 'Listas SAGE',
    };
    const tabBtn = this.page.locator('.filter-tab', { hasText: tabMap[tab] }).first();
    if (await tabBtn.isVisible()) {
      await tabBtn.click();
      await FreezeDetector.assertEventLoopResponsive(this.page);
    }
  }

  async openOrderDetails(orderNumber: string) {
    const row = this.page.locator('tr', { hasText: orderNumber }).first();
    const actionBtn = row.locator('.action-menu-btn, button[aria-label*="Más opciones"]').first();
    await actionBtn.click();
    
    const detailsBtn = this.page.locator('.action-dropdown-item', { hasText: 'Ver detalles' }).first();
    await detailsBtn.click();

    await this.page.waitForSelector('.modal-content', { timeout: 5000 });
    await FreezeDetector.assertEventLoopResponsive(this.page);
  }

  async closeModal() {
    const closeBtn = this.page.locator('.modal-header button, button[aria-label="Cerrar modal"], .modal-close').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await this.page.waitForTimeout(300);
    }
  }

  async cancelOrder(orderNumber: string) {
    const row = this.page.locator('tr', { hasText: orderNumber }).first();
    const actionBtn = row.locator('.action-menu-btn, button[aria-label*="Más opciones"]').first();
    await actionBtn.click();

    const dropdownCancelBtn = this.page.locator('.action-dropdown-item.danger, button:has-text("Cancelar orden")').first();
    await dropdownCancelBtn.click();

    const confirmBtn = this.page.locator('.modal-footer button:has-text("Cancelar orden")').first();
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click();
    }

    await FreezeDetector.assertNoHangingSpinners(this.page);
    await this.page.waitForTimeout(600);
  }
}
