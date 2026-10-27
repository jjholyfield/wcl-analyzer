# Retribution Paladin, Midnight Season 2 (12.1.5): the rules as the guides state them

Sources: seven extracts, distilled 2026-10-27, for grading a Herald of the Sun Mythic+ log. One written-guide file (Method, Maxroll, Murlok) and four videos are Season 2. Two videos are Season 1 and are marked [S1]. This is the verified edition. Section 15 lists every correction.

Names are normalized from the auto-transcripts:
- "Harold of the Sun" and "favorite of the sun" = Herald of the Sun.
- "Wings" = Avenging Wrath.
- "Divine Arbitrator", and the translated "Divine Judgment", = Divine Arbiter.
- "Final Reckoning" in Felipe Neli's video = Execution Sentence.
- "Inner Light" = Light Within. "imperium legacy" = Empyrean Legacy. "Sunseer" = Sun Sear. "out of war" = Art of War. "in the session" = Intercession.

Item names the transcripts garbled are marked (as transcribed). Method, Maxroll and Murlok are quoted from the fetch notes of 2026-10-26, not from the live pages. Figures marked (tooltip) come from Wowhead tooltips (live 12.1.5) saved during extraction. They are data for the grader, not a guide's rule. A cut-off marked (grading tolerance) was chosen by the synthesizer where the sources give only words. Myuvilo's macro text comes from his video description, pulled with yt-dlp. The video itself only says the macro is in the description.

Log figures
- A [log: ...] tag carries a figure measured from the logs on 2026-10-27. It is not a guide's word.
- The figures come from the per-key flow files (*-flow.txt), the audit comparison (_compare.txt) and the decoded talent strings (gear-talents/decoded.json) in the ret-guides folder.
- The player's keys: Murder Row +18, Voidscar Arena +17, Murder Row +17. Three player figures are given in that order.
- The references: Böllerbob (Murder Row +19) and Kelimdall (six +18 keys: Den of Nalorakk, Voidscar Arena twice, Altar of Fangs, Murder Row, Ruby Life Pools).
- "All ten flows" means those three, one and six keys.

Transcript repair. The plain-text transcripts dropped any caption line that repeated an earlier one word for word.
- Myuvilo's lists were rebuilt from its caption file during extraction.
- Lightblade lost only filler.
- NinoMMO lost three lines, and one sits inside the AoE list. The caption file (Jpkqk31FKPY.en-orig.vtt) reads "Blade of Justice with two stacks of Art of War if Avenging Wrath is not active" there too. The extract's note that the AoE line has no Art of War condition is wrong. This rulebook follows the caption file.

## 1. Sources

1. Method, "Retribution Paladin Playstyle and Rotation" and "Talents" (written, method.gg).
   - Patch 12.1.5, updated 2026-10-13. Current.
   - The spine of this rulebook: the Herald opener, both Herald priority lists and the talent strings.
   - The rotation page has no Mythic+ section. It does not cover Divine Purpose, Dawnlight or Empyrean Legacy.
2. NinoMMO, "The ONLY Ret Paladin Guide You Need | Midnight Season 2" (YouTube Jpkqk31FKPY, 2026-10-17, about 11 min, auto-transcript).
   - Season 2, no patch named. Current, and the newest source.
   - Herald lists close to Method's, plus an Empyrean Legacy line.
3. Maxroll, Retribution Paladin Mythic+ guide (written).
   - 12.1.5. The header says updated 2026-10-20, but the changelog's latest entry is 2026-08-04.
   - Current, but it pairs Templar with both its builds and describes Herald without recommending it.
   - Its Holy Power, cooldown, tier and Dawnlight notes are used here. Its priority lists are Templar lists and sit in section 12.
4. Murlok.io, Herald of the Sun Retribution Mythic+, top 50 players (US, EU, KR, TW, rating 4013 to 4277).
   - Labelled Patch 12.1, refreshed every 8 hours, read 2026-10-26. Current.
   - Data, not advice.
5. Felipe Neli (cited as Felipe), "GUIA COMPLETO PALADINO RETRI MIDNIGHT, Do Basico ao Avancado + Tier Set S2" (YouTube duOdqOB94MM, 2026-10-04, 43 min, Portuguese auto-translated).
   - Season 2, no patch named. Current. Herald with Crusading Strikes.
   - He calls Execution Sentence "Final Reckoning" 31 times: one ability, a 1-minute cooldown and a 10-second window. Grade every "Final Reckoning" rule as Execution Sentence.
6. Myuvilo, "Retribution Paladin | Guide | Beginner | WoW | Midnight 12.1" (YouTube _cYI32YNHFE, 2026-09-28, 8:34).
   - Season 2. Current, but a beginner guide with one loadout for all content.
   - It flags its own Divine Toll and Wake of Ashes placement as not optimal.
   - Its talent string decodes against the live 12.1.5 tree and holds every talent the player is known to run.
   - Its Avenging Wrath macro is in the video description, not spoken.
7. Lightblade Gaming, "Midnight - Retribution Paladin Season 2 Full Guide Patch 12.1" (YouTube ih7GEoRslSM, 2026-08-15, 26 min).
   - Season 2, recorded before launch: "our spenders got buffed in the PTR", and he will stream "when the new season actually starts".
   - Current with that caveat.
8. [S1] NeekapHere, "Retribution Paladin: Herald of the Sun is BACK On the Menu" (YouTube W7jkegQF-1M, 2026-05-27).
   - Season 1, 12.0.x. Not current.
   - Kept for the Hammer of Wrath rule in wings, which Season 2 sources repeat.
9. [S1] Melee, "Rank 1 Retribution Paladin Rotation Guide for M+ | Midnight Season 1" (YouTube yp5YBY1JP0U, 2026-03-12).
   - Season 1, Templar only. Not current.
   - Kept for generic habits only.

Read only as search-result summaries, not in full: Icy Veins (12.1.5), Mythistone, Overgear (about 67 days old), Expcarry (12.1), Timesaver (12.1 launch), and Wowhead's Season 2 guide by Bolas (12.1.5, updated 2026-10-13, body not retrieved). They are used only for the hero-tree question.

Not used: the source folder also holds captions for a NeekapHere video from The War Within Season 1 (y30v8bm427A). It is out of scope.

## 2. What changed for Season 2 / 12.1.5

Burst down, sustained up
- Avenging Wrath gives 15% damage and 15% crit, down from 20% crit.
  - Lightblade: "Divine Toll does 50% damage on judgments instead of 100. Wings only gives you 15% critical strike and 15% damage."
  - Maxroll: "+15% damage and crit (down from 20%)".
  - Method: damage, healing and crit chance up by 15%.
