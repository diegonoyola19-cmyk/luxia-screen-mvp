import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cisxgxttmfpxoslepybp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpc3hneHR0bWZweG9zbGVweWJwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQwMjk0NSwiZXhwIjoyMDkyOTc4OTQ1fQ.Y6Av7l1VSSTI_cFemx4QDPcWfMpSW0GdwpwQDJ7mgPs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: orders, error } = await supabase.from('work_orders').select('*').order('created_at', { ascending: false }).limit(5);
  if (error) {
    console.error('Error fetching orders:', error);
    return;
  }
  console.log('Latest 5 orders:', orders.map(o => o.order_number));
}

run().catch(console.error);
