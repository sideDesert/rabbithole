# Theme Switching System Design

## Summary

Add an extensible theme personality system that lets users switch between distinct visual identities (Neo Brutalism, Classic, and future themes). Each theme controls the full visual personality: colors, fonts, shadows, border styles, textures, icon library, and semantic/graph colors. Theme personality is independent of light/dark mode — the two are separate axes.

## Architecture

### CSS-Only Theme Classes (Approach A)

Themes are applied via CSS classes on `<html>` (e.g., `.theme-neo`, `.theme-classic`) alongside the existing `.dark` class from `next-themes`. All visual tokens live as CSS custom properties scoped under theme selectors.

```
<html class="theme-neo dark">   ← Neo dark mode
<html class="theme-classic">    ← Classic light mode
```

### Theme Data Model

**`lib/themes.ts`** — single source of truth for theme metadata:

```ts
export interface ThemePersonality {
  id: string;              // "neo" | "classic" | future themes
  label: string;           // "Neo Brutalism" | "Classic"
  className: string;       // "theme-neo" | "theme-classic"
  fonts: string[];         // Google Font families to load
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
```

Adding a new theme = add an entry here + add CSS variable blocks in globals.css.

### CSS Structure (globals.css)

Restructure from `:root` / `.dark` to theme-scoped selectors:

```css
/* Shared @theme inline block — maps Tailwind tokens to CSS vars (unchanged) */

/* ===== Theme: Neo Brutalism ===== */
.theme-neo {
  /* Core palette — warm cream + coral/yellow */
  --background: #fffef5;
  --foreground: #1a1a1a;
  --primary: #e85d3a;
  --secondary: #ffcc00;
  /* ... all existing neo :root variables ... */

  /* Typography */
  --font-sans: "DM Sans", sans-serif;
  --font-heading: "Space Grotesk", sans-serif;
  --font-mono: "Space Mono", "Courier New", monospace;

  /* Neo-brutalism hard offset shadows */
  --shadow: 4px 4px 0px 0px #1a1a1a;
  /* ... */

  /* Radius */
  --radius: 6px;

  /* Semantic/status colors */
  --color-mastered: hsl(142, 71%, 45%);
  --color-strong: hsl(142, 50%, 40%);
  --color-medium: hsl(45, 93%, 47%);
  --color-weak: hsl(0, 84%, 60%);
  --color-undiscovered: #64748b;

  /* Memory graph node types */
  --color-node-person: #e85d3a;
  --color-node-fact: #4a90d9;
  --color-node-belief: #ffcc00;
  --color-node-resource: #999999;

  /* Knowledge graph */
  --color-kg-memory-hub: hsl(260, 60%, 55%);
  --color-kg-topic-hub: hsl(200, 60%, 50%);
  --color-kg-thread: hsl(142, 50%, 40%);
  --color-kg-default: hsl(220, 20%, 50%);
  --color-confused-with: #e85d3a;

  /* Graph integration */
  --graph-ring-track: #e0e0dc;
  --graph-node-bg: #ffffff;
  --graph-node-shadow: 3px 3px 0px 0px #1a1a1a;
  --graph-edge-gold: #000000;
  --graph-edge-yellow: #000000;
  --graph-phase-interview: #000000;
  --graph-phase-planning: #000000;
}

.theme-neo.dark {
  /* All existing neo .dark overrides */
  --background: #0d0b0a;
  /* ... */

  /* Dark overrides for semantic/graph colors as needed */
}

/* ===== Theme: Classic ===== */
.theme-classic {
  /* Purple-toned oklch palette from main branch */
  --background: oklch(0.9777 0.0041 301.4256);
  --foreground: oklch(0.3651 0.0325 287.0807);
  --primary: oklch(0.6104 0.0767 299.7335);
  /* ... all existing main branch :root variables ... */

  /* Typography */
  --font-sans: Geist, sans-serif;
  --font-mono: "Fira Code", "Courier New", monospace;

  /* Soft blurred shadows */
  --shadow: 1px 2px 5px 1px hsl(0 0% 0% / 0.06), 1px 1px 2px 0px hsl(0 0% 0% / 0.06);
  /* ... */

  /* Radius */
  --radius: 0.5rem;

  /* Semantic/status colors (classic variants) */
  --color-mastered: hsl(142, 71%, 45%);
  --color-strong: hsl(142, 50%, 40%);
  --color-medium: hsl(45, 93%, 47%);
  --color-weak: hsl(0, 84%, 60%);
  --color-undiscovered: #64748b;

  /* Memory graph node types (classic variants) */
  --color-node-person: oklch(0.6104 0.0767 299.7335);
  --color-node-fact: oklch(0.7857 0.0645 258.0839);
  --color-node-belief: oklch(0.8540 0.0882 76.8292);
  --color-node-resource: oklch(0.5288 0.0375 290.7895);

  /* Knowledge graph (classic variants) */
  --color-kg-memory-hub: oklch(0.6104 0.0767 299.7335);
  --color-kg-topic-hub: oklch(0.7857 0.0645 258.0839);
  --color-kg-thread: oklch(0.7321 0.0749 169.8670);
  --color-kg-default: oklch(0.5288 0.0375 290.7895);

  /* Graph integration */
  --graph-ring-track: #cbd5e1;
  --graph-node-bg: oklch(0.97 0.001 286);
  --graph-node-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  --graph-edge-gold: oklch(0.6104 0.0767 299.7335);
  --graph-edge-yellow: oklch(0.8540 0.0882 76.8292);
  --graph-phase-interview: oklch(0.6104 0.0767 299.7335);
  --graph-phase-planning: oklch(0.8540 0.0882 76.8292);
}

.theme-classic.dark {
  /* All existing main branch .dark overrides */
  --background: oklch(0.2166 0.0215 292.8474);
  /* ... */
}
```

