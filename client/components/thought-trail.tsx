interface ThinkingOrbProps {
  statusMessage: string;
}

export function ThinkingOrb({ statusMessage }: ThinkingOrbProps) {
  return (
    <div className="flex items-center gap-3 mb-2 animate-in fade-in duration-200">
      <div className="thinking-orb shrink-0" />
      <span className="text-sm text-muted-foreground">{statusMessage}</span>
    </div>
  );
}
