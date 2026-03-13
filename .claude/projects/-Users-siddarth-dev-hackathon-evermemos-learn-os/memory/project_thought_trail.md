---
name: thought-trail-implementation
description: Thought Trail feature — whimsical status indicators replacing thinking orb in chat UI, implemented March 2026
type: project
---

The "Thought Trail" feature was implemented to replace the simple thinking orb + gradient spinner with engaging status lines during chat streaming.

**Why:** The learner had no visibility into what the AI was doing during 2-5s wait times. Now they see playful labels like "Rummaging...", "Mulling it over...", "Spotting rabbit holes..." that build up and collapse when text starts streaming.

**How to apply:** When modifying chat streaming, SSE events, or the chat UI, be aware of these files and their roles:

**Key files:**
- `client/lib/trail-labels.ts` — SSE step/tool name → whimsical label mapping
- `client/components/thought-trail.tsx` — Presentational component (dots, pulse, collapse toggle)
- `client/hooks/use-chat.ts` — Trail steps accumulated per-message via SSE events (TrailStep type, trailSteps/trailCollapsed on ChatMessage)
- `client/components/chat-message.tsx` — Renders ThoughtTrail above Streamdown, exports PhaseDivider
- `client/app/globals.css` — `trail-dot-pulse` animation (replaced thinking-orb/gradient-spinner)
- `backend/app/api/chat.py` — `pending_tool_names` FIFO queue tracks tool names for tool_result SSE events

**Spec:** `docs/superpowers/specs/2026-03-13-thought-trail-design.md`
**Plan:** `docs/superpowers/plans/2026-03-13-thought-trail.md`