**Theme-specific utilities scoped via CSS:**
- `.theme-neo .neo-hover { ... }` — only activates under neo theme
- `.noise-overlay`, `.noise-surface` — only render under `.theme-neo`
- `.theme-classic .neo-hover` — no-op (empty rule or not defined)

### Provider & State Management

**`ThemePersonalityProvider`** — new React context alongside existing `next-themes`:

```
<ThemeProvider>                    ← existing (light/dark)
  <ThemePersonalityProvider>       ← new (neo/classic/etc)
    <App />
  </ThemePersonalityProvider>
</ThemeProvider>
```

Responsibilities:
- Read/write active theme ID to `localStorage` (key: `"theme-personality"`)
- Apply theme `className` to `<html>` element
- Expose via context: `activeTheme`, `setTheme(id)`, `themes`
- Default: `"neo"` if no saved preference

**Anti-FOUC:** Inline `<script>` in `layout.tsx` reads localStorage and applies the theme class before first paint (same pattern `next-themes` uses for dark mode).

### Icon System

**`components/theme-icon.tsx`** — thin mapping layer:

```ts
// lib/icon-map.ts
export const iconMaps = {
  lucide: {
    search: LucideSearch,
    chevronRight: LucideChevronRight,
    circlePlus: LucideCirclePlus,
    // ... all icons used in the app
  },
  solar: {
    search: MagniferBoldDuotone,
    chevronRight: AltArrowRightBoldDuotone,
    circlePlus: AddCircleBoldDuotone,
    // ...
  },
};
```

**`<ThemeIcon name="search" className="..." size={16} />`** — reads active theme's `iconSet` from context, renders the mapped component. Components replace direct icon imports with `<ThemeIcon>`.

### Theme Switcher UI

New `<ThemePersonalitySwitcher />` in the sidebar, separate from the existing light/dark toggle. Simple dropdown showing available theme labels. Lives adjacent to the dark mode toggle.

### Component Migration

All ~40 hardcoded color instances in components get replaced with CSS variable references:

| Current hardcoded | New CSS variable |
|---|---|
| `hsl(142, 71%, 45%)` (mastered) | `var(--color-mastered)` |
| `hsl(0, 84%, 60%)` (weak) | `var(--color-weak)` |
| `#64748b` (undiscovered) | `var(--color-undiscovered)` |
| `#e85d3a` (person node) | `var(--color-node-person)` |
| `#4a90d9` (fact node) | `var(--color-node-fact)` |
| `#ffcc00` (belief node) | `var(--color-node-belief)` |
| `#999999` (resource node) | `var(--color-node-resource)` |
| `hsl(260, 60%, 55%)` (memory hub) | `var(--color-kg-memory-hub)` |
| `hsl(200, 60%, 50%)` (topic hub) | `var(--color-kg-topic-hub)` |
| Direct icon imports | `<ThemeIcon name="..." />` |

### Font Loading

`layout.tsx` loads all font families for all themes via `next/font/google`. The active theme's CSS variables point `--font-sans`, `--font-heading`, `--font-mono` to the right families. Unused fonts cost a small network fetch but no paint cost.

## Files to Create
- `client/lib/themes.ts` — theme config definitions
- `client/lib/icon-map.ts` — icon mapping per theme
- `client/components/theme-icon.tsx` — `<ThemeIcon>` component
- `client/components/theme-personality-provider.tsx` — context provider
- `client/components/theme-personality-switcher.tsx` — UI selector

## Files to Modify
- `client/app/globals.css` — restructure from `:root`/`.dark` to `.theme-neo`/`.theme-neo.dark`/`.theme-classic`/`.theme-classic.dark`, add new semantic CSS variables
- `client/app/layout.tsx` — add anti-FOUC script, load all fonts
- `client/components/providers.tsx` — wrap with `ThemePersonalityProvider`
- `client/components/app-sidebar.tsx` — add `ThemePersonalitySwitcher`
- `client/app/knowledge-graph/page.tsx` — replace hardcoded colors with CSS vars
- `client/components/graph/concept-node.tsx` — replace hardcoded status colors
- `client/components/graph/kg-thread-node.tsx` — replace hardcoded colors
- `client/components/graph/memory-hub-node.tsx` — replace hardcoded colors
- `client/components/graph/topic-hub-node.tsx` — replace hardcoded colors
- `client/components/graph/trail-edge.tsx` — replace hardcoded colors
- `client/components/memory-graph/belief-node.tsx` — replace hardcoded colors
- `client/components/memory-graph/fact-node.tsx` — replace hardcoded colors
- `client/components/memory-graph/person-node.tsx` — replace hardcoded colors
- `client/components/memory-graph/resource-node.tsx` — replace hardcoded colors
- `client/components/memory-graph/shared.tsx` — replace hardcoded colors
- `client/components/topic-progress.tsx` — replace hardcoded mask colors
- `client/app/dashboard/page.tsx` — replace direct icon imports with ThemeIcon
- Any other files importing icons from solar-icon-set or lucide-react directly
