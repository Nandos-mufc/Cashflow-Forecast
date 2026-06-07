import { createClient } from "@supabase/supabase-js";

// These two values come from your Supabase project:
//   Dashboard → Project Settings → API
// They are safe to expose to the browser (the anon key is public by design;
// Row Level Security is what actually protects the data).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Helpful early error rather than a confusing failure later.
  // eslint-disable-next-line no-console
  console.warn(
    "Missing Supabase env vars. Copy .env.local.example to .env.local and fill in your project URL and anon key."
  );
}

export const supabase = createClient(url || "", anonKey || "", {
  auth: { persistSession: true, autoRefreshToken: true },
});
