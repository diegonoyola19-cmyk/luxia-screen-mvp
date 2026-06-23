import { syncApiCatalogToSupabase } from '../src/logic/syncApiCatalogToSupabase';

async function run() {
  try {
    const count = await syncApiCatalogToSupabase();
    console.log("Count:", count);
  } catch (err) {
    console.error("Error:", err);
  }
}
run();
