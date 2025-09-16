"use client";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function Navbar() {
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    supabase.auth
      .getSession()
      .then(({ data }) => setUserEmail(data.session?.user?.email ?? null));
    return () => subscription.unsubscribe();
  }, []);

  const signIn = async () => {
    await supabase.auth.signInWithOAuth({ provider: "google" });
  };
  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <nav
      style={{
        display: "flex",
        gap: 16,
        alignItems: "center",
        padding: "12px 20px",
        borderBottom: "1px solid #eee",
        background: "#fafafa",
      }}
    >
      <strong style={{ flex: 1 }}>Predicación Tracker</strong>
      <Link href="/" style={{ textDecoration: "none" }}>
        Calendario
      </Link>
      <Link href="/persons" style={{ textDecoration: "none" }}>
        Personas
      </Link>
      <div>
        {userEmail ? (
          <>
            <span style={{ marginRight: 8, fontSize: 14, opacity: 0.8 }}>
              {userEmail}
            </span>
            <button onClick={signOut}>Salir</button>
          </>
        ) : (
          <button onClick={signIn}>Ingresar con Google</button>
        )}
      </div>
    </nav>
  );
}
