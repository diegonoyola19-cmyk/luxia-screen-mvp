const fs = require('fs');
let c = fs.readFileSync('src/features/calculadora-screen/components/MaterialReviewModal.tsx', 'utf8');

// Replace \` with `
c = c.replace(/\\`/g, '`');
// Also replace \$ with $
c = c.replace(/\\\$/g, '$');

fs.writeFileSync('src/features/calculadora-screen/components/MaterialReviewModal.tsx', c);
