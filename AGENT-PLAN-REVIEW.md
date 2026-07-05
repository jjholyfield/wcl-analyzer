# WCL Plan Review — Agent Execution Spec

You are reviewing a raid night against the boss plan: did the raid execute what was assigned, where did it slip, and what should change — in the plan or in the players — before next raid. This is the closing half of the prep loop (AGENT-BOSS-PREP.md is the opening half).

## When to Use This Spec

- "Review last night against the plan" / "did people follow the assignments"
- "Go back and look at performance" after a night with a published plan
- The weekly post-raid review once a boss has a `healing-cds/plans/<boss>.json`

## Pipeline

### 1. Plan compliance — `scripts/plan-compliance.mjs healing-cds/plans/<boss>.json <reportCode>`
Scores every timed assignment across every pull that reached its window: ON TIME (±20s default), DRIFT (±60s), MISSED. Per-player rollup + OFF-PLAN uses (planned CDs cast nowhere near their assigned time — usually the "everything dumped early" signature).
Each run saves `data/boss-prep/compliance-<plan>-<report>.json` — prior runs there are the week-over-week baseline ("did the players we flagged improve"). The `.out.txt` next to the plan is the NSRT generator output, not compliance history.

### 2. Defensive audit — `scripts/defensive-audit.mjs <reportCode> <encounterID> <bossKey>`
Full methodology in AGENT-DEFENSIVE-AUDIT.md. Answers whether the deaths trace to the plan (coverage gaps) or to execution (unpressed personals).

### 3. Tank plan check — `scripts/tank-swap-audit.mjs <reportCode> <bestFightID>`
Compare our swap timeline to the documented swap rule from the prep. Deviations get named with evidence.

### 4. Talent adoption — `scripts/pull-top-talents.mjs <encounterID> <reportCode> <bestFightID>`
If the prep flagged builds, check whether diffs shrank. `talentImportCode` is per fight, so mid-night swaps show up.

### 5. Per-player performance (when asked, or on kill nights)
Existing specs: AGENT-DPS-ANALYZER.md / AGENT-HEALER-ANALYZER.md / AGENT-TANK-ANALYZER.md / AGENT-PROG-RAID-ANALYZER.md.

### 6. Synthesize → adjust → regenerate
Every finding lands in one of three buckets:
- **Plan is wrong** — assignment consistently drifts to the same spot (avg Δ says where the raid actually needs it), or an assigned window never gets reached. Fix: edit the plan JSON.
- **Execution is wrong** — assignment missed while the CD was available. Fix: coaching note + the reminder already fires in-game; consider adding `countdown:` or moving the reminder earlier.
- **Roster/talent reality changed** — player not in log, CD not talented. Fix: plan JSON + CLAUDE.md roster same session.

If the plan JSON changed, immediately rerun `scripts/nsrt-note.mjs` and ship the new NSRT string with the review. A review that changes the plan but not the in-game note has not closed the loop.

### 7. Publish
"Plan vs Actual" section in the night's `log-YYYYMMDD` page (or a standalone review page): compliance table, per-player rollup, off-plan uses, the three-bucket action list, updated NSRT string if changed. Index card. Publishing rules per the wcl-raid-analysis skill.

## Interpretation Rules

| Signal | Meaning |
|---|---|
| High ON TIME on one assignment, low on the rest for same player | Player follows habits, not the plan — reminder/TTS should fix it; recheck next week |
| Consistent avg Δ (e.g. +25s every pull) | The plan time is wrong, not the player — move the assignment |
| OFF-PLAN cluster at one timestamp across pulls | An unassigned damage event is scaring CDs out — either assign it or call it out as hold |
| MISSED but pull was collapsing at that point | Not a compliance failure — cross-check death times before flagging (cascade context, AGENT-DEFENSIVE-AUDIT.md) |
| 0% compliance on a new assignment's first night | Baseline, not failure — the plan didn't exist during those pulls. Say so explicitly. |

## Common Mistakes

| Mistake | Reality |
|---|---|
| Scoring pulls that never reached the window | `plan-compliance.mjs` filters by pull duration — never hand-count raw casts |
| Flagging a "missed" CD in a dying pull | Check the death timeline first; nobody presses Revival on a 4-alive wipe |
| Reviewing against memory of the plan | The plan JSON is the contract — review against the file, not the conversation |
| Adjusting the plan without regenerating the NSRT string | The raid hears the OLD reminders next pull — always rerun nsrt-note.mjs after plan edits |
| Comparing names with accents | `lcName()` both sides; Voidhéart ≠ Voidheart will silently zero someone's compliance |
