# Mcpounding (Retribution, Herald of the Sun) Mythic+ audit, report VCT4BDbd7XknFKPG, 2026-10-26

Keys graded: Murder Row +18 timed 37.6 min 259K DPS (fight 1); Voidscar Arena +17 left after Taz'Rah 259K (fight 3); Murder Row +17 timed 31.2 min 248K (fight 4). Two +12s with another group, used only to check that the habits hold without death stress: Den of Nalorakk +12 timed 23.1 min 242K (fight 5) and Altar of Fangs +12 timed 295K, 0 deaths (fight 6).
References, same audit script: Böllerbob +19 Murder Row 430K (kRVtM6WHA1cxQ3gY fight 4), Kelimdall +18 Murder Row 433K and 21 more keys at +18 to +22 (HqaPZXckvydVnz1m).
Rulebook: guides/ret-s2-rules.md (58 rules from Method 12.1.5, Maxroll 12.1.5, Murlok top 50, NinoMMO 17 Oct, Felipe Neli 4 Oct, Myuvilo 28 Sep, Lightblade 15 Aug; NeekapHere and Melee from Season 1 for context).
Method: seven analysts, two adversarial verifiers per finding (one against the sources, one recomputing from the raw events), a critic for ranking and gaps. One finding was refuted (see "not his"). Sequence files: data/VCT4BDbd7XknFKPG/ret/mcpounding/fight1-sequence.txt (+18) and fight4-sequence.txt (+17).

## What already matches the top players (leave it alone)

- Holy Power. Waste 21.5 percent of generated against 23.3 and 23.7 for the references. At 4 to 5 Holy Power with Art of War up outside Wings he spends first 94 of 100 times (Kelimdall 53 of 54, Böllerbob 34 of 48). Blade of Justice overflowed 10 times in 37 minutes (Böllerbob 15). Time at 5 Holy Power 24 percent against 21.
- Spender choice by target count, Divine Purpose consumed (2 to 3 lapsed per key, references 0 to 3), both Dawnlight spenders landed after every Wake, Execution Sentence paired with Wings in every Murder Row window, Wings carrying 67 to 71 percent of damage (references 62 to 73).
- Outside lust and outside Wings he presses as fast as both references (47.5 GCDs a minute in the deathless +12s against 47.2 to 49.2). Movement, Divine Steed, generator waits and utility globals are at or better than both per alive minute. Rebuke and Blessing of Sacrifice are off the GCD and cost no presses.
- Talents: the top-50 build. The only difference is one utility node (Punishment against Lead the Charge or Consecrated Ground), under 0.1 percent either way. Enchants, gems, flask, food (missing only at the Altar start), rune and oil all match the references. Midnight has no cloak or bracer enchant, so the audit's earlier flag there was wrong.

## What to fix, in order

### 1. Deaths: 10 in three keys, 262 s of the +17's pull time dead (16 percent), 87 s of the +18's

Böllerbob died 0 times, Kelimdall once. At 7 of the 10 deaths Divine Shield or Divine Protection was ready and unpressed. A health potion was ready at all 10 and he drank none in five keys. At 7 deaths his last button was Final Verdict or Divine Storm below 65 percent with Eternal Flame castable; he pressed Eternal Flame in the last 5 s of 0 deaths. Four of his 16 Divine Shields went out at 100 percent with nothing landing. Dead time alone is about 50M in the +17 (11 percent of the meter) and 30M in the +18.

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

Save buttons: when a hit is coming that Protection or Shield cannot cover, the next spender is Eternal Flame on himself, and the Concentrated Silvermoon Health Potion goes down too. It does not share a cooldown with Recklessness, and both references drink it in these keys (returns of 26K to 510K by the next press, median about 190K, which covers three of his death margins of 8K, 41K and 131K). This is about the lethal moment, not a health threshold: the references themselves press damage spenders at 50 percent all the time.

### 2. Press cadence: queue the next button, above all under lust and inside Wings

