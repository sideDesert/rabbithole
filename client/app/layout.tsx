"use client";

import { Geist, Geist_Mono, Raleway } from "next/font/google";
import "./globals.css";
import { AppSidebar, Tool } from "@/components/app-sidebar";
import { Providers } from "@/components/providers";
import { MainContent } from "@/components/main-content";
import { LayoutDashboard, Network, Signature } from "lucide-react";

const raleway = Raleway({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const tools: Tool[] = [
  { name: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { name: "Study Plans", icon: Signature, href: "/study-plans" },
  { name: "Knowledge Graph", icon: Network, href: "/knowledge-graph" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={raleway.variable} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background`}
      >
        <Providers>
          <AppSidebar tools={tools} />
          <MainContent>{children}</MainContent>
        </Providers>
      </body>
    </html>
  );
}
