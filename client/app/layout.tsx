"use client";

import { Space_Grotesk, DM_Sans, Space_Mono } from "next/font/google";
import "./globals.css";
import { AppSidebar, Tool } from "@/components/app-sidebar";
import { Providers } from "@/components/providers";
import { MainContent } from "@/components/main-content";
import { AtomBoldDuotone, Widget2BoldDuotone, GraphBoldDuotone, Pen2BoldDuotone, DocumentTextBoldDuotone, ChecklistBoldDuotone } from "solar-icon-set";

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
  { name: "Dashboard", icon: Widget2BoldDuotone, href: "/dashboard" },
  { name: "Study Plans", icon: Pen2BoldDuotone, href: "/study-plans" },
  { name: "Notes", icon: DocumentTextBoldDuotone, href: "/notes" },
  { name: "Evaluations", icon: ChecklistBoldDuotone, href: "/evaluations" },
  { name: "Knowledge Graph", icon: GraphBoldDuotone, href: "/knowledge-graph" },
  { name: "Memory Graph", icon: AtomBoldDuotone, href: "/memory-graph" },
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
          <MainContent>{children}</MainContent>
        </Providers>
      </body>
    </html>
  );
}
