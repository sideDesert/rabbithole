"use client";

import { Space_Grotesk, DM_Sans, Space_Mono, Geist, Fira_Code } from "next/font/google";
import "./globals.css";
import { AppSidebar, Tool } from "@/components/app-sidebar";
import { Providers } from "@/components/providers";
import { MainContent } from "@/components/main-content";

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

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  variable: "--font-fira-code",
});

const tools: Tool[] = [
  { name: "Dashboard", iconName: "layoutGrid", href: "/dashboard" },
  { name: "Study Plans", iconName: "pencil", href: "/study-plans" },
  { name: "Notes", iconName: "fileText", href: "/notes" },
  { name: "Evaluations", iconName: "listChecks", href: "/evaluations" },
  { name: "Practice", iconName: "dumbbell", href: "/practice" },
  { name: "Knowledge Graph", iconName: "network", href: "/knowledge-graph" },
  { name: "Memory Graph", iconName: "atom", href: "/memory-graph" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`theme-neo ${spaceGrotesk.variable} ${dmSans.variable} ${spaceMono.variable} ${geist.variable} ${firaCode.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme-personality");if(t&&t!=="neo"){document.documentElement.classList.remove("theme-neo");document.documentElement.classList.add("theme-"+t)}}catch(e){}})()`,
          }}
        />
      </head>
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
