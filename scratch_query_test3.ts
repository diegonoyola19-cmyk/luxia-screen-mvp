import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cisxgxttmfpxoslepybp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpc3hneHR0bWZweG9zbGVweWJwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQwMjk0NSwiZXhwIjoyMDkyOTc4OTQ1fQ.Y6Av7l1VSSTI_cFemx4QDPcWfMpSW0GdwpwQDJ7mgPs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: orders } = await supabase.from('work_orders').select('*').eq('order_number', 'TEST-003').limit(1);
  const order = orders?.[0];
  if (!order) {
    console.log('Order TEST-003 not found');
    return;
  }
  console.log('Order TEST-003 ID:', order.id);
  console.log('Order status:', order.status);
  
  const { data: movements } = await supabase.from('inventory_movements').select('*').eq('order_id', order.id);
  console.log('Movements length:', movements?.length);
  
  const { data: items } = await supabase.from('inventory_items').select('*').eq('created_from_order_id', order.id);
  console.log('Created Items length:', items?.length);
}

run().catch(console.error);
