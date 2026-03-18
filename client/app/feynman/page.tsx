"use client";

import { useState } from "react";
import { ChatPage, FeynmanGreeting } from "@/components/chat-page";

const feynmanPrompts = [
  "How does gravity actually work?",
  "Explain quantum entanglement like I'm five",
  "Why do we dream?",
  "How does a neural network learn?",
  "What causes inflation in an economy?",
  "How does photosynthesis convert sunlight to energy?",
  "Why is the sky blue but sunsets are red?",
  "How do vaccines train your immune system?",
  "What makes music sound harmonious?",
  "How does encryption keep data secure?",
  "Why do we forget things?",
  "How do black holes form?",
  "What is the theory of relativity?",
  "How does DNA store information?",
  "Why do languages evolve over time?",
  "How does a blockchain work?",
  "What causes tides in the ocean?",
  "How do compilers translate code?",
  "Why is biodiversity important?",
  "How does the human brain process language?",
];

export default function Page() {
  const [suggestions] = useState(() =>
    [...feynmanPrompts].sort(() => Math.random() - 0.5).slice(0, 4)
  );

  return (
    <ChatPage
      agent="feynman"
      greeting={<FeynmanGreeting prompts={feynmanPrompts} />}
      suggestions={suggestions}
    />
  );
}
