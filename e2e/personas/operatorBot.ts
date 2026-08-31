import type { Page } from '@playwright/test';
import { FreezeDetector } from '../helpers/freezeDetector';

export class OperatorBot {
  page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async login(email = 'operador@luxia.com', password = 'password123') {
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

  async navigateToProduction() {
    const prodBtn = this.page.locator('.app-sidebar__link[aria-label="Producción"], button:has-text("Producción")').first();
    if (await prodBtn.isVisible()) {
      await prodBtn.click();
    }
    await this.page.waitForSelector('.pv2-root', { timeout: 8000 });
    await FreezeDetector.assertEventLoopResponsive(this.page);
  }

  async selectFabric(family = 'Screen', openness = '1%', color = 'White') {
    const familySelect = this.page.locator('#select-linea-tela');
    await familySelect.selectOption({ label: family });

    const opennessSelect = this.page.locator('#select-openness');
    await opennessSelect.selectOption({ label: openness });

    const colorChip = this.page.locator(`.pv2-swatch-chip[title*="${color}"]`).first();
    if (await colorChip.isVisible()) {
      await colorChip.click();
    }
    await FreezeDetector.assertEventLoopResponsive(this.page);
  }

  async setDimensions(widthMeters: number, heightMeters: number, quantity = 1) {
    const widthInput = this.page.locator('#input-ancho');
    const heightInput = this.page.locator('#input-alto');
    const qtyInput = this.page.locator('#input-cantidad');

    await widthInput.fill(String(widthMeters));
    await widthInput.blur();

    await heightInput.fill(String(heightMeters));
    await heightInput.blur();

    if (quantity > 1) {
      await qtyInput.fill(String(quantity));
    }
    await FreezeDetector.assertEventLoopResponsive(this.page);
  }

  async selectMountingSystem(system: 'standard' | 'pin_endplug' | 'double_bracket') {
    const label = system === 'pin_endplug' ? 'Pin EndPlug' : system === 'double_bracket' ? 'Bracket Doble' : 'Estándar';
    const btn = this.page.locator('.pv2-segmented-btn', { hasText: label }).first();
    if (await btn.isVisible()) {
      await btn.click();
    }
  }

  async confirmAlertsIfNeeded() {
    const doubleBracketCheckbox = this.page.locator('input[type="checkbox"][id*="double-bracket"], .pv2-alert input[type="checkbox"]').first();
    if (await doubleBracketCheckbox.isVisible()) {
      await doubleBracketCheckbox.check();
    }

    const rotatedCheckbox = this.page.locator('.pv2-alert input[type="checkbox"]').first();
    if (await rotatedCheckbox.isVisible()) {
      await rotatedCheckbox.check();
    }
  }

  async addCurtainToBatch() {
    await this.confirmAlertsIfNeeded();
    const addBtn = this.page.locator('button.pv2-btn-add-inline, button[aria-label="Agregar persiana al lote"]').first();
    
    await FreezeDetector.assertBecomesEnabled(addBtn, 'Botón Agregar al Lote', 4000);
    await addBtn.click();
    await FreezeDetector.assertEventLoopResponsive(this.page);
  }

  async setOrderNumber(orderNumber: string) {
    const orderInput = this.page.locator('#input-order-number');
    await orderInput.fill(orderNumber);
  }

  async saveBatchOrder() {
    const saveBtn = this.page.locator('button.pv2-btn-save-order, button:has-text("Guardar Orden")').first();
    await FreezeDetector.assertBecomesEnabled(saveBtn, 'Botón Guardar Orden', 4000);
    await saveBtn.click();
    await FreezeDetector.assertNoHangingSpinners(this.page);
  }

  async inspectCuttingPreview(): Promise<{ curtainCount: number; hasValidDiagram: boolean }> {
    const kpiCurtains = this.page.locator('.pv2-kpi-pill-val').first();
    const text = (await kpiCurtains.textContent()) || '0';
    const curtainCount = parseInt(text, 10) || 0;

    const diagram = this.page.locator('.pv2-roll-diagram, .pv2-table');
    const hasValidDiagram = await diagram.count() > 0;

    return { curtainCount, hasValidDiagram };
  }
}
