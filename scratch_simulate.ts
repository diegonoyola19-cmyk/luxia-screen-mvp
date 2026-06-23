import { createClient } from '@supabase/supabase-js';
import { buildConsumptionPlan } from './src/logic/buildConsumptionPlan';

const supabaseUrl = 'https://cisxgxttmfpxoslepybp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpc3hneHR0bWZweG9zbGVweWJwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQwMjk0NSwiZXhwIjoyMDkyOTc4OTQ1fQ.Y6Av7l1VSSTI_cFemx4QDPcWfMpSW0GdwpwQDJ7mgPs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: orders } = await supabase.from('work_orders').select('*').eq('order_number', 'TEST-003').limit(1);
  const order = orders?.[0];
  if (!order) {
    console.log('Order not found');
    return;
  }
  
  const payload = order.payload;
  console.log('Building plan for order...', payload.orderNumber);
  
  try {
    const plan = buildConsumptionPlan(payload);
    console.log('Plan warnings:', JSON.stringify(plan.warnings, null, 2));
    console.log('Plan items:', JSON.stringify(plan.items, null, 2));
  } catch (err) {
    console.error('Error building plan:', err);
  }
}

run().catch(console.error);