Under lust (Narìx's pet Primal Rage, four times in the +18 and three in the +17, 7 to 8 percent of pull time, the references 9) he presses 53 to 57 GCDs a minute against the references' 68 to 70. Median chained gap under lust 0.94 to 1.03 s against 0.77 to 0.80; gaps under 0.85 s: 20 of 135 (+18) against 90 of 135 (Böllerbob) and 83 of 132 (Kelimdall). The haste is on him (his swing timer drops from 1.71 to 1.32 s, the same as theirs); the presses do not follow it. About 107 presses short across five keys, up to 3.6 percent of damage, and the whole of his press deficit outside the deaths sits here.
Inside Wings without lust the same habit at a smaller scale: 1.106 s per GCD (+18) and 1.086 (+17) against 0.994 (Böllerbob) and 0.999 to 1.034 (Kelimdall), same GCD floor, so it is not haste. 32 percent of his chained Wings presses come 1.10 s or more after the previous one against 7 to 9.5 percent: 1.1 to 1.7 GCDs per window, 42 to 68 Wings GCDs in the +18, at 278 to 290K direct each. Standing pauses with a spender ready: 34 (38 s) in the +18, 13 with a Divine Purpose up, 9 inside Wings; Kelimdall 7 (7 s), Böllerbob 1.
Zaen freight: Execution Sentence 14:43.9 and Wings 14:44.2 with the Fel-Infused Freight on him, then no GCD until 14:52.5 (8.4 s); Wings #12, 16:07.2 to 16:15.7 (8.5 s, Steed plus Protection). Those two windows did 4.5M each. Both references kept hitting through the carry (Kelimdall 32 GCDs in a 36 s carry, a full Wings inside it). Protection and Steed are off the GCD.
Rule: the next button goes in during the last 0.3 to 0.4 s of the current GCD, every GCD, so the gap closes at the GCD and not after it. Under lust that is a press every 0.75 s. After every spender in Wings: 3+ Holy Power, next spender; under 3, Hammer; otherwise Blade. Never wait on a free proc.

### 3. Divine Arbiter: the glow decides the next spender, not the pack size

Mechanic, proven on all ten keys: a free Final Verdict grants an Arbiter that fires ONLY from Divine Storm; a free Divine Storm grants one that fires ONLY from Final Verdict. Pressing the same spender again leaves it sitting, and every Divine Purpose spent meanwhile grants nothing. He pressed the same spender while an Arbiter sat about 100 times in the +18 and 93 in the +17, 304 across five keys (Böllerbob 22, Kelimdall 4 to 12 a key). Divine Purpose procs that granted no Arbiter: 21 per Murder Row key (references 0 to 3). Conversion 81 and 73 percent against 95 and 89 to 93. Arbiter share of damage 9.0 and 8.1 percent against 10.0 and 9.7 to 10.7. About 21 Arbiters lost per key, 6 to 12M, 1 to 2.6 percent. The +12s show the same habit (49 and 36), so it is not death stress.

Zaen +18, 14:12.0: free Divine Storm grants the Final-Verdict-firing Arbiter; then Divine Storm 14:15.7, 14:16.9, 14:19.0 (free, wasted), 14:20.3, 14:22.9, 14:25.1 (free, wasted), 14:26.3, 14:27.5 (free, wasted), 14:29.0, 14:31.3; the Arbiter expires at 14:32.1 unfired. One Final Verdict at 14:15.7 fires it and the three free Storms would each have granted another.
Lithiel +17, 30:12.0: free Final Verdict grants the Storm-firing one; 11 Final Verdicts follow to 30:31.5, the free ones at 30:20.1, 30:26.9 and 30:30.3 grant nothing, it expires at 30:32.0.
Rule: after a free Final Verdict the next spender is Divine Storm, on one target too; after a free Divine Storm the next spender is Final Verdict, in a ten-pack too. Never the same spender twice while the Arbiter is up.

### 4. One macro for the window: Wings, Execution Sentence, trinket and potion on one press; then Wake, free Final Verdict, spender, Divine Toll by +5 s

The casts show the setup. Execution Sentence never shares Wings' timestamp (0 of 97 presses; it comes a median 0.33 s before Wings on a separate key); the potion was never on it (3 drunk in five keys, 0 inside any of 92 Wings windows; the references 5 per key, each on or just after the Wings press, 34 of 143 windows). Böllerbob fires Wings, Execution Sentence, trinket and potion within 0.6 s of one press every time. The separate key is also how two Execution Sentences went out without Wings in Den (14:02.9 at the Sentinel of Winter pull and 18:16.9 on Loa Speaker Nanea, Divine Toll following each), after which Wings sat held 76 s and 73 s.
Then the window. Wake came within 1.2 s of Wings in 27 of 92 windows (references 139 of 143): he presses a spender or two first at 4 to 5 Holy Power, or presses Wings while Wake is still on cooldown (10 of 28 and 8 of 22 times in the Murder Rows; the references hold Wings a second or three for Wake, 38 of 41 times). Divine Toll landed inside Execution Sentence in 53 of 92 windows (references 142 of 143), at +8.9 s (+18) and +7.2 s (+17) against +4.9 to +5.5; 10 of 78 Divine Resonance Hammers fell outside Wings (references 0). On Taz'Rah the Toll was ready at 9:11.2, Wings ran 9:14.2 to 9:34 with 4 Hammers and 2 Blades and no Toll, and the Toll went at 9:44.4 outside Wings; 1 of his 3 boss Wings there got a Toll (Kelimdall 3 of 3). When Wake went on the Wings press, his Toll averaged +6.0 s and 12 of 12 landed inside the hammer; when Wake was late, +11.1 s and 5 of 15.

His 20:21.7 (+18, 5 targets): Execution Sentence 20:21.0, Wings 20:21.7, Divine Storm 20:22.3, Wake 20:23.4, Divine Storm, Final Verdict, Hammer, Divine Storm, Hammer, Divine Storm, Final Verdict, Blade 20:32.1, Divine Storm, Divine Toll 20:34.1 (+12.4 s, Execution Sentence gone at 20:31.1).
Böllerbob's 8:35.9 (+19, 8 targets): Blade 8:34.2, then Wings + Execution Sentence + trinket + potion on one press at 8:35.9, Wake 8:36.6, free Final Verdict 8:37.8, Divine Storm 8:38.9, Divine Toll 8:39.9 (+4.0 s), Divine Storm, Hammer, Divine Storm, Divine Storm, Hammer, Final Verdict, one press every 1.0 s.

The window to run (second marks from both references):
- minus 1.5 s: last normal GCD. Holding 3 or more, spend here, never between Wings and Wake.
- 0.0: Avenging Wrath, Execution Sentence, Voracious Heart and Potion of Recklessness on one press. The potion only fires when ready, so the macro is safe; that is 7 potions in the +18 at 0:35, 5:47, 11:18, 17:36, 23:45, 29:00, 35:01.
- 0.7 to 1.1: Wake of Ashes, at any Holy Power, 5 included. The references overflow 3 on it in 16 of 19 and 18 of 23 windows and still out-damage the window. If Wake is up to 4 s from ready, wait for it.
- 1.6 to 2.3: Final Verdict, on packs too. It is free, carries Empyrean Legacy, and its Divine Storm fires the Arbiter.
- 2.5 to 3.4: the next spender (Divine Storm on 2+, Final Verdict on 1; with an Arbiter up, the other spender).
- 4.0 to 5.5: Divine Toll, with about 5 s of Execution Sentence left for its Hammers. Never press Hammer or Blade while Toll is ready inside Wings. It shares Wings' 60 s cooldown, so once it sits at +5 it stays at +5.
- to 24 s: spender at 3+, Hammer of Wrath under 3, Blade only with no Hammer charge, every press queued.
- +30: the mid-cycle Wake the moment it returns, even at 3 to 5 Holy Power. His came a median 35.0 s after Wings (Kelimdall 30.6); that is why Wings keeps opening without it. Lithiel +18: Wings at 33:59.5, 35:00.8 and 36:03.8 found Wake 3.9, 6.9 and 8.7 s away, so Wake landed at +5.0, +8.9 and +10.3 and Divine Toll at +19.0, then not at all.
Kelimdall's variant, worth copying on packs the tank is still gathering: Wings + Wake, free Final Verdict, Execution Sentence at +2.1 to +2.6 (so its first hit catches the whole pack), Divine Toll +4.9. His Execution Sentence collects 52 percent of its window's damage against 41 to 44 for Mcpounding's early press. Either order is fine; what is not fine is the Toll outside the hammer.

### 5. Boss cooldown timing: walk in with Wings ready, press it on the pull and on cooldown; Kystia is the one exception

Wings sat ready and unpressed for 27 percent of his alive boss time on Den's three bosses (Kelimdall 4 percent on the same three), 30 s on Taz'Rah (Kelimdall 4 s) and 38 s on Zul'jan (9 s). Sentinel of Winter: Wings was ready at the pull and first pressed at +76 s, one Wings in a 135 s fight (Kelimdall +2, +65, +127). The Hoardmonger: the third Wings came back at +124 s and was never pressed before the kill at +148. Taz'Rah: the previous Wings went on the dying last pack 44 s before the pull, so the first boss Wings came at +25 s, and the next two went 8 to 11 s late. Zul'jan: one spent 21 s before the pull, first boss Wings at +59 s. A boss Wings window is 3.5 to 4.4M of his damage in these keys; those bosses ran at 123 to 156K against Kelimdall's 205 to 237K.
Rule: when a boss pull is under a minute away, hold Wings for it (Kelimdall did before Taz'Rah and all three Den bosses). Press it within 2 s of the pull and again the moment it returns.
Kystia (Murder Row) is the exception: about 20 to 25 s after the first target stops taking damage, the second takes 4 to 8 times normal hits. Kelimdall opened Wings + Wake + potion at +67 s into that phase: 30.8M inside it. Böllerbob held Wings 113 s (ready at 4:22, pressed 6:15.4 with the potion) for it: 37.2M. Mcpounding's Wings #7 at 9:14.0 went 15 s early, spent its first 12 s on the first target (Final Verdicts at 50 to 67K against 174 to 473K after the switch at 9:26.6), 9 s landed in the burn, no potion, about 9M; his best 5 s bin was 2.8M against 14.0M and 10.4M. Kystia DPS over alive time 196K against 443K and 446K. Rule: no Wings and no potion before the burn; when the first target dies and the second starts taking the big hits (about +65 to +80 s), Wings + Wake + potion. Hold Wings up to about 15 s for it, Wake as long as it takes.
Xathuux: add waves near +20, +75 and +135 s. Both references pressed Wings + Wake at about +15 s, then +76 and +138. He pressed Wake at the pull (23:11.5) with Wings 22 s from ready, so Wings came at +36 without Wake, after the first wave, then +103 and +165. If Wings is not ready at the pull, do not Wake at the pull; Wings + Wake at about +15 s, then on cooldown.
Zaen and Lithiel: Wings at the pull, as now.

### 6. Hammer of Wrath inside Wings, where Blade of Justice is the last button

Inside Wings every Hammer also casts a Blade of Justice (Walk Into Light, 107 of 109 presses, 203 ms later) and nets 3 Holy Power, about 5 for the three Divine Resonance repeats after Divine Toll; a manual Blade gives 2. A Wings Hammer press is worth 335 to 362K of his direct damage, the Blade 105 to 114K. Hammers per Wings window 3.8 to 4.2 against 4.8 (Böllerbob) and 5.0 to 5.6 (Kelimdall). What separates him from the references is not the Blade count (Böllerbob presses more Wings Blades per window than he does) but Blades pressed 6 s or more after the last Hammer, with a charge back: 42 in his five keys against 0 in the references' seven. Hammer sat at 2 charges for 45 and 38 percent of his Wings (29 to 33). After Divine Toll his three Divine Resonance Hammers take a median 11 s (7.9 to 9.6).

Zaen +18, Wings 13:29.3: Hammer 13:37.3, Divine Storm, Blade 13:39.2 (3 Holy Power), Divine Storm, Final Verdict, Divine Storm, Blade 13:44.1 (1, Art of War), Divine Storm, Blade 13:46.3 (3, Art of War), Divine Storm, Divine Storm, Blade 13:49.4 (2, Art of War), Divine Storm, Final Verdict, Hammer 13:52.6. Four Blades and no Hammer for 15.3 s with both charges sitting.
Rule: at 0 to 3 Holy Power in Wings, Hammer whenever it has a charge, glowing Blade or not (the Hammer's free Blade uses the Art of War proc anyway). After Divine Toll, the next three non-spender globals are Hammers. Blade in Wings only with no Hammer charge and under 4.
This also carries the Judgment stacks: his boss Wings end with 6 to 7 Judgment stacks on the boss against 8 to 10, which is most of his Judgment uptime gap (66 and 71 percent alive against 79 to 81) and Expurgation gap (83 and 84 against 92). Outside Wings his Judgment pressing matches the references. One habit: when Wings ends, Judgment has both charges, so below 4 Holy Power the first global after Wings is Judgment, not Blade.

### 7. Eternal Flame at full health

25 Eternal Flames in the +17: 18 paid (54 Holy Power) and 7 free. Ten of the paid ones went on himself at 99 to 100 percent (11:56.2, 12:50.9, 14:38.4, 20:36.8, 21:52.9, 24:45.5, 26:31.3, 26:56.9, 28:46.8, 29:58.8), six inside Wings, five at 5 Holy Power; 28:46.8 on Lithiel was 5 Holy Power inside Wings and Execution Sentence with 15 targets near at full health. The 7 free casts granted no Arbiter, 4 of them at 98 to 100 percent inside Wings. The healer had been back since 8:57. Den +12 with the healer alive: 8 of 14 at 100 percent. References: Böllerbob 1 paid (at 87 percent after 532K in 3 s), Kelimdall 4 (100 with the heal over time already up, 71, 52, 79). About 4 to 5M, 1 percent of the +17.
Rule: never at 100 percent health, and never with a free Divine Purpose unless someone would die. The references cast theirs around 85 percent with damage incoming; there is no lower threshold to copy.

### 8. Gear: one ring moves crit above haste and gives the second embellishment

Sheet: mastery 1233, haste 1026, crit 726, versatility 169. Böllerbob 1172 / 870 / 1014 / 157; Kelimdall 1241 / 878 / 987 / 105; Murlok top 50 mastery 1163, crit 1097, haste 737. The rings are the cause: Sickening Signet of Atroxus (321) carries 258 haste and no effect; Band of the Swarmcaller pulls its weight (Acidbrood Scourge 0.8 to 1.1 percent of his damage). Gems and enchants are the references' set at max rank.
He runs one embellishment, not two: the bracers carry Arcanoweave Lining; the crafted girdle carries Lucky Keychain (+1 Sparkle, nothing in combat). The top 50 fill 99 of 100 embellishment slots, mostly Loa Worshiper's Band (40) and Stabilizing Gemstone Bandolier (36).
- Craft Loa Worshiper's Band (331, +228 crit +171 mastery, socket, embellished) in place of Sickening Signet: about 954 crit, 770 haste, 1291 mastery, the order both references and the top 50 run, and the second embellishment in one item.
- Next bracer recraft: Stabilizing Gemstone Bandolier (doubles the Loa band; Böllerbob's pair).
- Next crafted piece Crit/Mastery, boots first (Poison-Proof Stompers, 321, haste/vers).
- Helm socket (Season 2 Miasmic Jewelbinder, Vaultkeeper Elysa, Silvermoon, 6 Thalassian Tokens of Merit); both references have it. Four gems against six and five.
- Myth-track vault picks on the eight 321 slots, ring first if the Loa band is not ready, then boots, then cloak. Do not chase a fifth tier piece; the set has no 5-piece.
Not simmed: run Raidbots Top Gear before crafting.

### 9. Kicks

Rebuke landed 54 of 88 across five keys (61 percent) against Böllerbob's 28 of 33 (85) and Kelimdall's 132 of 167 (79); 0.70 kicks a minute against 1.10 to 1.27. Eleven of the 26 Rebukes in the +18 landed nothing and 3 were aimed at the boss itself. Kick the cast, not the mob.

### 10. Not his: raid buffs, pull size, route

- Lust is parity (an analyst first reported "no lust in either key"; the verifier queried the report and refuted it: Primal Rage from Narìx's pet at 0:33.7, 13:30.3, 23:32.5 and 32:57.2 in the +18 and three times in the +17). The pull now fetches buffs from every friendly source. What he lacked and the references had: Skyfury (2.8 to 3.0 percent of their damage, measured), Mark of the Wild, Battle Shout (Böllerbob only) and probably Chaos Brand (Kelimdall only); the last three are standard values, not measured here. Judge his Murder Row DPS against the references minus about 5 percent.
- Trash ran at 6.8 to 7.1 targets per Divine Storm against 8.4 (Kelimdall) and 11.5 (Böllerbob); 8 trash pulls over 1108 s against 6 over 703. About 34K per extra target on his own pulls. Compare his trash with Kelimdall's +18, not Böllerbob's.
- Route: both Defiled Golem pulls (27:34.6, 294 s at 5.4 targets; 36:34.4, 64 s at 2.8 targets after Lithiel died) cost 358 s and three Defiled Slam deaths. Both references go Wrathguard Flayer, Corrupted Warlock, Lithiel and skip the Golem. Raise it with the tank.
- The 37-minute clock does not lower the meter (he was in combat 87 percent of the key against 84 to 85); the gap is damage per pull-second, 299K against 515K.

Cleanup, one line each: 7 Blinding Lights hit nothing (one GCD each); at 5 Holy Power spend before Judgment (5 overflowed Judgments in the +18); Altar of Fangs started with no food buff.

## Sources found on YouTube, Season 2

Used (auto-captions pulled and read): NinoMMO, "The ONLY Ret Paladin Guide You Need | Midnight Season 2" (17 Oct 2026); Felipe Neli, "GUIA COMPLETO PALADINO RETRI MIDNIGHT, Do Basico ao Avancado + Tier Set S2" (4 Oct 2026, Portuguese auto-translated, the most detailed); Myuvilo, "Retribution Paladin | Guide | Beginner | WoW | Midnight 12.1" (28 Sep 2026); Lightblade Gaming, "Midnight - Retribution Paladin Season 2 Full Guide Patch 12.1" (15 Aug 2026, recorded before launch). Season 1 context only: NeekapHere, "Herald of the Sun is BACK On the Menu" (27 May 2026); Melee, "Rank 1 Retribution Paladin Rotation Guide for M+" (12 Mar 2026). Written: Method Playstyle and Rotation and Talents (12.1.5, 13 Oct 2026), Maxroll M+ guide (12.1.5), Murlok top-50 Herald M+ data.
Found, no captions available, not read: Javier, "Retribution Paladin Midnight Season 2 Beginner Raid & M+ Guide" (13 Aug 2026); Saltii, "One Button Retribution Paladin Guide | WoW Midnight" (16 Aug 2026); Thematicz Gamez, "Ret Paladin UPDATED Build Guide For Midnight Season 2 | BIG DAM Praise The Sun" (6 Sep 2026) and "This Ret Paladin Build MELTS Mythic+ | +16 Altar of Fangs Review" (8 Sep 2026).
