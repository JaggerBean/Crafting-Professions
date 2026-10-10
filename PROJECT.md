# Crafting Professions — PROJECT

Companion module to **Gathering Professions** (`gathering-professions`). Adds crafting professions in the style of *Davi's Professions Document* (based on Ghostfire Gaming's Grim Hollow professions), with recipes run by the shared Gathering Professions engine and Recipes window.

Status: Blacksmith and Bounty Hunter implemented. Crafting Professions 0.4.1 requires Gathering Professions 0.30.0. The 2026-10-09 deep-review fixes pass local regression tests; live UI and multiple-client verification remain pending (see CONTEXT.md). Historical design notes below are retained, but do not override current implementation or manifests.

**Change 2026-10-09:** the user dislikes Mastercrafted's UI. Refining now uses Gathering Professions' own engine and **Recipes window** (party-wide discovery, products grouped, batch crafting, timed jobs). Crafting professions should plug into that same engine and window (new tabs such as Blacksmith), not Mastercrafted. The Mastercrafted notes below are kept for reference only. First profession: **Blacksmith**.

## Dependencies

- Foundry v14, dnd5e, Gathering Professions 0.30.0+ (required), Kris's Compendium of Trade Goods `kctg-5e` (recommended, for preset recipes). Mastercrafted is not required.
- Reuses Gathering Professions' rank/die/XP engine, GM hub styling, and skill-tree link.
- Shared recipe helpers include runActorAction (active-GM-granted, renewable character leases) and rollProfessionCheck (native dnd5e roll APIs). Reward jobs persist until component receipts confirm delivery. An active GM is required for player actions. The lease coordinates module actions, not arbitrary edits from other integrations.

## Decisions (user, 2026-10-09)

| Topic | Decision |
|---|---|
| Module | New companion module `crafting-professions`, requires Gathering Professions + Mastercrafted. |
| First profession | Blacksmith. Others later (Leatherworker, Carpenter, Alchemist...). |
| Write-up | New Blacksmith entry in the doc's style (draft below; user to review). |
| Ranks | 5 ranks, profession die d4 / d6 / d8 / d10 / d12 (same as gathering; recipe tier N ↔ rank N). |
| Ranking up | Hybrid: crafting earns XP; reaching the threshold also needs the rank's story goal, confirmed by the GM (milestone). |
| How many | Doc rule: start with one crafting profession; GM may grant more after a story arc; each advances separately. |
| Doc extras | Profession ability (once per long rest, 1 hour, DC 15 + profession die), choice of standard or Wanderer ability (fixed once chosen), talents (one at selection, one per rank-up). Not holdings. |
| Talents | Picked in the profession menu. A roll a talent may apply to shows an "Add profession die (talent)" option; crafting checks add it automatically. |
| Craft roll | Like gathering: d20 + ability + Smith's Tools proficiency + profession die vs recipe tier DC (rank lowers DC). Degrees: fail / success / excellent (bonus output) / masterful (bonus + chance of a superior version). |
| Failure | Fail by < 5: lose half the materials (rounded up). Fail by 5+ or natural 1: lose all. Time is spent either way. |
| Recipes | (Updated 2026-10-09) Party auto-learning from ingredients is ONLY for gathering refining. Crafting recipes are learned in three ways: the GM grants them (Recipes window learn control), a recipe item found or bought that a player uses to learn it, or experimenting: a cauldron-style feature where players put items in to test whether they make anything (like Mastercrafted's cauldron). Rank still limits which tiers can be crafted. |
| Ingredients | Cross-profession: mainly mining, plus Logging (handles) and Skinning (straps) goods. |
| Products | dnd5e SRD gear (weapons, armour, shields) + Kris hardware/tools (Nails, Horseshoe, Tongs, Chisel...). |
| DC / XP tables | Separate crafting tables (GM hub), pre-filled with the gathering defaults. |
| Masterful result | Gear gets a **Masterwork** quality: no attack/AC bonus, but double durability and double value; later perks may build on it. |
| Build order | 1) Refining in Gathering Professions + Logging preset fix. 2) Crafting Professions skeleton + Blacksmith rank/XP/check. 3) Tier 1 Blacksmith recipes. 4) Ability, Wanderer ability, talents. |
| Time | Tier 1 = 1 h, 2 = 2 h, 3 = 4 h, 4 = 8 h, 5 = 1 day (Mastercrafted timed crafting with world time). Refining takes half. |

## Blacksmith build decisions (user, 2026-10-09, second round)

