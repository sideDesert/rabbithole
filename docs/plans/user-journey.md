# User Journey — Rabbithole

The end-to-end flow from first open to ongoing learning.

---

## 1. Onboarding (first launch only)

Mr. Feynman greets the user and runs a conversational Q&A to build an initial learner profile.

**Goal:** Understand learning habits, goals, and context — stored to EverMemOS as profile memory.

**Rules:**
- 5-7 questions max (not a form — a conversation)
- Questions adapt based on previous answers (LLM-driven)
- Offer multiple-choice options alongside free text to reduce friction
- Example questions:
  - "What are you trying to learn and why?"
  - "How do you usually study? (videos, reading, hands-on, mix)"
  - "How much time can you dedicate per session?"
  - "What's your experience level with this area?"
  - "Do you prefer deep dives or broad overviews first?"

**Output:** EverMemOS profile memory + initial context for all future sessions.

---

## 2. New Thread Creation

User opens a new thread and tells Feynman what they want to learn.

### 2a. Skill Assessment Q&A (3-5 questions)

Before generating a plan, Feynman probes the user's existing knowledge:
- "What do you already know about X?"
- "Have you worked with anything related to X?"
- "How deep do you want to go — practical basics or full theory?"

This sets the starting point and depth for the learning plan.

### 2b. Plan Generation

A planning step generates a structured learning plan:
- LLM brainstorms the topic, breaks it into ordered subtopics with dependencies
- Plan is saved as markdown: `plans/{topic_slug}/plan.md`
- Plan includes: ordered concept list, estimated depth, dependencies between concepts
- Feynman presents the plan to the user for approval/adjustment

**No web search for hackathon** — LLM generates from training data. Web search can be added later.

### 2c. Plan Approval

User reviews the plan. They can:
- Approve as-is
- Ask to add/remove/reorder topics
- Adjust depth

Once approved, Feynman starts teaching from the first topic.

---

## 3. Learning Loop (core experience)

Feynman works through the plan one subtopic at a time.

### Content Delivery
- Content is delivered incrementally — not a wall of text
- Feynman teaches conversationally, checks understanding as he goes
- Each subtopic gets its own section within the thread

### Suggested Rabbit Holes
- After covering a subtopic, Feynman lists related concepts the user hasn't explored
- Rendered as clickable suggestions in the chat (markdown convention, parsed by frontend)
- These are NOT nodes until the user clicks — they're invitations to go deeper
- Drives curiosity and ensures depth beyond what the LLM would enumerate on its own

### Branching (the rabbithole)
When the user is confused or curious about something:
1. User selects text or clicks a suggested topic
2. A child thread is created (new node in the tree)
3. Context from the parent thread + EverMemOS long-term memory is loaded
4. User learns the sub-concept in the child thread
5. This can happen recursively — branches within branches
6. User jumps back to parent thread and continues from where they left off

### Subtopic Completion
When a plan subtopic is covered:
1. Feynman triggers a **Feynman test** — user explains everything they learned about the subtopic
   - Test covers the parent subtopic; scoring accounts for whether the user naturally weaves in knowledge from child branches
2. **Scoring workflow** runs: clarity, accuracy, depth, transferability → 0.0-1.0 mastery score
3. Plan progress is updated (`plans/{slug}/plan.md` checkbox marked)
4. Feynman presents results:
   - What the user got right
   - What they missed or got wrong
   - Where they should focus more
5. User can either:
   - **Dive back in** to address weak areas (Feynman guides remediation)
   - **Move on** to the next subtopic in the plan
6. This is timeboxed — Feynman nudges the user forward if they dwell too long

---

## 4. Ebbinghaus Review (spaced repetition)

Triggered after Feynman test completion:

1. Mastery score → review interval:
   - 0.0-0.4 (Weak): 1-2 days
   - 0.4-0.7 (Medium): 5-7 days
   - 0.7-0.9 (Strong): 2-3 weeks
   - 0.9-1.0 (Mastered): occasional recall
2. `review_schedule` entry created with `scheduled_for` date
3. On next session open, backend checks for due reviews
4. If reviews are due, Ebbinghaus prompts: "You learned X 3 days ago. Quick review?"
5. User can review now or dismiss
6. Review = re-test → score update → next review scheduled

---

## 5. Returning User Flow

When the user opens Rabbithole on a subsequent visit:

1. **Check for due reviews** (Ebbinghaus)
   - If yes: prompt review before new learning
   - If no: proceed
2. **Resume or new thread**
   - Show active threads with progress
   - User can continue where they left off (active thread + plan progress)
   - Or start a new thread on a different topic

---

## Summary: State Machine

```
First Launch → Onboarding Q&A → Profile Stored
                                      │
                                      ▼
                              New Thread Created
                                      │
                                      ▼
                          Skill Assessment Q&A (3-5 Qs)
                                      │
                                      ▼
                          Plan Generated → User Approves
                                      │
                                      ▼
                    ┌─── Learning Loop (per subtopic) ◄──┐
                    │                                     │
                    │   Feynman teaches incrementally      │
                    │   Suggests rabbit holes              │
                    │   User branches if curious ──►       │
                    │       Child thread (recursive)       │
                    │       ◄── Returns to parent          │
                    │                                     │
                    │   Subtopic done?                     │
                    │       │                              │
                    │       ▼                              │
                    │   Feynman Test                       │
                    │       │                              │
                    │       ▼                              │
                    │   Score → Update Plan                │
                    │       │                              │
                    │       ├─ Review weak areas ──────────┘
                    │       │
                    │       ▼
                    │   Schedule Ebbinghaus Review
                    │       │
                    │       ▼
                    │   Next subtopic ─────────────────────┘
                    │
                    ▼
              Plan Complete → Session Summary
```
