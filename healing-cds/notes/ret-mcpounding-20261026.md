# Mcpounding (Retribution, Herald of the Sun) Mythic+ audit, report VCT4BDbd7XknFKPG, 2026-10-26

Keys: Murder Row +18 timed 37.6 min 259K DPS; Voidscar Arena +17 left after Taz'Rah 259K; Murder Row +17 timed 31.2 min 248K. (Den of Nalorakk +12 with another group, 293K, not graded.)
References, same audit script: Böllerbob +19 Murder Row 430K (kRVtM6WHA1cxQ3gY fight 4), Kelimdall +18 Murder Row 433K and 21 more keys at +18 to +22 (HqaPZXckvydVnz1m).
Rulebook: guides/ret-s2-rules.md (58 rules from Method 12.1.5, Maxroll 12.1.5, Murlok top 50, NinoMMO 17 Oct, Felipe Neli 4 Oct, Myuvilo 28 Sep, Lightblade 15 Aug; NeekapHere and Melee from Season 1 for context).
Method: seven analysts, two adversarial verifiers per finding (one against the sources, one recomputing from the raw events), zero refutations, wording corrections applied. Sequence files: data/VCT4BDbd7XknFKPG/ret/mcpounding/fight1-sequence.txt (+18) and fight4-sequence.txt (+17).

## What already matches the top players (leave it alone)

- Holy Power. Waste 21.5 percent of generated against 23.3 and 23.7 for the references. At 4 to 5 Holy Power with Art of War up outside Wings he spends first 94 of 100 times (Kelimdall 53 of 54, Böllerbob 34 of 48). Blade of Justice overflowed 10 times in 37 minutes (Böllerbob 15). Time at 5 Holy Power 24 percent against 21.
- Spender choice by target count, Divine Purpose consumed (2 to 3 lapsed per key, references 0 to 3), both Dawnlight spenders landed after every Wake, Execution Sentence paired with Wings in every window, Wings carrying 67 to 71 percent of damage (references 62 to 73).
- Movement, Divine Steed, generator waits and utility globals: at or better than both references per alive minute. Rebuke and Blessing of Sacrifice are off the GCD and cost no presses. Unbuffed, outside Wings, he presses faster than both (median gap 1.150 s against 1.175).
- Talents: the top-50 build. The only difference is one utility node (Punishment against Lead the Charge or Consecrated Ground), under 0.1 percent either way. Enchants, gems, flask, food, rune and oil all match the references. Midnight has no cloak or bracer enchant, so the audit's earlier flag there was wrong.

## What to fix, in order

### 1. Deaths: 10 in three keys, 262 s of the +17's pull time dead (16 percent), 87 s of the +18's

Böllerbob died 0 times, Kelimdall once. At 7 of the 10 deaths Divine Shield or Divine Protection was ready and unpressed. A health potion was ready at all 10 and he drank none in four keys. At 7 deaths his last button was Final Verdict or Divine Storm below 65 percent with Eternal Flame castable; he pressed Eternal Flame in the last 5 s of 0 deaths. Four of his 16 Divine Shields went out at 100 percent with nothing landing.

Kystia's Chaos Barrage at +36 killed him in both Murder Rows, at the same second of the pull:
- +18, 8:46.5. Final Verdict 8:42.3 (63 percent), Wake 8:43.5, Final Verdict 8:44.7, Divine Storm 8:45.8 at 100 percent, then 1,260K into 873K. Divine Protection had sat ready 125 s; Divine Shield and Lay on Hands were ready too. Protection alone would have left about 290K.
- +17, 5:54.1. Corroding Spittle 229K at 5:49.7, Final Verdict 5:51.4, Wake 5:52.5, a 407K Spittle tick at 5:52.7 (21 percent), Divine Protection at 5:53.5 (0.6 s before the hit), Final Verdict 5:53.7, then 776K after mitigation into 196K. Divine Shield and Lay on Hands were ready.
- Kelimdall pressed Divine Protection at +37.7 in the same window and took 218K. Neither reference ever took the barrage's fourth damage step in 44 barrages; both of his lethal ones were fourth-step hits at +36, so check where he stands at 0:36.
Fix: Divine Protection at +33 to +35 on Kystia, every attempt. If Spittle has him under 70 percent at +33, Divine Shield instead.

