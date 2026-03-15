"use client";

import { Geist, Geist_Mono, Raleway } from "next/font/google";
import "./globals.css";
import { AppSidebar, Tool } from "@/components/app-sidebar";
import { Providers } from "@/components/providers";
import { MainContent } from "@/components/main-content";
import { AtomBoldDuotone, Widget2BoldDuotone, GraphBoldDuotone, Pen2BoldDuotone } from "solar-icon-set";

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
  { name: "Dashboard", icon: Widget2BoldDuotone, href: "/dashboard" },
  { name: "Study Plans", icon: Pen2BoldDuotone, href: "/study-plans" },
  { name: "Knowledge Graph", icon: GraphBoldDuotone, href: "/knowledge-graph" },
  { name: "Memory Graph", icon: AtomBoldDuotone, href: "/memory-graph" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={raleway.variable} suppressHydrationWarning>
      <head>
        <script
          async
          crossOrigin="anonymous"
          src="https://tweakcn.com/live-preview.min.js"
        />
      </head>
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
