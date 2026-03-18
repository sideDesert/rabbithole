# Theme Switching Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an extensible theme personality system (Neo Brutalism + Classic) that lets users switch visual identities independently of light/dark mode.

**Architecture:** CSS-only theme classes (`.theme-neo`, `.theme-classic`) applied to `<html>` alongside existing `.dark` class. Theme config in `lib/themes.ts` defines metadata. A React context provider manages theme state via localStorage. All hardcoded colors migrated to CSS variables. Icon library switchable per theme via a `<ThemeIcon>` mapping component.

**Tech Stack:** Next.js 14 (App Router), Tailwind CSS v4, next-themes, React Context, CSS custom properties

---

### Task 1: Theme Config & Types

**Files:**
- Create: `client/lib/themes.ts`

- [ ] **Step 1: Create theme config file**

```ts
// client/lib/themes.ts
export interface ThemePersonality {
  id: string;
  label: string;
  className: string;
  fonts: string[];
  iconSet: "lucide" | "solar";
  features: {
    grainTexture: boolean;
    neoHover: boolean;
  };
}

export const themes: ThemePersonality[] = [
  {
    id: "neo",
    label: "Neo Brutalism",
    className: "theme-neo",
    fonts: ["DM Sans", "Space Grotesk", "Space Mono", "Lora"],
    iconSet: "lucide",
    features: { grainTexture: true, neoHover: true },
  },
  {
    id: "classic",
    label: "Classic",
    className: "theme-classic",
    fonts: ["Geist", "Fira Code", "Lora"],
    iconSet: "solar",
    features: { grainTexture: false, neoHover: false },
  },
];

export const DEFAULT_THEME_ID = "neo";
```

- [ ] **Step 2: Commit**

```bash
git add client/lib/themes.ts
git commit -m "feat: add theme personality config and types"
```

---

### Task 2: Restructure globals.css — Theme-Scoped Variables

**Files:**
- Modify: `client/app/globals.css`

This is the core task. Restructure `:root` → `.theme-neo` and `.dark` → `.theme-neo.dark`, then add `.theme-classic` / `.theme-classic.dark` with values from the `main` branch. Add new semantic CSS variables for hardcoded colors.

- [ ] **Step 1: Replace `:root` with `.theme-neo` and add new semantic variables**

Replace the `:root { ... }` block (lines 77-146) with `.theme-neo { ... }`. Add these new semantic variables inside the block:

```css
.theme-neo {
    /* Graph integration */
    --graph-ring-track: #e0e0dc;
    --graph-node-bg: #ffffff;
    --graph-node-shadow: 3px 3px 0px 0px #1a1a1a;
    --graph-edge-gold: #000000;
    --graph-edge-yellow: #000000;
    --graph-phase-interview: #000000;
    --graph-phase-planning: #000000;

    /* Core palette — warm cream + coral/yellow/teal */
    --background: #fffef5;
    --foreground: #1a1a1a;
    --card: #ffffff;
    --card-foreground: #1a1a1a;
    --popover: #ffffff;
    --popover-foreground: #1a1a1a;
    --primary: #e85d3a;
    --primary-foreground: #ffffff;
    --secondary: #ffcc00;
    --secondary-foreground: #1a1a1a;
    --muted: #f5f5f0;
    --muted-foreground: #6b6b6b;
    --accent: #ffcc00;
    --accent-foreground: #1a1a1a;
    --destructive: #dc2626;
    --destructive-foreground: #ffffff;
    --border: #1a1a1a;
    --input: #1a1a1a;
    --ring: #e85d3a;

    /* Charts */
    --chart-1: #e85d3a;
    --chart-2: #ffcc00;
    --chart-3: #000000;
    --chart-4: #4a90d9;
    --chart-5: #9b59b6;

    /* Sidebar */
    --sidebar: #f5f5f0;
    --sidebar-foreground: #1a1a1a;
    --sidebar-primary: #e85d3a;
    --sidebar-primary-foreground: #ffffff;
    --sidebar-accent: #e85d3a;
    --sidebar-accent-foreground: #ffffff;
    --sidebar-border: #1a1a1a;
    --sidebar-ring: #e85d3a;

    /* Typography */
    --font-sans: "DM Sans", sans-serif;
    --font-heading: "Space Grotesk", sans-serif;
    --font-mono: "Space Mono", "Courier New", monospace;
    --font-serif: "Lora", Georgia, serif;

    /* Radius & spacing */
    --radius: 6px;
    --spacing: 0.25rem;
    --letter-spacing: 0em;
    --tracking-normal: 0em;

    /* Neo-brutalism hard offset shadows */
    --shadow-2xs: 1px 1px 0px 0px #1a1a1a;
    --shadow-xs: 2px 2px 0px 0px #1a1a1a;
    --shadow-sm: 2px 2px 0px 0px #1a1a1a;
    --shadow: 4px 4px 0px 0px #1a1a1a;
    --shadow-md: 4px 4px 0px 0px #1a1a1a;
    --shadow-lg: 6px 6px 0px 0px #1a1a1a;
    --shadow-xl: 8px 8px 0px 0px #1a1a1a;
    --shadow-2xl: 10px 10px 0px 0px #1a1a1a;

    /* ── Semantic status colors ── */
    --color-mastered: hsl(142, 71%, 45%);
    --color-strong: hsl(142, 50%, 40%);
    --color-medium: hsl(45, 93%, 47%);
    --color-weak: hsl(0, 84%, 60%);
    --color-undiscovered: #64748b;

    /* Memory graph entity colors */
    --color-node-person: #e85d3a;
    --color-node-fact: #4a90d9;
    --color-node-belief: #ffcc00;
    --color-node-resource: #999999;

    /* Knowledge graph hub colors */
    --color-kg-memory-hub: hsl(260, 60%, 55%);
    --color-kg-topic-hub: hsl(200, 60%, 50%);
    --color-kg-topic-hub-legend: hsl(200, 60%, 25%);
    --color-kg-thread: hsl(142, 50%, 40%);
    --color-kg-default: hsl(220, 20%, 50%);
    --color-confused-with: #e85d3a;
    --color-part-of: #999999;

    /* Hub node gradients */
    --hub-gradient-start: #fffef5;
    --hub-gradient-end: #f5eed8;
}
```