Murder Row +17 scripted one-shots, all with the cooldown available:
- Murder in a Row 11:13.5 (Zaen +42): Blessing of Protection and Divine Protection pressed at 100 percent in the Keen Taskmaster pack before the boss, Divine Shield burnt at 10:58.8 at 57 percent on a Fire Bomb, so all three were down. Böllerbob pressed Blessing of Protection at +38 and took 0; Kelimdall Divine Shield at +41, 0. Protection alone would have held it (887K after armor, times 0.70, minus the Shield of Vengeance, against 490K health).
- Whirlwind 17:25.3 (Shivan Punisher): Divine Shield at 16:31.4 at 100 percent taking nothing, Divine Protection idle 35 s. Demonic Frenzy ticked 17:22.4, 17:23.4, 17:24.4; his last press was 17:22.1. Press Protection when the Frenzy starts ticking.
- Demonic Rage 20:56.7 (Xathuux): Protection available; three Final Verdicts at 63, 62 and 60 percent, two of them at 5 Holy Power. Press Protection the moment Infernal Crush hits (+34, +91 to +95, +148 to +152); the Rage lands 4 to 8 s later inside it.

Murder Row +18:
- 5:57.0 Fel Detonation, Massive Felwyrm: Divine Shield ready (302 s since the last), full health one second before, only Ret in four logs of that pull to be hit by it. Step out; if caught, Shield it. The Sacrifice on Narìx moved 221K onto him in those 12 s: cover a Sacrifice with Protection or Shield, as Böllerbob does, rather than sending it bare.
- 32:15.8 Defiled Slam: Protection pressed at 31:26.3, in the 22 s gap between slam cycles, covering nothing; the lethal cycle met Divine Shield, Eternal Flame and the potion all ready while he pressed Blade, Final Verdict (59 percent, 5 Holy Power), Blade, Divine Storm (28 percent), Final Verdict (30 percent). On the Golem, Protection goes on the first slam of a cycle, never in the gap.
- 1:06.9 pull-1 wipe: Divine Shield at 0:55.3 at 97 percent left Forbearance, so Blessing of Protection was locked when the tank died and the physical melee turned on him.

Save buttons: below 50 percent with 3 Holy Power or a free Divine Purpose, the next spender is Eternal Flame on himself. Below 50 percent with a hit coming, the Concentrated Silvermoon Health Potion; it does not share a cooldown with Recklessness, and both references drink it in these keys (returns of 26K to 510K by the next press, median about 190K, which covers three of his death margins of 8K, 41K and 131K).

### 2. The Wings window: Wings and Wake are one press, potion on it, Divine Toll by +5 s

What he does (56 of 60 windows): Execution Sentence 0.2 to 1.0 s before Wings, then Wings with the trinket, then a spender or two if he sits at 4 to 5, then Wake, and Divine Toll at +8.9 s (+18) and +7.2 s (+17). Wake came within 1.2 s of Wings in 12 of 29 and 7 of 22 windows (Böllerbob 17 of 19, Kelimdall 22 of 23). Wings was pressed with Wake still on cooldown 10 of 28 and 8 of 22 times (Böllerbob 4 of 19, Kelimdall 1 of 126; both hold Wings a second or three for Wake, 38 of 41 times). Divine Toll landed after Execution Sentence had expired in 10 of 26 windows and 10 of 78 Divine Resonance Hammers fell outside Wings (references 0). Potion in Wings: 0 of 28 and 0 of 22; the references 4 to 5 per key, on the Wings press.

