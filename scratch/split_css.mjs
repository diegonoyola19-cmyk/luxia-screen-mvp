import fs from 'fs';
import postcss from 'postcss';
import path from 'path';

const globalCssPath = path.resolve('src/styles/global.css');

async function extractSection(prefixes, outputFilename) {
  const css = fs.readFileSync(globalCssPath, 'utf8');
  const ast = postcss.parse(css);
  let count = 0;

  ast.walkRules((rule) => {
    const matches = prefixes.some(prefix => rule.selector.includes(prefix));
    if (matches) {
      count++;
    } else {
      rule.remove();
    }
  });

  let removedAtRules = true;
  while (removedAtRules) {
    removedAtRules = false;
    ast.walkAtRules((atRule) => {
      if (atRule.nodes && atRule.nodes.length === 0) {
        atRule.remove();
        removedAtRules = true;
      }
    });
  }

  if (count > 0) {
    fs.writeFileSync(path.resolve('src/styles', outputFilename), ast.toString(), 'utf8');
    console.log(`Extraidas ${count} reglas hacia ${outputFilename}`);
  }
}

async function stripExtracted(allPrefixes) {
  const css = fs.readFileSync(globalCssPath, 'utf8');
  const ast = postcss.parse(css);
  let removed = 0;

  ast.walkRules((rule) => {
    const matches = allPrefixes.some(prefix => rule.selector.includes(prefix));
    if (matches) {
      rule.remove();
      removed++;
    }
  });

  let removedAtRules = true;
  while (removedAtRules) {
    removedAtRules = false;
    ast.walkAtRules((atRule) => {
      if (atRule.nodes && atRule.nodes.length === 0) {
        atRule.remove();
        removedAtRules = true;
      }
    });
  }

  fs.writeFileSync(globalCssPath, ast.toString(), 'utf8');
  console.log(`Removidas ${removed} reglas de global.css`);
}

async function run() {
  const inventoryPrefixes = ['.inventory'];
  const rulesPrefixes = ['.rules', '.rule-'];
  const ordersPrefixes = ['.order', '.history', '.summary'];
  const productionPrefixes = ['.production', '.fabric-', '.waste'];

  await extractSection(inventoryPrefixes, 'inventory.css');
  await extractSection(rulesPrefixes, 'rules.css');
  await extractSection(ordersPrefixes, 'orders.css');
  await extractSection(productionPrefixes, 'production.css');

  const allPrefixes = [...inventoryPrefixes, ...rulesPrefixes, ...ordersPrefixes, ...productionPrefixes];
  await stripExtracted(allPrefixes);
}

run().catch(console.error);
