import { test as base, expect } from '@playwright/test';
import { ConsoleMonitor } from './console.fixture';
import { NetworkMonitor } from './network.fixture';
import { SandboxFixture } from './sandbox.fixture';
import { FreezeDetector } from '../helpers/freezeDetector';

export interface LuxiaTestFixtures {
  sandbox: SandboxFixture;
  consoleMonitor: ConsoleMonitor;
  networkMonitor: NetworkMonitor;
  freezeDetector: typeof FreezeDetector;
}

export const test = base.extend<LuxiaTestFixtures>({
  sandbox: [
    async ({ page }, use, testInfo) => {
      const sandbox = new SandboxFixture();
      await sandbox.setup(page, testInfo.title);
      await use(sandbox);
    },
    { auto: true },
  ],

  consoleMonitor: [
    async ({ page }, use) => {
      const monitor = new ConsoleMonitor();
      monitor.setup(page);
      await use(monitor);
      monitor.assertNoErrors();
    },
    { auto: true },
  ],

  networkMonitor: [
    async ({ page }, use) => {
      const monitor = new NetworkMonitor();
      monitor.setup(page);
      await use(monitor);
      monitor.assertHealthy();
    },
    { auto: true },
  ],

  freezeDetector: async ({}, use) => {
    await use(FreezeDetector);
  },
});

export { expect };