His 20:21.7 (+18, 5 targets): Execution Sentence 20:21.0, Wings 20:21.7, Divine Storm 20:22.3, Wake 20:23.4, Divine Storm, Final Verdict, Hammer, Divine Storm, Hammer, Divine Storm, Final Verdict, Blade 20:32.1, Divine Storm, Divine Toll 20:34.1 (+12.4 s, Execution Sentence gone at 20:31.1).
Böllerbob's 8:35.9 (+19, 8 targets): Blade 8:34.2, then Wings + Execution Sentence + trinket + potion on one press at 8:35.9, Wake 8:36.6, free Final Verdict 8:37.8, Divine Storm 8:38.9, Divine Toll 8:39.9 (+4.0 s), Divine Storm, Hammer, Divine Storm, Divine Storm, Hammer, Final Verdict, one press every 1.0 s.

The window to run (second marks from both references):
- minus 1.5 s: last normal GCD. Holding 3 or more, spend here, never between Wings and Wake.
- 0.0: Avenging Wrath, Execution Sentence, Voracious Heart and Potion of Recklessness on one press (the potion only fires when ready, so the macro is safe; that is 7 potions in the +18 at 0:35, 5:47, 11:18, 17:36, 23:45, 29:00, 35:01).
- 0.7 to 1.1: Wake of Ashes, at any Holy Power, 5 included. The references overflow 3 on it in 16 of 19 and 18 of 23 windows and still out-damage the window. If Wake is up to 4 s from ready, wait for it.
- 1.6 to 2.3: Final Verdict, on packs too. It is free, carries Empyrean Legacy, and its Divine Storm fires the Arbiter.
- 2.5 to 3.4: the next spender (Divine Storm on 2+, Final Verdict on 1; with an Arbiter up, the other spender).
- 4.0 to 5.5: Divine Toll, with about 5 s of Execution Sentence left for its Hammers. Never press Hammer or Blade while Toll is ready inside Wings. It shares Wings' 60 s cooldown, so once it sits at +5 it stays at +5.
- to 24 s: spender at 3+, Hammer of Wrath under 3, Blade only with no Hammer charge, every press queued at 1.00 s.
- +30: the mid-cycle Wake the moment it returns, even at 3 to 5 Holy Power. His came a median 35.0 s after Wings (Kelimdall 30.6); that is why Wings keeps opening without it. Lithiel +18: Wings at 33:59.5, 35:00.8 and 36:03.8 found Wake 3.9, 6.9 and 8.7 s away, so Wake landed at +5.0, +8.9 and +10.3 and Divine Toll at +19.0, then not at all.
Kelimdall's variant, worth copying on packs the tank is still gathering: Wings + Wake, free Final Verdict, Execution Sentence at +2.1 to +2.6 (so its first hit catches the whole pack), Divine Toll +4.9. His Execution Sentence collects 52 percent of its window's damage against 41 to 44 for Mcpounding's early press.

### 3. Divine Arbiter: the glow decides the next spender, not the pack size

Mechanic, proven on all ten keys: a free Final Verdict grants an Arbiter that fires ONLY from Divine Storm; a free Divine Storm grants one that fires ONLY from Final Verdict. Pressing the same spender again leaves it sitting, and every Divine Purpose spent meanwhile grants nothing. He pressed the same spender while an Arbiter sat about 100 times in the +18 and 93 in the +17 (Böllerbob 22, Kelimdall 4 to 12). Divine Purpose procs that granted no Arbiter: 21 per key (references 0 to 3). Conversion 81 and 73 percent against 95 and 89 to 93. Arbiter share of damage 9.0 and 8.1 percent against 10.0 and 9.7 to 10.7. About 21 Arbiters lost per key, 6 to 12M, 1 to 2.6 percent.

Zaen +18, 14:12.0: free Divine Storm grants the Final-Verdict-firing Arbiter; then Divine Storm 14:15.7, 14:16.9, 14:19.0 (free, wasted), 14:20.3, 14:22.9, 14:25.1 (free, wasted), 14:26.3, 14:27.5 (free, wasted), 14:29.0, 14:31.3; the Arbiter expires at 14:32.1 unfired. One Final Verdict at 14:15.7 fires it and the three free Storms would each have granted another.
Lithiel +17, 30:12.0: free Final Verdict grants the Storm-firing one; 11 Final Verdicts follow to 30:31.5, the free ones at 30:20.1, 30:26.9 and 30:30.3 grant nothing, it expires at 30:32.0.
Rule: after a free Final Verdict the next spender is Divine Storm, on one target too; after a free Divine Storm the next spender is Final Verdict, in a ten-pack too. Never the same spender twice while the Arbiter is up.

