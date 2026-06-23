import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cisxgxttmfpxoslepybp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpc3hneHR0bWZweG9zbGVweWJwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQwMjk0NSwiZXhwIjoyMDkyOTc4OTQ1fQ.Y6Av7l1VSSTI_cFemx4QDPcWfMpSW0GdwpwQDJ7mgPs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: orders } = await supabase.from('work_orders').select('*').eq('order_number', 'TEST-002').limit(1);
  const order = orders?.[0];
  if (!order) {
    console.log('Order TEST-002 not found');
    return;
  }
  console.log('Order TEST-002 ID:', order.id);
  
  const { data: movements } = await supabase.from('inventory_movements').select('*').eq('order_id', order.id);
  console.log('Movements:', JSON.stringify(movements, null, 2));
  
  const { data: items } = await supabase.from('inventory_items').select('*').eq('created_from_order_id', order.id);
  console.log('Created Items:', JSON.stringify(items, null, 2));
}

run().catch(console.error);
