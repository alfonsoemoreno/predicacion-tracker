"use client";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Navbar() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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

  const signOut = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setError(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setError(error.message);
      setLoggingOut(false);
      return;
    }
    router.replace("/login");
    setLoggingOut(false);
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
            <button onClick={signOut} disabled={loggingOut}>
              {loggingOut ? "Saliendo..." : "Salir"}
            </button>
          </>
        ) : (
          <Link href="/login">Ingresar</Link>
        )}
      </div>
      {error && <div style={{ color: "red", fontSize: 12 }}>{error}</div>}
    </nav>
  );
}
