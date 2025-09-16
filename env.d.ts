/// <reference types="next" />
/// <reference types="next/types/global" />

// Tipos para variables públicas usadas en el cliente.
// Deben comenzar con NEXT_PUBLIC_ para estar disponibles en el bundle.

declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_SUPABASE_URL: string;
    NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  }
}
