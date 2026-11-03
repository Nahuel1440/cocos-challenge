---
name: unit-testing
description: "Trigger: change domain rules, write unit tests (*.spec.ts), fixtures (*.mother.ts) or port mocks. Test observable behaviour with real domain logic."
---

## Activation Contract

Use before implementing or changing domain rules and when editing unit tests or fixtures. Do not use for HTTP or database tests.

## Hard Rules

- Assert outputs, errors or resulting state, not internal structure. A behaviour-preserving refactor should not require assertion changes.
- Verify interactions only when they are part of the observable contract, including required side effects or preventing unnecessary I/O.
- Keep domain objects and services real; mock external boundaries through typed ports, not internal collaborators.
- Cover named risks and meaningful edge cases, not a fixed number of tests or trivial accessors.
- Make fixture inputs and expected values explicit; do not couple assertions to unrelated defaults. Follow nearby fixture conventions without requiring a factory for every value.
- Construct money from decimal strings and compare exact decimal values or the required string representation, never floating-point approximations.

## Execution Steps

1. Preserve user-led TDD: the user names the case; observe it fail for the intended reason before implementing the domain change.
2. Write the minimum implementation, observe GREEN, then refactor while keeping tests green.
3. Place specs next to the tested code, isolate test state, and run the focused suite using the existing configuration.

## Output Contract

Report the risk covered and observed checks, including RED/GREEN evidence when implementing a domain change; disclose any check that could not run.

## References

- [Unit test configuration](../../../vitest.config.mts)
- [Project test-first workflow](../../../docs/tasks/TASKS.md)
