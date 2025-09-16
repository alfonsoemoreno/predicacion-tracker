"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Navbar from "@/components/Navbar";

interface Person {
  id: string;
  name: string;
  notes: string | null;
}

export default function PersonsPage() {
  const [list, setList] = useState<Person[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setList([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("persons")
      .select("id, name, notes")
      .order("created_at");
    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }
    setList(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return alert("Inicia sesión");
    if (!name.trim()) return;
    const { error } = await supabase
      .from("persons")
      .insert({ user_id: sessionData.session.user.id, name });
    if (error) alert(error.message);
    else {
      setName("");
      load();
    }
  };

  const remove = async (id: string) => {
    if (!confirm("¿Borrar?")) return;
    const { error } = await supabase.from("persons").delete().eq("id", id);
    if (error) alert(error.message);
    else load();
  };

  return (
    <>
      <Navbar />
      <main style={{ padding: 16 }}>
        <h1>Personas (cursos bíblicos)</h1>
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <input
            placeholder="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ padding: "6px 8px" }}
          />
          <button onClick={add}>Agregar</button>
        </div>
        {loading && <div>Cargando...</div>}
        {errorMsg && <div style={{ color: "red" }}>Error: {errorMsg}</div>}
        <ul style={{ listStyle: "none", padding: 0, margin: 0, maxWidth: 480 }}>
          {list.map((p) => (
            <li
              key={p.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "4px 0",
                borderBottom: "1px solid #eee",
              }}
            >
              <span>{p.name}</span>
              <button onClick={() => remove(p.id)}>Borrar</button>
            </li>
          ))}
          {!loading && list.length === 0 && (
            <li style={{ padding: "8px 0", opacity: 0.7 }}>Sin registros</li>
          )}
        </ul>
      </main>
    </>
  );
}
