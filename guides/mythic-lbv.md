# Mythic Lightblinded Vanguard — Full Raid Guide

**Comp:** MW Monk (Josh) / RSham (Brewtote) / RDruid (Silencio) / HPal (Dueche) / HPriest (Voidheart) — 5 healers
**Tanks:** Blood DK + Prot Warrior
**Source:** CD correlations from 3 top-ranked MW Monk kills, boss timeline from #1 kill (358s), soaker identification from report w9CLGQXPWdDnfcrb

---

## Bosses

- **General Amias Bellamy** (Prot Paladin) — Avenger's Shield, Divine Toll, Judgment, Shield of the Righteous, Divine Consecration
- **Commander Venel Lightblood** (Ret Paladin) — Divine Storm, Sacred Toll, Judgment, Final Verdict
- **War Chaplain Senn** (Holy Paladin) — Searing Radiance, Exorcism, Sacred Shield, Elekk Charge, Tyr's Wrath

**Spirits** (spawn sequentially, empower bosses):
- **Spirit of the Mender** → empowers Senn
- **Spirit of the Defender** → empowers Bellamy
- **Spirit of the Vindictive** → empowers Lightblood

---

## Kill Order & Timing

1. **Commander Venel Lightblood (Ret)** — Kill just before his 3rd ultimate. Empowered phase spawns Divine Storm tornadoes melee needs to dodge.
2. **War Chaplain Senn (Holy)** — Kill just before her 3rd ultimate. Most dangerous healer boss — Searing Radiance + heal absorbs.
3. **General Amias Bellamy (Prot)** — Dies last. Gets a 3rd ultimate but Prot phase is the most survivable.

**Retribution mechanic:** When a paladin dies, the raid takes 5% stacking damage amp every 2 seconds. Don't kill too early — Retribution ticks add up during downtime.

**Critical timing:** Ret must be dead before the final mass Avenger's Shield (~6:35). Revival needs to be available for that dispel.

---

## Soaker Assignments (from logs)

### Tyr's Wrath Soakers (heal absorb)

Confirmed across fights 36, 37, 39:

| Player | Role | Avg Hits/Pull |
|--------|------|--------------|
| Voidheart | HPriest | 5.3 |
| Brewtote | RSham | 4.7 |
| Senssay (Josh) | MW Monk | 4.0 |
| Nucke | DH | 3.3 |
| Nurnyx | SPriest | 3.0 |

### Floating Healer

**Voidheart** is the floating healer for Execution Sentence.

### Execution Sentence

Targets healers only. Whole raid stacks to soak the damage split (38-40 hits across 20 players per pull). When Voidheart gets targeted, the rest of the raid stacks on him. When another healer gets targeted, Voidheart covers their healing spot.

### Mass Avenger's Shield (Revival)

Post-nerf: hits 19-20 players simultaneously at ~72s and ~234s. Revival is the mass dispel.

---

## Boss Ability Timeline (from #1 MW kill, 358s)

### Major Ability Timers

| Ability | Source | Timestamps (s) | Interval |
|---------|--------|----------------|----------|
| Searing Radiance (initial) | Senn | 11, 182, 341 | ~165s |
| Searing Radiance (re-apply) | Senn | 63, 115, 234 | varies |
| Sacred Toll | Lightblood | 22, 40, 58, 76, 112, 130, 166, 184, 202, 220, 274, 292, 310, 328 | ~18s |
| Sacred Shield + Elekk Charge | Senn | 33, 92, 165, 209, 261, 324 | ~55-60s |
| Tyr's Wrath (Spirit) | Mender | 34, 193, 352 | ~160s |
| Tyr's Wrath (Senn) | Senn | 143, 302 | ~160s |
| Aura of Devotion | Bellamy | 29, 188, 347 | ~160s (phase marker) |
| Aura of Wrath | Lightblood | 82, 241 | ~160s (Ret empowered) |
| Aura of Peace | Senn | 137, 297 | ~160s (Senn empowered) |
| Divine Toll | Bellamy | 34, 87, 193, 246 | ~53s |
| Light Infused | Bellamy | 26, 79, 132, 185, 238, 292, 344 | ~53s |
| Judgment + SotR | Bellamy | 61, 115, 151, 169, 223, 277, 313, 331 | ~54s |
| Judgment + Final Verdict | Lightblood | 65, 119, 155, 173, 227, 281, 317, 335 | pairs w/ Bellamy |
| Divine Storm (empowered) | Lightblood | 123, 285 | during Aura of Wrath |
| Mass Avenger's Shield | Bellamy | ~66-72, ~228-234 | ~162s |
| Retribution | Bellamy | 344, 349 | boss death mechanic |

### Spirit Spawn Sequence (~160s cycle)

