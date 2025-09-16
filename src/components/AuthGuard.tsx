"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

interface Props {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: Props) {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) {
        setAuthed(true);
      } else {
        router.replace("/login");
      }
      setChecking(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!mounted) return;
      if (session) {
        setAuthed(true);
      } else {
        router.replace("/login");
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  if (checking) return <div style={{ padding: 24 }}>Verificando sesión...</div>;
  if (!authed) return null;
  return <>{children}</>;
}
