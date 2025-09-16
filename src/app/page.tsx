"use client";
export const dynamic = "force-dynamic";
import nextDynamic from "next/dynamic";
import Navbar from "@/components/Navbar";

// Carga diferida del calendario (solo cliente)
const CalendarView = nextDynamic(() => import("@/components/CalendarView"), {
  ssr: false,
});

export default function Home() {
  return (
    <>
      <Navbar />
      <CalendarView />
    </>
  );
}
