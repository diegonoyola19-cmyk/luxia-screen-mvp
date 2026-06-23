import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cisxgxttmfpxoslepybp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpc3hneHR0bWZweG9zbGVweWJwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQwMjk0NSwiZXhwIjoyMDkyOTc4OTQ1fQ.Y6Av7l1VSSTI_cFemx4QDPcWfMpSW0GdwpwQDJ7mgPs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: items } = await supabase.from('inventory_items').select('*').eq('code', '0-004-87-01998').eq('category', 'fabric');
  console.log('Stock items:', JSON.stringify(items, null, 2));
}

run().catch(console.error);