| Time | Spirit | Effect |
|------|--------|--------|
| 0:34 | Mender spawns | Tyr's Wrath (heal absorb on soakers) |
| 0:54 | Mender Zealous Spirit | |
| 1:07 | Defender spawns | Empowers Bellamy |
| 1:22 | Aura of Wrath activates | Ret empowered — empowered Divine Storm at 2:03 |
| 2:01 | Vindictive spawns | |
| 2:17 | Aura of Peace activates | Senn empowered — Tyr's Wrath (Senn) at 2:23 |
| 3:13 | Mender spawns (cycle 2) | |
| 3:33 | Mender Zealous Spirit | |
| 4:27 | Defender spawns (cycle 2) | |
| 4:45 | Empowered Divine Storm | |
| 4:57 | Aura of Peace (cycle 2) | |
| 5:02 | Tyr's Wrath (Senn) | |
| 5:21 | Vindictive spawns (cycle 2) | |
| 5:44 | Retribution | Boss death damage |

### Searing Radiance Windows (15s each, damage ramps toward end)

| Window | Start | Notes |
|--------|-------|-------|
| 1 | **0:11** | Opening — easy |
| 2 | **1:03** | Overlaps Sacred Shield at 1:32 |
| 3 | **1:55** | Overlaps Aura of Peace at 2:17 — DANGEROUS |
| 4 | **3:02** | Tyr's Wrath (Spirit) at 3:13 — DANGEROUS |
| 5 | **3:54** | Overlaps Aura of Wrath zone |
| 6 | **5:41** | Retribution stacks at 5:44 — LETHAL |

### Dangerous Overlaps (prog walls)

1. **1:55-2:23** — SR #3 → Aura of Peace → Tyr's Wrath (Senn)
2. **3:02-3:17** — SR #4 + Tyr's Wrath (Spirit at 3:13)
3. **4:45-5:02** — Empowered Divine Storm + Aura of Peace + Tyr's Wrath (Senn)
4. **5:41-5:56** — Final SR + Retribution death stacks — wipe point

---

## Healing CD Assignments

### Verified Available CDs (confirmed from kill log casts)

| Healer | CDs | Approx CD |
|--------|-----|-----------|
| Josh (MW) | Revival, Invoke Yu'lon, Celestial Conduit | 3m, ~2m, ~1.5m |
| Brewtote (RSham) | Spirit Link Totem, Ascendance | 3m, 3m |
| Silencio (RDruid) | Convoke the Spirits, Tranquility, Ironbark | ~1m, 3m, ~1.5m |
| Dueche (HPal) | Avenging Wrath, Aura Mastery | ~2m, 3m |
| Voidheart (HPriest) | Apotheosis, Divine Hymn, Guardian Spirit | ~2m, 3m, 3m (single) |

**NOT available:** Healing Tide Totem (not in RSham meta build), Flourish (not cast by any RDruid in kills).

Convoke is ~60s CD — used rotationally in nearly every window, not saved for big damage.

### Locked MW Monk CDs (consistent across every kill)

| CD | Window | Timing | Purpose |
|----|--------|--------|---------|
| Yu'lon | Pull | ~9-11s | SR #1 |
| **Revival** | W3 | **~72-73s** | **Mass AS dispel** |
| Yu'lon | W5 | ~137-145s | Aura of Peace + Tyr's Wrath overlap |
| **Revival** | W7 | **~234-235s** | **Mass AS dispel** |
| Yu'lon | W8 | ~269-295s | Emp Divine Storm + Aura of Peace #2 |
| CC | On CD | ~90s intervals | Throughput (flexible) |

Revival at 72-73s and 234-235s is non-negotiable — every MW Monk in every kill uses it at exactly those times to mass-dispel the 19-20 player Avenger's Shield.

### CD Assignment Table

| Window | Time | Boss Event | Josh (MW) | Brewtote (RSham) | Silencio (RDruid) | Dueche (HPal) | Voidheart (HPriest) |
|--------|------|-----------|-----------|-----------------|-------------------|---------------|-------------------|
| W1 | 0:09 | SR #1 | **Yu'lon** | — | Convoke | — | — |
| W2 | 0:39 | Tyr's Wrath | **CC** | — | — | **AW** | — |
| **W3** | **1:12** | **Mass AS** | **REVIVAL** | — | Convoke | — | — |
| W4 | 1:55 | SR #3 | — | — | Convoke | — | — |
| **W5** | **2:17** | **AoP + Tyr's** | **Yu'lon** | **Ascendance** | Convoke | **AM** | **Apotheosis** |
| W6 | 3:02 | SR #4 + Tyr's | **CC** | **SLT** | **Tranq** | — | **Hymn** |
| **W7** | **3:54** | **Mass AS** | **REVIVAL** | **Ascendance** | Convoke | **AW** | — |
| **W8** | **4:37** | **Emp DS + AoP** | **Yu'lon** | — | Convoke + Ironbark | **AM** | **Apotheosis** |
| **W9** | **5:41** | **SR #6 + Retri** | **CC** | **SLT** | **Tranq** + Convoke | **AW** | **Hymn** |