- Divine Toll's Judgment deals +50% damage, down from +100% (Maxroll).
- Lightblade: "our burst damage got a bit lower, but our sustained damage got higher".
- Maxroll's 12.1 changes: Final Verdict +15%, Divine Storm +15%, Blade of Justice +40%, Judgment +50%.
- Art of War's Blade of Justice bonus dropped from 150% to 80% (Maxroll). Skyfury attacks no longer trigger Art of War (Maxroll).
- Mastery (Highlord's Judgment) was reworked. Judgment buffs your spenders and can proc extra Holy damage on the main target (Maxroll).

Hero trees
- Lightblade: "they also made Templar and Herald of the Sun work. Both talents are very close in terms of damage".
- Hammer of Light was nerfed (Lightblade). Templar only.

12.1.5
- Final Reckoning was removed and built into Execution Sentence (Maxroll's core-changes section). Its deep dive still calls Final Reckoning a 1-minute cooldown.
- Final Reckoning is not in the player's casts or in Murlok's top 50.

Tier set
- The new set gives a 2pc (Divine Power) and a 4pc (Divine Arbiter). Both are keyed off Divine Purpose (section 4).
- Method: "Season 2 tier set makes Tempest of the Lightbringer worth using in single target as well as AoE."
- NinoMMO: "Divine storm on single target? It sounds wrong, but with tier set, it's almost 9% more damage in the sims."
- Felipe expects the Season 3 set to be different.

Gear
- Arcanoweave Lining is dropped for Loa Worshiper's Band plus Stabilizing Gemstone Bandolier (Lightblade).
- Murlok still shows Arcanoweave Lining on 23 of 50.

Open from Season 1
- [S1] Melee says the Execution Sentence funnel was bugged at 10% instead of 20%.
- No Season 2 source says it was fixed. Felipe states 20%, and so does the tooltip.

## 3. Talents and hero talent for Mythic+

Herald or Templar: who says what, and when

For Herald
1. Method (12.1.5, 13 Oct): "Recommends Herald of the Sun for both Mythic+ and Raid; Templar is the favorite in short burst windows."
2. NinoMMO (17 Oct): "Herald of the Sun is best all-rounder for raid and Mythic Plus, and pretty much every top Mythic Plus player runs it." On Templar: "You trade sustained AoE damage for short burst windows and stronger defensives."
3. Felipe (4 Oct): "the strongest build this season".
4. Myuvilo (28 Sep): Herald, with one loadout for everything.
5. Murlok (live): 50 of 50 on Herald. "Templar: 0 of 50."
6. Mythistone (summary): 99% of the top 50 on Herald, from 4.1M runs. Icy Veins (12.1.5, summary): defaults to Herald.

For Templar, or a tie
7. Maxroll (changelog 4 Aug): Templar for both M+ builds. Herald is described but not recommended.
8. Lightblade (15 Aug, pre-launch): the two are close.
   - Templar is slightly ahead on pure single target.
   - Herald is "a lot better than Templar" when one or two extra targets live long enough.
   - Herald does "a lot more damage than Templar" above about 10 targets.
9. Search-result summaries:
   - Icy Veins: Templar is much stronger for burst AoE.
   - Expcarry (12.1): Templar is the M+ default, and Herald is viable for low-target cleave routes.
   - Overgear (about 67 days old): Templar is "clearly the best option".
10. [S1] NeekapHere: "Templar is still slightly better in all content, basically." Shelve.

Where it lands: every October source and the live top-50 data put Herald first. The Templar calls are older, or come from Maxroll, whose changelog stops in August.

The Herald M+ build (Method, "Herald of the Sun (Raid Cleave and Mythic+)")
`CYEAAAAAAAAAAAAAAAAAAAAAAAAAAAwoZbbmZWGzMzAAAAAAYmyYGmZsNmthZ2mxYMGmxCbAYWmtZmZrBBAAsAYAwYGGYGzMbAzMDjZMYA`

Decoded against the live 12.1.5 tree: 34 class, 34 spec and 13 hero points, Herald of the Sun.
- Spec: Blade of Justice, Divine Storm, Expurgation, Light of Justice, Avenging Wrath, Final Verdict, Holy Blade, Art of War, Jurisdiction, Tempest of the Lightbringer, Rush of Light, Holy Flames, Improved Judgment, Zealot's Fervor 2/2, Blade of Vengeance, Highlord's Wrath, Crusading Strikes, Blessed Champion, Burning Crusade, Blades of Light 2/2, Wake of Ashes, Divine Wrath 2/2, Execution Sentence, Seething Flames, Empyrean Legacy, Burn to Ash, Crusade, Light Within 4/4.
- Spec, not taken: Radiant Glory, Empyrean Power, Judge, Jury and Executioner, Heart of the Crusader, Judgment of Justice, Sanctify.
- Class: Lay on Hands, Cleanse Toxins, Fist of Justice, Blinding Light, Healing Hands, Guided Prayer, Divine Steed, Shield of Vengeance, Cavalier, Blessing of Freedom, Rebuke, Obduracy 2/2, Divine Toll, Unbound Freedom, Sanctified Plates 2/2, Punishment, Blessing of Sacrifice, Divine Resonance, Blessing of Protection, Consecrated Ground, Holy Aegis, Divine Purpose, Unbreakable Spirit, Lead the Charge, Inspired Guard, Light's Revocation, Seal of Might 2/2, Vengeful Wrath 2/2, Lightbearer, Blessing of Dusk.
- Class, granted: Auras of the Resolute, Hammer of Wrath, Greater Judgment.
- Hero: Dawnlight, Gleaming Rays, Eternal Flame, Luminosity, Endless Gleam, Will of the Dawn, Blessing of An'she, Sun Sear, Solar Grace, Aurora, Walk Into Light, Second Sunrise, Born in Sunlight, Sun's Avatar.
- Method also gives a Herald Single Target (Raid) string. It is for raid and is not decoded here: `CYEAAAAAAAAAAAAAAAAAAAAAAAAAAANbbzMzywMDAAAAAAzUmtZYmx2Y2GmZbGjxYYGLsNAMLz2Mzs1gAAAWAMAYMDDMjZmNgZmhxMGMA`

Murlok's top 50 against that string
- Spec and hero: all 50 take every pick above, except Blessed Champion 49, Blade of Vengeance 49, Light of Justice 45 and Gleaming Rays 49.
- Class: the string skips Sacrifice of the Just (40 of 50) and Righteous Protection (33 of 50). It takes Lead the Charge (20 of 50) and Consecrated Ground (19 of 50).
- Method calls the class talents "largely interchangeable" and says "Spec tree has little flexibility."

The player's string [log: decoded]
- It takes Jurisdiction, Burning Crusade, Light of Justice, Crusade, Light Within 4/4 and Cleanse Toxins.
- In the class tree it takes Sacrifice of the Just and Righteous Protection where Method's string takes Lead the Charge and Consecrated Ground. Method calls the class talents "largely interchangeable" (rule 54).

What the videos add
- Lightblade: the Herald M+ 1-minute build is "pretty much exactly the same as the 1-minute build from Templar". He uses it from about +14 keys. It takes:
  - Execution Sentence, "to funnel damage to your targets".
  - Tempest of the Lightbringer, "uncapped AoE, 20% of your Divine Storm".
  - Blade of Vengeance and Blessed Champion.
  - Divine Resonance: "instead of taking Quick Indulgence [Quickened Invocation], we are taking Divine Resonance because we really value those extra Judgements."
- NinoMMO: the M+ build differs from the raid build only by "a few talents around for more AoE". "Mythic Plus, you will need more interrupts and stuns than in raids."
- Felipe: Herald with Crusading Strikes.
  - The single-target version swaps the two AoE Blade of Justice talents for Heart of the Crusader.
  - His class tree is built for a season of bleeds and poisons: Improved Blessing of Protection.
  - Per dungeon he takes the talent that makes Blessing of Sacrifice remove and prevent poison and disease. The translation calls it "Unwavering Spirit"; Melee gives that effect to Righteous Protection. Otherwise he takes Brought to Light.
  - He takes Light-Forged Blessing when not on Improved Blessing of Protection.
  - Do not buy the 1-minute Blessing of Sacrifice if you will not press it.
- Myuvilo's beginner string differs from Method's:
  - It takes Swift Justice over Light of Justice, Heart of the Crusader 2/2, and Sacrifice of the Just.
  - It skips Jurisdiction, Burning Crusade and Light's Revocation.
- [S1] NeekapHere:
  - Tempest of the Lightbringer is "definitely the superior pick to Sanctify" for Herald.
  - Divine Resonance against Quickened Invocation is close. He leans Divine Resonance for single target in M+.
  - His Empyrean Power pick is not the player's. The player runs Empyrean Legacy.

Crusade is part of this build
- All 50 Murlok players take Crusade alongside Avenging Wrath, and both strings take it.
- (tooltip) "Avenging Wrath now grants you 2% Haste. Each Holy Power spent during Avenging Wrath increases Haste by an additional 2%, up to 20%."
- So Method's note "with Crusade you gain haste per Holy Power spent, up to 20%" applies to the player's Avenging Wrath. Do not shelve it.

Shelved
- [Radiant Glory] Lightblade's Herald 30-second build and NinoMMO's "easier playstyle" both take Radiant Glory in place of Execution Sentence. Not the player's build.
- [Templar] Every Templar build is in section 12.

Apex talent: Light Within, 4 points (Method)
1. Point 1 "raises Blade of Justice damage by 80% while Art of War is active and lets Art of War stack to 2 charges".
2. Points 2 and 3 "raise spender damage during Wings for a total 20% to Divine Storm and Final Verdict".
3. The last point makes Blade of Justice deal Holy damage to the main target, and AoE damage to enemies between you and it.

Other notes on it:
- Felipe ("Inner Light", "the capstone"): Art of War empowers the next Blade of Justice to splash in front of you, and Blade of Justice resets Art of War's cooldown.
- Maxroll: "Light Within rank 3 reduces it by 25%". It does not say what is reduced. Not graded.

## 4. The mechanics

Holy Power economy
- Myuvilo: "You can have a maximum of five holy power at any given moment. Everything you generate above that gets wasted."
- Every spender costs 3: Final Verdict, Divine Storm, Eternal Flame (Myuvilo).
- Generators (Myuvilo):
  - Blade of Justice: 2.
  - Judgment: 1. It becomes Hammer of Wrath in wings, also 1.
  - Crusading Strikes: 1.
  - Wake of Ashes: 3.
  - Divine Toll: 1 per target hit, up to 5.
- Walk Into Light. No guide gives its Holy Power. (tooltip) It will "generate 2 Holy Power after casting Avenging Wrath".
  - [log: confirmed. Its resource events run at 1 point each, about 2 per Avenging Wrath press: 64 over 29 Wings for the player in Murder Row +18; 40 over 19, 48 over 23 and 42 over 20 for the references.]
  - Count it as a separate generator (rule 1). [log: the player wasted 26 of its 64 points, 6 of 22 and 12 of 48; the references 7 to 15 of 40 to 48.]
- In wings, Walk Into Light makes each Hammer of Wrath cast a Blade of Justice, and that Blade generates 2.
  - [log: Blade of Justice resource events exceed manual presses by as many as the Hammer of Wrath presses plus the in-wings Divine Tolls, to within 10 per key in all ten flows. Player, Murder Row +18: 346 events, 207 presses, 109 Hammers plus 27 Tolls. Böllerbob: 262 events, 151 presses, 91 Hammers plus 19 Tolls.]
- The in-wings values that follow:
  - Hammer of Wrath gives 3 (1 plus 2). It is exact at 2 Holy Power and wastes at 3 or more. The three Divine Resonance repeats after Divine Toll give about 5: a repeat Judgment point lands at the press and a second Hammer of Wrath point about 0.3 s later, on top of the Hammer's 1 and the Blade's 2. Those presses are exact at 0 and waste at 1 or more. [log: 4.9 to 5.2 Holy Power on the Resonance presses against 3.0 to 3.1 on the other in-wings Hammers, Crusading Strikes excluded, in all ten flows; they are 51 to 63 percent of in-wings Hammer presses, 68 of 109 for the player in Murder Row +18]
  - Divine Toll gives targets hit plus 2, up to 7 (one Blade; see Divine Toll below).
- Felipe: under the tier set, the spender that consumes Divine Purpose "grants holy power when it activates". He gives no amount. [log: it grants none. No resource event from Divine Power or Divine Purpose appears in any of the ten flows (13.15).]

Crusading Strikes
- Method: "with Crusading Strikes auto attacks generate 1 Holy Power, avoid wasting it."
- Felipe: every auto attack triggers a Crusader Strike for 1 Holy Power. It is a large share of generation, and of damage, especially on one target.
- Maxroll: "Crusading Strikes usually gives Holy Power on the second auto." It does not hold for this build (13.12).
  - [log: Crusading Strikes resource events run at 28 to 33 per alive minute in all ten flows (player 971 in 31.4 min; Böllerbob 675 in 22.0; Kelimdall 663 in 21.8), about one every 2 seconds. A second-auto rule would need a swing about every second. Every auto generates.]
- Myuvilo: "For crusading strikes, always stand in melee range." Felipe's ranged dummy demo ran out of Holy Power.
- [S1] Melee: track your next auto attack, so its Holy Power does not overcap you.

Art of War, stacking to 2
- Auto attacks have a 15% chance to reset Blade of Justice (Maxroll, Felipe).
- With Light Within, Blade of Justice deals 80% more while Art of War is up, and Art of War holds 2 stacks (Method).
- NinoMMO: "but if you sit at two stacks and keep pressing other buttons, every new proc is wasted. So, spend them fast."
- Inside wings, do not press Blade of Justice to spend it. Each Hammer of Wrath casts a Blade of Justice, and "it will consume the procs" (Felipe).
- [S1] Melee: the Art of War Blade of Justice "throws out a cone frontal" that must point at the mobs. Method's last Light Within point hits enemies between you and the target.

Divine Purpose and the tier set
- Divine Purpose procs from spenders and makes the next spender free (Myuvilo).
- Its chance is 10% base, 20% with the set. Felipe: "instead of a 10%chance to activate it for free, I have a 20%chance for my abilities to be free." Maxroll: "the 2-piece adds a 10% proc chance".
- Herald: every Wake of Ashes grants Divine Purpose (Maxroll, Felipe, Myuvilo's opener).
- 2pc, Divine Power. Maxroll: "consuming it grants Divine Power, +10% Holy damage for 12s." Felipe reads it as the consuming spender dealing 10% more Holy damage and granting Holy Power. [log: no Holy Power; Maxroll's reading stands (13.15).]
- 4pc, Divine Arbiter. Maxroll: "consuming Divine Purpose grants Divine Arbiter, which makes your other Holy Power spenders launch an arbiter of light at the primary target dealing Holy damage to enemies within 8 yards". It "cannot occur while Divine Arbiter is active."
  - Felipe's tooltip read: 65,000 Holy damage to the primary target and 30,000 within 8 yards.
- NinoMMO: "And it only fires off your other spender."
  - If Final Verdict consumed Divine Purpose, Divine Storm cashes the Arbiter.
  - If Divine Storm consumed it, Final Verdict cashes it.
  - Lightblade, Myuvilo, Felipe and NinoMMO all say this.
- NinoMMO: "pressing the same spender again just leaves the proc sitting there and it blocks your next one." Felipe: "You lost three chances to gain a proc. Don't do that."
- The empowered spender still costs Holy Power. Felipe: "Sometimes I'll need to generate to be able to spend."

Dawnlight and Sun's Avatar
- Maxroll: "Wake of Ashes makes your next two spenders apply Dawnlight; Avenging Wrath/Crusade applies it to four nearby targets and starts Sun's Avatar".
  - [log: the Avenging Wrath half does not show in this build. No Dawnlight debuff was applied at any of the 206 Avenging Wrath presses in the ten flows; every application lands with a spender after Wake, 1.8 to 2.4 per Wake. Rule 57 is shelved on it.]
- Maxroll: "Dawnlight DoTs boost spenders by 5% and each application grants 2% haste for 12s."
- Lightblade: "You got your Dawnlights that uh hit everything, reduced after five, but hit everything, and you're going to have three of them applied uh in most AoE packs." Targets must live long enough to give full value.
- Sun's Avatar pulses AoE along "the yellow lines that connect the Dawn Lights when you have cooldowns" (Lightblade).
- Sun Sear ("Sunseer") applies a DoT whenever Divine Storm crits (Lightblade).
- [S1] NeekapHere: much of Herald's damage runs through Dawnlight.
- [log: Dawnlight plus Sun's Avatar dealt 12.0 percent of the player's damage in Murder Row +18 (5.9 plus 6.1), against 10.7 for Böllerbob and 11.0 for Kelimdall in the same dungeon.] Rules 56 and 58 grade it; 57 is shelved.

Blessing of An'she
- No guide covers it. (tooltip) Walk Into Light grants it after Avenging Wrath. DoT and HoT ticks can also proc it. It raises the next Judgment's damage by 50%. No rule exists to grade it.
- No source explains the log's "Hammer of Wrath (usable proc)" buff. [log: it led to no Hammer of Wrath press outside wings in any of the ten flows.] Treat Hammer of Wrath as wings-only.

Empyrean Legacy
- Myuvilo: "This procs once when pressing avenging wrath".
- NinoMMO: "And Empyrean Legacy procs after avenging wrath and it makes your next Final Verdict also fire off a stronger Divine Storm. So, don't skip it."
- (tooltip) "Avenging Wrath empowers your next damage dealing single target Holy Power ability to automatically activate Divine Storm with 25% increased effectiveness." A Divine Storm does not spend it.
- Spend it on Final Verdict, at 2+ targets too (NinoMMO, Myuvilo).
- In the opener, its Divine Storm cashes the Divine Arbiter that the same Final Verdict created (Myuvilo; section 5).

Hammer of Wrath and its charges
- During Avenging Wrath, Judgment becomes Hammer of Wrath (NinoMMO, Myuvilo, Felipe, Lightblade).
- They are one button. [log: Hammer of Wrath was never pressed outside wings, and Judgment never inside, in all ten flows.] A rule that needs Judgment and Hammer of Wrath ready at the same moment can never fire.
- NinoMMO: "The talent Walk into Light makes every Hammer of Wrath during Avenging Wrath also cast a full Blade of Justice. That's why Hammer of Wrath jumps ahead of Blade of Justice in your burst window." Felipe adds "at 100% effectiveness".
- It has two charges from Improved Judgment ((tooltip) "Judgment now has 2 charges"). Press it at two charges "to keep one rolling" (Myuvilo's AoE list; his single-target list gives no charge count).
- How hard to press it in wings:
  - Lightblade: "when you have cooldowns, you want to use uh Judgment as much as possible because it counts as a Blade of Justice."
  - Felipe: Hammer of Wrath "non-stop" in wings.
  - [S1] NeekapHere: "spam your Hammer of Wrath" between spenders on M+ bosses.
- (tooltip) Second Sunrise: Divine Storm and Hammer of Wrath have a 15% chance to cast again at 30%.

Judgment and mastery
- Felipe: Judgment makes enemies "take 20% more damage from your next Holy Power consuming ability". The Greater Judgment tooltip says the same.
- Felipe: "So, it's Judgment, Divine Storm, Judgment, Final Verdict."
- Method: "Keep Expurgation and Judgment debuffs on the target; this greatly increases damage, especially from spenders."
- Land the tier-empowered spender on a target that has the Judgment debuff (Felipe).
- Felipe says the debuff "has two charges", in a garbled passage. (tooltip) Highlord's Wrath reads "Judgment applies an additional stack of Greater Judgment if it is known", which fits two.
- Highlord's Judgment (mastery) was reworked. Judgment buffs your spenders and can proc extra Holy damage on the main target (Maxroll).

Expurgation
- Felipe: "When you use Blade of Justice, it leaves a damage-over-time effect on your opponents, and Divine Storm spreads this debuff to all targets." Open with Blade of Justice to apply it.
- Blade of Justice keeps Expurgation up for Holy Flames, which gives +5% Holy damage to targets with Expurgation (Maxroll).
- Method: keep it up.

Divine Toll and Divine Resonance
- Divine Toll casts Judgment on up to five targets. In wings it casts Hammer of Wrath on them instead.
- Felipe: "Divine Toll will also trigger an automatic Blade of Justice." One Blade, not one per target.
  - [log: the in-wings Divine Toll gain is 3 to 7 in 198 of 199 windows (one reads 8), which is targets hit plus 2. Blade of Justice events show one auto-cast Blade per in-wings Divine Toll.]
- Felipe: "The Judgment cast by Divine Toll deals 50% more damage."
- Divine Resonance: after Divine Toll, the next three Judgments are cast again at 100%. In wings they are Hammers of Wrath. Felipe says this; the tooltip reads "your next 3 Judgments cast again at 100% effectiveness". Each repeat also adds a Judgment point and a second Hammer of Wrath point, so those three Hammer presses give about 5 Holy Power, not 3 (the in-wings values above).
- In wings, Lightblade counts them as extra Blades of Justice: "double Judgements counts as double Blades of Justice".
  - [log: if those Blades are cast, they generate no Holy Power. Blade of Justice events match one per Hammer of Wrath press and one per in-wings Divine Toll to within 10 per key, far fewer than three echoes per Toll would add.]

Execution Sentence
- It has a 1-minute cooldown and a 10-second window (Felipe; tooltip).
  - It opens with a blast on everything within 10 yards.
  - After 10 seconds, the target takes 20% of the Holy damage dealt to everything the blast hit.
- NinoMMO: "execution sentence collects a part of the damage you deal to everything it hits and drops it on your target in the end. So, in AoE, keep pressing your AoE buttons until the hammer lands."
- Maxroll: "weak outside burst windows".
- [S1] Melee: the first cast must hit every target in the pack.
- Method: "Spend as much Holy Power as possible during Avenging Wrath and Execution Sentence to stack Crusade quickly and strengthen the final Execution Sentence tick."

Tooltip figures for grading (live 12.1.5, base values)
- Avenging Wrath: 20 seconds, 24 with Divine Wrath. Its cooldown in this build is 1 minute [log: shortest gaps between casts 60.0 to 64.1 s; 13.2]. The tooltip's 2-minute base is not used for grading.
- Execution Sentence: 1 minute. Divine Toll: 1 minute.
- Wake of Ashes: 30 seconds, 3 Holy Power.
- Blade of Justice: 12 seconds, 1 Holy Power plus 1 from Holy Blade.
- Judgment: 11 seconds, 1 Holy Power, 2 charges with Improved Judgment.
- Rush of Light: generator crits give 5% haste for 10 seconds.
- Born in Sunlight: Dawnlight crit chance +15% in Avenging Wrath.
- Will of the Dawn: movement speed only.
- None of the last three carries a rule.

## 5. The opener for Herald

Method, one target
1. Blade of Justice.
2. Avenging Wrath.
3. On-use items: trinkets and the combat potion.
4. Execution Sentence.
5. Wake of Ashes.
6. Final Verdict.
7. Final Verdict.
8. Divine Toll.

Then go into the single-target list. For AoE, Method says: "Replace Final Verdict with Divine Storm for AoE."

Why the second Final Verdict is not a same-spender mistake (Myuvilo): "This final verdict will use up the divine purpose proc you got from wake of ashes, and thanks to the divine storm from imperium legacy, divine Arbiter gets used at the same time."
- The first Final Verdict is free.
- It creates the Divine Arbiter.
- Its Empyrean Legacy Divine Storm cashes that Arbiter.

Variants
- NinoMMO (17 Oct), one target: "You run in with Blade of Justice and pop Avenging Wrath. Then Execution Sentence. Wake of Ashes. Final Verdict. Final Verdict. Divine Toll."
- NinoMMO, two or more targets: Blade of Justice, Avenging Wrath, Execution Sentence, Wake of Ashes, Final Verdict, Divine Storm, Divine Toll. The Final Verdict still comes first.
- Felipe (4 Oct), in order:
  1. Let the tank group the pack.
  2. Blade of Justice, to apply its DoT.
  3. Avenging Wrath, Execution Sentence and the top trinket from one macro, with the potion pressed by hand at the same moment.
  4. Wake of Ashes.
  5. Spend: Final Verdict on one target, Divine Storm in AoE.
  6. Divine Toll, inside the Execution Sentence window.
  7. Spend everything, then press Hammer of Wrath non-stop.
  - His summary: "Blade of Justice, Final Reckoning with Wings, trinket, pre-pot, Wake of Ashes, I spend some of my Holy Power, I use Divine Toll and continue doing my normal rotation".
  - And: "So, it is very important that during your burst, during your opener, and during wings, you do not use Blade of Justice."
- Myuvilo (28 Sep, beginner): Blade of Justice while walking in, the Avenging Wrath + Execution Sentence macro (it also fires both trinkets; the macro text is in his video description), Divine Toll, Wake of Ashes, Final Verdict for Empyrean Legacy, then Final Verdict again.
  - Most of his openers are the same for one target or many.
  - Divine Toll before Wake follows the order his lists flag as a beginner compromise.
- Lightblade (15 Aug, pre-launch): "Blade of Justice, Judgment, then we use Wings plus Execution Sentence, Wake of Ashes, spend, spend, spend again because of the proc, Divine Toll". This is the only Herald opener with a Judgment before Avenging Wrath.
- Maxroll (Templar-paired):
  - "Opener goal: reach 3 Holy Power with Blade of Justice then Judgment".
  - Execution Sentence goes before Avenging Wrath.
  - "delay Divine Toll and Judgment in openers if they would overcap".
- Felipe, for dangerous keys: have Blessing of Protection or Divine Shield up in the opener, because "dying is prohibited".

Arithmetic note (not a source rule; the Holy Power figures are the [log] values in section 4):
- Blade of Justice (2) plus Walk Into Light (2) put the opener at 4 when Wake of Ashes lands, before any Crusading Strikes autos. So Method's and NinoMMO's order wastes at least 2 on Wake.
- Myuvilo's order (Blade of Justice, Divine Toll, Wake) wastes more. In wings, Divine Toll gives targets hit plus 2, so at 4 it overcaps even on one target, and Wake then overcaps again.
- After Wake and Method's two Final Verdicts (the first is free), the opener sits at about 2. Its Divine Toll in wings then wastes targets hit minus 1: 4 at five targets.
- No source addresses this. Rule 12 reports the opener's Wake waste, and its Divine Toll waste at 2 or less, without grading them.

## 6. Priority lists for Herald

Press the highest line that is available. Method's lists are the spine, and video additions are marked.

Single target (Method)
1. Avenging Wrath. Method adds "skip with Radiant Glory"; the player runs Avenging Wrath, so this applies.
2. Execution Sentence.
3. Divine Storm when Divine Arbiter is active and you have 5 Holy Power.
4. Final Verdict at 5 Holy Power, or at 4 if the next auto attack is a Crusading Strikes.
5. Wake of Ashes.
6. Divine Toll.
7. Blade of Justice with Art of War, only while Avenging Wrath is not active.
8. Hammer of Wrath at 2 charges.
9. Divine Storm when Divine Arbiter is active.
10. Final Verdict at 4 Holy Power.
11. Hammer of Wrath.
12. Blade of Justice.
13. Judgment.
14. Final Verdict at 3 Holy Power.
15. Templar Strike and Templar Slash, if talented. The player is not (Crusading Strikes).

Additions and differences
- [NinoMMO, Myuvilo] Line 7 reads "Blade of Justice with two stacks of Art of War if Avenging Wrath is not active." Method says only "with Art of War".
- [NinoMMO] Lines 3 and 9 name where the Arbiter came from: "Divine Storm with a Divine Arbitrator proc from Final Verdict".
- [NinoMMO] Lines 10 and 14 are one plain "Final Verdict", and line 4 has no Crusading Strikes clause.
- [Myuvilo, no cooldowns] The Arbiter Divine Storm below 5 reads "at four holy power and less". It sits under Blade of Justice at 2 Art of War stacks and above plain Final Verdict.
- [Myuvilo, with cooldowns] The top of his list is the macro, then Divine Toll, then Wake of Ashes (beginner order).
- [Myuvilo, with cooldowns] His Hammer of Wrath line has no charge count: "blade of justice with two stacks [of Art of War] unless avenging wrath is active, hammer of wrath". Only his AoE list says "hammer of wrath at two stacks to keep one rolling".
- [NinoMMO, Myuvilo, Felipe] In wings, Hammer of Wrath takes Blade of Justice's place. Line 7 drops out, and each Hammer of Wrath casts a Blade of Justice.
- One button [log: 0 Hammer of Wrath presses outside wings and 0 Judgments inside, in all ten flows]. Lines 8 and 11 apply only inside wings. Lines 7 and 13 apply only outside.
- [Felipe] Outside wings:
  - When the tier proc lights Divine Storm, "I will use it as fast as possible".
  - Spend before the glowing Blade of Justice and before Judgment.
  - Judgment on cooldown, but never at 5.
  - Blade of Justice on cooldown.
- [Felipe] Inside wings: spend first, with the glowing spender before the others. Then Hammer of Wrath non-stop. Blade of Justice only when nothing else can be pressed.
- Felipe's spend-first order conflicts with Method's lines 7 to 14 (13.9).
- Reading of Method's list: at 5 Holy Power, or at 4 with a Crusading Strikes auto due, the spender (line 3 or 4) outranks Wake of Ashes, Divine Toll and every generator.

Two or more targets (Method)
1. Avenging Wrath.
2. Execution Sentence.
3. Final Verdict when Divine Arbiter is active.
4. Divine Storm at 5 Holy Power, or at 4 if the next auto attack is a Crusading Strikes.
5. Wake of Ashes.
6. Divine Toll.
7. Hammer of Wrath at 2 charges.
8. Blade of Justice with Art of War, only while Avenging Wrath is not active.
9. Final Verdict when Divine Arbiter is active (it appears in the list twice).
10. Divine Storm at 4 Holy Power.
11. Hammer of Wrath.
12. Blade of Justice.
13. Judgment.
14. Divine Storm at 3 Holy Power.
15. Templar Strike and Templar Slash. Not taken.

Additions and differences
- [NinoMMO, Myuvilo] Line 3 reads "Final Verdict with a Divine Arbitrator proc from Divine Storm at five Holy Power." Method gives no Holy Power condition.
- [NinoMMO, Myuvilo] After line 3, insert "Final Verdict with an Empyrean Legacy proc", above Divine Storm at 5. Method has no Empyrean Legacy line.
- [NinoMMO, Myuvilo] Line 8 reads "with two stacks of Art of War" (from NinoMMO's caption file).
- At 2+ targets, Hammer of Wrath at 2 charges (7) ranks above Blade of Justice with Art of War (8). On one target the order is reversed (Method, NinoMMO, Myuvilo). This never decides a press: line 8 holds only outside wings, and Hammer of Wrath exists only inside. [log: 0 Hammer of Wrath presses outside wings in all ten flows.]
- [Felipe]
  - Divine Storm "enters the spending priority starting from two targets".
  - Never press another Divine Storm over a glowing tier proc.
  - Keep Blade of Justice's DoT on every target.
  - Put Execution Sentence on the biggest mob that will live.
- [NinoMMO] During Execution Sentence, keep pressing AoE buttons until the hammer lands.
- [Lightblade] Dawnlights land on three targets in most packs.
- [S1, NeekapHere] Herald AoE leans on Divine Storm, "maybe eight times in a row".

## 7. Cooldown rules

Avenging Wrath with Execution Sentence
1. Pair them.
   - Method: "Pair Avenging Wrath with Execution Sentence when talented."
   - Felipe: "The most important thing is that your Final Reckoning and your wings are always aligned."
   - Myuvilo and Felipe press both from one macro.
2. Order.
   - Method: Avenging Wrath, on-use items, then Execution Sentence.
   - NinoMMO: Avenging Wrath, then Execution Sentence.
   - Maxroll (Templar-paired): Execution Sentence first.
   - Grade the pairing, not the order (13.3).
3. Use them on cooldown.
   - NinoMMO: "The main rule is use Avenging Wrath and Execution Sentence on cooldown. That's your burst window."
   - Felipe: "since Execution Sentence and Wings have a one-minute cooldown".
   - The cooldown is 1 minute in this build. [log: shortest gaps between Avenging Wrath casts 60.0 to 64.1 s in all ten flows; 13.2.]
4. Hold them only briefly.
   - NinoMMO: "If in doubt, send your cooldowns. Only hold them if you know a big pull or important adds are just a few seconds away."
   - Maxroll: do not hold Avenging Wrath "more than a few seconds".
5. Target: the mob that will outlive the hammer, usually the main elite of the pack. Felipe: "If you cast Final Reckoning on a guy who is dying, the Final Reckoning buff disappears and you lose the extra damage it was going to cause."
6. On a nearly dead pack, press Wake of Ashes alone and carry the big cooldowns to the next pack. Felipe: "you desync your cooldowns a bit, but you save your 'big cooldowns' for the next pack." This narrows rule 4. Rule 20 applies it only when the next pack follows within a few seconds.
7. Fill the 10 seconds.
   - Felipe: put wings, damage trinkets, Wake of Ashes, Divine Toll and as many Judgments or Hammers of Wrath as will fit inside it.
   - Method: spend as much Holy Power as possible.
8. Shelved to section 12: Maxroll's "aim for 3 Holy Power ready just before Execution Sentence comes off cooldown". It sets up Templar's Hammer of Light. For Herald, Walk Into Light's 2 and Wake's 3 overcap from 3 (3 + 2 + 3 = 8).
9. Felipe: Bloodlust and the wings haste mean more autos, so more Holy Power, and a shorter GCD, so more casts fit inside Execution Sentence.
10. [S1] Melee, Season 1 figures:
    - Press the 24-second cooldowns only if the pull will live another 24 seconds.
    - On pulls near 2 minutes, use them twice.
    - When a pull runs just over a minute, hold them.
    - When a 30-second walk or RP follows, use them twice.
11. [S1] NeekapHere: "If things don't line up correctly, there's no point in playing Execution Sentence in Mythic Plus." Lightblade (Season 2) runs the Execution Sentence build from about +14 keys.

Wake of Ashes
1. Use it on its 30-second cooldown: one inside every Execution Sentence and wings window, and one in between.
   - Felipe: "I will use it now exactly at 30 seconds of cooldown with the rest of my bursts."
   - Felipe: "I delayed using Wake of Ashes. I should have used it inside my burst."
2. Felipe: "It’s not a big problem if you are inside a Final Reckoning and don't have Wake of Ashes." Wings and Execution Sentence falling out of line is the problem.
   - When the two halves of rule 1 conflict, the window wins. Holding Wake a few seconds for an Avenging Wrath about to come back is not late ("I should have used it inside my burst"). A Wake pressed late with no window to meet is.
3. Method ranks it at line 5: under the capped spender and above every generator.
4. Holy Power.
   - It gives 3 (Myuvilo).
   - Maxroll's single-target list ties a threshold to Radiant Glory: "with 2 Holy Power or less if Radiant Glory". Only its AoE list says "2 Holy Power or below" outright. The player runs Avenging Wrath, so only the AoE line could apply, and both lists are Templar-paired. Shelved (section 12).
   - Method gives no threshold: Wake sits under the capped spender only (13.11).
5. For Herald, it grants Divine Purpose and makes the next two spenders apply Dawnlight (Maxroll).

Divine Toll
1. In the opener it goes after Wake of Ashes and the first spenders (Method, NinoMMO, Felipe, Lightblade). Myuvilo puts it before Wake as a beginner compromise.
2. It goes inside Execution Sentence. Felipe: "So it is very important that we fit this Divine Toll within the duration of Execution Sentence". Fit Divine Resonance's three repeats inside it as well.
   - Holding it for the window is correct, although Method's line 6 alone would press it whenever ready. A delay after it comes off cooldown is not a fault by itself.
   - [log: the references land every Divine Toll inside the window: Böllerbob 19 of 19, Kelimdall 20 to 23 of 20 to 23 per key. The player: 17 of 28, 6 of 8, 15 of 21.]
3. It gives 1 Holy Power per target hit, up to 5 (Myuvilo). In wings it gives targets hit plus 2, up to 7 [log: in-wings gains of 3 to 7 in 198 of 199 windows; section 4].
   - Maxroll: "delay Divine Toll and Judgment in openers if they would overcap".
   - Maxroll takes Divine Toll "mainly for Holy Power".
4. Method ranks it at line 6, under Wake of Ashes.

Trinkets and potion
1. Method: on-use items (trinkets and the combat potion) go right after Avenging Wrath, before Execution Sentence.
2. Macros.
   - Myuvilo: /cast Avenging Wrath, /cast Execution Sentence, /use 13, /use 14. The macro is in his video description; the video only points to it.
   - Felipe uses /use 13 only, and presses the potion by hand: "The prepot is one of the most important cooldowns in this game." He gives the burst potion a 5-minute cooldown.
3. Maxroll: "Trinkets: 90s trinkets on cooldown unless they give a large Mastery or Strength buff, then align with Wings." On Avenging Wrath: "don't hold trinkets for it."
4. Voracious Heart (Felipe's "Olatheq's Heart", 1.5-minute cooldown) has two plans.
   - Plan 1: use it with every other burst, which makes it a 2-minute trinket.
   - Plan 2: in specific spots, use it with a Wake of Ashes alone, outside a full burst, so it is back for the next full burst.
   - Never delay the 1-minute burst for it. Felipe: "Certainly the best situation and the greatest advantage is in one minute again."
5. Felipe: "It's very important that you use this Heart during the lust with a pre-pot."
6. Potion of Recklessness boosts your highest secondary stat. Lightblade: "remember to always guarantee that your highest stat is going to be mastery."

## 8. Holy Power rules

1. Never overcap.
   - NinoMMO: "And the most important rule, don't overcap Holy Power because your spenders do way more damage than your generators. Wasting Holy Power is wasting DPS."
   - Myuvilo: "try to spend your holy power at five before generating more."
2. Method: "prioritize generators over spenders as long as you won't overcap Holy Power".
   - Count Walk Into Light's 2 at each Avenging Wrath press as a generator [log: about 2 Walk Into Light points per Avenging Wrath press in all ten flows; section 4].
3. At 5, spend before Wake of Ashes, Divine Toll or any generator (Method lines 3 and 4, NinoMMO, Myuvilo). Felipe: "always try not to end up in a situation where you have five Holy Power; you don't want to use Judgment here."
4. At 4 with a Crusading Strikes auto due, spend (Method line 4).
5. At 4 otherwise, Method's order is:
   1. Wake of Ashes.
   2. Divine Toll.
   3. Blade of Justice with Art of War, outside wings.
   4. Hammer of Wrath at 2 charges, inside wings.
   5. The Arbiter spender.
   6. The 4-Holy-Power spender.
   7. Hammer of Wrath (inside wings), then Blade of Justice, then Judgment (outside wings).
   - At 2+ targets the Arbiter Final Verdict (AoE line 3) goes before all of these.
   - [S1] Melee: "if I have four holy power, I will spend first and use blade after".
   - At 4, Blade of Justice overcaps by 1, Wake of Ashes by 2, and Hammer of Wrath in wings by 2, or by 4 when it is a Divine Resonance repeat (13.9).
   - [log: at 4 with Art of War up outside wings, the references press a spender on 14 of 22 presses (Böllerbob) and 136 of 143 (Kelimdall).] Rule 4 grades neither choice.
6. At 3, Method builds first. It spends at 3 only when the generators are all on cooldown (line 14): Hammer of Wrath inside wings, Blade of Justice, Judgment outside wings.
   - Ranked higher, and not a build-first case: the Arbiter spender at any Holy Power (Method's line 9 in both lists, and AoE line 3, carry no Holy Power condition), a free Divine Purpose spender, and the Empyrean Legacy Final Verdict (NinoMMO, Myuvilo).
   - [S1] Melee: "If it's off cooldown, I will use my Blade of Justice first and then Divine Storm just in case my next auto attack resets Blade of Justice."
   - Felipe spends before the glowing Blade of Justice and before Judgment (13.9).
   - [log: at 3 outside wings, 65 to 77 percent of the references' presses are spenders (Böllerbob 93 of 142; Kelimdall 96 of 145 to 126 of 168).] Rule 9 reports this; it does not fault it.
7. Press Judgment at 4 only to set up Execution Sentence. Maxroll: "Judgment on 4 Holy Power only when setting up Execution Sentence, otherwise get a Final Verdict out first." Method's order agrees: line 10 is above line 13.
8. Shelved to section 12: Maxroll's "aim for 3 Holy Power ready just before Execution Sentence comes off cooldown" (section 7, rule 8).
9. In the opener, Divine Toll and Judgment wait if they would overcap (Maxroll).
10. Wake of Ashes gives 3, so at 3 or more it overcaps. Count it (rule 5). Maxroll's "2 Holy Power or below" is from its Templar AoE list, and its single-target list ties the threshold to Radiant Glory. Shelved (section 12).
11. Spend right after a Judgment, so the spender takes the 20% (Felipe).
12. Spend as much as possible inside Avenging Wrath and Execution Sentence (Method).
13. Stay in melee. Out of range, Crusading Strikes stops generating (Myuvilo, Felipe).
14. In-wings generator values [log: section 4]: Hammer of Wrath 3 (about 5 for each of the three Divine Resonance repeats after Divine Toll), Divine Toll targets hit plus 2 (up to 7), Walk Into Light 2 at each Avenging Wrath press. Rules 1, 2, 6, 8 and 10 count with them.

## 9. Spender choice

1. One target: Final Verdict. Every source agrees.
2. Two or more targets: Divine Storm.
   - NinoMMO: "As soon as you fight two or more targets, Divine Storm becomes your main spender."
   - Method's AoE list is for "2+ targets". Felipe says "starting from two targets".
   - [S1] Melee: "Anything two targets or more, you still divine storm."
   - Myuvilo gives no target count.
3. Divine Arbiter flips the choice.
   - One target: Divine Storm cashes an Arbiter that Final Verdict created. It goes first at 5, and again below 5.
   - Two or more targets: Final Verdict cashes an Arbiter that Divine Storm created.
   - NinoMMO: "Divine Arbitrator flips in AoE. Divine Storm gives it and we spend it with Final Verdict."
4. Never press the same spender again while the other one glows. Felipe: "If I use another Divine Storm, I didn't spend the Tier 7 proc. It's still glowing there, see?"
5. Empyrean Legacy goes on Final Verdict, at 2+ targets too, ahead of Divine Storm at 5 (NinoMMO, Myuvilo).
6. Land the tier spender on a target with the Judgment debuff (Felipe).
7. Divine Storm also feeds Tempest of the Lightbringer, "uncapped AoE, 20% of your Divine Storm", and Sun Sear (Lightblade).
8. Eternal Flame is Herald's Word of Glory (Method). It is a heal that costs damage.
   - Myuvilo: "Still use it if someone, including you, would die otherwise."
   - Myuvilo: a free Divine Purpose spent on it "will cost you damage down the line".
   - Felipe: in hard keys, spend Holy Power on it whenever the group would otherwise die.
   - Maxroll: a 16-second HoT, 25% stronger on yourself.
   - [S1] NeekapHere: "if you are in a tight spot, you do get the better Word of Glory Eternal Flame."

## 10. Mythic+ play

Before the burst
1. Let the tank group the pack. Ret's burst pulls aggro (Felipe).
2. In dangerous keys, have Blessing of Protection or Divine Shield up in the opener. If aggro still turns, Felipe offers three answers:
   - Blinding Light, so the tank can take it back.
   - Hammer of Justice.
   - Divine Steed, to kite while you keep casting.
3. Where you put Execution Sentence decides the dungeon's damage (Felipe; section 7).

Pulls and holding cooldowns
- NinoMMO: send them unless a big pull or important adds are seconds away. "Your cool downs are short and every usage you skip is damage you never get back."
- Maxroll: never hold them more than a few seconds.
- Felipe: on a nearly dead pack, use Wake of Ashes alone.
- [S1] Melee: the 24-second pull-life check (section 7, rule 10).
- Felipe: in M+ the burst drifts with deaths, resets, kicks and stuns. The less it drifts, the more damage you do.

Interrupts and stops
1. Rebuke (melee range, 15-second cooldown).
   - Myuvilo: "Use it whenever you can. If you know dangerous spells in a dungeon or raid, try interrupting them."
   - NinoMMO's fifth mistake is not kicking enough: "So, keep kicking."
2. Hammer of Justice (6-second stun, 30-second cooldown). Myuvilo: "Use it freely as often as you can. It is a semi interrupt as well if the enemy is stunnable."
3. Blinding Light (6-second disorient within 10 yards, broken by damage).
   - Myuvilo: "Mostly use it for interrupting enemies for a short moment."
   - NinoMMO: "And in mythic plus, blinding light and hammer of justice can stop casts when you kick is on cool down."

Defensives
1. Divine Protection: 30% less damage taken plus the Shield of Vengeance absorb, for 8 seconds, on a 1-minute cooldown.
   - Use it on hard hits you know are coming.
   - Myuvilo: "Otherwise, use it on cool down as long as you take damage. Holding it is often a wasted use since it only has a 1-minute cool down."
   - Keep it for a known hit due within the minute (Myuvilo).
   - The shield explodes when it breaks. NinoMMO: "So, it could even be used offensively."
2. Divine Shield.
   - NinoMMO: use it when you are about to die, or to cheese a mechanic.
   - Myuvilo: "Long cool down, but don't hold it forever."
   - [S1] Melee: 4-minute cooldown.
3. Lay on Hands works on yourself or any ally (Myuvilo, Felipe).
4. Forbearance.
   - Divine Shield, Blessing of Protection and Lay on Hands all apply it.
   - Myuvilo: "Blessing of Protection into Lay on Hands immediately will not work."
   - Another paladin's Forbearance blocks yours too (Myuvilo).
5. NinoMMO: "just make sure to use your defensives preemptively instead of using them when you're already at 5% HP."
6. Concentrated Silvermoon Health Potion. NinoMMO: "It's basically an extra defensive cool down that you get."
7. Blessing of Dusk: up to 10% less damage taken (Maxroll). Maxroll's boss tips call for defensives on Ravenous Bellow, Serpentine Gust, Poison Splash and Excavating Blast.
8. Felipe: between pulls, top yourself up with a couple of Flash of Light casts. It is no longer instant.
9. Herald is less tanky than Templar ([S1] NeekapHere). NinoMMO says Templar has "stronger defensives".

Group utility
1. Blessing of Sacrifice: a 1-minute cooldown with Sacrifice of the Just. It cannot be cast on yourself.
   - Myuvilo: "If any other player than you or the tank is about to get hit by a hard-hitting ability or is in danger of dying, this can and often will save people. Also quite nice on a tank while he's pulling."
   - Felipe: with the poison talent it clears a stacking poison on the tank. Cover the 30% you take with Divine Protection or Divine Shield.
2. Blessing of Protection.
   - Myuvilo: "Never cast it on a tank in combat."
   - Felipe: it removes a bleed from an ally.
   - Maxroll: use it for aggro or physical damage.
3. Blessing of Freedom.
   - Myuvilo: use it on a mechanic it removes, or for speed on the tank between pulls.
   - Felipe: cast it before a root lands.
4. Cleanse Toxins removes poisons and diseases from any group member, you included. The player's string takes it [log: decoded string, node 81507].
   - Myuvilo: "Use it if a poison or disease is active on your group."
   - Felipe: "This season is packed with poison and disease."
5. Intercession. Myuvilo: "Instantly use it on a dead tank or healer." No Intercession node appears in any of the six decoded talent strings [log]. Grade it only if the player has it (rule 51).
6. Myuvilo: "Unless other paladins are in your group, always use Aura of Devotion".
7. Keybind everything (NinoMMO) and turn on mouseover casting for party frames (Felipe). NinoMMO's fourth mistake is not using utility: "You have to learn to be a team player."
8. Hand of Reckoning: skip it unless "you're 100% sure what you're doing" (Myuvilo).
9. Felipe's Season 2 dungeon examples:
   - Freedom on the Atal'Dazar trash slows and the Underrot boss root.
   - Sacrifice with the poison talent on the opening packs of Assassins' Gambit, which stack a poison on the tank.
   - Protection on the bleed from a bear and owl boss.

## 11. Gear, stats, consumables

Stat priority
- Murlok top 50 (live): Mastery 50% (+1163 rating), Crit 33% (+1097), Haste 19% (+737), Versatility 2% (+113). That reads as Mastery, Crit, Haste, Versatility. Avoidance 5% (+200).
- NinoMMO (17 Oct): higher item level with more Strength comes first. Then "mastery, haste, and crits. They're about the same. And versatility. Mastery wins because it boosts all of your holy damage, which is basically everything ret does."
- Lightblade (15 Aug, pre-launch): for Herald, "Strength, mastery, haste, critical strike, and versatility". Haste goes over crit because Herald is "a very dot-based" spec.
- Maxroll: its priority is an image that was not captured.
  - "Ret needs Mastery and Crit balanced with enough Haste".
  - Sim; item level usually matters more.
- Agreed: mastery first, versatility last.
- Open: whether haste or crit is second. The live data puts crit ahead, NinoMMO calls them even, and Lightblade (the oldest source) puts haste ahead.

Murlok top-50 data
- Tier set (Consecrated Flame): Warhelm 39, Pauldrons 41, Bulwark 46, Gauntlets 38, Greaves 47.
- Trinkets: Voracious Heart of Ula'tek 47, Zul'jin's Guillotine Technique 46 (a set piece).
- Weapon: Maze-roa, Warlord's Fury 49 (in a set with the trinket).
- Embellishments: Loa Worshiper's Band 40, Stabilizing Gemstone Bandolier 36, Arcanoweave Lining 23.
- Enchants:
  - Head: Empowered Rune of Avoidance 49.
  - Shoulders: Amirdrassil's Grace 50.
  - Chest: Mark of the Worldsoul 48.
  - Legs: Forest Hunter's Armor Kit 49.
  - Feet: Lynx's Dexterity 48.
  - Rings: Eyes of the Eagle 97, counted across both ring slots.
  - Main hand: Rite of the Hash'ey 47.
- Gems: Indecipherable Eversong Diamond 49; Flawless Masterful Peridot 149, Flawless Deadly Peridot 24, Flawless Deadly Amethyst 12, Flawless Masterful Garnet 5, Flawless Quick Garnet 5.
- Races: mostly Dwarf.

What the guides add
- Tier set. NinoMMO: "Your highest priority should be to acquire the four set as soon as possible because that's what gives you divine arbiter."
- Trinkets (Lightblade):
  - Voracious Heart ("Ulathek"): critical strike, plus an on-use every 1.5 minutes that builds Strength for 20 seconds. "This thing can go up to over a thousand strength."
  - The second trinket is conditional: "Soul Shard's Gift and Technique" as transcribed, which is Murlok's Zul'jin's Guillotine Technique. It deals +2% damage per 1% of health the target is missing. Alone it is "six out of 10". With the axe it becomes best-in-slot, because it then cleaves and applies the weapon's venom to both targets.
  - Raid alternatives: Keeper's Seething Core ("especially good for Herald") and Gebbo's Bottomless Bank (better for Templar).
  - M+ trinkets: Vial of Volatile Venom (on-use, 2-minute cooldown) and Resonant Valestone (30-second crit proc, about 50% uptime).
  - Felipe calls Olatheq's Heart "the strongest trinket of the season".
- Weapon: the raid two-hand axe. Lightblade's transcript calls it "Mace of the Ruthless Fury" and "Masamune Warlord's Fury"; NinoMMO's says "mace raw".
  - Lightblade: "This is the best weapon in the game."
  - NinoMMO: spend bonus rolls on the Coiled Altar boss, ideally on Heroic, for the weapon and Zul'jin's Guillotine Technique. A crafted weapon is a good early boost.
- Other pieces (Lightblade):
  - The Mythic legs from the last boss are best-in-slot for the patch: pure mastery plus a mastery-raising effect, always a net gain.
  - The neck "Amulet of the Pit Lord" (as transcribed) has two sockets and crit.
- Embellishments:
  - Lightblade: Loa Worshiper's Band on one ring, with only Flawless Masterful Peridots in every socket to guarantee its haste Loa. The Strength Loa procs too.
  - Lightblade: the Stabilizing Gemstone Bandolier goes on cloak or bracers and doubles the ring's procs.
  - NinoMMO: the ring, plus "spell breaker's braces" (as transcribed) with the Bandolier.
- Enchants (Lightblade):
  - Weapon: Arcane Mastery or "Acuity of the Render Rate" (as transcribed). Sim to pick.
  - Shoulders: "Amice of the Sea's Embrace" (as transcribed). Murlok shows Amirdrassil's Grace on all 50.
  - Head, chest, legs, feet and rings: as Murlok.
- Gems:
  - Lightblade: only Flawless Masterful Peridots with the band. Without it, mastery/crit or crit/mastery gems over the haste/mastery greens. The diamond is "Indestructible Everstone" (as transcribed).
  - NinoMMO: "Indecipherable Everbloom Diamond" and "flawless masterful paradox" (as transcribed).
  - Maxroll differs: Powerful Eversong Diamond, Flawless Deadly Peridot, Quick Garnet, Quick Lapis, Quick Amethyst.

Consumables
- Flask: Flask of the Magisters, for mastery (Lightblade). Maxroll lists Flask of the Blood Knights, Flask of the Shattered Sun or Flask of the Magisters.
- Combat potion: Potion of Recklessness (Lightblade, Maxroll), with mastery as your highest stat (Lightblade).
- Health potion: Concentrated Silvermoon Health Potion (Lightblade, NinoMMO). Maxroll lists Silvermoon Health Potion.
- Food: Harandar Celebration (Maxroll; the transcripts say "Hara Nar" and "Harron Deer" Celebration).
  - Or the main-stat roast ("Frayer Roast" and "boiled roast" as transcribed).
  - NinoMMO: "Just use what is cheaper."
- Weapon oil: Thalassian Phoenix Oil (Lightblade, Maxroll).
- Augment rune: Void-Touched Augment Rune (Maxroll). Lightblade: use it "if they're not too expensive".

## 12. Templar appendix

Shelved. Read it only if the player switches hero trees.
- When the guides prefer Templar:
  - Short burst windows (Method).
  - Burst AoE (Icy Veins summary).
  - Pure single target (Lightblade).
  - Stronger defensives (NinoMMO).
- Method string, Templar (Raid Cleave and Mythic+): `CYEAAAAAAAAAAAAAAAAAAAAAAAAAAAwoZbbmZWGzMzAAAAAAYmyYGmZsNmthZ2mxYMGmxGbAAAZmptZmtZAAbAGAMmhBmxMzGWmBDjZMYA`
- Method openers:
  - Execution Sentence version: Blade of Justice, Avenging Wrath, on-use items, Execution Sentence, Wake of Ashes, Hammer of Light, Divine Toll. The same for one target and AoE.
  - Radiant Glory version: Blade of Justice, on-use items and potion, Wake of Ashes, Hammer of Light, Divine Toll.
- Method single-target list:
  1. Avenging Wrath.
  2. Execution Sentence.
  3. Hammer of Light.
  4. Divine Storm with Divine Arbiter at 5.
  5. Final Verdict at 5, or at 4 before a Crusading Strikes auto.
  6. Wake of Ashes.
  7. Divine Toll.
  8. Blade of Justice with Art of War.
  9. Divine Storm with Divine Arbiter.
  10. Final Verdict at 4.
  11. Blade of Justice.
  12. Judgment / Hammer of Wrath.
  13. Final Verdict at 3.
  - Method: "Do not actively spend Divine Arbiter procs from the tier set on single target when using Seal of the Templar."
  - The AoE list is the same with the two spenders swapped.
- NinoMMO:
  - Light's Guidance turns Wake of Ashes into Hammer of Light, so press it again right after. Hammer of Light tops the list.
  - If Avenging Wrath is about to come back, hold a free Hammer of Light for a few seconds. Always use it before Avenging Wrath or Execution Sentence ends, and before it expires.
  - "And since Templar doesn't have Walk into Light, Blade of Justice always goes ahead of Hammer of Wrath."
- Lightblade:
  - Raid stats: Strength, Mastery, Haste, Crit, Versatility.
  - AoE and M+ stats: Strength, Mastery, Crit, Haste, Versatility, because Empyrean Hammers need crit to splash.
  - 1-minute opener: Blade of Justice, Judgment, Execution Sentence, Wings, Wake of Ashes, Hammer of Light, Divine Toll.
- Maxroll (Templar-paired):
  - Single target: Templar's Verdict near 5; Execution Sentence on cooldown; Wake of Ashes on cooldown (at 2 or less with Radiant Glory); Hammer of Light; Blade of Justice for Expurgation; Divine Toll; Judgment and Blade of Justice at 3 or below.
  - AoE: Divine Storm near 5; Wake of Ashes at 2 or below; Hammer of Light; Blade of Justice; Divine Toll; Judgment when low or for Sanctification; Divine Storm at 3.
- [S1] Melee's opener: Blade of Justice, Avenging Wrath, Execution Sentence, Wake of Ashes, Hammer of Light, Divine Toll, Divine Storm.

Shelved here from the Herald sections in verification
- Rule 11 (3 or more Holy Power at the Avenging Wrath + Execution Sentence press) and Maxroll's "aim for 3 Holy Power ready just before Execution Sentence comes off cooldown" (sections 7 and 8).
  - Maxroll's opener goal ("reach 3 Holy Power with Blade of Justice then Judgment") and "Delay Divine Toll until after Hammer of Light if it would overcap" come from the same Templar setup: 3 Holy Power ready for Hammer of Light after Wake.
  - For Herald, Wake gives Divine Purpose plus 3, and Walk Into Light gives 2 at the Wings press [log: section 4]. Entering at 3 overcaps (3 + 2 + 3 = 8).
  - Method's and NinoMMO's Herald openers enter at 2, after one Blade of Justice; Lightblade's enters at 3 (Blade of Justice, Judgment, then Wings plus Execution Sentence; 13.4). Shelving still holds on the arithmetic: 3 plus 2 plus 3 overcaps.
- Maxroll's Wake of Ashes thresholds: single target "with 2 Holy Power or less if Radiant Glory", AoE "2 Holy Power or below". Herald grades Wake by Method's line 5 (rule 5).

## 13. Where the sources disagree

1. Hero tree.
   - Herald: Method (13 Oct), NinoMMO (17 Oct), Felipe (4 Oct), Myuvilo (28 Sep), Murlok (live, 50 of 50).
   - Templar, or a tie: Maxroll (changelog 4 Aug), Lightblade (15 Aug, pre-launch), Expcarry (12.1), Overgear (about 67 days old).
   - The Herald side is newer.
2. Avenging Wrath's cooldown. Settled by the log.
   - Felipe: 1 minute.
   - [S1] Melee: "one minute cooldowns" that last 24 seconds.
   - Tooltip: 2 minutes, with a 20-second duration (24 with Divine Wrath). That is the base value.
   - [log: 1 minute in this build. The shortest gaps between Avenging Wrath casts are 60.0 to 64.1 s in all ten flows (Execution Sentence 60.0 to 64.2 s), and the player cast 29 in the 37.6-minute Murder Row +18.]
   - Grade against 1 minute.
3. Avenging Wrath or Execution Sentence first.
   - Method (13 Oct) and NinoMMO (17 Oct): Avenging Wrath first.
   - Maxroll (Templar-paired): Execution Sentence first.
   - The macros (Myuvilo, Felipe) fire both on one press.
   - Grade the pairing, not the order (rules 13, 14 and 17).
   - [log: the player presses Execution Sentence 0.1 to 1.0 s before Avenging Wrath in 56 of 60 windows. Böllerbob presses it 0 to 0.6 s after. Kelimdall presses it after Wake of Ashes in 124 of 126 windows, 0.5 to 5.0 s after Wings, 2.5 to 2.7 s on average.]
4. A Judgment before Avenging Wrath.
   - Yes: Lightblade (15 Aug) and Maxroll's "3 Holy Power" goal.
   - No: Method, NinoMMO, Felipe and Myuvilo use Blade of Justice only.
   - The newer sources say no Judgment.
5. Divine Toll in the opener.
   - After Wake and two spenders: Method, NinoMMO.
   - After Wake and one spend: Felipe.
   - After Wake and three spenders: Lightblade.
   - Before Wake: Myuvilo, which he flags as a beginner compromise.
6. The AoE opener's spenders.
   - Method (13 Oct): Divine Storm twice.
   - NinoMMO (17 Oct, newer): Final Verdict, then Divine Storm.
   - Myuvilo: Final Verdict first, for Empyrean Legacy.
   - Method's own AoE list disagrees with its "replace" sentence. A Divine Storm that spends Wake's Divine Purpose creates an Arbiter, and line 3 spends that Arbiter with Final Verdict.
   - Method's sentence would also leave Empyrean Legacy unspent. By the tooltip it empowers only a "single target Holy Power ability", so a Divine Storm does not cash it. This supports NinoMMO's order (rule 14).
7. Empyrean Legacy.
   - NinoMMO and Myuvilo rank Final Verdict with Empyrean Legacy above Divine Storm at 5 when there are 2+ targets.
   - Method's list has no such line.
8. Art of War.
   - Method: "with Art of War", which also covers one stack.
   - NinoMMO and Myuvilo: "two stacks".
9. Building or spending below 5.
   - Felipe (4 Oct): spend before the glowing Blade of Justice and before Judgment.
   - Method (13 Oct, newer): build at 3. At 4, Wake of Ashes, Divine Toll, the Art of War Blade of Justice (outside wings), Hammer of Wrath at 2 charges (inside wings) and the Arbiter spender go first.
   - Myuvilo: Blade of Justice at 2 Art of War stacks goes above every spender under 5.
   - [S1] Melee: build at 3, spend at 4.
   - Blade of Justice at 4 overcaps by 1, and so does Hammer of Wrath in wings at 3; a Divine Resonance Hammer (about 5) overcaps at 1 or more. Method's own general rule forbids all of them.
   - [log: the references mostly spend. At 4 with Art of War up outside wings, 14 of 22 (Böllerbob) and 136 of 143 (Kelimdall) presses are spenders. At 3 outside wings, 65 to 77 percent are.]
   - Grading: at 4 with Art of War up, neither choice is a mistake (rule 4). At 3 the spend is reported, not faulted (rule 9). A manual Blade of Justice in wings at 3 or less, with no Hammer charge and no Arbiter, is contested (rule 30).
10. The Arbiter Final Verdict at 2+ targets.
    - Method's lines 3 and 9 give no Holy Power condition.
    - NinoMMO and Myuvilo put the first one at 5.
11. The Wake of Ashes threshold.
    - Maxroll: "2 Holy Power or below" in its AoE list. Its single-target list says "with 2 Holy Power or less if Radiant Glory". Both are Templar-paired, and the player runs Avenging Wrath.
    - Method: under the capped spender, nothing more.
    - Every Herald opener presses Wake after Blade of Justice and Avenging Wrath, with no spend between.
    - Grading follows Method (rule 5). Maxroll's threshold is shelved (section 12).
    - [log: the references press Wake at 3 or more on 26 of 37 casts (Böllerbob) and 19 to 26 of 40 to 45 per key (Kelimdall).]
12. Crusading Strikes. Settled by the log.
    - Method and Felipe: every auto gives 1 Holy Power.
    - Maxroll: "usually gives Holy Power on the second auto".
    - [log: every auto generates. Crusading Strikes resource events run at 28 to 33 per alive minute in all ten flows, about one every 2 seconds. A second-auto rule would need a swing about every second.]
13. Holding cooldowns.
    - NinoMMO: send them unless a big pull is seconds away.
    - Maxroll: never hold them more than a few seconds.
    - Felipe: on a nearly dead pack, Wake alone, and carry the big cooldowns.
    - [S1] Melee: use them only if the pull will live 24 more seconds.
    - Grading: rules 18 to 20.
14. Trinkets.
    - Method: right after Avenging Wrath.
    - Maxroll: 90-second trinkets on cooldown, unless they give a large Mastery or Strength buff.
    - Felipe: Voracious Heart with every other burst, or with a Wake of Ashes alone so it is back for the next full burst.
15. The 2pc. Settled by the log.
    - Maxroll: Divine Power, +10% Holy damage for 12 seconds.
    - Felipe: the consuming spender deals 10% more Holy damage and grants Holy Power.
    - [log: no Holy Power. No resource event from Divine Power or Divine Purpose appears in any of the ten flows.] Maxroll's reading stands.
16. Stats: whether haste or crit is second (section 11).
17. Gems.
    - Murlok, Lightblade and NinoMMO: Masterful Peridots and the Indecipherable diamond.
    - Maxroll: Powerful Eversong Diamond, Deadly Peridot and Quick gems.
18. Talents.
    - Myuvilo's beginner string drops Jurisdiction and Burning Crusade, which all 50 Murlok players take.
    - It takes Swift Justice over Light of Justice; 45 of 50 Murlok players take Light of Justice.
19. [S1] The Execution Sentence funnel.
    - Melee: bugged at 10%.
    - Felipe and the tooltip: 20%.

## 14. AUDIT RULES

How to read these rules:
- Each rule is one sentence.
- Tags name the sources: Method, NinoMMO, Maxroll, Murlok, Felipe, Myuvilo, Lightblade, NeekapHere S1, Melee S1.
- "Contested" points to section 13.
- "Grading tolerance" marks a cut-off the synthesizer chose where the sources give only words.
- A [log: ...] tag carries a figure measured from the logs (see the top of this file).
- A "count" or a "report" goes into the report. It is not a per-press fault.
- The numbering follows the draft. Rule 11 is shelved. Rules 56 to 58 (Dawnlight) are new.

Holy Power
1. Every point of Holy Power generated above 5 is wasted: count it per key and per generator from the resource events, with Walk Into Light (2 at each Avenging Wrath press) as a separate generator. [Myuvilo, NinoMMO, Method] [log: Walk Into Light wasted 26 of 64, 6 of 22 and 12 of 48 points for the player; 7 to 15 of 40 to 48 for the references]
2. A generator (Blade of Justice, Judgment, Hammer of Wrath, Wake of Ashes, Divine Toll) pressed at 5 Holy Power is a mistake, because the spender goes first, and it wastes its full yield (in wings, 3 for a Hammer of Wrath, about 5 for a Divine Resonance Hammer, and targets hit plus 2 for a Divine Toll); the Wake on the Wings press is exempt (rule 12). [Myuvilo, Felipe, Method lines 3 and 4] [log: in-wings yields, section 4]
3. A Crusading Strikes auto that lands at 5 Holy Power wastes its point, so at 4 with an auto due before the next press, the spender goes first. [Method line 4; Melee S1]
4. Blade of Justice at 4 Holy Power wastes 1 (it gives 2): count the waste, grade it a mistake when Art of War was not up (Method line 10 above line 12), and with Art of War up outside wings and no Crusading Strikes auto due grade neither the Blade nor the 4-Holy-Power spender as a mistake, because Method ranks the Art of War Blade above that spender at any stack, NinoMMO and Myuvilo only at two stacks, and Felipe and Melee S1 spend first. [Method lines 7, 10 and 12; NinoMMO; Myuvilo; Felipe; Melee S1; contested 13.9] [log: at 4 with Art of War up outside wings the references press a spender on 14 of 22 presses (Böllerbob) and 136 of 143 (Kelimdall), the player on 55 of 64]
5. Wake of Ashes at 3 or more Holy Power wastes Holy Power (it gives 3): count the waste, and grade it a mistake only at 5, or at 4 with a Crusading Strikes auto due (rules 2 and 3), because Method's line 5 ranks Wake above every line except the capped spender. [Method line 5; Myuvilo; Maxroll's "2 Holy Power or below" belongs to a Templar list and is shelved, section 12] [log: Wake at 3 or more on 26 of 37 casts (Böllerbob) and 19 to 26 of 40 to 45 per key (Kelimdall); the player 22 of 55, 5 of 16 and 13 of 39]
6. Divine Toll wastes whatever its yield carries past 5 Holy Power: 1 per target hit outside wings, and targets hit plus 2 inside wings (one Walk Into Light Blade of Justice), so up to 7. [Myuvilo; Maxroll; Felipe: "Divine Toll will also trigger an automatic Blade of Justice"] [log: in-wings gains of 3 to 7 in 198 of 199 windows, one reading 8; the references waste on 15 to 22 of 19 to 23 Divine Tolls per key]
7. Judgment at 4 Holy Power is a mistake unless it sets up Execution Sentence, because the 4-Holy-Power spender goes first (Maxroll: "Judgment on 4 Holy Power only when setting up Execution Sentence, otherwise get a Final Verdict out first"), and the exception carries low weight for Herald, since entering Avenging Wrath at 5 wastes Walk Into Light's 2 (rule 11, shelved). [Maxroll, Templar-paired; Method lines 10 and 13]
8. Hammer of Wrath with 1 charge, pressed at 4 Holy Power while a spender was affordable, is out of order, because the 4-Holy-Power spender goes first, and it wastes 2, or 4 as a Divine Resonance repeat, since a Hammer of Wrath in wings gives 3, or about 5 as one of the three repeats after Divine Toll (rule 10). [Method lines 10 and 11]
9. Report, not a per-press fault: count the 3-Holy-Power spenders pressed while a generator was ready (Hammer of Wrath inside wings, Blade of Justice, Judgment outside wings), which Method's line 14 ranks last, and leave out the Arbiter spender at any Holy Power (Method's line 9 carries no Holy Power condition and sits above lines 11 to 13), a free Divine Purpose spender, and the Empyrean Legacy Final Verdict (NinoMMO's AoE line, above Wake). [Method line 14; NinoMMO; contested 13.9, Felipe spends first] [log: at 3 outside wings, 65 to 77 percent of the references' presses are spenders (Böllerbob 93 of 142; Kelimdall 96 of 145 to 126 of 168), 47 to 59 percent of the player's (107 of 199, 34 of 58, 64 of 136)]
10. In wings each Hammer of Wrath press also casts a Blade of Justice that generates 2 (Walk Into Light), so the press gives 3, exact at 2 Holy Power and wasting 1 at 3 and 2 at 4, and each of the three Divine Resonance repeats after Divine Toll gives about 5 (a repeat Judgment point and a second Hammer point land with it), exact at 0 and wasting 4 at 4 [log: 4.9 to 5.2 on those presses against 3.0 to 3.1, 51 to 63 percent of in-wings Hammers]; at 3, and at 4 with 2 charges, Method still ranks the press above the plain spender (lines 8 and 11 above lines 10 and 14), so count that waste under rule 1 and do not fault the press, except when an Arbiter spender was available, which Method ranks above a 1-charge Hammer (single-target line 9, AoE lines 3 and 9) and, in AoE, above Hammer at 2 charges (line 3); at 4 with 1 charge rule 8 applies and at 5 rule 2. [Walk Into Light tooltip; NinoMMO; Felipe; Method] [log: Blade of Justice events exceed manual presses by the Hammer of Wrath presses plus the in-wings Divine Tolls, to within 10 per key in all ten flows; player, Murder Row +18: 346 events, 207 presses, 109 Hammers and 27 Tolls]
11. Shelved to section 12: "Holy Power at the Avenging Wrath + Execution Sentence press is 3 or more" is Maxroll's Templar setup, and for Herald it overcaps (3, plus Walk Into Light's 2, plus Wake's 3).
12. In the opener, Holy Power wasted by Wake of Ashes is reported but not graded, because every Season 2 opener presses Wake before the first spender, and so is Divine Toll waste at 2 Holy Power or less, which its in-wings yield makes unavoidable at 2+ targets after the sources' own spenders; other waste there from Divine Toll or Judgment is graded. [Method, NinoMMO, Felipe, Myuvilo, Lightblade; Maxroll; grading decision] [log: Divine Toll yield, rule 6]

Opener
Scope: the opener is every Avenging Wrath window in a key, not only the first pull. Method writes its opener per burst, every Season 2 source presses Wake right after Wings and Execution Sentence with no spender in front, and the references run the same script window after window [log: Wake within 1.2 s of Wings in 17 of 19 (Böllerbob) and 124 of 127 (Kelimdall) windows, at 5 Holy Power in 11 and 38 of them]. So rule 12's exemption covers the Wake on the Wings press in every window, and rule 2 does not fault it.
13. One target: Blade of Justice, Avenging Wrath, on-use trinkets and potion, Execution Sentence, Wake of Ashes, Final Verdict, Final Verdict, Divine Toll; grade the first eight presses against this order, with Avenging Wrath and Execution Sentence accepted in either order (13.3). [Method; NinoMMO the same without on-use items] [log: the player presses Execution Sentence 0.1 to 1.0 s before Avenging Wrath in 56 of 60 windows; Böllerbob 0 to 0.6 s after; Kelimdall 0.5 to 5.0 s after]
14. Two or more targets: Blade of Justice, Avenging Wrath, Execution Sentence, Wake of Ashes, Final Verdict (Empyrean Legacy), Divine Storm, Divine Toll, with Avenging Wrath and Execution Sentence accepted in either order; by the tooltip Empyrean Legacy empowers only a single-target spender, so Method's two Divine Storms would leave it unspent, which supports this order. [NinoMMO for the sequence; Myuvilo for the Final Verdict first only; contested 13.6]
15. Divine Toll in the opener goes after Wake of Ashes and at least one spender, never before Wake. [Method, NinoMMO, Felipe, Lightblade]
16. There is no manual Blade of Justice from the Avenging Wrath press until the opener's Divine Toll, unless nothing else could be pressed. [Felipe]

Cooldowns
17. Execution Sentence goes out with Avenging Wrath, on the same press or within the next few GCDs, and a gap over 5 seconds counts as unpaired (grading tolerance, widened from 3). [Method, Felipe, Myuvilo, NinoMMO] [log: Kelimdall's gaps average 2.5 to 2.7 s and reach 5.0 s; 18 of his 126 paired windows exceed 3 s]
18. Avenging Wrath and Execution Sentence are 1-minute cooldowns in this build, and either one ready for more than 5 seconds in combat counts as held (grading tolerance for "a few seconds"), except as rule 20 allows. [NinoMMO, Maxroll, Felipe; contested 13.13] [log: shortest gaps between casts 60.0 to 64.1 s for Avenging Wrath and 60.0 to 64.2 s for Execution Sentence in all ten flows]
19. Count Avenging Wrath and Execution Sentence casts per key against the 1-minute cooldown, and treat each missing use as lost damage ("every usage you skip is damage you never get back"). [NinoMMO] [log: cooldown as in rule 18]
20. An Execution Sentence whose target dies within 10 seconds of the cast lost its stored damage, which is reported as lost funnel damage, and pressing Wake of Ashes alone on a pack that dies inside 10 seconds while holding the pair is exempt from rules 18 and 19 only when the next pack followed within a few seconds. [Felipe: "you save your 'big cooldowns' for the next pack"; NinoMMO: hold only if "a big pull or important adds are just a few seconds away"]
21. Wake of Ashes goes out within about 3 seconds of coming off its 30-second cooldown, with one spend first allowed (grading tolerance on the 3 seconds), but holding it a few seconds for an Avenging Wrath about to come back is not late, because the window wins ("I should have used it inside my burst"), while a Wake pressed late with no window to meet is late, and a window with no Wake at all carries low weight ("It's not a big problem if you are inside a Final Reckoning and don't have Wake of Ashes"). [Felipe; Method line 5] [log: of the player's four late in-window Wakes in Murder Row +18 (19.3, 9.4, 8.9 and 10.3 s into Wings), three came off cooldown late in the window (ready at 17.7, 6.9 and 8.7 s); the one at 9.4 s was ready at the Wings press]
22. Divine Toll lands inside the 10-second Execution Sentence window, and holding it for that window is correct, so a delay after it came off cooldown is not a fault by itself; only a Divine Toll that lands outside the window is. [Felipe; Method's line 6 alone would press it whenever ready] [log: inside the window on 19 of 19 (Böllerbob) and 20 to 23 of 20 to 23 per key (Kelimdall); the player 17 of 28, 6 of 8 and 15 of 21]
23. Divine Resonance's three repeat Judgments land inside Execution Sentence where they can (low weight). [Felipe]
24. Report the Holy Power spent inside each Avenging Wrath and Execution Sentence, against the rule "as much Holy Power as possible". [Method]
25. On-use trinkets go out within 3 seconds of Avenging Wrath (grading tolerance), and so does the combat potion when it is off cooldown, except a 90-second trinket without a large Mastery or Strength buff, which goes on cooldown. [Method, Myuvilo (macro from his video description), Felipe, Maxroll] [log: 8 potions were possible in the 37.6-minute Murder Row +18, against 29 Wings]
26. Voracious Heart goes with every other burst, or with a Wake of Ashes outside a full burst, and no 1-minute burst waits for it. [Felipe]
27. The combat potion, when off cooldown, goes inside Avenging Wrath [Method], and with Bloodlust when Bloodlust is in that pull [Felipe, said of the Heart trinket with the pre-pot: "It's very important that you use this Heart during the lust with a pre-pot"].

Procs and spenders
28. An Art of War proc that lands while already at 2 stacks is wasted: count refreshes at 2 stacks. [NinoMMO, Method]
29. Outside wings, with 2 Art of War stacks, Blade of Justice is the next press unless one of these is due: Avenging Wrath, Execution Sentence, a 5-Holy-Power spender, Wake of Ashes, Divine Toll, at 2+ targets the Arbiter Final Verdict (Method: at any Holy Power; NinoMMO and Myuvilo: at 5), or the Empyrean Legacy Final Verdict; at 4 Holy Power, rules 3 and 4 decide. [Method single-target line 7 and AoE lines 3 and 8; NinoMMO; Myuvilo] [log: Hammer of Wrath is not on the list, with 0 presses outside wings in all ten flows]
30. Inside wings, a manual Blade of Justice pressed while Hammer of Wrath had a charge, or while a 4-Holy-Power or Arbiter spender was available, is a mistake, but at 3 Holy Power or less with no Hammer charge and no Arbiter it is Method-correct (line 12 above line 14) and only Felipe faults it ("You only use Blade of Justice if there is absolutely nothing else for you to press"), so that case is contested (13.9). [Felipe, NinoMMO, Method lines 7, 12 and 14, NeekapHere S1] [log: in Murder Row +18, 44 of the player's 45 in-wings manual Blades came at 3 or less and 1 at 5; the references press about 1 to 2 per window]
31. Hammer of Wrath at 2 charges goes before a manual Blade of Justice and the 4-Holy-Power spender. [Method single-target line 8 and AoE line 7; NinoMMO; Myuvilo's AoE list ("hammer of wrath at two stacks to keep one rolling"; his single-target list has a plain Hammer of Wrath)] [log: one button, section 4]
32. Inside wings, time Hammer of Wrath spends capped at 2 charges while lower lines are pressed is lost. [Felipe, Lightblade, Method]
33. Judgment pressed while Blade of Justice was ready is out of order. [Method lines 12 and 13; Felipe for the Art of War Blade only: "If I'm outside of wings, the priority to spend the Art of War proc is above Judgment"] [log: Hammer of Wrath is never ready when Judgment is; one button, section 4]
34. With Divine Arbiter up, the next spender is the other one (Divine Storm after a Divine Purpose Final Verdict, Final Verdict after a Divine Purpose Divine Storm), so the same spender again is a mistake, the Empyrean Legacy Divine Storm counts as the other spender, and this rule is the fault while rule 35 is a count. [NinoMMO, Felipe, Lightblade, Myuvilo]
35. A Divine Purpose consumed while Divine Arbiter is still up forfeits the new Arbiter: count each one, as a count and not a fault, because the spender that cashes the Arbiter can consume a Divine Purpose at the same press and no source says to hold it. [Maxroll, Felipe]
36. A Divine Arbiter or a Divine Purpose left unspent until it lapses is wasted; the sources say to spend it (NinoMMO: the proc "blocks your next one"; Felipe: "You lost three chances to gain a proc"), and the lapse is this rulebook's inference. [NinoMMO, Felipe] [log: Divine Purpose lapsed 3, 3 and 2 times in the player's keys, 0 to 3 times per key for the references]
37. On one target the spender is Final Verdict, except Divine Storm to cash an Arbiter from Final Verdict, which goes first at 5 Holy Power. [Method lines 3, 4 and 9; NinoMMO; Myuvilo]
38. At two or more targets the spender is Divine Storm, except Final Verdict to cash an Arbiter from Divine Storm or to spend Empyrean Legacy. [Method, NinoMMO, Myuvilo, Felipe, Melee S1]
39. Empyrean Legacy is spent by the first Final Verdict after Avenging Wrath, and one left unspent until it lapses, or that waits behind Divine Storms at 2+ targets, is a miss; "don't skip it" is the sources' word, and the lapse is this rulebook's. [NinoMMO, Myuvilo] [log: Empyrean Legacy lapsed 2, 0 and 1 times in the player's keys, 0 or 1 per key for the references]
40. A free Divine Purpose spent on Eternal Flame when no one was in danger is a mistake. [Myuvilo]
41. Each Eternal Flame is graded against its target's health at the cast, since the sources give no threshold beyond "would die otherwise". [Myuvilo, Felipe]

Debuffs
42. Expurgation stays up on the main target, refreshed by Blade of Justice: report its uptime. [Method, Maxroll, Felipe]
43. Spenders land on targets that carry the Judgment debuff: report the share that do. [Method, Felipe]

Mythic+ utility and defensives
44. An interruptible cast that finished while Rebuke was ready and the player was in melee is a missed kick. [Myuvilo, NinoMMO]
45. Hammer of Justice and Blinding Light stop casts while Rebuke is on cooldown: report their use against the casts that went through. [NinoMMO, Myuvilo]
46. Divine Protection ready for more than 60 seconds while the player took damage is a wasted use, unless a known hit was due within that minute. [Myuvilo]
47. A death with Divine Protection, Divine Shield or Lay on Hands ready (and no Forbearance blocking it), or with the health potion unused, is a missed defensive. [NinoMMO, Myuvilo]
48. A defensive pressed at or below about 5% health is late. [NinoMMO]
49. Blessing of Protection on the tank in combat is a mistake. [Myuvilo]
50. With Cleanse Toxins talented, a poison or disease left on an ally while Cleanse Toxins was ready is a missed dispel. [Myuvilo, Felipe] [log: the player's string takes it, node 81507]
51. If the player has Intercession, a dead tank or healer is raised with it at once when it is available. [Myuvilo] [log: no Intercession node in any of the six decoded strings]

Gear and setup
52. Mastery is the highest secondary stat, so Potion of Recklessness gives mastery. [Lightblade, Murlok, NinoMMO]
53. The 4pc is equipped, which Divine Arbiter in the log proves. [NinoMMO]
54. Talents match Method's Herald M+ string or Murlok's near-universal picks: flag a miss among Jurisdiction, Burning Crusade, Crusade and Light Within 4/4 (50 of 50 each), flag Light of Justice at lower weight (45 of 50), and do not flag class picks Method calls "largely interchangeable", such as Sacrifice of the Just and Righteous Protection in place of Lead the Charge and Consecrated Ground. [Method, Murlok] [log: the player's string takes all five named talents]
55. Enchants, gems and embellishments follow the Murlok majority: Eyes of the Eagle on both rings, only Flawless Masterful Peridots with the Loa band, and the Bandolier on cloak or bracers. [Murlok, Lightblade]

Dawnlight (added in verification)
Dawnlight plus Sun's Avatar dealt 12.0 percent of the player's damage in Murder Row +18 [log: 5.9 plus 6.1; Böllerbob 10.7, Kelimdall 11.0].
56. After every Wake of Ashes the next two spenders apply Dawnlight: count the Wake windows that did not get both spenders before the empowerment lapsed. [Maxroll] [log: 0, 0 and 1 short windows in the player's keys; 0 or 1 per key for the references]
57. Shelved after the check: Maxroll's "Avenging Wrath applies Dawnlight to four nearby targets" does not hold in this build's logs, so no Wings press is graded on Dawnlight count; rule 56 carries Dawnlight. [Maxroll; Felipe] [log: no Dawnlight debuff was applied at any of the 206 Avenging Wrath presses in the ten flows; every application lands with a spender after Wake, 1.8 to 2.4 per Wake]
58. A Dawnlight on a target that dies within a few seconds of the application lost most of its value: report those applications. [Lightblade: "Those targets do have to live long enough, so you get the full value of these Dawnlights"]

## 15. Verification

Two verifiers read the draft against the sources and the logs (verify-sources.txt, cited as "sources N"; verify-logic.txt, cited as "logic N"). Neither refuted it. Every correction they listed is applied above. One line each.

Audit rules
- Rule 1: Walk Into Light counted as a separate generator; the log confirms its 2 Holy Power per Wings (logic 2, 21).
- Rule 2: in-wings waste values added (Hammer of Wrath 3, about 5 for a Divine Resonance repeat, Divine Toll targets hit plus 2) so the count is right (logic 21; the Resonance value from the checker).
- Rule 4: no longer a mistake either way at 4 with Art of War up; Method has no stack count and the references spend first; with no Art of War it stays a fault (sources 12, logic 11).
- Rule 5: a count; a mistake only at 5 or at 4 with an auto due, per Method's line 5; Maxroll's threshold belongs to a Templar list and is shelved; the Radiant Glory tie is recorded in sections 7, 8.10, 12 and 13.11 (sources 2, logic 8, 14).
- Rule 6: Divine Toll's in-wings yield is targets hit plus 2, up to 7; the draft undercounted by 2 (logic 4).
- Rule 7: Maxroll's condition quoted, which does not name Avenging Wrath (sources 4); low weight on the exception added by the editor, as a consequence of rule 11's shelving (logic 13).
- Rule 8: the in-wings waste of 2 added (logic 21).
- Rule 9: downgraded to a report, leaving out the Arbiter, free Divine Purpose and Empyrean Legacy spenders; the references spend at 3 most of the time (logic 9).
- Rule 10: the "check the resource events first" clause dropped; the log shows the Walk Into Light Blade generates 2, so a Hammer of Wrath in wings gives 3, and about 5 as one of the three Divine Resonance repeats after Divine Toll (logic 2, 3; the checker). The Arbiter-spender exception was added from Method's lines 3 and 9 (the checker).
- Rule 11: shelved to section 12; it is Templar setup, and for Herald 3 + 2 + 3 overcaps (logic 13).
- Rule 12: opener Divine Toll waste at 2 or less is no longer graded, since the corrected yield makes it unavoidable after the sources' own spenders; an editor's consequence of logic 4.
- Rule 13: Avenging Wrath and Execution Sentence accepted in either order, matching 13.3 (logic 12).
- Rule 14: tags fixed (the sequence is NinoMMO's; Myuvilo backs only the Final Verdict first), either order accepted, and the Empyrean Legacy tooltip point added (sources 3, logic 12, 23).
- Rule 17: pairing tolerance widened from 3 to 5 seconds; Kelimdall's Execution Sentence trails Wings by up to 5.0 s (logic 12).
- Rule 18: "measure first" dropped; the log fixes the cooldown at 1 minute (logic 1).
- Rule 19: graded against the 1-minute cooldown, not "the measured cooldowns" (logic 1).
- Rule 20: lost funnel damage is a report, and the hold exemption needs the next pack within a few seconds (logic 17).
- Rule 21: low weight on "a Wake in every window", Felipe's own caveat, and the window-wins tiebreak stated (sources 6, logic 16).
- Rule 22: holding Divine Toll for the window is correct; only a Toll outside the window is a fault (logic 18).
- Rule 25: "when off cooldown" for the potion; Myuvilo's macro marked as from his video description (logic 15, sources 8).
- Rule 27: "when off cooldown"; the Bloodlust clause retagged Felipe, with its Heart-trinket context (logic 15, sources 7).
- Rule 29: the Arbiter Final Verdict and the Empyrean Legacy Final Verdict added to the exceptions; the Hammer of Wrath exception removed as wings-only; 4 Holy Power deferred to rules 3 and 4 so it agrees with rule 4 (sources 1, logic 6, 11).
- Rule 30: reworded so a Blade at 3 or less with no Hammer charge and no Arbiter is Method-correct and contested (sources 5, logic 10).
- Rule 31: the Judgment clause and the 2+ target clause removed (one button; the Art of War Blade is an outside-wings line); Myuvilo's tag narrowed to his AoE list (sources 13, logic 6).
- Rule 33: the Hammer of Wrath clause removed (never ready outside wings); Felipe's tag narrowed to the Art of War Blade (sources 11, logic 6).
- Rules 34 and 35: the fault and count split made explicit (logic 24).
- Rules 36 and 39: "expires" marked as this rulebook's inference, with the log's lapse counts as support (sources 10).
- Rule 50: conditioned on Cleanse Toxins, which the player's string takes (logic 19).
- Rule 51: conditioned on the player having Intercession, which no decoded string shows (logic 19).
- Rule 54: Light of Justice flagged at lower weight (45 of 50); interchangeable class picks not flagged; the player passes (sources 9, logic 19).
- Rules 56 and 58: Dawnlight rules added from Maxroll and Lightblade (logic 20). Rule 57 was added from Maxroll's Avenging Wrath clause and shelved after the check: the logs show no Dawnlight at any of the 206 Wings presses.

Sections
- Top: the [log] tag defined; Myuvilo's macro provenance noted (sources 8).
- Section 1: Myuvilo's macro marked as from his video description (sources 8).
- Section 3: the player's decoded picks added (logic 19).
- Section 4: Walk Into Light, the Walk Into Light Blade, Crusading Strikes, the 2pc, the one-button fact, the usable-proc buff and Divine Toll's single Blade settled from the log; "each one casts a Blade of Justice" removed (logic 2 to 7, 22).
- Section 5: the arithmetic note fixed with the log's Walk Into Light and Divine Toll values; Myuvilo's macro provenance (logic 2, 4; sources 8).
- Section 6: one-button note; Myuvilo's single-target Hammer line; the line 7 and 8 reversal marked as never deciding a press (sources 13, logic 6).
- Section 7: cooldown set at 1 minute; rule 8 shelved; Wake threshold tied to Radiant Glory and shelved; window tiebreak; Divine Toll hold; macro provenance (logic 1, 13, 14, 16, 18; sources 2, 8).
- Section 8: rule 5 lists Wake and Divine Toll first; rule 6 exceptions; rule 8 shelved; rule 10 threshold shelved; rule 14 added for in-wings values (logic 8, 9, 13, 14, 21).
- Section 10: Cleanse Toxins and Intercession talent notes (logic 19).
- Section 12: the shelved Herald items listed (logic 13, 14).
- Section 13: items 2, 12 and 15 settled from the log; items 3, 6, 9, 11 and 13 given log figures or grading pointers (logic 1, 5, 7, 11, 12, 14, 23).

Figures that differ from the verifiers' (the flow files were rechecked)
- Logic 8 cites Kelimdall's Wake at 3 or more on 42 of 42, 45 of 45 and 41 of 41 casts. That is the audit's wakeAt3Plus, which reads Holy Power after Wake's own gain whenever the gain is logged before the cast, as it is for every Kelimdall Wake but one (40 of 41 in Ruby Life Pools). The model-checked flow figures are used: 19 to 26 of 40 to 45.
- Logic 11's counts (Kelimdall 67 of 71, 51 of 54, 62 of 67; Böllerbob 34 of 48; player 93 of 100) cover 4 or more Holy Power. Rule 4 is about 4, so it cites the exact-4 counts: 136 of 143, 14 of 22, 55 of 64.
- Logic 8 says the references' Wings-window Wake comes at 5 on most casts: true for Böllerbob (11 of 19 windows), not for Kelimdall (38 of 127).
- Logic 18's player counts (16 of 28, 6 of 9, 15 of 22) recount as 17 of 28, 6 of 8 and 15 of 21 Divine Tolls inside the window.
- Logic 12 says the player presses Execution Sentence first in every window: 56 of 60; in the other 4 it trails by up to 0.7 s.
- Logic 16 says the four late in-window Wakes were the previous Wake's lateness carried forward: three were; the one at 9.4 s was ready at the Wings press.
- Logic 4 says Felipe has Divine Toll only cast Hammer of Wrath in an area; he also says "Divine Toll will also trigger an automatic Blade of Justice", one Blade, as the log shows.
- Logic 17's "the references never hold" rests on minimum gaps, which cannot show a hold; not used as evidence.
- Logic 19's "the task's cast list has neither" is not in the files read; only the decoded strings are cited.

Settled after the check
- The references press the Wings-window Wake at once, without spending first, in 17 of 19 windows (Böllerbob) and 124 of 127 (Kelimdall), at 5 Holy Power in 11 and 38 of them. Rule 2 alone would grade a Wake at 5 as a mistake. The opener is now scoped to every Avenging Wrath window (section 14, Opener), so rule 12 exempts that Wake and rule 2 does not fault it.
- The checker's four new errors are fixed above: the Divine Resonance Hammer yield of about 5 (rules 2, 8 and 10, sections 4 and 8, 13.9); rule 57 shelved (no Dawnlight lands at a Wings press in any of the 206 windows); the section 12 line on where the Herald openers enter (Lightblade enters at 3); and rule 10's exception for an available Arbiter spender. The cosmetic line on rule 5's Radiant Glory tie is corrected too.