- [ ] **Step 2: Replace `.dark` with `.theme-neo.dark`**

Replace the `.dark { ... }` block (lines 148-205) with `:is(.dark).theme-neo { ... }`. Add the same new semantic variables with dark-appropriate values:

```css
:is(.dark).theme-neo {
    /* Graph integration */
    --graph-ring-track: #444444;
    --graph-node-bg: #1e1c1a;
    --graph-node-shadow: 3px 3px 0px 0px rgba(0, 0, 0, 0.6);
    --graph-edge-gold: #ffd482;
    --graph-edge-yellow: #ffcc00;
    --graph-phase-interview: #ffd482;
    --graph-phase-planning: #ffcc00;

    /* Core palette — dark warm */
    --background: #0d0b0a;
    --foreground: #e0e0e0;
    --card: #1e1c1a;
    --card-foreground: #e0e0e0;
    --popover: #1e1c1a;
    --popover-foreground: #e0e0e0;
    --primary: #e85d3a;
    --primary-foreground: #ffffff;
    --secondary: #ffcc00;
    --secondary-foreground: #1a1a1a;
    --muted: #252220;
    --muted-foreground: #999999;
    --accent: #ffcc00;
    --accent-foreground: #1a1a1a;
    --destructive: #ff936f;
    --destructive-foreground: black;
    --border: #ffffff21;
    --input: #444444;
    --ring: #e85d3a;

    /* Charts */
    --chart-1: #e85d3a;
    --chart-2: #ffcc00;
    --chart-3: #000000;
    --chart-4: #3a7bc8;
    --chart-5: #8e4fad;

    /* Sidebar */
    --sidebar: #151311;
    --sidebar-foreground: #e0e0e0;
    --sidebar-primary: #e85d3a;
    --sidebar-primary-foreground: #ffffff;
    --sidebar-accent: var(--primary);
    --sidebar-accent-foreground: #ffffff;
    --sidebar-border: var(--border);
    --sidebar-ring: #e85d3a;

    /* Neo-brutalism dark shadows */
    --shadow-2xs: 1px 1px 0px 0px rgba(0, 0, 0, 0.6);
    --shadow-xs: 2px 2px 0px 0px rgba(0, 0, 0, 0.6);
    --shadow-sm: 2px 2px 0px 0px rgba(0, 0, 0, 0.6);
    --shadow: 4px 4px 0px 0px rgba(0, 0, 0, 0.6);
    --shadow-md: 4px 4px 0px 0px rgba(0, 0, 0, 0.6);
    --shadow-lg: 6px 6px 0px 0px rgba(0, 0, 0, 0.6);
    --shadow-xl: 8px 8px 0px 0px rgba(0, 0, 0, 0.6);
    --shadow-2xl: 10px 10px 0px 0px rgba(0, 0, 0, 0.6);

    /* Semantic status colors — slightly adjusted for dark */
    --color-mastered: hsl(142, 71%, 50%);
    --color-strong: hsl(142, 50%, 45%);
    --color-medium: hsl(45, 93%, 52%);
    --color-weak: hsl(0, 84%, 65%);
    --color-undiscovered: #94a3b8;

    /* Memory graph entity colors */
    --color-node-person: #ff7a5c;
    --color-node-fact: #5ba3e6;
    --color-node-belief: #ffe066;
    --color-node-resource: #aaaaaa;

    /* Knowledge graph hub colors */
    --color-kg-memory-hub: hsl(260, 60%, 65%);
    --color-kg-topic-hub: hsl(200, 60%, 60%);
    --color-kg-topic-hub-legend: hsl(200, 60%, 40%);
    --color-kg-thread: hsl(142, 50%, 50%);
    --color-kg-default: hsl(220, 20%, 60%);
    --color-confused-with: #ff7a5c;
    --color-part-of: #aaaaaa;

    /* Hub node gradients */
    --hub-gradient-start: #2a2118;
    --hub-gradient-end: #1e1c1a;
}
```

- [ ] **Step 3: Add `.theme-classic` and `:is(.dark).theme-classic` blocks**

Add after the neo dark block. Use the oklch values from the `main` branch:

