---
name: wcl-raid-analysis
description: Use when analyzing Warcraft Logs reports, raid logs, or prog nights — healer CD rotations/assignments, defensive or death audits, DPS/healer/tank player audits, MRT/NSRT notes, boss preps, or any raid report for the team. Triggers include "run the logs", "check the logs", "CD assignments", "defensive usage", "who died", "preventable deaths", "boss prep", "raid night report", "review against the plan".
---

# WCL Raid Analysis

## Overview

All raid log work follows the written specs in this repository. The conversation is for iterating; the deliverable is a published HTML page in `healing-cds/` plus in-game note strings. **Never rely on conversation context for methodology — read the spec for the task type every time.**

## Start Here

1. Read `CLAUDE.md` at the repo root (API access, roster, encounter IDs, process, new-boss checklist).
2. Route to the spec for the task:

| Task | Spec |
|---|---|
| Prog night report (no kill) | `AGENT-PROG-RAID-ANALYZER.md` |
| Defensive usage / death audit | `AGENT-DEFENSIVE-AUDIT.md` |
| Individual DPS audit | `AGENT-DPS-ANALYZER.md` |
| Healer audit | `AGENT-HEALER-ANALYZER.md` |
| Tank audit | `AGENT-TANK-ANALYZER.md` |
| Healing CD sheet / rotation | `CLAUDE.md` § "Process for Building a CD Sheet" |
| Full boss prep (talents + personal CDs + healing CDs + taunts + NSRT distribution) | `AGENT-BOSS-PREP.md` |
| Post-night review vs the plan (compliance, performance, plan adjustments) | `AGENT-PLAN-REVIEW.md` |

## Hard Rules

1. **Scripts live in `scripts/`, parameterized by report code.** Check for an existing script before writing one. New scripts import `scripts/wcl-lib.mjs` (token, gql, paging, fmt, lcName) — never re-implement auth. Never write analysis scripts to a temp directory: they are the best version of the tool and they get lost.
2. **Every team-facing deliverable is an HTML page in `healing-cds/`** with a Discord copy block inside the page, plus a card in `healing-cds/index.html`. A deliverable that exists only in chat was not delivered.
3. **Filenames: lowercase, accents stripped** (use `lcName()`). Player names in page CONTENT and note tags keep their real accents.
4. **Verify every CD timer before finalizing** — `nsrt-note.mjs` validates chains automatically; walk anything it can't.
5. **Discord output**: no markdown tables (use code blocks), real line breaks.
6. **Roster or talent changes mentioned mid-session** → update `CLAUDE.md` in the same session.
7. **Death analysis without cascade filtering is wrong.** Never report raw death counts as individual failures — see `AGENT-DEFENSIVE-AUDIT.md`.

## Red Flags — Stop and Fix

- About to deliver a final report only as a chat message or temp file
- Writing `getToken()` or a paging loop in a new script
- Counting all deaths in a pull as individual mistakes
- Counting immunities/reactive heals (Turtle, Divine Shield, Desperate Prayer) as unpressed DR
- An assignment sheet where a CD's previous use hasn't finished cooling down
- A filename containing an accent
- Shipping an NSRT/MRT note without running `nsrt-note.mjs` with a recent report code (roster preflight — mismatched tags silently never fire)
- A boss prep "done" while the boss page has no NSRT import block, talent section, or tank plan
- Mixing fight difficulties in compliance or death stats (scripts filter to Mythic by default)
