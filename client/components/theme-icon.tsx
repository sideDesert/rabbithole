"use client";

import { useThemePersonality } from "@/components/theme-personality-provider";
import { iconMaps, type IconName } from "@/lib/icon-map";

interface ThemeIconProps {
  name: IconName;
  className?: string;
  size?: number;
}

export function ThemeIcon({ name, className, size }: ThemeIconProps) {
  const { activeTheme } = useThemePersonality();
  const map = iconMaps[activeTheme.iconSet];
  const Icon = map?.[name];

  if (!Icon) return null;

  return <Icon className={className} size={size} />;
}