```css
/* ===== Theme: Classic ===== */

.theme-classic {
    /* Graph integration */
    --graph-ring-track: #cbd5e1;
    --graph-node-bg: oklch(0.97 0.001 286);
    --graph-node-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    --graph-edge-gold: oklch(0.6104 0.0767 299.7335);
    --graph-edge-yellow: oklch(0.8540 0.0882 76.8292);
    --graph-phase-interview: oklch(0.6104 0.0767 299.7335);
    --graph-phase-planning: oklch(0.8540 0.0882 76.8292);

    /* Core palette */
    --background: oklch(0.9777 0.0041 301.4256);
    --foreground: oklch(0.3651 0.0325 287.0807);
    --card: oklch(1.0000 0 0);
    --card-foreground: oklch(0.3651 0.0325 287.0807);
    --popover: oklch(1.0000 0 0);
    --popover-foreground: oklch(0.3651 0.0325 287.0807);
    --primary: oklch(0.6104 0.0767 299.7335);
    --primary-foreground: oklch(0.9777 0.0041 301.4256);
    --secondary: oklch(0.8957 0.0265 300.2416);
    --secondary-foreground: oklch(0.3651 0.0325 287.0807);
    --muted: oklch(0.8906 0.0139 299.7754);
    --muted-foreground: oklch(0.5288 0.0375 290.7895);
    --accent: oklch(0.7889 0.0802 359.9375);
    --accent-foreground: oklch(0.3394 0.0441 1.7583);
    --destructive: oklch(0.6332 0.1578 22.6734);
    --destructive-foreground: oklch(0.9777 0.0041 301.4256);
    --border: oklch(0.8447 0.0226 300.1421);
    --input: oklch(0.9329 0.0124 301.2783);
    --ring: oklch(0.6104 0.0767 299.7335);

    /* Charts */
    --chart-1: oklch(0.6104 0.0767 299.7335);
    --chart-2: oklch(0.7889 0.0802 359.9375);
    --chart-3: oklch(0.7321 0.0749 169.8670);
    --chart-4: oklch(0.8540 0.0882 76.8292);
    --chart-5: oklch(0.7857 0.0645 258.0839);

    /* Sidebar */
    --sidebar: oklch(0.9554 0.0082 301.3541);
    --sidebar-foreground: oklch(0.3651 0.0325 287.0807);
    --sidebar-primary: oklch(0.6104 0.0767 299.7335);
    --sidebar-primary-foreground: oklch(0.9777 0.0041 301.4256);
    --sidebar-accent: oklch(0.7889 0.0802 359.9375);
    --sidebar-accent-foreground: oklch(0.3394 0.0441 1.7583);
    --sidebar-border: oklch(0.8719 0.0198 302.1690);
    --sidebar-ring: oklch(0.6104 0.0767 299.7335);

    /* Typography */
    --font-sans: Geist, sans-serif;
    --font-heading: Geist, sans-serif;
    --font-mono: "Fira Code", "Courier New", monospace;
    --font-serif: "Lora", Georgia, serif;

    /* Radius & spacing */
    --radius: 0.5rem;
    --spacing: 0.25rem;
    --letter-spacing: 0em;
    --tracking-normal: 0em;

    /* Soft blurred shadows */
    --shadow-2xs: 1px 2px 5px 1px hsl(0 0% 0% / 0.03);
    --shadow-xs: 1px 2px 5px 1px hsl(0 0% 0% / 0.03);
    --shadow-sm: 1px 2px 5px 1px hsl(0 0% 0% / 0.06), 1px 1px 2px 0px hsl(0 0% 0% / 0.06);
    --shadow: 1px 2px 5px 1px hsl(0 0% 0% / 0.06), 1px 1px 2px 0px hsl(0 0% 0% / 0.06);
    --shadow-md: 1px 2px 5px 1px hsl(0 0% 0% / 0.06), 1px 2px 4px 0px hsl(0 0% 0% / 0.06);
    --shadow-lg: 1px 2px 5px 1px hsl(0 0% 0% / 0.06), 1px 4px 6px 0px hsl(0 0% 0% / 0.06);
    --shadow-xl: 1px 2px 5px 1px hsl(0 0% 0% / 0.06), 1px 8px 10px 0px hsl(0 0% 0% / 0.06);
    --shadow-2xl: 1px 2px 5px 1px hsl(0 0% 0% / 0.15);

    /* Semantic status colors */
    --color-mastered: oklch(0.7321 0.0749 169.8670);
    --color-strong: oklch(0.6800 0.0700 169.8670);
    --color-medium: oklch(0.8540 0.0882 76.8292);
    --color-weak: oklch(0.6332 0.1578 22.6734);
    --color-undiscovered: oklch(0.5288 0.0375 290.7895);

    /* Memory graph entity colors */
    --color-node-person: oklch(0.6104 0.0767 299.7335);
    --color-node-fact: oklch(0.7857 0.0645 258.0839);
    --color-node-belief: oklch(0.8540 0.0882 76.8292);
    --color-node-resource: oklch(0.5288 0.0375 290.7895);

    /* Knowledge graph hub colors */
    --color-kg-memory-hub: oklch(0.6104 0.0767 299.7335);
    --color-kg-topic-hub: oklch(0.7857 0.0645 258.0839);
    --color-kg-topic-hub-legend: oklch(0.5500 0.0500 258.0839);
    --color-kg-thread: oklch(0.7321 0.0749 169.8670);
    --color-kg-default: oklch(0.5288 0.0375 290.7895);
    --color-confused-with: oklch(0.6332 0.1578 22.6734);
    --color-part-of: oklch(0.5288 0.0375 290.7895);

    /* Hub node gradients */
    --hub-gradient-start: oklch(0.97 0.001 286);
    --hub-gradient-end: oklch(0.94 0.005 286);
}

:is(.dark).theme-classic {
    /* Graph integration */
    --graph-ring-track: #334155;
    --graph-node-bg: hsla(222, 20%, 14%, 0.95);
    --graph-node-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    --graph-edge-gold: oklch(0.7058 0.0777 302.0489);
    --graph-edge-yellow: oklch(0.8540 0.0882 76.8292);
    --graph-phase-interview: oklch(0.7058 0.0777 302.0489);
    --graph-phase-planning: oklch(0.8540 0.0882 76.8292);

    /* Core palette */
    --sidebar: oklch(0.1985 0.0200 293.6639);
    --background: oklch(0.2166 0.0215 292.8474);
    --foreground: oklch(0.9053 0.0245 293.5570);
    --card: oklch(0.2544 0.0301 292.7315);
    --card-foreground: oklch(0.9053 0.0245 293.5570);
    --popover: oklch(0.2544 0.0301 292.7315);
    --popover-foreground: oklch(0.9053 0.0245 293.5570);
    --primary: oklch(0.7058 0.0777 302.0489);
    --primary-foreground: oklch(0.2166 0.0215 292.8474);
    --secondary: oklch(0.4604 0.0472 295.5578);
    --secondary-foreground: oklch(0.9053 0.0245 293.5570);
    --muted: oklch(0.2560 0.0320 294.8380);
    --muted-foreground: oklch(0.6974 0.0282 300.0614);
    --accent: oklch(0.3181 0.0321 308.6149);
    --accent-foreground: oklch(0.8391 0.0692 2.6681);
    --destructive: oklch(0.6875 0.1420 21.4566);
    --destructive-foreground: oklch(0.2166 0.0215 292.8474);
    --border: oklch(0.3063 0.0359 293.3367);
    --input: oklch(0.2847 0.0346 291.2726);
    --ring: oklch(0.7058 0.0777 302.0489);

    /* Charts */
    --chart-1: oklch(0.7058 0.0777 302.0489);
    --chart-2: oklch(0.8391 0.0692 2.6681);
    --chart-3: oklch(0.7321 0.0749 169.8670);
    --chart-4: oklch(0.8540 0.0882 76.8292);
    --chart-5: oklch(0.7857 0.0645 258.0839);

    /* Sidebar */
    --sidebar-foreground: oklch(0.9053 0.0245 293.5570);
    --sidebar-primary: oklch(0.7058 0.0777 302.0489);
    --sidebar-primary-foreground: oklch(0.2166 0.0215 292.8474);
    --sidebar-accent: oklch(0.3181 0.0321 308.6149);
    --sidebar-accent-foreground: oklch(0.8391 0.0692 2.6681);
    --sidebar-border: oklch(0.2847 0.0346 291.2726);
    --sidebar-ring: oklch(0.7058 0.0777 302.0489);

    /* Classic soft shadows (same for dark) */
    --shadow-2xs: 1px 2px 5px 1px hsl(0 0% 0% / 0.03);
    --shadow-xs: 1px 2px 5px 1px hsl(0 0% 0% / 0.03);
    --shadow-sm: 1px 2px 5px 1px hsl(0 0% 0% / 0.06), 1px 1px 2px 0px hsl(0 0% 0% / 0.06);
    --shadow: 1px 2px 5px 1px hsl(0 0% 0% / 0.06), 1px 1px 2px 0px hsl(0 0% 0% / 0.06);
    --shadow-md: 1px 2px 5px 1px hsl(0 0% 0% / 0.06), 1px 2px 4px 0px hsl(0 0% 0% / 0.06);
    --shadow-lg: 1px 2px 5px 1px hsl(0 0% 0% / 0.06), 1px 4px 6px 0px hsl(0 0% 0% / 0.06);
    --shadow-xl: 1px 2px 5px 1px hsl(0 0% 0% / 0.06), 1px 8px 10px 0px hsl(0 0% 0% / 0.06);
    --shadow-2xl: 1px 2px 5px 1px hsl(0 0% 0% / 0.15);

    /* Semantic status colors (dark) */
    --color-mastered: oklch(0.7321 0.0749 169.8670);
    --color-strong: oklch(0.6800 0.0700 169.8670);
    --color-medium: oklch(0.8540 0.0882 76.8292);
    --color-weak: oklch(0.6875 0.1420 21.4566);
    --color-undiscovered: oklch(0.6974 0.0282 300.0614);

    /* Memory graph entity colors (dark) */
    --color-node-person: oklch(0.7058 0.0777 302.0489);
    --color-node-fact: oklch(0.7857 0.0645 258.0839);
    --color-node-belief: oklch(0.8540 0.0882 76.8292);
    --color-node-resource: oklch(0.6974 0.0282 300.0614);

    /* Knowledge graph hub colors (dark) */
    --color-kg-memory-hub: oklch(0.7058 0.0777 302.0489);
    --color-kg-topic-hub: oklch(0.7857 0.0645 258.0839);
    --color-kg-topic-hub-legend: oklch(0.6500 0.0600 258.0839);
    --color-kg-thread: oklch(0.7321 0.0749 169.8670);
    --color-kg-default: oklch(0.6974 0.0282 300.0614);
    --color-confused-with: oklch(0.6875 0.1420 21.4566);
    --color-part-of: oklch(0.6974 0.0282 300.0614);

    /* Hub node gradients */
    --hub-gradient-start: oklch(0.25 0.015 286);
    --hub-gradient-end: oklch(0.20 0.010 286);
}
```