### 4. Hammer of Wrath inside Wings, where Blade of Justice is the last button

Inside Wings every Hammer also casts a Blade of Justice (Walk Into Light, 107 of 109 presses, 203 ms later) and nets 3 Holy Power; a manual Blade gives 2. A Wings Hammer press is worth 335 to 362K of his direct damage, the Blade 105 to 114K. Hammers per Wings window 3.8 against 4.8 (Böllerbob) and 5.2 (Kelimdall); 1.57 to 1.69 per 10 s against 1.98 to 2.34. Blades pressed in Wings 5 s or more after the last Hammer, with a charge back: 15 and 14 (Böllerbob 2, Kelimdall 0 in six keys). Hammer sat at 2 charges for 45 and 38 percent of his Wings (29 to 33). After Divine Toll his three Divine Resonance Hammers take a median 11 s (7.9 to 9.6).

Zaen +18, Wings 13:29.3: Hammer 13:37.3, Divine Storm, Blade 13:39.2 (3 Holy Power), Divine Storm, Final Verdict, Divine Storm, Blade 13:44.1 (1, Art of War), Divine Storm, Blade 13:46.3 (3, Art of War), Divine Storm, Divine Storm, Blade 13:49.4 (2, Art of War), Divine Storm, Final Verdict, Hammer 13:52.6. Four Blades and no Hammer for 15.3 s with both charges sitting.
Rule: at 0 to 3 Holy Power in Wings, Hammer whenever it has a charge, glowing Blade or not (the Hammer's free Blade uses the Art of War proc anyway). After Divine Toll, the next three non-spender globals are Hammers. Blade in Wings only with no Hammer charge and under 4.
This also carries the Judgment stacks: his boss Wings end with 6 to 7 Judgment stacks on the boss against 8 to 10, which is most of his Judgment uptime gap (66 and 71 percent alive against 79 to 81) and Expurgation gap (83 and 84 against 92). Outside Wings his Judgment pressing matches the references. One habit: when Wings ends, Judgment has both charges, so below 4 Holy Power the first global after Wings is Judgment, not Blade.

### 5. Press cadence inside Wings: queue the next button

Wings press spacing 1.106 s per GCD (+18), 1.086 (+17), against 0.994 (Böllerbob) and 0.999 to 1.034 (Kelimdall), same GCD floor, so it is not haste. 32 percent of his chained Wings presses come 1.10 s or more after the previous one against 7 to 9.5 percent. That is 42 to 68 Wings GCDs in the +18 and 25 to 46 in the +17, at 278 to 290K direct each. Standing pauses with a spender ready: 34 (38 s) in the +18, 13 with a Divine Purpose up, 9 inside Wings; Kelimdall 7 (7 s), Böllerbob 1.
Zaen freight: Execution Sentence 14:43.9 and Wings 14:44.2 with the Fel-Infused Freight on him, then no GCD until 14:52.5 (8.4 s); Wings #12, 16:07.2 to 16:15.7 (8.5 s, Steed plus Protection). Those two windows did 4.5M each. Both references kept hitting through the carry (Kelimdall 32 GCDs in a 36 s carry, a full Wings inside it). Protection and Steed are off the GCD.
Rule: the next button goes in during the last 0.3 s of the current GCD. After every spender in Wings: 3+ Holy Power, next spender; under 3, Hammer; otherwise Blade. Never wait on a free proc.

### 6. Boss cooldown timing: Kystia's burn and Xathuux's add waves

Kystia (Murder Row): about 20 to 25 s after the first target stops taking damage, the second takes 4 to 8 times normal hits. Kelimdall opened Wings + Wake + potion at +67 s into that phase: 30.8M inside it. Böllerbob held Wings 113 s (ready at 4:22, pressed 6:15.4 with the potion) for it: 37.2M. Mcpounding's Wings #7 at 9:14.0 went 15 s early, spent its first 12 s on the first target (Final Verdicts at 50 to 67K against 219 to 473K after the switch at 9:26.6), 9 s landed in the burn, no potion, about 9M. Kystia DPS over alive time 196K against 443K and 446K.
Rule: on Kystia, no Wings and no potion before the burn. When the first target dies and the second starts taking the big hits (about +65 to +80 s), Wings + Wake + potion. Hold Wings up to about 15 s for it, Wake as long as it takes.
Xathuux: add waves near +20, +75 and +135 s. Both references pressed Wings + Wake at about +15 s, then +76 and +138. He pressed Wake at the pull (23:11.5) with Wings 22 s from ready, so Wings came at +36 without Wake, after the first wave, then +103 and +165. Rule: if Wings is not ready at the pull, do not Wake at the pull; Wings + Wake at about +15 s, then on cooldown.
Zaen and Lithiel: Wings at the pull, as now.

### 7. Eternal Flame as a top-up: 10 of 18 paid casts at 99 to 100 percent health (+17)

25 Eternal Flames in the +17: 18 paid (54 Holy Power) and 7 free. Ten of the paid ones went on himself at 99 to 100 percent (11:56.2, 12:50.9, 14:38.4, 20:36.8, 21:52.9, 24:45.5, 26:31.3, 26:56.9, 28:46.8, 29:58.8), six inside Wings, five at 5 Holy Power; 28:46.8 on Lithiel was 5 Holy Power inside Wings and Execution Sentence with 15 targets near at full health. The 7 free casts granted no Arbiter, 4 of them at 98 to 100 percent inside Wings. The healer had been back since 8:57. References: Böllerbob 1 paid (at 87 percent after 532K in 3 s), Kelimdall 4 (100 with the heal over time already up, 71, 52, 79). About 4 to 5M, 1 percent of the key.
Rule: a save button. Himself below about 60 percent with more coming when Protection is not the answer, or an ally visibly dropping. Never at full health, never with a free Divine Purpose, never inside Wings unless it saves a life.

### 8. Potions: 2 of 18 possible, none inside Wings, no health potion in four keys

Potion of Recklessness is the right one (mastery is his highest stat): 0 of 8 in the +18, 1 of 3 in Voidscar (37 s after Wings), 1 of 7 in the +17 (19 s before Wings, 12 s of its 30 overlapped). Böllerbob and Kelimdall drink 5 a key, each on a Wings press: first pull, Kystia's burn, the big Felmaster or Shivan pack, Xathuux, Lithiel. The references' potion windows run about 5 percent above their other windows on the same boss; 7 to 8 potions in a 37-minute key is about 5 to 11M. The macro in fix 2 handles it. Carry Concentrated Silvermoon Health Potions (fix 1).

### 9. Gear: one ring moves crit above haste and gives the second embellishment

Sheet: mastery 1233, haste 1026, crit 726, versatility 169. Böllerbob 1172 / 870 / 1014 / 157; Kelimdall 1241 / 878 / 987 / 105; Murlok top 50 mastery 1163, crit 1097, haste 737. The rings are the cause: Sickening Signet of Atroxus (321) carries 258 haste and no effect; Band of the Swarmcaller pulls its weight (Acidbrood Scourge 0.8 to 1.1 percent of his damage). Gems and enchants are the references' set at max rank.
He runs one embellishment, not two: the bracers carry Arcanoweave Lining; the crafted girdle carries Lucky Keychain (+1 Sparkle, nothing in combat). The top 50 fill 99 of 100 embellishment slots, mostly Loa Worshiper's Band (40) and Stabilizing Gemstone Bandolier (36).
- Craft Loa Worshiper's Band (331, +228 crit +171 mastery, socket, embellished) in place of Sickening Signet: about 954 crit, 770 haste, 1291 mastery, the order both references and the top 50 run, and the second embellishment in one item.
- Next bracer recraft: Stabilizing Gemstone Bandolier (doubles the Loa band; Böllerbob's pair).
- Next crafted piece Crit/Mastery, boots first (Poison-Proof Stompers, 321, haste/vers).
- Helm socket (Season 2 Miasmic Jewelbinder, Vaultkeeper Elysa, Silvermoon, 6 Thalassian Tokens of Merit); both references have it. Four gems against six and five.
- Myth-track vault picks on the eight 321 slots, ring first if the Loa band is not ready, then boots, then cloak. Do not chase a fifth tier piece; the set has no 5-piece.
Not simmed: run Raidbots Top Gear before crafting.

### 10. Not his: group buffs, pull size, route

- Lust is parity: Narìx's pet cast Primal Rage on him four times in the +18 (0:33.7, 13:30.3, 23:32.5, 32:57.2) and three in the +17, 7.8 and 6.6 percent of pull time against the references' 9.4 and 8.9; the shortfall is his deaths cutting two of those windows short. (An analyst first reported "no lust in either key"; the verifier queried the report and refuted it. The pull now fetches buffs from every friendly source.) What the references had and he did not: Skyfury (2.8 to 3.0 percent of their damage, measured), Mark of the Wild, Battle Shout (Böllerbob only) and probably Chaos Brand (Kelimdall only); the last three are standard values, not measured here. Judge his Murder Row DPS against the references minus about 5 percent, not 10.
- Trash ran at 6.8 to 7.1 targets per Divine Storm against 8.4 (Kelimdall) and 11.5 (Böllerbob); 8 trash pulls over 1108 s against 6 over 703. About 34K per extra target on his own pulls. Compare his trash with Kelimdall's +18, not Böllerbob's.
- Route: both Defiled Golem pulls (27:34.6, 294 s at 5.4 targets; 36:34.4, 64 s at 2.8 targets after Lithiel died) cost 358 s and three Defiled Slam deaths. Both references go Wrathguard Flayer, Corrupted Warlock, Lithiel and skip the Golem. Raise it with the tank.
- The 37-minute clock does not lower the meter (he was in combat 87 percent of the key against 84 to 85); the gap is damage per pull-second, 299K against 515K.

Cleanup, one line each: 7 Blinding Lights hit nothing (one GCD each); 11 of 26 Rebukes landed nothing and 3 were aimed at the boss itself (an interrupt question, not a pace one); at 5 Holy Power spend before Judgment (5 overflowed Judgments in the +18).

## Sources found on YouTube, Season 2

Used (auto-captions pulled and read): NinoMMO, "The ONLY Ret Paladin Guide You Need | Midnight Season 2" (17 Oct 2026); Felipe Neli, "GUIA COMPLETO PALADINO RETRI MIDNIGHT, Do Basico ao Avancado + Tier Set S2" (4 Oct 2026, Portuguese auto-translated, the most detailed); Myuvilo, "Retribution Paladin | Guide | Beginner | WoW | Midnight 12.1" (28 Sep 2026); Lightblade Gaming, "Midnight - Retribution Paladin Season 2 Full Guide Patch 12.1" (15 Aug 2026, recorded before launch). Season 1 context only: NeekapHere, "Herald of the Sun is BACK On the Menu" (27 May 2026); Melee, "Rank 1 Retribution Paladin Rotation Guide for M+" (12 Mar 2026). Written: Method Playstyle and Rotation and Talents (12.1.5, 13 Oct 2026), Maxroll M+ guide (12.1.5), Murlok top-50 Herald M+ data.
Found, no captions available, not read: Javier, "Retribution Paladin Midnight Season 2 Beginner Raid & M+ Guide" (13 Aug 2026); Saltii, "One Button Retribution Paladin Guide | WoW Midnight" (16 Aug 2026); Thematicz Gamez, "Ret Paladin UPDATED Build Guide For Midnight Season 2 | BIG DAM Praise The Sun" (6 Sep 2026) and "This Ret Paladin Build MELTS Mythic+ | +16 Altar of Fangs Review" (8 Sep 2026).