These replace older rows above where they conflict.

| Topic | Decision |
|---|---|
| Module | Separate companion module `crafting-professions`; requires Gathering Professions; **no Mastercrafted**. Registers its professions, recipes, and learning rules into Gathering Professions' recipe engine; Blacksmith is a tab in the same Recipes window. |
| Recipe knowledge | Per character by default (only the character who learned it). **GM toggle**: party mode (anyone learning it teaches every character; they still need the profession and rank to craft). |
| Starting recipes | Choosing Blacksmith teaches a starter set: **Nails, Horseshoe, Caltrops**. |
| Rank limit | Can learn any tier, but craft only when Blacksmith rank ≥ recipe tier. |
| Recipe items | "Recipe: <product>" scroll Item. Owner clicks **Learn recipe**; needs the right crafting profession; the scroll is consumed. GM makes them with a **Make recipe scroll** button per recipe (folder "Recipe Scrolls", price by tier: 10 / 25 / 100 / 500 / 2,500 gp). |
| Experimenting | Put items into the forge (Blacksmith tab). If the set of item types matches an unknown recipe of that profession with tier ≤ rank, it is **learned only** (nothing used; craft normally later). Quantities don't matter. A miss costs **nothing** (no time, no items). Hint on a miss: "Something here could work…" if the items are part of an unknown recipe, else "Nothing comes of it." |
| GM grant | In the Recipes window the GM chooses a character; each crafting recipe's learn control sets Learned / Unlearned for that character (everyone in party mode). |
| Check | d20 + Strength + proficiency bonus (if proficient with Smith's Tools) + Blacksmith die vs crafting tier DC − rank reduction. **Smith's Tools must be in the inventory.** |
| Choosing / rank | Same profession menu (hammer button) gets a **Crafting** section: choose Blacksmith (once; GM can add more), rank, die, XP, next rank's story goal; later ability and talents. |
| Rank up | **GM toggle**: "GM confirms" (menu shows "Ready for Rank N: <story goal>", GM gets a whisper, GM clicks Promote; XP keeps banking) or "Automatic" at the XP threshold. |
| Failure | Fail by < 5: lose half the materials (rounded up). Fail by 5+ or natural 1: lose all. |
| Excellent / Masterful | **GM-configurable per degree** (GM hub): any mix of extra product (number, 0 = none), Masterwork, and a perk. Defaults: Excellent = Masterwork; Masterful (or natural 20) = Masterwork + perk. |
| Masterwork | "Masterwork <item>", double value. **No durability or combat effect.** |
| Perks | GM-edited list in the hub: name, description, item types it fits (weapon / armour / tool / any), optional effects: weight ×, value ×, +damage (weapon base damage bonus), +AC (armour), tool durability ×. Module ships a starter list (Light, Balanced, Reinforced, Ornate, Keen…). Who picks: **GM setting** — GM (whisper card with fitting perks), the crafting player, or random. |
| Products | dnd5e **2024 Equipment** compendium (`dnd5e.equipment24`) + Kris hardware + Gathering Professions' gathering tools. |
| Crafting tables | Separate crafting DC / XP / time per tier and rank XP / reduction (crafting module settings, GM hub), defaults from gathering; time T1 1 h, 2 h, 4 h, 8 h, 1 day. |

### Tier 1 Blacksmith recipes (approved)

| Product | From | Source |
|---|---|---|
| Nails ×10 (starter) | 1 Copper Ingot | Kris |
| Horseshoe ×2 (starter) | 1 Copper Ingot + 1 Coke | Kris |
| Caltrops (starter) | 1 Copper Ingot | dnd5e |
| Dagger | 1 Copper Ingot + 1 Cured Hide | dnd5e |
| Sickle | 1 Copper Ingot + 1 Cedar Plank | dnd5e |
| Light Hammer | 1 Copper Ingot + 1 Pine Plank | dnd5e |
| Handaxe | 2 Copper Ingot + 1 Cedar Plank | dnd5e |
| Spear | 1 Copper Ingot + 2 Split Bamboo | dnd5e |
| Arrows ×20 | 1 Copper Ingot + 2 Split Bamboo + 1 Fletching Feathers | dnd5e |
| Crossbow Bolts ×20 | 1 Copper Ingot + 1 Pine Plank + 1 Fletching Feathers | dnd5e |
| Miner's Pick | 2 Copper Ingot + 1 Cedar Plank | gathering tool |
| Herbalism Sickle | 1 Copper Ingot + 1 Cedar Plank | gathering tool |
| Woodcutter's Axe | 2 Copper Ingot + 1 Pine Plank | gathering tool |
| Skinning Knife | 1 Copper Ingot + 1 Cured Hide | gathering tool |
| Chisel | 1 Copper Ingot + 1 Pine Plank | Kris |
| Flat Tongs | 1 Copper Ingot + 1 Pine Plank | Kris |

### Build plan

1. Gathering Professions: recipe **provider registry** (refining becomes the first provider; the Recipes window, GM controls, editor, and crafting engine work per provider), profession-menu extension hooks, item-sheet "Learn recipe" hook point.
2. Crafting Professions module: crafting professions + Blacksmith data, actor state (profession, XP, rank, known recipes), check, rank-up modes, knowledge modes, crafting tables, degree outcomes, Masterwork, perks, recipe scrolls, experimenting, tier 1 recipes, profession-menu section.
3. Later: profession ability, Wanderer ability, talents; tiers 2–5.

## Bounty Hunter design (user, 2026-10-09)

A "unique" profession that reuses the crafting engine with different flavour. Based on the doc's Bounty Hunter (Investigation; Hunter's Pursuit / Fresh Trail; ranks Tracker → Bloodhound → Reclaimer → Master Tracker, plus a fifth to match our 5 ranks).

