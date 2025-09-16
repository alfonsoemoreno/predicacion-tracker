import { createClient, SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (browserClient) return browserClient;
  if (typeof window === "undefined") {
    // Proxy para evitar uso accidental en servidor/prerender
    return new Proxy({} as SupabaseClient, {
      get() {
        throw new Error("Supabase client no disponible en servidor (SSR).");
      },
    });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.warn("Faltan variables públicas de Supabase (.env.local).");
    return new Proxy({} as SupabaseClient, {
      get() {
        throw new Error(
          "Definir NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY."
        );
      },
    });
  }
  browserClient = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return browserClient;
}

export const supabase = getSupabaseClient();
