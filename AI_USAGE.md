# AI usage

I used Claude Code and Codex for design critique, implementation and review. I led the problem definition and made the scope and trade-off decisions; the tools also wrote code, test bodies and documentation. This page explains that division of work.

## How I worked

### Understand the problem first

I read the brief and separated the required functionality, business rules, assumptions and quality concerns. I first wrote my own notes in Noteful on my iPad and drew the entities and endpoint flows by hand.

I used Codex to clarify uncertainties, critique the draft, refine its wording and transcribe the notes into Markdown. The initial notes were an input to the design, not a substitute for checking the supplied schema and seed.

### Design through questions and concrete cases

With Claude acting as a Socratic coach, I proposed a model or a decision before asking for critique. We examined alternatives and edge cases, and I chose what to retain or change. I also asked for recommendations when I needed more context.

The resulting contract and rationale are in the [specification](docs/SPEC.md). Decisions evolved during implementation and review; a proposal was not final merely because an AI had agreed with it.

### Implement in bounded slices

I split the work into tasks with a defined contract, dependencies and acceptance criteria. Claude Code coordinated implementation across task-specific sessions, agents and worktrees rather than generating the entire API in one pass.

The development plan was test first. I named initial cases and challenged expected outcomes; AI wrote test bodies and proposed missing cases. Later, I delegated approval of some proposed cases to the orchestration session. I retained control of scope, final decisions and merges.

The [implementation slices](docs/tasks/TASKS.md) connect that plan to the delivered files and test criteria.

### Review and revise

The workflow combined unit tests for domain rules, HTTP tests against a real Postgres, static checks and additional reviews. I used Codex as another point of view on the plan and implementation, not just the same implementation agent approving its own work.

Handoffs included the changes, checks and remaining limitations. I questioned results and revisited proposals that did not preserve behavior or make the code clearer. AI-generated code and reviews were inputs to that process, not guarantees of correctness.

## Examples of decisions

| Situation | How the discussion changed the result |
|-----------|--------------------------------------|
| An amount buys less than one share | I initially treated this as a business rejection in every case. Claude challenged the LIMIT case: the client already supplied the price, so changing market conditions cannot make that request valid. I kept a persisted rejection for MARKET and request validation for LIMIT. |
| BMA has a negative holding in the seed | I checked the seed with Claude and questioned whether pending orders should count. Only executed orders establish ownership, so the supplied BUY 20 and SELL 30 yield -10. I chose to report the inherited anomaly rather than alter the data or invent short-selling support. |
| A proposed ledger simplification added complexity | After reviewing the result, I chose to restore the previous ledger implementation and keep the new test. Calling a change a refactor was not enough reason to retain it. |

These are examples of the working method; the specification contains the final rules and their trade-offs.

## Tools and skills

| Tool | Role in this challenge |
|------|------------------------|
| Claude Code | Design conversations, orchestration and scoped implementation. |
| Codex | Requirements clarification and transcription, additional critique, and documentation review. |
| Engram | Persistent context and decision records across sessions. |

I used two personal workflow skills:

- **`socratic-task-coach`:** required my proposal before critique, so the discussion started from my understanding rather than a generated solution.
- **`orquestador`:** coordinated dependencies, handoffs and reports across implementation sessions.

During development, project-specific **`backend-ddd`, `unit-testing` and `e2e-testing` skills** also recorded conventions: where responsibilities belonged, testing observable behavior, decimal assertions, and exercising HTTP/database boundaries. They helped make instructions repeatable; they did not replace tests or review. Those instructions were revised as the implementation evolved.
