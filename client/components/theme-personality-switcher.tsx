"use client";

import { useThemePersonality } from "@/components/theme-personality-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { Check, Palette } from "lucide-react";

export function ThemePersonalitySwitcher() {
  const { activeTheme, setTheme, themes } = useThemePersonality();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={buttonVariants({
          variant: "ghost",
          size: "sm",
          className: "w-full justify-start gap-2",
        })}
      >
        <Palette className="h-4 w-4" />
        <span className="text-sm">{activeTheme.label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {themes.map((theme) => (
          <DropdownMenuItem key={theme.id} onClick={() => setTheme(theme.id)}>
            {theme.label}
            {theme.id === activeTheme.id && (
              <Check className="ml-auto h-4 w-4" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
