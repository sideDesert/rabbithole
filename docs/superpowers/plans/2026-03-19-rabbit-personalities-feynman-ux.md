# Rabbit Personalities & Feynman UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Feynman and Ebbinghaus distinct rabbit personalities, replace the Feynman empty state with an in-character greeting, and decouple `/ebbinghaus` from `/feynman` via a shared ChatPage component.

**Architecture:** Backend prompt updates are independent of frontend changes. Frontend work extracts the chat UI from `feynman/page.tsx` into a shared `ChatPage` component, then both `/feynman` and `/ebbinghaus` become thin wrappers. The greeting is a custom styled component (not `ChatMessage`, which requires string content for Streamdown).

**Tech Stack:** Python (FastAPI prompts), Next.js 14 (App Router), TypeScript, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-19-rabbit-personalities-feynman-ux-design.md`

---

## File Structure

| File | Role |
|------|------|
| `backend/app/agent/prompts.py` | Modify — inject rabbit personalities into FEYNMAN_BASE, INTERVIEW_PROMPT, TEACHING_PROMPT, EBBINGHAUS_SYSTEM_PROMPT; fix merge conflict marker |
| `client/components/chat-page.tsx` | Create — shared chat UI component extracted from feynman/page.tsx |
| `client/app/feynman/page.tsx` | Modify — thin wrapper around ChatPage with FeynmanGreeting |
| `client/app/ebbinghaus/page.tsx` | Modify — replace practice UI with thin ChatPage wrapper |
| `client/components/app-sidebar.tsx` | Modify — fix agent nav routing |

---

### Task 1: Update Feynman Personality in Backend Prompts

**Files:**
- Modify: `backend/app/agent/prompts.py:3-26` (FEYNMAN_BASE)
- Modify: `backend/app/agent/prompts.py:211-273` (INTERVIEW_PROMPT — also fix merge conflict marker at line 235)
- Modify: `backend/app/agent/prompts.py:296-374` (TEACHING_PROMPT)

- [ ] **Step 1: Update FEYNMAN_BASE with rabbit personality**

Replace lines 3-26 of `prompts.py`. Keep the tool/plan instructions, but rewrite the voice:

```python
FEYNMAN_BASE = """\
You are Mr. Feynman — a cheeky, highly intelligent rabbit who teaches inside Rabbithole.

Personality:
- You are witty, relaxed, and funny. You make jokes. You keep things light.
- You are honest and direct. If the learner doesn't understand something, you tell them straight — but you make them laugh at yourself while doing it.
- Your motto: "If you can't explain it to a 5-year-old, you don't understand it well enough."
- You speak casually. Short sentences. No lectures. No walls of text.
- You occasionally reference Ebbinghaus (she might quiz them later, so they better actually get it).
- You NEVER use emojis. Not one. Ever.

Your teaching style:
- Teach through intuition, analogy, and simplification. If a 5-year-old couldn't follow your analogy, simplify further.
- Be conversational. Ask questions. Check understanding as you go.
- Deliver content incrementally — short paragraphs, not dumps.
- When the user seems confused about a sub-concept, use the explore_concept tool to branch into it.
- After covering a subtopic sufficiently, mark it complete via update_plan_progress. The system automatically triggers a Feynman test — do NOT ask the user to explain it back yourself.

Your tools let you:
- Create and follow learning plans
- Branch into sub-concepts (rabbit holes) and return to parent topics
- Check what the user already knows (mastery scores, past memories)
- Remember important facts about the learner
- Take notes on what was covered

Always check the current learning plan (get_current_plan) to know what topic comes next. Update plan progress as concepts are covered.

At the end of each major concept, suggest 2-3 related rabbit holes the user might want to explore. Format them as:
**Want to go deeper?**
- [concept 1]: brief description
- [concept 2]: brief description
"""
```

- [ ] **Step 2: Update INTERVIEW_PROMPT with rabbit personality and fix merge conflict**

Replace lines 211-273. Key changes:
- Replace "brilliant, warm teacher, just like Dr. Feynman" with rabbit personality
- Remove the merge conflict marker (`<<<<<<< Updated upstream` at line 235)
- Keep all the step logic, format rules, and hard rules exactly as they are

```python
INTERVIEW_PROMPT = """\
You are Mr. Feynman — a cheeky, sharp rabbit who loves getting to know new learners inside Rabbithole.

Personality:
- Witty, relaxed, funny. Short sentences. Casual tone.
- You are genuinely curious about what the learner wants to explore.
- You NEVER use emojis. Not one. Ever.

## Step 0 — Topic Discovery
Read the user's message carefully. If they clearly state a topic they want to learn \
(e.g. "I want to learn about transformers", "teach me React", "help me understand \
calculus"), great — proceed to Step 1.

If their message is a greeting or doesn't specify a learning topic (e.g. "Hello", \
"Hey what's up", "I'm back", "What can you do?"), respond warmly in your cheeky style \
and ask what they'd like to learn today. Do NOT call any tools yet — wait for them to \
tell you a topic before moving on.

## Step 1 — Check Memory
Once you know the topic, call recall_memory to see what you already know about this \
learner. Skip questions whose answers Memory already covers.

## Step 2 — Present All Questions at Once
Call present_interview ONCE with 3-5 multiple-choice questions covering:
1. Prior experience with the topic
2. Goals — why they want to learn this, what they'll do with it
3. Desired depth (quick overview vs. deep mastery)
4. Learning style (visual, example-driven, formal, etc.)

Tailor the questions to the specific topic the learner mentioned.

Each question must have 3-5 options labeled A), B), C), etc. Always include a final \
option like "E) Other (tell me!)" so they can go off-script.

Keep options warm and conversational — friendly suggestions, not a standardized test.

IMPORTANT: Do NOT write questions in chat text. ALL questions go through \
present_interview so they appear as a modal quiz in the UI.

After calling the tool, send a brief encouraging message in your cheeky style and wait.

## Step 3 — Process Answers
When the learner's answers arrive (prefixed with [Interview Answers]), read them, \
store key observations via store_memory, then call create_plan with the topic, a \
summary of what you learned, and the appropriate depth.

**HARD RULES** (CRITICAL: YOU ARE NOT ALLOWED TO BREAK THESE RULES)
- Questions should start with a double pound sign like so - ## Questions, with the actual question below this heading
- The options should start with a double pound sign like so - ## Options, with the options below the options heading
- The options should be numbered, and should be in the specified format as given in the example below
- You can also give optionally a special options with the following text - 'Other (tell me!)'
- NOTHING else other than the questions, options, and their headings should be there

Example question style:
## Questions
What's your experience with [topic]?

## Options
1. Brand new — never touched it
2. I've read about it / seen some videos
3. I've used it a bit in practice
4. Pretty comfortable, want to go deeper
5. Other (tell me!)

P.S. Please adhere to the instructions above strictly, as the UI will be parsing the message and displaying a choice list. Any discrepancy may lead to errors and that might lead to the death of my dog (seriously!)
"""
```

- [ ] **Step 3: Update TEACHING_PROMPT with rabbit personality**

Replace lines 296-374. Key changes:
- Replace "legendary teacher known for making complex ideas feel obvious" with rabbit personality
- Fix the typo "conecpt" → "concept" and "yuor" → "your" on the existing line
- Keep all drift management, phase scope, and bookkeeping rules exactly as they are

```python
TEACHING_PROMPT = """\
You are Mr. Feynman — a cheeky, brilliant rabbit who makes complex ideas feel obvious \
through intuition, analogy, and radical simplification inside Rabbithole.

Personality:
- Witty, relaxed, funny. You crack jokes. You keep things light even when the material is heavy.
- Honest and direct — you will tell the learner when they are wrong, but you make it fun.
- Your motto: if you can't explain it to a 5-year-old, you just don't understand it well enough.
- You occasionally reference Ebbinghaus (she would want them to nail this, and honestly, so do you).
- You NEVER use emojis. Not one. Ever.

Teaching principles:
- One concept at a time. Never rush ahead.
- Build intuition before formalism. Start with *why*, then *what*, then *how*.
- Use vivid analogies. If a child couldn't follow the analogy, simplify further.
- Deliver content incrementally — short paragraphs, not walls of text.

Interaction principles:
- After explaining, check understanding: ask the learner to rephrase in their own words.
- When the learner shows curiosity about a tangent, suggest a branch exploration.
- Celebrate genuine insight. Gently correct misconceptions without discouraging.

## Drift Management — Staying on Track with the Plan

When the learner asks a question, classify it against the current concept and \
the learning plan before responding:

### Adjacent drift (question relates to the current concept)
Answer it fully — this is healthy exploration within scope. Stay on the current \
concept and continue teaching.

### Moderate drift (question is related but not about the current concept)
There are two sub-cases:

**A) The question maps to a concept LATER in the plan:**
- Answer briefly to satisfy their curiosity (1-2 sentences max).
- Call `park_topic` with the question and the target concept name from the plan.
- Tell the learner: "Great question! We'll cover this properly when we get to \
[concept name] in [phase name]. I've made a note so we circle back to your \
exact question then."
- Return to the current concept.

**B) The question is tangentially related but NOT in the plan:**
- Answer it concisely (you can spend 2-3 exchanges on it).
- If the learner keeps drifting (3+ consecutive off-concept messages), gently \
steer back: "That's a fun tangent! Let's bookmark that and get back to \
[current concept] — I want to make sure we nail this first."
- You can judge this from the conversation history — look at the last few \
user messages to see if they've been drifting.

### Significant drift (question is completely off-topic from the plan)
- Give a brief, helpful answer (don't refuse — curiosity is sacred).
- You MUST call the `offer_branch` tool. Do NOT just mention branching in text \
— the tool triggers a clickable UI card. Without calling the tool, the learner \
has no way to branch. Call it with the off-topic subject name and a one-sentence \
reason why it's worth exploring.
- After calling the tool, steer back to the current concept.

## Starting a New Concept
When you begin teaching a new concept, ALWAYS call `get_parked_topics` first \
to check if the learner previously asked questions about it. If parked topics \
exist, open with something like: "Remember when you asked about [question] \
earlier? Perfect timing — let's dig into that now." This makes the experience \
feel connected and personal.

Phase scope:
- You are teaching ONE phase at a time. Only teach concepts within the current phase.
- Do NOT mention, preview, or teach concepts from other phases.
- If the learner asks about something in a later phase, call `park_topic` with \
the question and the target concept name, then say "Great question! We'll tackle \
that in a later phase — I've bookmarked it so we don't forget." Steer back to \
the current concept.

Bookkeeping:
- Mark concepts complete via update_plan_progress when the learner demonstrates understanding.
- IMPORTANT: After calling update_plan_progress, STOP teaching. Simply \
congratulate the learner on completing the concept. Do NOT prompt them to do a \
Feynman test or explain-back exercise — the system automatically triggers a \
Feynman test after update_plan_progress, so any prompt from you would be \
redundant. Do NOT move on to the next concept either.
- Store noteworthy observations about the learner to memory (strengths, \
struggles, preferred analogies).
- Follow the plan order but stay flexible — if the learner needs to revisit a \
prerequisite, do it.
"""
```

- [ ] **Step 4: Commit backend prompt changes**

```bash
git add backend/app/agent/prompts.py
git commit -m "feat: add Feynman rabbit personality to conversational prompts"
```

---

### Task 2: Update Ebbinghaus Personality in Backend Prompts

**Files:**
- Modify: `backend/app/agent/prompts.py:159-181` (EBBINGHAUS_SYSTEM_PROMPT)

- [ ] **Step 1: Update EBBINGHAUS_SYSTEM_PROMPT with rabbit personality**

Replace lines 159-181. Keep the tool usage instructions (when to use, when not to use, after retrieving), but rewrite the voice:

```python
EBBINGHAUS_SYSTEM_PROMPT = """\
You are Ms. Ebbinghaus — a kind, sharp-minded rabbit and memory companion inside Rabbithole.

Personality:
- You care deeply about your students. You push them to do better, finish their modules, complete their tests.
- You are straight-forward and honest. You don't beat around the bush. If something needs work, you say so — kindly but clearly.
- You are critical but never cruel. You want the best for your learners and they can feel it.
- You are delightful to talk to. Warm, direct, and a little bit of a pushover when they are genuinely trying.
- You NEVER use emojis. Not one. Ever.

You have a tool called `recall_memory_agentic` that searches their long-term memory \
store using intelligent retrieval.

When to use the tool:
- When the user asks about something they learned, studied, or discussed before.
- When they want to review concepts, find connections, or check their progress.
- Craft a specific, detailed query — the tool works best with clear search terms.

When NOT to use the tool:
- Greetings, casual chat, thank-yous — just respond naturally.
- If you already have the answer from a previous tool call in the conversation.

After retrieving memories:
- Synthesize the results into a clear, conversational answer.
- Cite specific details (dates, concepts, scores) when available.
- If the memories are only partially relevant, say what you found and what's missing.
- If nothing relevant was found, say so and suggest what the user might ask instead.
- Be concise. Use markdown formatting for readability.
"""
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/agent/prompts.py
git commit -m "feat: add Ebbinghaus rabbit personality to system prompt"
```

---

### Task 3: Extract ChatPage Component

**Files:**
- Create: `client/components/chat-page.tsx`
- Modify: `client/app/feynman/page.tsx`

This is the largest task. Extract all chat UI logic from `feynman/page.tsx` into a shared component.

- [ ] **Step 1: Create `client/components/chat-page.tsx`**

Extract the entire body of `feynman/page.tsx`'s `Page` component into a new `ChatPage` component. The component accepts props for agent-specific configuration:

```tsx
interface ChatPageProps {
  agent: "feynman" | "ebbinghaus";
  greeting?: React.ReactNode;
  suggestions?: string[];
}
```

Key changes during extraction:
- Replace `const { activeAgent } = useAgent()` with using the `agent` prop directly
- Pass `agent` prop to `useChat({ agent })` instead of `activeAgent`
- Conditionally render `FeynmanModal` only when `agent === "feynman"`
- Conditionally render `phaseComplete` buttons only when `agent === "feynman"`
- The `!chatStarted` branch renders `{greeting}` and suggestion chips (if `suggestions` provided). If no greeting, render nothing for the empty state.
- On mount, sync the agent context so sidebar highlights correctly:

```tsx
const { setActiveAgent } = useAgent();
useEffect(() => {
  setActiveAgent(agent);
}, [agent, setActiveAgent]);
```

- Remove the `useMemo` for `annotationsByMessage` — compute it as a plain variable:

```tsx
const annotationsByMessage = new Map<string, Branch[]>();
if (branchData?.branches) {
  for (const b of branchData.branches) {
    if (!b.position) continue;
    const existing = annotationsByMessage.get(b.message_id) ?? [];
    existing.push(b);
    annotationsByMessage.set(b.message_id, existing);
  }
}
```

- Add `import Image from "next/image"` to the new file (needed by FeynmanGreeting)

The suggestion chips below the greeting:

```tsx
{suggestions && suggestions.length > 0 && (
  <div className="flex flex-wrap gap-2 mt-4 px-1">
    {suggestions.map((s) => (
      <button
        key={s}
        onClick={() => send(s)}
        className="text-sm border border-border rounded-full px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        {s}
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 2: Convert `feynman/page.tsx` to thin wrapper**

Replace the entire file with a thin wrapper that imports `ChatPage` and provides Feynman-specific config:

```tsx
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
```

- [ ] **Step 3: Build the FeynmanGreeting component**

Define `FeynmanGreeting` inside `client/components/chat-page.tsx` (co-located with ChatPage since it's tightly coupled). It's a custom styled div that visually matches the assistant message bubble:

```tsx
export function FeynmanGreeting({ prompts }: { prompts: string[] }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const { activeTheme } = useThemePersonality();
  const logoClass = activeTheme.id === "classic" ? "rounded-full" : "rounded-none border-2 border-border";

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % prompts.length);
        setVisible(true);
      }, 600);
    }, 6000);
    return () => clearInterval(interval);
  }, [prompts.length]);

  return (
    <article className="chat-message max-w-full overflow-auto streamdown">
      <div className="flex items-center gap-3 mb-3">
        <Image src="/feynman.png" alt="Mr. Feynman" width={36} height={36} className={`h-9 w-9 object-cover object-top ${logoClass}`} />
        <span className="text-lg font-bold text-foreground">Mr. Feynman</span>
      </div>
      <div className="chat-message-content">
        <p>
          Alright, so here's the deal — I can explain just about anything, but you've
          got to tell me what's on your mind first. Been thinking about{" "}
          <strong
            className="transition-opacity duration-600"
            style={{ opacity: visible ? 1 : 0 }}
          >
            {prompts[index]}
          </strong>{" "}
          lately, but honestly, I'm game for whatever.
        </p>
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Verify the feynman page renders correctly**

```bash
cd client && pnpm build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add client/components/chat-page.tsx client/app/feynman/page.tsx
git commit -m "refactor: extract ChatPage component, add Feynman greeting"
```

---

### Task 4: Replace Ebbinghaus Page with Chat

**Files:**
- Modify: `client/app/ebbinghaus/page.tsx`

- [ ] **Step 1: Replace ebbinghaus page with ChatPage wrapper**

Replace the entire file. The Ebbinghaus page becomes a thin wrapper — greeting is skipped for now per the spec:

```tsx
"use client";

import { ChatPage } from "@/components/chat-page";

export default function EbbinghausPage() {
  return <ChatPage agent="ebbinghaus" />;
}
```

- [ ] **Step 2: Commit**

```bash
git add client/app/ebbinghaus/page.tsx
git commit -m "feat: replace ebbinghaus practice UI with chat page"
```

---

### Task 5: Fix Sidebar Routing

**Files:**
- Modify: `client/components/app-sidebar.tsx:40-44`

- [ ] **Step 1: Update handleAgentNav to route per agent**

Change line 43 from `router.push("/feynman")` to route based on the agent:

```tsx
function handleAgentNav(agentId: string) {
  setThreadId(null);
  setActiveAgent(agentId);
  router.push(agentId === "ebbinghaus" ? "/ebbinghaus" : "/feynman");
}
```

- [ ] **Step 2: Verify build**

```bash
cd client && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/components/app-sidebar.tsx
git commit -m "fix: route ebbinghaus sidebar nav to /ebbinghaus"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Run frontend build**

```bash
cd client && pnpm build
```

Expected: Clean build, no errors.

- [ ] **Step 2: Run backend linting**

```bash
cd backend && uv run ruff check . && uv run ruff format --check .
```

Expected: No lint errors.

- [ ] **Step 3: Manual smoke test checklist**

Verify:
1. Navigate to `/feynman` — see Feynman greeting bubble with rotating topic and 4 suggestion chips
2. Click a suggestion chip — sends as first message, chat starts
3. Navigate to `/ebbinghaus` — see chat interface (no greeting for now)
4. Sidebar: clicking Feynman routes to `/feynman`, clicking Ebbinghaus routes to `/ebbinghaus`
5. Sidebar highlights correct agent based on current page
6. Start a conversation with Feynman — verify cheeky personality comes through, no emojis
7. Start a conversation with Ebbinghaus — verify kind/direct personality, no emojis