- [ ] **Step 4: Scope neo-specific utilities**

Change `.neo-hover` selectors (lines 231-243) to be scoped:

```css
.theme-neo .neo-hover {
    transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.theme-neo .neo-hover:hover {
    transform: translate(2px, 2px);
    box-shadow: 2px 2px 0px 0px var(--border) !important;
}
.theme-neo .neo-hover:active {
    transform: translate(4px, 4px);
    box-shadow: none !important;
}

.theme-neo .card-hover {
    transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.theme-neo .card-hover:hover {
    transform: translate(-2px, -2px);
    box-shadow: 6px 6px 0px 0px var(--border);
}
```

- [ ] **Step 5: Scope noise texture to neo theme**

Change `.noise-overlay` and `.noise-surface` selectors (lines 567-601) to only work under `.theme-neo`:

```css
.theme-neo .noise-overlay { ... }
.theme-neo.dark .noise-overlay { ... }
.theme-neo .noise-surface::before { ... }
.theme-neo.dark .noise-surface::before { ... }
```

Note: The shared base (`.noise-overlay, .noise-surface::before` on lines 568-574) should also be scoped to `.theme-neo`.

- [ ] **Step 6: Verify the app still renders correctly**

Run: `cd client && pnpm build`
Expected: Build succeeds. The app should look identical since `.theme-neo` hasn't been applied to `<html>` yet — will break temporarily until Task 3 is done. That's expected.

