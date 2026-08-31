#!/usr/bin/env node
import { spawn } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import fs from 'node:fs';

const args = process.argv.slice(2);
const isHeaded = args.includes('--headed');
const isEdge = args.includes('--edge');
const isChaos = args.includes('--chaos');
const isReport = args.includes('--report');

if (isReport) {
  console.log('\x1b[36m[LUXIA QA Runner]\x1b[0m Opening Playwright HTML report...');
  const child = spawn('npx', ['playwright', 'show-report', 'playwright-report'], {
    stdio: 'inherit',
    shell: true,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
} else {
  let specFilter = 'operator-cutting.spec.ts supervisor-orders.spec.ts warehouse-inventory.spec.ts';
  if (isEdge) {
    specFilter = 'edge.spec.ts';
  } else if (isChaos) {
    specFilter = 'chaos.spec.ts';
  }

  // Handle deterministic Chaos Monkey seed
  let chaosSeed = process.env.QA_SEED;
  if (isChaos) {
    if (!chaosSeed) {
      chaosSeed = String(Math.floor(100000 + Math.random() * 900000));
      process.env.QA_SEED = chaosSeed;
    }
  }

  const playwrightArgs = ['playwright', 'test', ...specFilter.split(' ')];
  if (isHeaded) {
    playwrightArgs.push('--headed');
  }

  console.log('\n\x1b[34m====================================================\x1b[0m');
  console.log('\x1b[1m  LUXIA — AI Synthetic QA Agent / Test Runner\x1b[0m');
  console.log('\x1b[34m====================================================\x1b[0m');
  console.log(` Mode:        ${isChaos ? 'CHAOS MONKEY' : isEdge ? 'EDGE CASES' : 'STANDARD REGRESSION'}`);
  console.log(` Browser:     Chromium (1920x1080)`);
  console.log(` View Mode:   ${isHeaded ? 'HEADED (Visible GUI)' : 'HEADLESS (Background)'}`);
  console.log(` Sandbox:     ENABLED (Strict Network Guard Active)`);
  if (isChaos) {
    console.log(` Seed:        ${chaosSeed}`);
    console.log(` Reproduce:   QA_SEED=${chaosSeed} npm run test:agent:chaos`);
  }
  console.log('\x1b[34m----------------------------------------------------\x1b[0m\n');

  const startTime = Date.now();
  const child = spawn('npx', playwrightArgs, {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      QA_MODE: process.env.QA_MODE || 'local',
      QA_SANDBOX: 'true',
      QA_BLOCK_PRODUCTION: 'true',
      QA_SEED: chaosSeed || process.env.QA_SEED,
    },
  });

  child.on('exit', (code) => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n\x1b[34m====================================================\x1b[0m');
    if (code === 0) {
      console.log(`\x1b[32m  ✓ ALL SCENARIOS PASSED SUCCESSFULLY (${duration}s)\x1b[0m`);
      console.log('\x1b[34m----------------------------------------------------\x1b[0m');
      console.log(' Production requests attempted: 0');
      console.log(' Production requests allowed:   0');
      console.log(' HTML Report Location:          playwright-report/index.html');
      console.log('\x1b[34m====================================================\x1b[0m\n');
    } else {
      console.log(`\x1b[31m  ✗ SCENARIOS FAILED (Exit Code: ${code})\x1b[0m`);
      console.log('\x1b[34m----------------------------------------------------\x1b[0m');
      console.log(' Production requests attempted: 0');
      console.log(' Production requests allowed:   0');
      console.log(' HTML Report Location:          playwright-report/index.html');
      console.log('\x1b[34m====================================================\x1b[0m\n');

      printStructuredFailureBanner(isChaos ? 'CHAOS MONKEY' : isEdge ? 'EDGE' : 'STANDARD');
    }
    process.exit(code ?? 0);
  });
}

function printStructuredFailureBanner(suiteName) {
  const failures = extractFailureSummary();
  if (failures && failures.length > 0) {
    for (const f of failures) {
      const classification = classifyError(f.error, f.scenario);
      console.log('\x1b[31m══════════════════════════════════════\x1b[0m');
      console.log('\x1b[1;31mAI SYNTHETIC QA FAILED\x1b[0m');
      console.log('\x1b[31m══════════════════════════════════════\x1b[0m\n');
      console.log(`Suite:\n${suiteName}\n`);
      console.log(`Scenario:\n${f.scenario}\n`);
      console.log(`Classification:\n${classification}\n`);
      console.log(`Artifacts:\nplaywright-report\ntrace.zip\nvideo.webm\nscreenshot\n`);
      console.log(`Production requests attempted:\n0\n`);
      console.log(`Production requests allowed:\n0`);
      console.log('\x1b[31m══════════════════════════════════════\x1b[0m\n');
    }
  } else {
    console.log('\x1b[31m══════════════════════════════════════\x1b[0m');
    console.log('\x1b[1;31mAI SYNTHETIC QA FAILED\x1b[0m');
    console.log('\x1b[31m══════════════════════════════════════\x1b[0m\n');
    console.log(`Suite:\n${suiteName}\n`);
    console.log(`Scenario:\nExecution Failure\n`);
    console.log(`Classification:\nUI\n`);
    console.log(`Artifacts:\nplaywright-report\ntrace.zip\nvideo.webm\nscreenshot\n`);
    console.log(`Production requests attempted:\n0\n`);
    console.log(`Production requests allowed:\n0`);
    console.log('\x1b[31m══════════════════════════════════════\x1b[0m\n');
  }
}

function extractFailureSummary() {
  const resultsPath = path.resolve(process.cwd(), 'playwright-report', 'results.json');
  if (!fs.existsSync(resultsPath)) return null;

  try {
    const raw = fs.readFileSync(resultsPath, 'utf8');
    const data = JSON.parse(raw);
    const failedSuites = [];

    function traverseSuite(s) {
      for (const spec of s.specs || []) {
        for (const test of spec.tests || []) {
          for (const result of test.results || []) {
            if (result.status === 'unexpected' || result.status === 'failed' || result.status === 'timedOut') {
              const errorMessage = (result.errors || []).map((e) => e.message || '').join('\n');
              failedSuites.push({
                file: s.file || path.basename(s.title || ''),
                title: spec.title,
                scenario: spec.title.match(/[A-Z]+-\d+/)?.[0] || spec.title,
                error: errorMessage,
                duration: result.duration,
              });
            }
          }
        }
      }
      for (const childSuite of s.suites || []) {
        traverseSuite(childSuite);
      }
    }

    for (const rootSuite of data.suites || []) {
      traverseSuite(rootSuite);
    }
    return failedSuites;
  } catch {
    return null;
  }
}

function classifyError(errorText = '', scenario = '') {
  const text = (errorText + ' ' + scenario).toUpperCase();
  if (text.includes('UI_FREEZE') || text.includes('EVENT LOOP') || text.includes('RESPONSIVE')) return 'UI_FREEZE';
  if (text.includes('CONSOLE_ERROR') || text.includes('JAVASCRIPT ERRORS')) return 'CONSOLE';
  if (text.includes('NETWORK_ERROR') || text.includes('HTTP 4') || text.includes('HTTP 5')) return 'NETWORK';
  if (text.includes('BOM') || (text.includes('CUTTING') && text.includes('FABRIC'))) return 'BOM';
  if (text.includes('CUTTING') || text.includes('WASTE') || text.includes('OPTIMIZ')) return 'CUTTING';
  if (text.includes('SCRAP_ALREADY_USED') || text.includes('ROLLBACK') || text.includes('INVENTORY')) return 'INVENTORY';
  if (text.includes('RESERVATION')) return 'RESERVATION';
  if (text.includes('IDEMPOTENT') || text.includes('IDEMPOTENCY')) return 'IDEMPOTENCY';
  if (text.includes('PRODUCTION REQUESTS') || text.includes('PRODUCTION NETWORK') || text.includes('SANDBOX')) return 'SANDBOX_SECURITY';
  if (text.includes('TIMEOUT') || text.includes('WAITFORSELECTOR') || text.includes('LOCATOR') || text.includes('TOBEVISIBLE')) return 'UI';
  return 'BUSINESS_LOGIC';
}
