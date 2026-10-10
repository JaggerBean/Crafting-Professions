// Crafting professions, written in the style of Davi's Professions Document
// (based on Ghostfire Gaming's Grim Hollow professions). Each one rolls a dnd5e
// tool check plus its profession die.
export const MODULE_ID = "crafting-professions";
export const GP_ID = "gathering-professions";

const rank = (title, text, holdings, goal) => Object.freeze({ title, text, holdings, goal });
// applies: { skills: [dnd5e skill keys], tools: [tool keys], abilities: [ability keys for plain ability checks] }
const talent = (id, name, applies, text) => Object.freeze({ id, name, text,
  skills: Object.freeze(applies.skills ?? []), tools: Object.freeze(applies.tools ?? []), abilities: Object.freeze(applies.abilities ?? []) });

export const CRAFTING_PROFESSIONS = Object.freeze({
  blacksmith: Object.freeze({
    key: "blacksmith",
    label: "Blacksmith",
    verb: "Smithing",
    action: "Forge",
    icon: "fa-hammer",
    ability: "str",
    tool: Object.freeze({ key: "smith", name: "Smith's Tools" }),
    skill: "Athletics",
    quote: "Iron remembers every blow. Make each one worth remembering.",
    description: "Blacksmiths turn the mountain's bones into the tools of every other trade. The farmer's sickle, the miner's pick, the soldier's blade, and the nail that holds the roof above them all pass across an anvil first.",
    ranks: Object.freeze([
      rank("Forge Apprentice", "You work the bellows and sweep the scale for a master who rarely praises you.",
        "A pallet beside your master's forge, use of the forge after hours, and the right to sell simple hardware under your master's mark.",
        "Forge something that saves a life or a livelihood when the regular smith could not."),
      rank("Journeyman Smith", "You travel and work other smiths' forges, learning a trick in every town.",
        "A journeyman's token recognised by smiths' guilds, a portable kit, and a standing welcome at any guild forge for a night's work.",
        "Complete a commission for a client who matters, such as a guard captain, a mine owner, or a temple, and have it praised by name."),
      rank("Master Smith", "Your mark is known. Apprentices ask to sweep your floor.",
        "Your own forge and shop, one or two apprentices, and a supply arrangement with a local mine.",
        "Arm a company, outfit an expedition, or rebuild a town's tools after disaster."),
      rank("Guild Forgemaster", "You set the standard other smiths are measured by and settle their disputes.",
        "A large forge with journeymen, a seat in the smiths' guild, and first claim on rare metals that reach the region.",
        "Forge a work from a legendary metal (mithral, adamantine, cold iron) that changes the outcome of a conflict."),
      rank("Hand of the Anvil", "Your works are named and their histories recorded. Kings wait for you.",
        "A renowned forge-hall, a school of smiths bearing your mark, and access to metals from royal or otherworldly sources.",
        "")
    ]),
    // Learned automatically when a character takes up the profession.
    starter: Object.freeze(["Nails", "Horseshoe", "Caltrops"]),
    // Chosen when taking up the profession: the standard ability or the Wanderer one.
    abilities: Object.freeze({
      standard: Object.freeze({
        name: "Temper and True", skill: "ath", dc: 15, effect: "temper", maxItems: 6,
        text: "Spend one hour at a forge working on up to six weapons, suits of armour, or tools, and make a medium-DC Strength (Athletics) check. On a success they are in peak condition: until your next long rest, weapons and armour cannot be broken by mundane means, and gathering tools regain all their durability (a broken one is repaired)."
      }),
      wanderer: Object.freeze({
        name: "Cold Forge", skill: "ath", dc: 15, effect: "coldForge", maxItems: 1,
        text: "Spend one hour with a campfire, flat stones, and your tools, and make a medium-DC Strength (Athletics) check. On a success you repair one broken weapon, shield, suit of armour, or tool so it works again until it next breaks (a gathering tool returns to half its durability). You also learn what metal it is made of and whether it hides a flaw."
      })
    }),
    // Pick one when taking up the profession and one at each rank-up. Each adds
    // the profession die to matching checks (a toggle in the roll dialog).
    talents: Object.freeze([
      talent("calloused-hands", "Calloused Hands", { skills: ["ath"] }, "Strength (Athletics) checks to lift, drag, or shove a heavy object."),
      talent("applied-leverage", "Applied Leverage", { skills: ["ath"] }, "Strength (Athletics) checks to force open a door or container."),
      talent("field-digger", "Field Digger", { skills: ["ath"] }, "Strength (Athletics) checks to dig, clear earth, or uproot obstacles."),
      talent("hard-working", "Hard-Working", { abilities: ["con"] }, "Constitution checks for a repetitive task, such as marching or labouring for hours without rest."),
      talent("work-rhythm", "Work Rhythm", { abilities: ["con"] }, "Constitution checks to perform repetitive manual labour without tiring."),
      talent("hearty-stomach", "Hearty Stomach", { abilities: ["con"] }, "Constitution checks to resist spoiled food, cheap drink, or tainted water."),
      talent("makeshift-fix", "Makeshift Fix", { tools: ["tinker"], abilities: ["wis"] }, "Intelligence (Tinker's Tools) or Wisdom checks to jury-rig or repair a broken tool, cart, or household item."),
      talent("steady-hands", "Steady Hands", { skills: ["slt"] }, "Dexterity (Sleight of Hand) checks involving craftswork, carving, or delicate manual tasks."),
      talent("barter-tongue", "Barter Tongue", { skills: ["per"] }, "Charisma (Persuasion) checks to haggle or trade everyday goods."),
      talent("good-neighbor", "Good Neighbor", { skills: ["per"] }, "Charisma (Persuasion) checks to calm tensions or settle disputes between common folk."),
      talent("metal-sense", "Metal Sense", { skills: ["inv"], tools: ["smith"] }, "Intelligence (Investigation) or Smith's Tools checks to identify a metal, judge its purity, or spot a counterfeit metal object."),
      talent("weapon-appraiser", "Weapon Appraiser", { skills: ["inv"] }, "Intelligence (Investigation) checks to judge the quality, value, or hidden flaw of a weapon or suit of armour."),
      talent("hammer-arm", "Hammer Arm", { skills: ["ath"] }, "Strength (Athletics) checks to break an object or burst a lock, hinge, or chain by force."),
      talent("forge-hardened", "Forge-Hardened", { abilities: ["con"] }, "Constitution checks to endure extreme heat, smoke, or fumes."),
      talent("guild-tongue", "Guild Tongue", { skills: ["per"] }, "Charisma (Persuasion) checks to deal with smiths, miners, or other craftsmen for prices, favours, or gossip.")
    ])
  }),
  // Works like the Blacksmith; products are meals with effects (meals.js).
  cook: Object.freeze({
    key: "cook",
    kind: "cooking",
    label: "Cook",
    verb: "Cooking",
    action: "Cook",
    icon: "fa-utensils",
    ability: "wis",
    tool: Object.freeze({ key: "cook", name: "Cook's Utensils" }),
    skill: "Medicine",
    quote: "Food is memory. Food is power.",
    description: "A great meal soothes fear, binds loyalty, or hides the taste of darker intentions. From steaming street stalls to royal kitchens, cooks make comfort in cruel worlds and hope in hungry bellies.",
    ranks: Object.freeze([
      rank("Kitchen Hand", "You chop vegetables, wash cauldrons, and burn your fingers learning the secrets of seasoning and flame.",
        "A cramped bunk near the kitchen that employs you, access to leftover ingredients, and a dog-eared family recipe or two.",
        "Serve a dish that earns the approval of a respected innkeeper, head cook, or master chef."),
      rank("Tavern Cook", "The stove is yours. Travellers hum contentedly after your stews; regulars call you family.",
        "Control of a tavern's kitchen, a trusted helper, a spice drawer with one rare ingredient, and a room above the kitchen.",
        "Cater a feast for an influential figure, a noble, a merchant guild, or a knightly order, and earn their praise."),
      rank("Master Chef", "Nobles send for your craft; temples ask you to prepare sacred meals. You have studied foreign kitchens and dangerous ingredients.",
        "A prestigious restaurant or noble kitchen, a staff of skilled cooks, a cellar of exotic ingredients, and a guest book of powerful patrons.",
        "Serve a dish so exquisite (or so daring) that it is spoken of across the region, or a meal that prevents bloodshed or seals a treaty."),
      rank("Culinary Sovereign", "You are culture, diplomacy, comfort, and fear. Kings dine at your table; rivals study your sauces like grimoires.",
        "A culinary estate or legendary school, elite apprentices, control of rare ingredient routes, and invitations to courts and secret societies.",
        "Create a dish that becomes part of a realm's traditions, served at its coronations and funerals."),
      rank("Hearth of Legends", "Your dishes are told in stories across realms. Armies march on recipes that bear your name, and nations would steal your notebooks.",
        "A school of cooks in several cities, vaults of ancestral spices and recipe scrolls, and the standing of an envoy wherever you cook.",
        "")
    ]),
    starter: Object.freeze(["Tea", "Nettle Soup", "Jerky"]),
    abilities: Object.freeze({
      standard: Object.freeze({
        name: "Hearthcraft", skill: "med", dc: 15, effect: "hearthcraft", maxItems: 6,
        text: "Spend one hour preparing a fresh meal for up to six creatures and make a medium-DC Wisdom (Medicine) check. On a success, each creature who eats has advantage on one saving throw against disease, poison, or fatigue within the next 24 hours. Mundane food sickness or a mild poison is cured; a magical one is suppressed for 24 hours."
      }),
      wanderer: Object.freeze({
        name: "The Empty Pot", skill: "med", dc: 15, effect: "emptyPot", maxItems: 6,
        text: "Spend one hour preparing a meal from whatever the land provides and make a medium-DC Wisdom (Medicine) check. On a success the meal feeds your whole party, and each creature that eats removes one level of exhaustion."
      })
    }),
    talents: Object.freeze([
      talent("hearty-stomach", "Hearty Stomach", { abilities: ["con"] }, "Constitution checks to resist spoiled food, cheap drink, or tainted water."),
      talent("forage-finder", "Forage Finder", { skills: ["sur"] }, "Wisdom (Survival) checks to find food, water, or natural resources in the wild."),
      talent("subtle-seasoning", "Subtle Seasoning", { skills: ["inv", "ins"] }, "Intelligence (Investigation) or Wisdom (Insight) checks to detect poison or tampering in food or drink."),
      talent("warm-welcome", "Warm Welcome", { skills: ["per"] }, "Charisma (Persuasion) checks to ease tensions or earn lodging by offering food or hospitality."),
      talent("rationmaster", "Rationmaster", { skills: ["sur"] }, "Wisdom (Survival) checks to stretch supplies, preserve rations, or prepare food for long travel."),
      talent("hedgerow-healer", "Hedgerow Healer", { skills: ["med"] }, "Wisdom (Medicine) checks using natural herbs or improvised remedies."),
      talent("barter-tongue", "Barter Tongue", { skills: ["per"] }, "Charisma (Persuasion) checks to haggle or trade everyday goods."),
      talent("familiar-faces", "Familiar Faces", { skills: ["per"] }, "Charisma (Persuasion) checks to ask common folk for help, shelter, or kindness."),
      talent("harvest-timing", "Harvest Timing", { skills: ["nat"] }, "Intelligence (Nature) checks to predict crop growth, animal behaviour, or seasonal shifts."),
      talent("butchers-eye", "Butcher's Eye", { skills: ["nat"] }, "Intelligence (Nature) checks to tell whether meat, fish, or a carcass is safe to eat."),
      talent("market-nose", "Market Nose", { skills: ["ins"] }, "Wisdom (Insight) checks to judge whether a merchant's food or spices are fresh, fair, or a swindle."),
      talent("campfire-cook", "Campfire Cook", { tools: ["cook"] }, "Cook's Utensils checks made over an open fire with no proper kitchen."),
      talent("iron-gut", "Iron Gut", { abilities: ["con"] }, "Constitution checks to keep down strange, foreign, or monstrous food.")
    ])
  }),
  // A "unique" profession: contracts instead of recipes, gold instead of
  // products, gear brought along instead of materials (see contacts.js).
  bountyhunter: Object.freeze({
    key: "bountyhunter",
    kind: "bounty",
    label: "Bounty Hunter",
    verb: "Bounties",
    action: "Hunt",
    icon: "fa-crosshairs",
    ability: "int",
    skill: "inv",
    tool: null,
    quote: "Everyone runs. Not everyone gets away.",
    description: "Bounty Hunters live in the grey between justice and crime: half mercenary, half bloodhound. They track fugitives, debtors, deserters, or monsters, and bring them in dead or alive for gold.",
    ranks: Object.freeze([
      rank("Tracker", "You live job to job, scraping together bounties from local magistrates or criminal guilds: petty thieves, deserters, and debtors no one else bothers to chase.",
        "A list of local bounties, an old informant who feeds you occasional leads, and a ramshackle bunk near the edge of town.",
        "Capture or kill a high-value target with a bounty worth more than a month's wages, earning the attention of a major guild or patron."),
      rank("Bloodhound", "Your reputation as a dependable hunter spreads. Nobles, guard captains, and syndicates hire you for fugitives, escaped prisoners, and traitors.",
        "A reliable contact in the watch or a thieves' guild, a trained hound or hawk, and a modest safehouse stocked with ropes, restraints, and traps.",
        "Hunt down and deliver a target of political or criminal importance, cementing your reputation as a professional hunter."),
      rank("Reclaimer", "You recover what others cannot: a fugitive, an artifact, a runaway heir. Gangs abandon territory rather than be hunted by you.",
        "A small team of scouts and interrogators, a network of tavern-keepers and guards who report sightings, and a collection of grim trophies.",
        "Capture or slay a legendary fugitive, beast, or outlaw whose name is known across the realm, and live to tell the tale."),
      rank("Master Tracker", "You are a figure of dread and legend. Criminals pause before crossing your path; some run to ground at the rumour of your coming.",
        "A retinue of lesser hunters paying you a share, warrants from high lords letting you cross borders in pursuit, and a fortified lodge of trophies and wanted posters.",
        "Bring in a quarry that a kingdom's own forces have failed to catch, on a warrant signed by its ruler."),
      rank("Warden of the Hunt", "Your word ends manhunts. Rulers seal treaties that name you the arbiter of who may be hunted across their borders, and every hunter in the realm answers to your guild.",
        "A hunters' guild bearing your name, standing warrants valid in several realms, and the right to grant or revoke any hunter's licence.",
        "")
    ]),
    // A first contact (repeatable work); more come from asking around, letters, or the GM.
    starter: Object.freeze(["contact.harbor-watch"]),
    abilities: Object.freeze({
      standard: Object.freeze({
        name: "Hunter's Pursuit", skill: "inv", dc: 15, effect: "intel", maxItems: 0,
        text: "Spend one hour studying evidence, questioning witnesses, or examining signs of passage, and make a DC 15 Intelligence (Investigation) check to track a named or clearly described quarry. On a success you learn their direction of travel, recent activity, and likely next destination within 24 hours. On a failure you can't try again on that quarry until you find new evidence."
      }),
      wanderer: Object.freeze({
        name: "Fresh Trail", skill: "inv", dc: 15, effect: "intel", maxItems: 0,
        text: "Spend one hour in a new settlement asking the right questions of the right people, and make a medium-DC Intelligence (Investigation) check. You learn whether your quarry has passed through in the last two weeks; if so, when, which way they left, who they spoke to, and one detail about their condition or purpose."
      })
    }),
    talents: Object.freeze([
      talent("bounty-hunter", "Bounty Hunter", { skills: ["sur"] }, "Wisdom (Survival) checks to track criminals."),
      talent("interrogator", "Interrogator", { skills: ["itm"] }, "Charisma (Intimidation) checks to extract information from a restrained enemy."),
      talent("heister", "Heister", { skills: ["prc"] }, "Wisdom (Perception) checks to spot traps, sentries, and other security measures."),
      talent("menacing-presence", "Menacing Presence", { skills: ["itm"] }, "Charisma (Intimidation) checks when dealing with academics, common folk, or seafarers."),
      talent("threat-of-steel", "Threat of Steel", { skills: ["itm"] }, "Charisma (Intimidation) checks while threatening violence with a weapon in view."),
      talent("nimble-fingers", "Nimble Fingers", { tools: ["thief"] }, "Dexterity (Thieves' Tools) checks to pick a lock."),
      talent("urban-sprinter", "Urban Sprinter", { skills: ["ath", "acr"] }, "Strength (Athletics) or Dexterity (Acrobatics) checks while chasing someone or running from a pursuer."),
      talent("fence-jumper", "Fence Jumper", { skills: ["ath", "acr"] }, "Strength (Athletics) or Dexterity (Acrobatics) checks to scale or vault walls, fences, or barriers in a chase."),
      talent("silent-takedown", "Silent Takedown", { skills: ["ath", "slt"] }, "Strength (Athletics) or Dexterity (Sleight of Hand) checks to restrain or subdue someone quietly."),
      talent("gutter-gossip", "Gutter Gossip", { skills: ["per", "dec"] }, "Charisma (Persuasion) or Charisma (Deception) checks to gather information from beggars, urchins, and other lowlifes."),
      talent("casing-the-joint", "Casing the Joint", { skills: ["inv"] }, "Intelligence (Investigation) checks to study a building's entrances, routines, guards, or escape routes."),
      talent("wanted-faces", "Wanted Faces", { skills: ["prc"] }, "Wisdom (Perception) checks to pick a face from a crowd that matches a wanted poster or description."),
      talent("trapper", "Trapper", { skills: ["sur"] }, "Wisdom (Survival) checks to set, hide, or spot snares and hunting traps."),
      talent("long-road", "Long Road", { abilities: ["con"] }, "Constitution checks to keep up a hard pace on a long pursuit.")
    ])
  })
});

export const RANK_DIE = Object.freeze([4, 6, 8, 10, 12]);

export function craftingProfession(key) {
  return CRAFTING_PROFESSIONS[key] ?? null;
}
