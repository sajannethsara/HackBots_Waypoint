# AI tool disclosure

_Draft. The team will finalise this before submission._

## Tools used
- **Claude Code (Anthropic)**, used as a pair-programmer in the IDE.
- **Figma MCP**, used to read our own Designathon frames while implementing them.
- **shadcn CLI / MCP**, used to install UI components from the shadcn registry.

## AI-assisted
- Scaffolding the monorepo (pnpm + Turborepo), Docker Compose and the Prisma seed pipeline.
- First drafts of the NestJS modules, the planning engine and the dispatcher screens. The team reviewed and tested these against the brief.
- Drafting documentation (README, architecture and data-model docs).

## Done by the team
- Problem framing, personas, screen flows and the Designathon design (Figma).
- The data model and its conventions (the original `schema.prisma`).
- Product decisions: the demo day (S1), the priority policy, which constraints are hard, and the scope.
- Review, testing and acceptance of all generated code.

## How we used it
We gave the assistant the challenge brief, our schema and our Figma design, then iterated in small steps. Each step was type-checked and linted, and verified end to end against the running app before the next. The planning engine was checked on scenario S1, and a priority inversion found during review was fixed.
