# Vision — Memory-Native Learning OS

## The Problem

Current LLM-based learning is fundamentally broken:

- **Conversations reset.** Every session starts from zero. The AI has no idea what you learned yesterday.
- **No mastery tracking.** There's no way to know if you actually understood recursion or just nodded along.
- **No structured exploration.** When a new term appears, you either open a new tab (losing context) or skip it (building on shaky foundations).
- **No resumption.** You can't pick up where you left off with any continuity.
- **No adaptive testing.** The AI never checks if you can explain things back, apply concepts, or transfer knowledge.
- **No spaced repetition.** Concepts you learned last week fade with no mechanism to reinforce them.

The result: fragmented understanding, cognitive overload, and the illusion of learning.

## The Core Idea

Build an AI education companion that doesn't just answer questions — it builds a **persistent cognitive model of the learner** over time.

The system:

1. **Tracks concept mastery** across sessions with objective scoring
2. **Detects knowledge gaps** by analyzing what the learner struggles with
3. **Supports branching exploration** — drill into a new term, then return to the parent context
4. **Runs adaptive tests** — Feynman explanations, conceptual questions, application problems
5. **Schedules spaced repetition** — weak concepts resurface at optimal intervals
6. **Consolidates long-term memory** — the learner's knowledge graph evolves over months

## What Makes This Different

| Traditional LLM Learning | Memory-Native Learning OS |
|---|---|
| Chat history as "memory" | Structured memory architecture (episodes, facts, predictions) |
| Flat conversation | Branching conversation tree with parent-child navigation |
| No mastery measurement | Objective scoring across clarity, accuracy, depth, transferability |
| Concepts forgotten between sessions | Persistent knowledge graph with mastery decay and reinforcement |
| Same approach for everyone | Behavioral pattern detection adapts teaching strategy |
| No review mechanism | Spaced repetition scheduler triggers reviews automatically |

## Use Cases

### Primary: Technical Education
- Programming concepts (Rust ownership, async patterns, system design)
- AI/ML engineering
- Distributed systems
- Mathematics

### Secondary: Exam Preparation
- Concept mastery tracking with weak area isolation
- Targeted review sessions

### Tertiary: Long-Term Skill Development
- Career skill building over months
- Measurable progress tracking

## Success Criteria

For the MVP to be considered successful:

1. A learner can study a topic across multiple sessions and the system remembers what they know
2. Branching into sub-topics works — explore a term, get tested, return to parent
3. Mastery scores update based on test performance
4. Weak concepts resurface for review at appropriate intervals
5. The experience feels meaningfully better than ChatGPT for structured learning
