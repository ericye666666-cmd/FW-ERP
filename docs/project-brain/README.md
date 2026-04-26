# Project Brain

The `project-brain` folder is the source-of-truth context for planning and implementation handoffs.

## Files in this folder

1. `01_THREAD_INDEX.md`
   - Index of important conversation threads and references.
2. `02_CURRENT_SYSTEM_MAP.md`
   - Snapshot of the current product/system state.
3. `03_BUSINESS_DECISIONS.md`
   - Confirmed business decisions that should guide implementation.
4. `04_OPEN_CONFLICTS.md`
   - Unresolved questions, conflicts, and items needing clarification.
5. `05_NEXT_ACTION_PLAN.md`
   - Prioritized next actions and execution sequence.

## Workflow between GPT Thinking and Codex

1. GPT Thinking reviews `docs/project-brain/` first.
2. GPT Thinking creates clear, scoped GitHub Issues from that context.
3. Codex implements only small, scoped Issues.
4. Any new discoveries are fed back into project-brain documents for future planning.

This keeps planning and implementation aligned while minimizing scope creep.
