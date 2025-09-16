"use client";
import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });
  }, [router]);

  const signIn = async () => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : undefined;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: origin ? { redirectTo: origin } : undefined,
    });
  };

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: 24,
      }}
    >
      <h1>Ingresar</h1>
      <p style={{ maxWidth: 400, textAlign: "center" }}>
        Accede con tu cuenta de Google para registrar tus actividades de
        predicación y cursos bíblicos.
      </p>
      <button onClick={signIn} style={{ padding: "10px 18px", fontSize: 16 }}>
        Ingresar con Google
      </button>
    </main>
  );
}