- [ ] **Step 7: Commit**

```bash
git add client/app/globals.css
git commit -m "feat: restructure CSS to theme-scoped selectors with semantic color variables"
```

---

### Task 3: Theme Personality Provider

**Files:**
- Create: `client/components/theme-personality-provider.tsx`
- Modify: `client/components/providers.tsx` (lines 36-52)
- Modify: `client/app/layout.tsx` (lines 43-44)

- [ ] **Step 1: Create ThemePersonalityProvider**

```tsx
// client/components/theme-personality-provider.tsx
"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { themes, DEFAULT_THEME_ID, type ThemePersonality } from "@/lib/themes";

interface ThemePersonalityContextValue {
  activeTheme: ThemePersonality;
  setTheme: (id: string) => void;
  themes: ThemePersonality[];
}

const ThemePersonalityContext = createContext<ThemePersonalityContextValue | null>(null);

export function ThemePersonalityProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME_ID;
    return localStorage.getItem("theme-personality") ?? DEFAULT_THEME_ID;
  });

  const activeTheme = themes.find((t) => t.id === themeId) ?? themes[0];

  function setTheme(id: string) {
    const theme = themes.find((t) => t.id === id);
    if (!theme) return;

    // Remove old theme classes, add new one
    for (const t of themes) {
      document.documentElement.classList.remove(t.className);
    }
    document.documentElement.classList.add(theme.className);
    localStorage.setItem("theme-personality", id);
    setThemeId(id);
  }

  return (
    <ThemePersonalityContext.Provider value={{ activeTheme, setTheme, themes }}>
      {children}
    </ThemePersonalityContext.Provider>
  );
}

export function useThemePersonality() {
  const ctx = useContext(ThemePersonalityContext);
  if (!ctx) throw new Error("useThemePersonality must be used within ThemePersonalityProvider");
  return ctx;
}
```

- [ ] **Step 2: Wrap providers.tsx with ThemePersonalityProvider**

In `client/components/providers.tsx`, import and wrap inside `ThemeProvider`:

```tsx
import { ThemePersonalityProvider } from "@/components/theme-personality-provider";

// Inside the JSX, wrap after ThemeProvider:
<ThemeProvider ...>
  <ThemePersonalityProvider>
    <SidebarProvider>
      ...
    </SidebarProvider>
  </ThemePersonalityProvider>
</ThemeProvider>
```

- [ ] **Step 3: Add anti-FOUC script and default theme class to layout.tsx**

In `client/app/layout.tsx`, add an inline script before `<body>` and add the default theme class to `<html>`:

The `<html>` tag (line 43) should include `theme-neo` as a default class and an inline `<script>` inside `<head>` that reads localStorage and applies the right class before paint:

```tsx
<html lang="en" className={`theme-neo ${spaceGrotesk.variable} ${dmSans.variable} ${spaceMono.variable}`} suppressHydrationWarning>
  <head>
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var t=localStorage.getItem("theme-personality");if(t&&t!=="neo"){document.documentElement.classList.remove("theme-neo");document.documentElement.classList.add("theme-"+t)}}catch(e){}})()`,
      }}
    />
  </head>
  <body className="antialiased bg-background font-sans">
    ...
  </body>
</html>
```

- [ ] **Step 4: Verify the app renders with neo theme**

Run: `cd client && pnpm dev`
Expected: App should look identical to before the changes — neo theme applied by default.

- [ ] **Step 5: Commit**

```bash
git add client/components/theme-personality-provider.tsx client/components/providers.tsx client/app/layout.tsx
git commit -m "feat: add ThemePersonalityProvider with anti-FOUC script"
```

---

### Task 4: Theme Personality Switcher UI

**Files:**
- Create: `client/components/theme-personality-switcher.tsx`
- Modify: `client/components/app-sidebar.tsx` (add import + render)

- [ ] **Step 1: Create the switcher component**

```tsx
// client/components/theme-personality-switcher.tsx
"use client";

import { useThemePersonality } from "@/components/theme-personality-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Check, Palette } from "lucide-react";

