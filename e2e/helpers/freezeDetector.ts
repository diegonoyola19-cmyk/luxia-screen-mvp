import type { Page, Locator } from '@playwright/test';

export class FreezeDetector {
  /**
   * Asserts that a button or interactive element becomes enabled within a timeout.
   */
  static async assertBecomesEnabled(locator: Locator, description: string, timeoutMs = 5000): Promise<void> {
    try {
      await locator.waitFor({ state: 'visible', timeout: timeoutMs });
      const startTime = Date.now();
      while (Date.now() - startTime < timeoutMs) {
        const isDisabled = await locator.isDisabled();
        if (!isDisabled) return;
        await locator.page().waitForTimeout(100);
      }
      throw new Error(`Element remained disabled: ${description}`);
    } catch (err: any) {
      throw new Error(`[UI_FREEZE] Element "${description}" is permanently disabled or unresponsive: ${err?.message}`);
    }
  }

  /**
   * Asserts that no infinite loading spinner is blocking the user view.
   */
  static async assertNoHangingSpinners(page: Page, timeoutMs = 6000): Promise<void> {
    const spinnerLocators = [
      page.locator('.splash-spinner'),
      page.locator('.login-spinner'),
      page.locator('.loading-indicator'),
    ];

    for (const spinner of spinnerLocators) {
      const count = await spinner.count();
      if (count > 0 && await spinner.first().isVisible()) {
        try {
          await spinner.first().waitFor({ state: 'hidden', timeout: timeoutMs });
        } catch {
          throw new Error('[UI_FREEZE] A loading spinner remained visible indefinitely, blocking user interaction');
        }
      }
    }
  }

  /**
   * Pings the page event loop to ensure JavaScript thread is responsive.
   */
  static async assertEventLoopResponsive(page: Page, timeoutMs = 3000): Promise<void> {
    const start = Date.now();
    const result = await page.evaluate(() => {
      return 1 + 1;
    });
    if (result !== 2 || Date.now() - start > timeoutMs) {
      throw new Error('[UI_FREEZE] JavaScript event loop is congested or unresponsive');
    }
  }
}
