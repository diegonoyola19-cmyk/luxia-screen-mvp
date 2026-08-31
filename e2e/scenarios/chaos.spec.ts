import { test, expect } from '../fixtures/luxia.fixture';
import { OperatorBot } from '../personas/operatorBot';
import { ChaosMonkeyBot } from '../personas/chaosMonkeyBot';

test.describe('Persona: Chaos Monkey - Fuzzing & Resilience Tests', () => {
  test('CHAOS-001: Seeded fuzzing on dimension inputs and rapid tab switching', async ({
    page,
  }) => {
    const rawSeed = process.env.QA_SEED ? parseInt(process.env.QA_SEED, 10) : Math.floor(Math.random() * 1000000);
    const chaos = new ChaosMonkeyBot(page, rawSeed);
    console.log(`\x1b[35m[CHAOS MONKEY]\x1b[0m Running with Seed: ${chaos.getSeed()}`);

    const bot = new OperatorBot(page);
    await bot.login();
    await bot.navigateToProduction();

    // 1. Inject malformed and extreme inputs
    await chaos.injectChaosInputs('#input-ancho', '#input-alto');

    // 2. Rapid tab switching
    await chaos.testRapidTabSwitching(6);

    // 3. Navigate back to production and ensure page is fully functional
    await bot.navigateToProduction();
    await bot.selectFabric('Screen', '1%', 'White');
    await bot.setDimensions(1.50, 1.80, 1);
    await bot.addCurtainToBatch();

    const preview = await bot.inspectCuttingPreview();
    expect(preview.curtainCount).toBe(1);
  });
});
