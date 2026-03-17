"use client";

import { Space_Grotesk, DM_Sans, Space_Mono } from "next/font/google";
import "./globals.css";
import { AppSidebar, Tool } from "@/components/app-sidebar";
import { Providers } from "@/components/providers";
import { MainContent } from "@/components/main-content";
import { Atom, LayoutGrid, Network, Pencil, FileText, ListChecks } from "lucide-react";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["700"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "700"],
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "700"],
});

const tools: Tool[] = [
  { name: "Dashboard", icon: LayoutGrid, href: "/dashboard" },
  { name: "Study Plans", icon: Pencil, href: "/study-plans" },
  { name: "Notes", icon: FileText, href: "/notes" },
  { name: "Evaluations", icon: ListChecks, href: "/evaluations" },
  { name: "Knowledge Graph", icon: Network, href: "/knowledge-graph" },
  { name: "Memory Graph", icon: Atom, href: "/memory-graph" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${dmSans.variable} ${spaceMono.variable}`} suppressHydrationWarning>
      <body className="antialiased bg-background font-sans">
        <Providers>
          <AppSidebar tools={tools} />
          <MainContent>
            <div className="noise-overlay" aria-hidden="true" />
            {children}
          </MainContent>
        </Providers>
      </body>
    </html>
  );
}
