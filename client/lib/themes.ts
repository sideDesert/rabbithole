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
