"use client";

import { useState, useEffect } from "react";

const orbPhrases = [
  "Mulling it over",
  "Piecing things together",
  "Thumbing through notes",
  "Warming up",
  "Connecting the dots",
  "Thinking out loud",
  "Gathering thoughts",
  "Chewing on it",
  "Letting it marinate",
  "Turning gears",
  "Following a thread",
  "Tracing the idea",
  "Unraveling",
  "Sifting through",
  "Weighing options",
  "Sketching it out",
  "Puzzling over it",
  "Mapping it out",
  "Sorting through",
  "Percolating",
];

function pickPhrase() {
  return orbPhrases[Math.floor(Math.random() * orbPhrases.length)];
}

export function ThinkingOrb() {
  const [phrase, setPhrase] = useState(pickPhrase);

  useEffect(() => {
    const tick = () => {
      setPhrase(pickPhrase());
      timer = window.setTimeout(tick, 3000 + Math.random() * 4000);
    };
    let timer = window.setTimeout(tick, 3000 + Math.random() * 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex items-center gap-3 mb-2 animate-in fade-in duration-200">
      <div className="thinking-orb shrink-0" />
      <span className="text-sm text-muted-foreground">{phrase}...</span>
    </div>
  );
}
