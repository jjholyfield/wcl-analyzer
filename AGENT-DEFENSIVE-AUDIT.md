# WCL Defensive Audit — Agent Execution Spec

You are auditing whether players used defensive cooldowns at the appropriate times in a raid night. The question is always "where are we falling short and how do we improve" — NOT "who pressed the fewest buttons."

## When to Use This Spec

- "Are people using cooldowns at the appropriate times?"
- "Check defensive usage" / "preventable deaths" / "who died with CDs available"
- Any death analysis for a prog night

## The Tool

```
node scripts/defensive-audit.mjs <reportCode> <encounterID> [bossKey]
node scripts/defensive-audit.mjs qDfTzvAyV3pRb6rG 3181 crown
```

The script implements the full methodology below. If the boss has no config yet, add phases/damage windows to `BOSS_CONFIGS` in the script first (pull them with `pull-boss-abilities.mjs` or a damage-taken timeline). Do NOT write a new one-off script.

## Methodology — All Four Rules Are Mandatory

### 1. Cascade filtering
Once 2 players are dead in a pull, the pull is over — every later death is cascade, not an individual failure. Only the **first 2 deaths per pull** are auditable. Raw death counts across all pulls are meaningless: a 25-pull night produces 500+ deaths of which ~50 are real.

### 2. Defensive classification
Three buckets — never mix them:
- **Proactive DR** (auditable): AMS, IBF, Enraged Regen, Fort Brew, Diffuse Magic, Divine Protection, Barkskin, Survival Instincts, Unending Resolve, Dark Pact, Survival of the Fittest, Astral Shift, Obsidian Scales
- **Reactive heals / immunities** (NOT counted as missed DR): Desperate Prayer, Dispersion, Exhilaration, Turtle, Divine Shield. These are responses or full-commit buttons, not "you should have had this rolling."
- **Healthstone**: tracked separately as a footnote.
- Shadow Priest and Disc Priest have **no proactive DR** — never flag them for not pressing one.

### 3. Raid CD coverage check
Check whether a raid CD (Rally, AMZ, Darkness, Barrier, AM, VE, Tranq, Revival, Yu'lon) was **active at the moment of death**. Dying under Rally+Darkness is a damage/assignment problem, not a player problem.

### 4. Quadrant classification
Every real death lands in one of four buckets, and each bucket has a different fix:
| Raid CD active | Personal DR available | Meaning |
|---|---|---|
| yes | no | Damage killed through — fix the assignment plan, not the player |
| yes | yes | Player should stack personal on top of raid CD |
| no | yes | Coverage gap AND unpressed personal — both fixes apply |
| no | no | Genuinely out of options — needs a raid CD or strat change |

## Common Mistakes (all observed in baseline testing — do not repeat)

| Mistake | Reality |
|---|---|
| Counting all deaths as individual failures | 90% of deaths on a prog night are cascade. Filter first. |
| "Senssay died 30 times with defensives available" | Wrong on both counts: most were cascade, and the audit must check DR specifically. |
| Counting Turtle/Divine Shield/Desperate Prayer as "had a defensive" | Immunities and reactive heals are a different decision class than DR. |
| Skipping the raid CD check | Blaming players who died under 3 stacked raid CDs inverts the actual conclusion. |
| Concluding "everyone press buttons" from raw counts | The corrected Crown audit flipped the conclusion entirely: P1/INT first-deaths were the problem, P3 deaths were all cascade. |

## Output

1. Headline numbers: total deaths → real deaths → quadrant split.
2. Where real deaths happen (damage windows), with raid-CD-coverage context per window.
3. Per-player first-death list with tags (under which raid CDs, which DR was available).
4. Action items derived from quadrants — assignment fixes vs. personal-usage fixes vs. strat gaps.
5. Publish per the wcl-raid-analysis skill: HTML page in `healing-cds/`, index card, Discord copy block. Chat output is a draft, not the deliverable.

## Tone

The audit exists to find fixes, not to shame. Lead with what the data says about the plan (coverage gaps, assignments) before what it says about individuals. Verify surprising per-player findings (talent choices — e.g. a spec may not have the CD talented) before publishing names.
