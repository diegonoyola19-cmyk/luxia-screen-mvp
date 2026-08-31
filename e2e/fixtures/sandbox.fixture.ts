import type { Page } from '@playwright/test';
import { SandboxState } from '../state/sandboxSeed';
import { setupNetworkGuard } from '../helpers/networkGuard';

export class SandboxFixture {
  state: SandboxState;

  constructor() {
    this.state = new SandboxState();
  }

  async setup(page: Page, testTitle: string) {
    this.state.reset();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    setupNetworkGuard(page, {
      sandboxState: this.state,
      currentScenario: testTitle,
    });

    await page.context().clearCookies();
  }
}