| Blacksmith | Bounty Hunter |
|---|---|
| Smithing tab, "Forge" | **Bounties** tab, "Hunt" |
| Recipe | **Contract (job)** with a short brief explaining the situation |
| Tier 1–5 | Danger tier 1–5 (rank ≥ tier to take it) |
| Ingredients | **Required gear**, each item with a reason ("Manacles — he must arrive alive"). Per item per job: **used up** or **kept** on success; kept items may be marked **at risk** |
| Product | **Gold** (into the character's dnd5e currency) |
| Recipe scroll | **Contact scroll** ("Contact: Harbor Watch Sergeant"): unlocks that contact's jobs (one contact → several jobs) |
| Experimenting | **Asking around** (below) |
| GM grant | GM grant (same per-character / party switch) |
| Crafting time | Hunt duration; gold arrives when world time passes |
| Grouped by product | Grouped by **contact** |

**Check:** d20 + Intelligence + proficiency (Investigation) + Bounty Hunter die vs job DC − rank reduction.

**Contract types:**
- **Kill:** proof of death; tier DC; base gold.
- **Retrieval (alive):** tier DC **+3**, gold **×1.5** (both GM settings); restraint gear.
- **Dead or alive:** the hunter picks Kill or Alive when pressing Hunt; each choice has its own gear list, DC, and reward.

**Results:**
- Success: full gold + Bounty Hunter XP. One-time jobs are then done; repeatable jobs stay (set per job).
- Excellent / Masterful (natural 20): GM-configurable like the Blacksmith: bonus gold and/or a **rare find on the quarry** (job loot table, tier rare table, or GM pick). Replaces Masterwork/perks.
- **Near miss (fail by 1–4):** the quarry got away; no gold; the job stays open (even one-time jobs). Gear: half of the used-up items lost (rounded up).
- **Bad failure (fail by 5+ / natural 1):** bounty failed; all used-up items lost, **plus every kept item marked "at risk"** for that job.

**Asking around** (replaces experimenting): the hunter presses Ask around. The **GM gets a pop-up** to Allow / Deny, and sets before the roll: the **skill** (Investigation, Persuasion, Intimidation, Insight…), the **DC**, and the **result on success** — pre-filled with a suggested unknown job of a tier the hunter can take, changeable to any job or to "nothing useful". Then the roll (skill + Bounty Hunter die). Success: they learn the GM's chosen job. Failure: "Nobody's talking." No cost.

**Example tier-1 jobs** (starters marked ★; gear uses goods the other professions make):
- ★ Wanted: Garrick the Fence — dead or alive. Kill: Dagger (close work in the alleys), 20 gp. Alive: Manacles, 30 gp.
- ★ Rats in the Granary — kill. Caltrops (block the drains), Torch (smoke them out). 10 gp. Repeatable.
- The Bellmaker's Debt — retrieval. Manacles (must arrive alive), Hempen Rope (slippery on the road), Wanted Poster (so townsfolk recognise him). 38 gp.
- Old Tusk (giant boar) — dead or alive. Kill: 2 Hunting Traps, Spear, 20 gp. Alive: 2 Hunting Traps, Hempen Rope, Sedative Herbs, 30 gp.
- Deserter on the North Road — retrieval. Manacles, Horseshoe (a remount), Rations. 30 gp.
- The Mill Road Bandits — kill. Arrows ×20 (ambush at range), Rope (string up proof). 35 gp. Repeatable.

**Engine additions needed** (Gathering Professions recipe engine + Crafting Professions): per-ingredient used-up / kept / at-risk; gold rewards; rare-find draws on great results; grouping by contact and contact scrolls that unlock a group; per-provider wording ("Bring", "Hunt"); alternative choices per recipe (Kill / Alive) with their own gear, DC, and reward; repeatable vs one-time recipes; GM-approved asking around with GM-set skill, DC, and result.

## Bounty Hunter v2: contacts and contracts (user, 2026-10-09)

Replaces the flat job list of 0.3.0. Two kinds of work:

| | Contact | Contract |
|---|---|---|
| What | A person who gives one **repeatable task** that isn't about a specific person ("bring in anyone wanted for debt", "proof of any bandit on the roads") | A **one-time** job with a **named target** and a real reason, tied to a **town** |
| How many | **3 per tier** (15), written by me, editable | GM-written, or **Generate** from tables (name, reason, quarry, gear, reward); edit before granting |
| Repeats | Limit **set per contact**; default **once per long rest** | Once, then done |
| Town | — | A town name on the contract; can be completed anywhere once taken |
| Learned from | Asking around, contact letters, GM | Asking around, GM |

**Tiers** (quarry and job type climb):
- T1 commoners (debtors, runaways, petty thieves): retrieval only (never killed).
- T2 criminals and deserters: retrieval, some dead or alive.
- T3 bandit chiefs, smugglers, rogue mages, dangerous beasts: dead or alive.
- T4 assassins, cult leaders, monsters: mostly kill.
- T5 warlords, notorious villains, legendary monsters: kill, with a head or trophy as proof.
- Rank ≥ tier to take it.

**Rewards** (low / gritty scale), task / contract: T1 3–8 / 10–25 gp, T2 12–30 / 40–100, T3 50–125 / 150–375, T4 200–450 / 500–1,250, T5 750–1,500 / 2,000–5,000. Retrieval and dead-or-alive rules, gear (used / kept / at risk), near-miss and failure rules, great results (bonus gold, rare finds), and timed pay stay as in v1.

**Asking around:** the GM pop-up keeps Allow / Deny, skill, and DC. The result can be **any contact or any contract**, or a contract **generated on the spot**, or "nothing useful". It asks for the **town**; pre-selected: an open contract for that town the hunter doesn't have, else an unmet contact of a tier they can take.

**GM management:** a **Bounties** section in the GM hub (next to Crafting): contacts by tier (task, gear with reasons and modes, reward, repeat limit, letter button) and contracts grouped by town (write, Generate, edit, delete, who has it, completed by whom).

**Conversion of the 0.3.0 jobs:** Garrick the Fence, The Bellmaker's Debt, Old Tusk, and the North Road Deserter become example tier-1 contracts; Rats in the Granary and the Mill Road Bandits become contacts' repeatable tasks where they fit. Contact letters stay.

## Refining belongs to gathering (built in Gathering Professions, not here)

Any gatherer refines their own materials without a crafting profession.

- Mining: smelting (ore + Coal → ingots; stone → bricks).
- Logging: milling (logs → planks/lumber; Charcoal, Pine Tar).
- Skinning: tanning (hides → Cured Hide, Grain Leather, ...).
- Herbalism: preparation (herbs → dried herbs, oils, extracts).
- Done through Mastercrafted recipe books ("Mining — Smelting", ...). Those recipes roll the **gathering** profession's check at the material's tier and give gathering XP. Gentler than crafting: failure loses part of the input; Excellent/Masterful can give a bonus unit.
- Consequence: the Logging preset changes so planks/lumber are refining outputs only; Logging materials become raw wood (about 4 per tier).

## Mastercrafted integration (verified in Mastercrafted 6.0.5 source)

- No hooks. Each recipe's `macroName` may hold inline JS (used when no macro has that name), run before crafting with `(actor, componentsToConsume, product, productData, macroArgs, inventoryActor)`. It returns `{ success, consume, checkResult, timeMultiplier }`.
- `checkResult` drives Mastercrafted's `modifierList` (DC thresholds → bonus quantity expression). Use it for Excellent/Masterful bonus output.
- Partial material loss: return `{ success: false, consume: false }` and remove half the materials ourselves.
- Recipes are `JournalEntryPage` documents of type `mastercrafted.mastercrafted` inside recipe-book journals (`flags.mastercrafted`). A module can generate them, as the material presets do.
- Recipe visibility is per user (`ownership`), not per character. Rank limits are enforced in the craft check ("Requires Blacksmith rank 2").

## Blacksmith (approved 2026-10-09)

*"Iron remembers every blow. Make each one worth remembering."*

Blacksmiths turn the mountain's bones into the tools of every other trade. The farmer's sickle, the miner's pick, the soldier's blade, and the nail that holds the roof above them all pass across an anvil first. A village without a smith is a village living on borrowed iron, and everyone knows it. Smiths are rarely rich and never idle; their forges burn before dawn and their arms carry the scars of a thousand sparks.

- **Skill Proficiency:** Athletics
- **Tool Proficiency:** Smith's Tools
- **Additional Equipment:** Smith's tools, a scorched leather apron and gloves, a set of tongs, a whetstone, and the first nail you ever forged, kept on a cord.

**Ability: Temper and True.** Upon spending one hour at a forge working on up to six weapons, suits of armour, or tools and succeeding on a medium-DC Strength (Athletics) check, you bring them to peak condition. Until your next long rest, each weapon or suit of armour cannot be broken by mundane means. Each gathering tool regains all of its durability, and a broken one is repaired.

**Wanderer Ability: Cold Forge.** Upon spending one hour with a campfire, flat stones, and your tools and succeeding on a medium-DC Strength (Athletics) check, you repair one broken weapon, shield, suit of armour, or tool so it works again. The repair holds until the item next breaks or you reach a proper forge. You also learn what metal it is made of and whether it hides a flaw.

**Rank 1 — Forge Apprentice.** You work the bellows and sweep the scale for a master who rarely praises you. Your hammer is heavy and your strikes uneven, but your nails hold.
- Holdings: A pallet beside your master's forge, use of the forge after hours, and the right to sell simple hardware under your master's mark.
- Progression: Forge something that saves a life or a livelihood when the regular smith could not.

**Rank 2 — Journeyman Smith.** You travel and work other men's forges, learning a trick in every town.
- Holdings: A journeyman's token recognised by smiths' guilds, a portable kit, and a standing welcome at any guild forge for a night's work.
- Progression: Complete a commission for a client who matters, such as a guard captain, a mine owner, or a temple, and have it praised by name.

**Rank 3 — Master Smith.** Your mark is known. Apprentices ask to sweep your floor.
- Holdings: Your own forge and shop, one or two apprentices, and a supply arrangement with a local mine.
- Progression: Arm a company, outfit an expedition, or rebuild a town's tools after disaster.

**Rank 4 — Guild Forgemaster.** You set the standard other smiths are measured by and settle their disputes.
- Holdings: A large forge with journeymen, a seat in the smiths' guild, and first claim on rare metals that reach the region.
- Progression: Forge a work from a legendary metal (mithral, adamantine, cold iron) that changes the outcome of a conflict.

**Rank 5 — Hand of the Anvil.** Your works are named and their histories recorded. Kings wait for you.
- Holdings: A renowned forge-hall, a school of smiths bearing your mark, and access to metals from royal or otherworldly sources.

**Talents:** the doc's Common Folk talent list, plus smithing talents (to be drafted and reviewed).

## Cook (user, 2026-10-09)

Works almost the same as the Blacksmith. Decisions: ingredients primarily gatherable by the four gathering professions (some bought is fine); Skinning gathers Beast Flesh (T1) / Beast Fat (T2), Mining gathers Rock Salt (T1) (built in Gathering Professions 0.30.1); dishes = Kris dishes + module dishes (Nettle Soup, Bone Broth, Acorn Bread); simple buffs, one meal effect at a time; ignore old Mastercrafted cooking books; Excellent +1 serving, Masterful Exquisite (double effect and value), GM-configurable; eat from the inventory (one serving, that character); no spoilage; rank 5 Hearth of Legends; check d20 + Wis + Cook's Utensils proficiency + die, utensils required, Blacksmith failure rules; abilities roll + real effects (Hearthcraft: Hearth-fed 24 h for up to 6; The Empty Pot: −1 exhaustion; Medicine DC 15, once per long rest); talents curated Common Folk + cooking talents. Approved T1 recipes: README → Cook.

## Open questions

- Talent list for Blacksmith (step 3).
