# Crafting Professions

Crafting professions for **Gathering Professions** (Foundry VTT v14, dnd5e): **Blacksmith**, **Bounty Hunter** and **Cook**. Professions are written in the style of *Davi's Professions Document* (based on Ghostfire Gaming's Grim Hollow professions).

Requires: Gathering Professions 0.30.1+. Recommended: Kris's Compendium of Trade Goods (`kctg-5e`) for hardware products. Weapons and gear come from the dnd5e **2024 Equipment** compendium.

## Reliability update (0.4.1)

Update Gathering Professions to 0.30.0 at the same time, restart Foundry, and reconnect all clients. Player profession actions require an active GM to coordinate character locks. Concurrent crafting/hunting cannot reuse the same ingredients or the same character's job allowance; public Hunt calls resolve a registered job and apply the normal ownership, knowledge, profession, rank and limit gates.

Contact letters and wanted notices now learn jobs through the inventory Use action or the sheet's Learn Job control. Retaking a removed profession restores its saved XP, rank, path and talents. Canceling an item ability or choosing no targets spends no use; Cold Forge refuses healthy gathering tools.

For a dead-or-alive bounty, leave its alive reward blank to use the dead reward multiplied by the configured alive reward factor. Generated dead-or-alive contracts use this fallback. Explicit rewards (including zero) are preserved. List each gear item once, with its total quantity.

Run `node tests/crafting.mjs` for the normal suite and review regressions. Live Foundry UI and multi-client checks remain pending; see the companion module's `REVIEW-2026-10-09.md`.

## For players

- **Choose a crafting profession** in your Professions menu (the hammer button in the token controls) under **Crafting professions**. You can take one; a second takes a story arc and the GM adds it. Taking up Blacksmith teaches the starter recipes: **Nails, Horseshoe, Caltrops**.
- **Craft** from the **Recipes** window (book button in the token controls), tab **Smithing**. Each recipe shows what you have against what it needs, the DC, your chance, and the time. You need **Smith's Tools** in your inventory and a Blacksmith rank at least the recipe's tier.
- **The check:** d20 + Strength + proficiency bonus (if proficient with Smith's Tools) + your Blacksmith die, against the tier's DC minus your rank reduction.
  - Fail by less than 5: half the materials (rounded up) are lost.
  - Fail by 5 or more, or a natural 1: all the materials are lost.
  - Success: the products and crafting XP. **Excellent** and **Masterful** results can add extra products, make the item **Masterwork** (double value), and/or give it a **perk**, as the GM sets.
- **Learn recipes** in three ways:
  - **Recipe scrolls:** with a "Recipe: …" scroll in your inventory, **use it** (click it on your character sheet), or press **Learn** next to it under "Recipe scrolls you carry" in the Recipes window's Smithing tab. (It is also under the scroll window's ⋮ menu → Learn Recipe.) You need the right crafting profession; the scroll is used up.
  - **Experimenting:** in the Smithing tab, put items from your inventory into the **Experiment** panel and press **Try**. If they are exactly the ingredients of a recipe you don't know (amounts don't matter, tier up to your rank), you learn it. Otherwise you get a hint: "Something here could work…" or "Nothing comes of it." Nothing is ever used up.
  - **From the GM.**
- **Rank up:** crafting earns XP. Depending on the GM's setting, you rank up automatically at the XP threshold, or once you have the XP **and** the GM confirms you met the rank's story goal (shown in your Professions menu).

### Ability and talents (0.2.0)