Biggest CD stack windows: **W5** (Aura of Peace + Tyr's Wrath, ~2:17) and **W9** (SR #6 + Retribution, ~5:41). Every team dumps 3-4 CDs on each.

---

## Tank Guide

**MT:** The mover. Pulls Senn for Searing Radiance.
**OT:** The wall. Holds Bellamy. Spell Reflects. Strips Sacred Shield.

### The Pull

| Time | Who | Taunt Target |
|------|-----|-------------|
| **0:00** | **OT** | **Bellamy (Prot)** |
| **0:02** | **MT** | **Lightblood (Ret)** |
| **0:14** | **MT** | **Senn (Holy)** — pull her out for Searing Radiance |

### Default State

- **MT** holds **Senn + Lightblood**
- **OT** holds **Bellamy**

### Swap Timer (~every 80-90s)

Both tanks taunt simultaneously to trade Bellamy and Lightblood. Senn stays on MT.

| Time | MT Taunts | OT Taunts |
|------|-----------|-----------|
| **1:03** | Bellamy | Lightblood |
| **2:33** | Bellamy | Lightblood |
| **3:45** | Bellamy | Lightblood |
| **5:15** | Bellamy | Lightblood |

### Searing Radiance Pull (MT)

Senn casts Searing Radiance at **0:11, 3:02, 5:41**.

Start running at **3/4 of the cast bar**. Taunt Senn if not already on you, Death's Advance, run ~20 yards out. Bring her back after it expires (15s).

### OT Spell Reflect Timer

Bellamy casts Judgment every ~54s. OT Spell Reflects 1 second after he starts casting. Catches Judgment + Shield of the Righteous.

| Judgment | Spell Reflect |
|----------|--------------|
| 1:01 | 1:02 |
| 1:55 | 1:56 |
| 2:31 | 2:32 |
| 2:49 | 2:50 |
| 3:43 | 3:44 |
| 4:37 | 4:38 |
| 5:13 | 5:14 |
| 5:31 | 5:32 |

### OT Wrecking Throw Timer

Sacred Shield on Senn every ~55-60s. OT strips it with Wrecking Throw.

| Sacred Shield | Wrecking Throw |
|--------------|---------------|
| 0:33 | Throw |
| 1:32 | Throw |
| 2:45 | Throw |
| 3:29 | Throw |
| 4:21 | Throw |
| 5:24 | Throw |

### Full Tank Timeline

| Time | MT | OT |
|------|----|----|
| **0:00** | — | **Taunt Bellamy** |
| **0:02** | **Taunt Lightblood** | — |
| **0:11** | SR — pull Senn at 3/4 bar | — |
| **0:14** | **Taunt Senn** | — |
| **0:33** | — | **Wrecking Throw → Senn** |
| **1:01** | — | **Spell Reflect** |
| **1:03** | **Taunt Bellamy** | **Taunt Lightblood** ← SWAP |
| **1:32** | — | **Wrecking Throw → Senn** |
| **1:55** | — | **Spell Reflect** |
| **2:33** | **Taunt Bellamy** | **Taunt Lightblood** ← SWAP |
| **2:45** | — | **Wrecking Throw → Senn** |
| **3:02** | SR — pull Senn at 3/4 bar | — |
| **3:29** | — | **Wrecking Throw → Senn** |
| **3:43** | — | **Spell Reflect** |
| **3:45** | **Taunt Bellamy** | **Taunt Lightblood** ← SWAP |
| **4:21** | — | **Wrecking Throw → Senn** |
| **4:37** | — | **Spell Reflect** |
| **5:13** | — | **Spell Reflect** |
| **5:15** | **Taunt Bellamy** | **Taunt Lightblood** ← SWAP |
| **5:24** | — | **Wrecking Throw → Senn** |
| **5:31** | — | **Spell Reflect** |
| **5:41** | SR — pull Senn at 3/4 bar | — |

---

## Josh's MW Monk Priorities

1. **RWK on cooldown. Every time.** Log analysis showed 60% usage (15/24+ possible casts). This is the #1 fix.
2. **Renewing Mist — never cap charges.** TFT on RM when at 2 charges.
3. **Revival at ~73s and ~235s** — mass Avenger's Shield dispel. Non-negotiable timing.
4. **Yu'lon at ~10s, ~140s, ~280s** — the 3 big healing windows.
5. **Celestial Conduit on CD** — flexible throughput, ~90s intervals.
6. **Float for Execution Sentence** when Voidheart can't.
7. **Celestial Conduit — stay in range.** Logs showed 40K damage vs top monks at 850K-1050K. Don't cancel early, don't be out of range.
8. **DPS in downtime.** Top MW monks do 13-17K on this fight. You were at 6K. More RWK casts fix most of this automatically.
