import type { Page } from '@playwright/test';
import { TestDataFactory } from '../helpers/testDataFactory';
import { FreezeDetector } from '../helpers/freezeDetector';

export class ChaosMonkeyBot {
  page: Page;
  seed: number;

  constructor(page: Page, seed?: number) {
    this.page = page;
    this.seed = seed ?? Math.floor(Math.random() * 1000000);
  }

  getSeed(): number {
    return this.seed;
  }

  async testRapidDoubleClicks(buttonLocator: any): Promise<void> {
    if (await buttonLocator.isVisible()) {
      // Rapid double click to test idempotency
      await buttonLocator.click({ clickCount: 2, delay: 50 });
      await FreezeDetector.assertEventLoopResponsive(this.page);
    }
  }

  async injectChaosInputs(widthSelector = '#input-ancho', heightSelector = '#input-alto'): Promise<void> {
    const payloads = TestDataFactory.getChaosPayloads(this.seed);
    const widthInput = this.page.locator(widthSelector);
    const heightInput = this.page.locator(heightSelector);

    for (const p of payloads.slice(0, 5)) {
      if (await widthInput.isVisible()) {
        await widthInput.evaluate((el: HTMLInputElement, val: string) => {
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, p.value).catch(() => {});
        await widthInput.blur().catch(() => {});
      }
      if (await heightInput.isVisible()) {
        await heightInput.evaluate((el: HTMLInputElement, val: string) => {
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, p.value).catch(() => {});
        await heightInput.blur().catch(() => {});
      }
      // Assert that app doesn't crash
      await FreezeDetector.assertEventLoopResponsive(this.page);
    }
  }

  async testRapidTabSwitching(iterations = 4): Promise<void> {
    const tabs = ['Producción', 'Ordenes', 'Bodega'];
    for (let i = 0; i < iterations; i++) {
      const tabName = tabs[i % tabs.length];
      const tabBtn = this.page.locator('button, a', { hasText: tabName }).first();
      if (await tabBtn.isVisible()) {
        await tabBtn.click().catch(() => {});
        await this.page.waitForTimeout(50); // fast switch
      }
    }
    await FreezeDetector.assertEventLoopResponsive(this.page);
    await FreezeDetector.assertNoHangingSpinners(this.page);
  }
}
