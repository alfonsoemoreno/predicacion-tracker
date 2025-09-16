import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppThemeClient, { ColorModeProvider } from "./theme-client";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Registro de Precursorado",
  description:
    "Registro de tiempo de ministerio, cursos bíblicos y servicio sagrado",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ColorModeProvider>
          <AppThemeClient>{children}</AppThemeClient>
        </ColorModeProvider>
      </body>
    </html>
  );
}