- **Ability:** when you take up Blacksmith you choose **Temper and True** (needs a forge) or the Wanderer ability **Cold Forge** (on the road). The GM can switch it later in the profession menu. Press **Use** in your profession menu: once per long rest, Strength (Athletics) + your Blacksmith die vs DC 15. A failure still uses it.
  - **Temper and True:** choose up to 6 weapons, armour, or tools. Gathering tools regain all their durability (a broken one is repaired); weapons and armour are marked Tempered (can't be broken by mundane means) until your next long rest.
  - **Cold Forge:** choose one broken item. A gathering tool returns to half its durability; other items are marked Field-repaired.
- **Talents:** you choose one when you take up the profession and one more at each rank (profession menu → Talents). When you make a matching check (for example Calloused Hands on Strength (Athletics)), dnd5e's roll dialog lists the talent: tick it if the situation applies and your profession die is added. If several apply, only the highest die is added, once.
- Blacksmith talents: Calloused Hands, Applied Leverage, Field Digger, Hard-Working, Work Rhythm, Hearty Stomach, Makeshift Fix, Steady Hands, Barter Tongue, Good Neighbor (from the doc's Common Folk list), and Metal Sense, Weapon Appraiser, Hammer Arm, Forge-Hardened, Guild Tongue (smithing).

## Bounty Hunter (0.4.0)

A "unique" profession on the same engine with different flavour: work instead of recipes, **gold** instead of products, **gear you bring** instead of materials. Two kinds of work, both in the Recipes window's **Bounties** tab:

- **Contacts** (15 by default, 3 per tier): each gives one **repeatable task** that isn't about a specific person ("bring in any pickpocket working the docks"). Each contact has a repeat limit (default once per long rest; the GM can set N per long rest, per day, or unlimited). A new Bounty Hunter starts with one contact (Sergeant Malda, Harbour Watch).
- **Contracts**: **one-time**, a **named target** with a real reason, tied to a **town** (grouped by town in the tab). Once taken, finish it anywhere.
- **Tiers:** T1 commoners, brought back alive; T2 criminals and deserters (retrieval, some dead or alive); T3 bandit chiefs, smugglers, rogue mages, dangerous beasts (dead or alive); T4 assassins, cult leaders, monsters (mostly kill); T5 warlords, notorious villains, legendary monsters (kill, a head or trophy as proof). Rank ≥ tier to take it.
- **Gold** (gritty): task / contract T1 2–4 / 5–12 gp, T2 6–15 / 20–50, T3 25–60 / 75–190, T4 100–225 / 250–625, T5 375–750 / 1,000–2,500.
- **The check:** d20 + Investigation + Bounty Hunter die vs the tier DC (+3 for retrieval) minus rank reduction. Success: gold into your coins and XP (a contract is then done). Excellent / Masterful: bonus gold and/or a rare find from the work's list. Near miss: no pay, half the used-up gear lost, a contract stays open. Bad failure: all used-up gear and every at-risk item lost. Attempts at a contact's task count toward its limit. With timed crafting, the pay arrives after the hunt.
- **Getting work:**
  - **Ask around** (Bounties tab): the GM's pop-up sets Allow / Deny, the skill, the DC, the **town**, and the result: any unmet contact, any contract the hunter doesn't have, a **newly generated contract** for that town, or nothing. Pre-selected: an open contract in that town, else an unmet contact. You roll the skill + your Bounty Hunter die.
  - **Contact letters** ("Contact: …") and **wanted notices** ("Wanted: …"): use one from the inventory, or Use in the Bounties tab.
  - **GM grants** in the Recipes window (GM view).
- **Ability:** Hunter's Pursuit or the Wanderer Fresh Trail (name the quarry; the GM gets a whisper to narrate). Ranks: Tracker, Bloodhound, Reclaimer, Master Tracker, Warden of the Hunt. Talents from the doc's Criminal list plus Wanted Faces, Trapper, Long Road.
- **GM hub → Bounties:** contacts by tier (edit task, gear with reasons and used/kept/at-risk, reward, repeat limit; make a contact letter; delete; reset to the module's 15) and contracts by town (**Generate** a contract of a tier for a town, edit before saving, write one, make a wanted notice, delete; see who has it and who finished it). **GM hub → Crafting → Bounties:** retrieval DC bonus, reward multiplier, great-result bonus gold and finds.

## Cook (0.5.0)

Works like the Blacksmith: d20 + **Wisdom** + Cook's Utensils proficiency + rank die, **Cook's Utensils** carried, the same failure rules. Ranks: Kitchen Hand, Tavern Cook, Master Chef, Culinary Sovereign, Hearth of Legends. Starter recipes: **Tea, Nettle Soup, Jerky**. Tab **Cooking** in the Recipes window.

- **Ingredients** are mostly gathered or refined (herbalism, skinning, mining, logging); only Potato and Chicken Egg are bought. Gathering Professions 0.30.1 adds Rock Salt (mining) and Beast Flesh / Beast Fat (skinning).
- **Eating:** click the dish in your inventory: one serving is eaten and its effect applies to that character. Only one meal effect at a time; a new meal replaces the last. Dishes don't spoil.
- **Great results** (GM hub → Crafting Professions → **Cooking**): Excellent = +1 serving; Masterful = **Exquisite** dish (double effect, value × 2). Both configurable.
- **Ability (standard): Hearthcraft**: Medicine DC 15 + rank die, once per long rest: up to 6 chosen diners become *Hearth-fed* for 24 hours (advantage on one save against disease, poison or fatigue; mundane food sickness cured). **Wanderer: The Empty Pot**: same check; chosen diners lose one level of exhaustion.
- **Talents:** curated Common Folk talents plus cooking talents (Subtle Seasoning, Butcher's Eye, Campfire Cook, Iron Gut…).

| Dish | From | When eaten |
|---|---|---|
| Tea ×3 (starter) | 1 Dried Chamomile, or 1 Dried Wild Mint | advantage on the next Wisdom save within 1 hour |
| Nettle Soup ×4 (starter) | 2 Nettle + 1 Chicken Bones + 1 Rock Salt | 3 temp HP |
| Jerky ×4 (starter) | 2 Beast Flesh + 1 Rock Salt | 2 temp HP (travel food) |
| Bone Broth ×4 | 2 Chicken Bones + 1 Dried Clover + 1 Rock Salt | regain 1d4 HP |
| Green Salad ×2 | 1 Dandelion + 1 Wild Mint | advantage on the next Constitution save within 1 hour |
| Meat Of The Hunt ×2 | 2 Beast Flesh + 1 Dried Wild Mint + 1 Rock Salt | 5 temp HP |
| Skewers ×3 | 1 Beast Flesh + 1 Dandelion + 1 Split Bamboo | +5 ft speed for 1 hour |
| Acorn Bread ×3 | 3 Acorns + 1 Rock Salt + 1 Chicken Egg | 2 temp HP (travel food) |
| Vegetable Soup ×4 | 2 Potato + 1 Nettle + 1 Rock Salt | 3 temp HP |

Nettle Soup, Bone Broth and Acorn Bread are module items; the rest come from Kris's compendium. The table shows the default effects; the GM can change them (below).

### Editing meal effects (0.5.1)

**GM hub → Crafting Professions → Cooking → Meal effects.** One row per dish:

- **Dish:** the recipe's product name (suggestions list the Cook's recipes). Add a row to give a custom recipe's dish an effect; remove a row to make a dish ordinary food.
- **Effect:** Temporary hit points (amount 1–999), Heal (dice formula, e.g. `1d4` or `2d4+2`), Advantage on a save (ability + minutes), Speed bonus (5–120 ft + minutes), Remove exhaustion (1–6 levels). Changing the effect shows only the fields it uses. **Travel** only adds "travel food" to the description.
- **When eaten** previews the text players see.
- **Save meal effects** stores them in the world (module updates don't touch them). **Reset to defaults** restores the table above.
- Saving affects dishes cooked from then on. **Update cooked dishes** rewrites the effect of dishes already in inventories and the Items sidebar (Exquisite ones stay Exquisite and are doubled again; dishes whose row was removed keep their old effect).

## For the GM

- **Settings:** the **GM hub** (Gathering Professions) → **Crafting Professions** group: **Rules** (shared by every crafting profession), **Cooking** (the Cook's great results and meal effects), **Bounties**. Game Settings → Configure Settings → Module Settings → Crafting Professions → **Open crafting settings** opens Rules:
  - **Modes:** rank ups (GM confirms / automatic), who knows a learned recipe (the character / the whole party), whether crafting takes world time.
  - **Great results:** for Excellent and for Masterful separately: extra products (number), Masterwork, a perk. Who picks perks (GM by whispered choice, the crafting player, or random). Masterwork value multiplier. Defaults: Excellent = Masterwork; Masterful = Masterwork + perk.
  - **Crafting ranks** (XP to reach, DC reduction, die) and **crafting tiers** (DC, XP per unit, minutes per unit; defaults 60 / 120 / 240 / 480 / 1440).
  - **Perks:** name, which items it fits (any, weapons, armour, tools), description, and effects: weight ×, value ×, +damage (weapon base damage), +AC (armour), tool durability ×. Starters: Keen, Balanced, Reinforced, Light, Ornate, Durable.
  - **Items:** Prepare items imports every product and Smith's Tools (done automatically once).
- **Recipes window (GM view):** on the Smithing tab, choose a character to grant or remove recipes (party mode: everyone). Each recipe also has **Edit**, **Make recipe scroll** (creates "Recipe: …" in Items → Crafting → Recipe Scrolls, priced 10 / 25 / 100 / 500 / 2,500 gp by tier), **Disable / Enable**, **Reset**, and **New smithing recipe**.
- **Professions menu (GM):** promote, demote, set XP, add or remove crafting professions, switch between the standard and Wanderer ability, add or remove talents.

## Tier 1 Blacksmith recipes

| Product | From |
|---|---|
| Nails ×10 (starter) | 1 Copper Ingot |
| Horseshoe ×2 (starter) | 1 Copper Ingot + 1 Coke |
| Caltrops (starter) | 1 Copper Ingot |
| Dagger | 1 Copper Ingot + 1 Cured Hide |
| Sickle | 1 Copper Ingot + 1 Cedar Plank |
| Light Hammer | 1 Copper Ingot + 1 Pine Plank |
| Handaxe | 2 Copper Ingot + 1 Cedar Plank |
| Spear | 1 Copper Ingot + 2 Split Bamboo |
| Arrows ×20 | 1 Copper Ingot + 2 Split Bamboo + 1 Fletching Feathers |
| Bolts ×20 | 1 Copper Ingot + 1 Pine Plank + 1 Fletching Feathers |
| Miner's Pick | 2 Copper Ingot + 1 Cedar Plank |
| Herbalism Sickle | 1 Copper Ingot + 1 Cedar Plank |
| Woodcutter's Axe | 2 Copper Ingot + 1 Pine Plank |
| Skinning Knife | 1 Copper Ingot + 1 Cured Hide |
| Chisel | 1 Copper Ingot + 1 Pine Plank |
| Flat Tongs | 1 Copper Ingot + 1 Pine Plank |

Ingredients come from Gathering Professions' refining (smelting, milling, tanning).

## Macros

`game.modules.get("crafting-professions").api`: `chooseProfession(actor, "blacksmith")`, `learn(actor, [recipeId])`, `forget`, `knows`, `craft(actor, recipeId, batch)`, `experiment(actor, "blacksmith", ["Copper Ingot", "Cedar Plank"])`, `makeScroll(recipeId)`, `setRank`, `setXp`, `addXp`, `recipes("blacksmith")`, `perks()`, `savePerks(list)`, `prepareItems()`, `openGm()`, `meals.list()`, `meals.eat(item)`, `meals.save(rows)`, `meals.reset()`, `meals.refreshCooked()`.

## Tests

`node modules/crafting-professions/tests/crafting.mjs` (uses Gathering Professions' crafting helpers).
