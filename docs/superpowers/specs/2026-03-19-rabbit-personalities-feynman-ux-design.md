# Rabbit Personalities & Feynman Empty State

**Date:** 2026-03-19

## Summary

Give Feynman and Ebbinghaus distinct rabbit personalities in their system prompts, replace the generic Feynman empty state with an in-character greeting message, and decouple the `/ebbinghaus` page from `/feynman` by extracting a shared chat component.

## 1. Feynman Personality (System Prompt)

Update all Feynman-facing prompts in `backend/app/agent/prompts.py` to inject his character.

**Character brief:**
- Cheeky, witty, relaxed male rabbit. Highly intelligent but never condescending.
- Motto: "If you can't explain it to a 5-year-old, you don't understand it well enough."
- Makes jokes. Will tell you straight when your understanding is wrong, but makes you laugh at yourself while doing it.
- Has a crush on Ebbinghaus — never says it outright, but occasionally references her ("Ebbinghaus would probably quiz you on this later, so let's make sure you actually get it").
- Casual language, short sentences. Not a lecturer.
- **No emojis. Ever.** This is an explicit instruction in the prompt.

**Where it applies:**
- `FEYNMAN_BASE` — add personality preamble
- `INTERVIEW_PROMPT` — replace "brilliant, warm teacher" framing with rabbit personality
- `TEACHING_PROMPT` — replace "legendary teacher" framing with rabbit personality
- `PLAN_GENERATION_PROMPT` — this is a system prompt for curriculum generation, not user-facing chat. Leave as-is.
- `SCORING_PROMPT`, `PRACTICE_SCORING_PROMPT`, `PRACTICE_GENERATE_PROMPT` — these are scoring/generation prompts, not conversational. Leave as-is.

**Prompt structure:** Personality block goes at the top of each conversational prompt, before the phase-specific instructions. The phase logic (tools, rules, formatting) stays unchanged.

**Important:** `FEYNMAN_BASE` and the phase prompts (`INTERVIEW_PROMPT`, `TEACHING_PROMPT`) are used by *different code paths*. `build_phase_prompt()` selects from the phase map and never touches `FEYNMAN_BASE`. `build_system_prompt()` uses `FEYNMAN_BASE` directly. Personality must be injected independently into each prompt — they do not inherit from each other. `PRACTICE_BASE` is a separate agent prompt and is not part of this change.

**Pre-existing bug:** `INTERVIEW_PROMPT` contains a git merge conflict marker (`<<<<<<< Updated upstream` at line 235). Fix this while editing the prompt.

## 2. Ebbinghaus Personality (System Prompt)

Update `EBBINGHAUS_SYSTEM_PROMPT` in `backend/app/agent/prompts.py`.

**Character brief:**
- Kind, smart female rabbit. Cares immensely for her students.
- Pushes the user to complete tests and finish modules. Straight-forward and honest.
- Critical but kind — doesn't beat around the bush. Delightful to chat with.
- A bit of a pushover but holds firm on what matters (learning).
- **No emojis. Ever.**

**Where it applies:**
- `EBBINGHAUS_SYSTEM_PROMPT` — rewrite the voice/personality section while keeping the tool usage instructions intact.

## 3. Feynman Empty State → In-Character Greeting

**Current state:** When no messages exist, the Feynman page shows a centered "What do you want to learn?" heading with a rotating subtitle cycling through topic suggestions.

**New state:** Replace with a custom greeting component that visually matches the assistant message bubble style but does NOT use the `ChatMessage` component (since `ChatMessage` pipes content through `Streamdown` as a string, which doesn't support React nodes or animations).

The greeting:
- Written in Feynman's voice (cheeky, inviting, casual)
- Contains a rotating topic suggestion woven naturally into the text
- The rotating topic cycles through the existing `prompts` array with the same fade animation timing

**Example greeting:**
> Alright, so here's the deal — I can explain just about anything, but you've got to tell me what's on your mind first. Been thinking about **{rotating topic}** lately, but honestly, I'm game for whatever.

Below the greeting, show 4 clickable suggestion chips (randomly sampled from `prompts` on mount). Chips use compact, muted styling (`text-sm`, `border`, `rounded-full`, `hover:bg-muted`).

**Interaction:**
- Clicking a chip calls `send(chipText)` — the chip text becomes the first user message
- Chips disappear once `chatStarted` is true (natural, since the `!chatStarted` branch no longer renders)
- 4 chips shown, randomly sampled from the prompts array on mount

**Implementation in `client/app/feynman/page.tsx`:**
- Replace the `!chatStarted` branch (the centered `<div>` with `<h2>` and `<p>`) with:
  - A custom `<FeynmanGreeting>` component styled to look like an assistant message bubble
  - A row of 4 clickable suggestion chips below it
- The rotating topic inside the greeting text uses the same `index`/`visible` state and fade transition

## 4. Decouple `/ebbinghaus` from `/feynman`

**Current problem:** The sidebar routes Ebbinghaus to `/feynman` with `activeAgent="ebbinghaus"`. The actual `/ebbinghaus` page is a practice/review UI (duplicate of `/practice`).

**Change:**
1. Extract the chat UI logic from `client/app/feynman/page.tsx` into `client/components/chat-page.tsx`
   - Props: `agent: "feynman" | "ebbinghaus"`, `greeting: ReactNode`, `suggestions: string[]`
   - Contains: all the chat message rendering, prompt input, text selection menu, branch logic, interview widget, phase action buttons
   - Feynman-specific features (`FeynmanModal`, `phaseComplete` buttons) are conditionally rendered only when `agent === "feynman"`
   - The parent page provides agent-specific config (greeting component, suggestions array)

2. `client/app/feynman/page.tsx` becomes thin:
   ```tsx
   export default function FeynmanPage() {
     return <ChatPage agent="feynman" greeting={<FeynmanGreeting />} suggestions={feynmanPrompts} />
   }
   ```

3. `client/app/ebbinghaus/page.tsx` — replace the current practice UI with a chat page:
   ```tsx
   export default function EbbinghausPage() {
     return <ChatPage agent="ebbinghaus" greeting={/*skip for now */} />
   }
   ```
   - The current practice UI content at `/ebbinghaus` is already fully duplicated at `/practice`, so nothing is lost

4. Fix sidebar routing: `handleAgentNav("ebbinghaus")` should route to `/ebbinghaus`, `handleAgentNav("feynman")` to `/feynman`. Also ensure `useAgent()` context stays in sync — when the page mounts, it should set `activeAgent` from the `agent` prop so direct URL navigation works correctly.

## Files Changed

| File | Change |
|------|--------|
| `backend/app/agent/prompts.py` | Add personality to FEYNMAN_BASE, INTERVIEW_PROMPT, TEACHING_PROMPT, EBBINGHAUS_SYSTEM_PROMPT |
| `client/components/chat-page.tsx` | **New** — extracted shared chat UI component |
| `client/app/feynman/page.tsx` | Thin wrapper around ChatPage + FeynmanGreeting |
| `client/app/ebbinghaus/page.tsx` | Replace practice UI with thin ChatPage wrapper |
| `client/components/app-sidebar.tsx` | Fix Ebbinghaus nav to route to `/ebbinghaus` |

## What's NOT changing

- Backend agent logic, tools, phase transitions — untouched
- The `/practice` page — stays as-is
- Scoring prompts, plan generation prompts — no personality injection
- The `ChatMessage` component itself — no changes needed
- Thread tree, branch logic — just moved into ChatPage, not modified