export function ThemePersonalitySwitcher() {
  const { activeTheme, setTheme, themes } = useThemePersonality();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
          <Palette className="h-4 w-4" />
          <span className="text-sm">{activeTheme.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {themes.map((theme) => (
          <DropdownMenuItem key={theme.id} onClick={() => setTheme(theme.id)}>
            {theme.label}
            {theme.id === activeTheme.id && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Add switcher to app-sidebar.tsx**

Add import at top of `client/components/app-sidebar.tsx`:
```tsx
import { ThemePersonalitySwitcher } from "@/components/theme-personality-switcher";
```

Add the switcher at the bottom of the sidebar, after the Thread Tree `SidebarGroup` (after line 102), before `</SidebarContent>`:
```tsx
<SidebarGroup className="border-t-2 border-border p-2">
  <ThemePersonalitySwitcher />
</SidebarGroup>
```

- [ ] **Step 3: Verify switching works**

Run: `cd client && pnpm dev`
Expected: Click the theme switcher in sidebar → theme changes instantly. Refresh page → theme persists. Light/dark toggle still works independently.

- [ ] **Step 4: Commit**

```bash
git add client/components/theme-personality-switcher.tsx client/components/app-sidebar.tsx
git commit -m "feat: add theme personality switcher in sidebar"
```

---

### Task 5: Font Loading for Classic Theme

**Files:**
- Modify: `client/app/layout.tsx` (lines 1-26, 43)

- [ ] **Step 1: Add Geist and Fira Code font imports**

In `client/app/layout.tsx`, add the Classic theme fonts alongside the existing Neo fonts. Note: Geist is available from `next/font/google` as of Next.js 14.

```tsx
import { Space_Grotesk, DM_Sans, Space_Mono, Geist, Fira_Code } from "next/font/google";

// Existing neo fonts...
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-heading-neo", weight: ["700"] });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans-neo", weight: ["400", "500", "700"] });
const spaceMono = Space_Mono({ subsets: ["latin"], variable: "--font-mono-neo", weight: ["400", "700"] });

// Classic fonts
const geist = Geist({ subsets: ["latin"], variable: "--font-sans-classic" });
const firaCode = Fira_Code({ subsets: ["latin"], variable: "--font-mono-classic" });
```

Update the `<html>` className to include all font variables:
```tsx
<html lang="en" className={`theme-neo ${spaceGrotesk.variable} ${dmSans.variable} ${spaceMono.variable} ${geist.variable} ${firaCode.variable}`} suppressHydrationWarning>
```

Note: The `--font-sans`, `--font-heading`, `--font-mono` CSS variables in each theme block in globals.css already point to the correct font families. The CSS variables from `next/font` just make the font files available — the theme CSS picks which one to use.

Actually, `next/font/google` injects font-face rules and creates CSS variables. But our theme CSS variables (`--font-sans: "DM Sans"`) reference the font family name directly, not the next/font variable. So we just need the font-face to be loaded. The `variable` prop on the next/font creates a CSS variable we don't actually need to use — we just need the font file to be available. The simplest approach: keep the variable names but they're just for font loading.

- [ ] **Step 2: Verify both font sets load**

Run: `cd client && pnpm dev`
Switch themes. Inspect the rendered text — Neo should show DM Sans, Classic should show Geist.

- [ ] **Step 3: Commit**

```bash
git add client/app/layout.tsx
git commit -m "feat: load classic theme fonts (Geist, Fira Code)"
```

---

### Task 6: Migrate Hardcoded Colors in Graph Components

**Files:**
- Modify: `client/components/graph/concept-node.tsx` (lines 16-30)
- Modify: `client/components/graph/kg-thread-node.tsx` (lines 17-25)
- Modify: `client/components/graph/memory-hub-node.tsx` (lines 27-29)
- Modify: `client/components/graph/topic-hub-node.tsx` (lines 36-38)
- Modify: `client/components/graph/trail-edge.tsx` (lines 17-21)

- [ ] **Step 1: Migrate concept-node.tsx**

Replace the `masteryColor` function (lines 16-22) to use CSS variables:

```tsx
function masteryColor(score: number): string {
  if (score >= 0.9) return "var(--color-mastered)";
  if (score >= 0.7) return "var(--color-strong)";
  if (score >= 0.4) return "var(--color-medium)";
  if (score > 0)    return "var(--color-weak)";
  return "var(--color-undiscovered)";
}
```

Replace `masteryBg` function (lines 24-30) — use `color-mix` for alpha:

```tsx
function masteryBg(score: number): string {
  if (score >= 0.9) return "color-mix(in srgb, var(--color-mastered) 15%, transparent)";
  if (score >= 0.7) return "color-mix(in srgb, var(--color-strong) 12%, transparent)";
  if (score >= 0.4) return "color-mix(in srgb, var(--color-medium) 12%, transparent)";
  if (score > 0)    return "color-mix(in srgb, var(--color-weak) 12%, transparent)";
  return "var(--graph-node-bg)";
}
```

- [ ] **Step 2: Migrate kg-thread-node.tsx**

Replace `phaseConfig` (lines 17-21) and the fallback on line 25:

```tsx
const phaseConfig: Record<string, { cssVar: string; fallback: string }> = {
  interview: { cssVar: "--graph-phase-interview", fallback: "var(--color-undiscovered)" },
  planning:  { cssVar: "--graph-phase-planning",  fallback: "var(--color-undiscovered)" },
  teaching:  { cssVar: "",                        fallback: "var(--primary)" },
};

// line 25 fallback:
const config = phaseConfig[d.thread_phase] ?? { cssVar: "", fallback: "var(--color-undiscovered)" };
```

Note: Since the teaching phase doesn't use a CSS var lookup (it uses `getCSSVar` which reads computed styles), and we're replacing the fallback with a `var()`, we need to adjust. The `getCSSVar` approach reads computed values and can't return a `var()` string. We should simplify: always use CSS variables directly.

Better approach — replace the entire color resolution (lines 13-26) with direct CSS var usage:

```tsx
const PHASE_COLORS: Record<string, string> = {
  interview: "var(--graph-phase-interview)",
  planning:  "var(--graph-phase-planning)",
  teaching:  "var(--primary)",
};

// In the component:
const color = PHASE_COLORS[d.thread_phase] ?? "var(--color-undiscovered)";
```

Remove the `getCSSVar` function entirely.

- [ ] **Step 3: Migrate memory-hub-node.tsx**

Replace hardcoded gradients (lines 27-29):

```tsx
style={{
  background: `radial-gradient(circle at 30% 30%, var(--hub-gradient-start), var(--hub-gradient-end))`,
  minWidth: 160,
}}
```

Remove the `useTheme` import and `isDark`/`resolvedTheme` usage since the CSS variable handles light/dark automatically.

- [ ] **Step 4: Migrate topic-hub-node.tsx**

Replace hardcoded gradients (lines 36-38):

```tsx
style={{
  background: `linear-gradient(135deg, var(--hub-gradient-start), var(--hub-gradient-end))`,
}}
```

Remove the `useTheme` import and `isDark`/`resolvedTheme` usage.

- [ ] **Step 5: Migrate trail-edge.tsx**

Replace `EDGE_STYLE_VARS` and `getCSSVar` pattern (lines 12-22) with direct CSS var usage:

```tsx
const EDGE_STYLES: Record<EdgeType, { color: string; dasharray?: string }> = {
  prerequisite_of: { color: "var(--graph-edge-gold)" },
  part_of:         { color: "var(--color-part-of)" },
  explored_from:   { color: "var(--graph-edge-yellow)", dasharray: "6 4" },
  confused_with:   { color: "var(--color-confused-with)", dasharray: "4 4" },
};

// In the component (replace lines 46-48):
const config = EDGE_STYLES[edgeType];
const stroke = config.color;
```

Remove the `getCSSVar` function entirely.

- [ ] **Step 6: Verify graph components render correctly**

Run: `cd client && pnpm dev`, navigate to Knowledge Graph page, verify nodes/edges display correctly.

- [ ] **Step 7: Commit**

```bash
git add client/components/graph/concept-node.tsx client/components/graph/kg-thread-node.tsx client/components/graph/memory-hub-node.tsx client/components/graph/topic-hub-node.tsx client/components/graph/trail-edge.tsx
git commit -m "feat: migrate graph component colors to CSS variables"
```

---

### Task 7: Migrate Hardcoded Colors in Memory Graph Components

**Files:**
- Modify: `client/components/memory-graph/shared.tsx` (lines 10-16)
- Modify: `client/components/memory-graph/belief-node.tsx` (lines 10-13)
- Modify: `client/components/memory-graph/fact-node.tsx` (lines 17, 19)
- Modify: `client/components/memory-graph/person-node.tsx` (line 15)
- Modify: `client/components/memory-graph/resource-node.tsx` (line 25)

- [ ] **Step 1: Migrate shared.tsx ENTITY_COLORS**

Replace lines 10-16:

```tsx
export const ENTITY_COLORS: Record<EntityType, { border: string; bg: string }> = {
  concept:  { border: "var(--border)", bg: "color-mix(in srgb, var(--border) 8%, transparent)" },
  person:   { border: "var(--color-node-person)", bg: "color-mix(in srgb, var(--color-node-person) 8%, transparent)" },
  fact:     { border: "var(--color-node-fact)", bg: "color-mix(in srgb, var(--color-node-fact) 8%, transparent)" },
  belief:   { border: "var(--color-node-belief)", bg: "color-mix(in srgb, var(--color-node-belief) 8%, transparent)" },
  resource: { border: "var(--color-node-resource)", bg: "color-mix(in srgb, var(--color-node-resource) 8%, transparent)" },
};
```

- [ ] **Step 2: Migrate belief-node.tsx**

Replace `beliefStyle` function (lines 10-14):

```tsx
function beliefStyle(correct: boolean | null) {
  if (correct === true) return { border: "var(--color-node-belief)", bg: "color-mix(in srgb, var(--color-node-belief) 8%, transparent)", label: "correct" };
  if (correct === false) return { border: "var(--color-node-person)", bg: "color-mix(in srgb, var(--color-node-person) 8%, transparent)", label: "incorrect" };
  return { border: "var(--color-node-resource)", bg: "color-mix(in srgb, var(--color-node-resource) 8%, transparent)", label: "unverified" };
}
```

Note: "incorrect" uses person color (coral/orange) and "unverified" uses resource color (gray) — matching the original intent.

- [ ] **Step 3: Migrate fact-node.tsx**

Replace hardcoded colors on lines 17, 19:

```tsx
<span className="shrink-0 mt-0.5" style={{ color: "var(--color-node-fact)" }}><CircleCheck size={16} /></span>
// and
<span className="shrink-0 mt-0.5" style={{ color: "color-mix(in srgb, var(--color-node-fact) 50%, transparent)" }}><Circle size={16} /></span>
```

- [ ] **Step 4: Migrate person-node.tsx**

Replace line 15:

```tsx
<User size={20} className="shrink-0" style={{ color: "var(--color-node-person)" }} />
```

- [ ] **Step 5: Migrate resource-node.tsx**

Replace line 25:

```tsx
<Icon size={16} className="shrink-0" style={{ color: "var(--color-node-resource)" }} />
```

- [ ] **Step 6: Commit**

```bash
git add client/components/memory-graph/shared.tsx client/components/memory-graph/belief-node.tsx client/components/memory-graph/fact-node.tsx client/components/memory-graph/person-node.tsx client/components/memory-graph/resource-node.tsx
git commit -m "feat: migrate memory graph node colors to CSS variables"
```

---

### Task 8: Migrate Hardcoded Colors in Knowledge Graph Page

**Files:**
- Modify: `client/app/knowledge-graph/page.tsx` (lines 119-121, 130-156, 163, 413-418)

- [ ] **Step 1: Migrate legend edge colors**

Lines 119, 121 — replace hardcoded colors:

```tsx
<LegendItem color="var(--color-part-of)" label="Part of" />
// and
<LegendItem color="var(--color-confused-with)" label="Confused with" dashed />
```

- [ ] **Step 2: Migrate legend mastery colors**

Lines 130, 137, 144 — replace:

```tsx
style={{ background: "var(--color-weak)" }}
// ...
style={{ background: "var(--color-medium)" }}
// ...
style={{ background: "var(--color-mastered)" }}
```

- [ ] **Step 3: Migrate legend node colors**

Line 156 — replace:

```tsx
style={{ borderColor: "var(--color-undiscovered)" }}
```

Line 163 — replace:

```tsx
style={{ background: "var(--color-kg-topic-hub-legend)" }}
```

- [ ] **Step 4: Migrate MiniMap nodeColor**

Lines 414-418 — replace:

```tsx
nodeColor={(node) => {
  if (node.type === "memory_hub") return "var(--color-kg-memory-hub)";
  if (node.type === "topic_hub") return "var(--color-kg-topic-hub)";
  if (node.type === "thread") return "var(--color-kg-thread)";
  return "var(--color-kg-default)";
}}
```

Note: Check if ReactFlow's `nodeColor` prop accepts CSS `var()` strings. If not, we may need to use `getComputedStyle` to resolve them. Test this.

- [ ] **Step 5: Migrate maskColor**

Line 413 — this uses `resolvedTheme` which is fine since it's a light/dark concern, not a theme personality concern. Leave as-is.

- [ ] **Step 6: Commit**

```bash
git add client/app/knowledge-graph/page.tsx
git commit -m "feat: migrate knowledge graph page colors to CSS variables"
```

---

### Task 9: Icon Mapping System

**Files:**
- Create: `client/lib/icon-map.ts`
- Create: `client/components/theme-icon.tsx`

- [ ] **Step 1: Install solar-icon-set if not already present**

Check `client/package.json` for `solar-icon-set`. If not present:

Run: `cd client && pnpm add solar-icon-set`

The main branch used solar icons. The neo branch switched to lucide. Both need to be available.

- [ ] **Step 2: Create icon mapping**

Build the mapping from the audit. Only map icons that differ between themes — icons that are the same in both libraries (or only used in one theme's components) can stay as direct imports.

```ts
// client/lib/icon-map.ts
import type { ComponentType } from "react";

// Lucide icons
import {
  Search as LucideSearch,
  ChevronRight as LucideChevronRight,
  CirclePlus as LucideCirclePlus,
} from "lucide-react";

// Solar icons
import {
  MagniferBoldDuotone,
  AltArrowRightBoldDuotone,
  AddCircleBoldDuotone,
} from "solar-icon-set";

type IconProps = { className?: string; size?: number };

export const iconMaps: Record<string, Record<string, ComponentType<IconProps>>> = {
  lucide: {
    search: LucideSearch,
    chevronRight: LucideChevronRight,
    circlePlus: LucideCirclePlus,
  },
  solar: {
    search: MagniferBoldDuotone,
    chevronRight: AltArrowRightBoldDuotone,
    circlePlus: AddCircleBoldDuotone,
  },
};
```

Note: Start with just the icons that were explicitly swapped between branches (search, chevronRight, circlePlus based on the dashboard diff). More mappings can be added incrementally. Most icons (GitBranch, MessageSquare, etc.) exist in both libraries or only one — those can stay as direct lucide imports for now.

- [ ] **Step 3: Create ThemeIcon component**

```tsx
// client/components/theme-icon.tsx
"use client";

import { useThemePersonality } from "@/components/theme-personality-provider";
import { iconMaps } from "@/lib/icon-map";

interface ThemeIconProps {
  name: string;
  className?: string;
  size?: number;
}

export function ThemeIcon({ name, className, size }: ThemeIconProps) {
  const { activeTheme } = useThemePersonality();
  const map = iconMaps[activeTheme.iconSet];
  const Icon = map?.[name];

  if (!Icon) {
    console.warn(`ThemeIcon: no icon "${name}" in iconSet "${activeTheme.iconSet}"`);
    return null;
  }

  return <Icon className={className} size={size} />;
}
```

- [ ] **Step 4: Commit**

```bash
git add client/lib/icon-map.ts client/components/theme-icon.tsx
git commit -m "feat: add ThemeIcon component with icon mapping per theme"
```

---

### Task 10: Migrate Dashboard Icons to ThemeIcon

**Files:**
- Modify: `client/app/dashboard/page.tsx` (lines 10, 27, 74)

- [ ] **Step 1: Replace mapped icons in dashboard**

Replace the direct lucide imports for icons that have solar equivalents with `<ThemeIcon>`:

```tsx
// Replace:
import { Search } from "lucide-react";
// With:
import { ThemeIcon } from "@/components/theme-icon";

// In JSX, replace:
<Search className="..." />
// With:
<ThemeIcon name="search" className="..." />
```

Do the same for `ChevronRight` and `CirclePlus` where they appear.

Keep any lucide icons that don't have solar mappings as direct imports.

- [ ] **Step 2: Verify dashboard renders with both themes**

Run: `cd client && pnpm dev`, switch themes, check dashboard icons change.

- [ ] **Step 3: Commit**

```bash
git add client/app/dashboard/page.tsx
git commit -m "feat: migrate dashboard icons to ThemeIcon"
```

---

### Task 11: Build Verification & Cleanup

**Files:**
- All modified files

- [ ] **Step 1: Run build**

Run: `cd client && pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Run lint**

Run: `cd client && pnpm lint`
Expected: No new lint errors.

- [ ] **Step 3: Manual smoke test**

Test these scenarios:
1. App loads with default neo theme
2. Switch to classic theme → colors, fonts, shadows change
3. Switch light/dark mode → works independently of theme
4. Refresh page → theme persists (localStorage)
5. Knowledge graph renders with themed colors
6. Memory graph renders with themed colors
7. Dashboard icons change per theme
8. Noise overlay only shows in neo theme
9. Neo-hover effect only works in neo theme

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: theme switching cleanup and fixes"
```
