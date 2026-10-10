// Bounty Hunter work: CONTACTS (3 per tier, each with one repeatable task) and
// CONTRACTS (one-time, a named target in a town). Both are world settings the
// GM edits in the hub's Bounties section; contracts can be generated.
// A task or contract ("work"): { tier, title, brief, type: "alive"|"kill"|"either",
//   kill: { gold, gear }, alive: { gold, gear }, finds: [[name, weight]], days }
// Gear: { name, quantity, mode: "used"|"kept"|"risk", reason }.
import { MODULE_ID } from "./professions.js";
import { craftingRules } from "./rules.js";

const g = (name, quantity, mode, reason) => ({ name, quantity, mode, reason });
const work = data => data;

// Gold (gritty, halved twice): repeatable task / one-time contract per tier.
export const TASK_GOLD = Object.freeze([[2, 4], [6, 15], [25, 60], [100, 225], [375, 750]]);
export const CONTRACT_GOLD = Object.freeze([[5, 12], [20, 50], [75, 190], [250, 625], [1000, 2500]]);
export const TIER_DAYS = Object.freeze([1, 2, 3, 5, 7]);

const contact = (id, tier, name, img, text, task, limit = { per: "longRest", count: 1 }) => ({ id, tier, name, img, text, task: work({ tier, ...task }), limit });
const ICON = "icons/environment/people/";

export const DEFAULT_CONTACTS = Object.freeze([
  // Tier 1: commoners, brought back alive.
  contact("harbor-watch", 1, "Sergeant Malda, Harbour Watch", `${ICON}infantry-armored.webp`, "Malda pays for the dockside nuisances her patrols can't spare men for.", {
    title: "Dockside Pickpockets", type: "alive", days: 0.5,
    brief: "Bring in any pickpocket working the docks. The watch wants them breathing for the stocks.",
    alive: { gold: 3, gear: [g("Manacles", 1, "kept", "They go to the stocks, not the river"), g("Rope", 1, "risk", "Slippery hands")] },
    finds: [["Silver Ring", 2], ["Bone Dice", 2]] }),
  contact("bellmakers-guild", 1, "Clerk Hobb, Bellmaker's Guild", `${ICON}group.webp`, "A nervous guild clerk who would rather hire a hunter than take a debtor to court.", {
    title: "Bad Debts", type: "alive", days: 1,
    brief: "Find anyone who skipped out on a guild loan and walk them back to the counting house.",
    alive: { gold: 3, gear: [g("Wanted Poster", 1, "used", "So townsfolk point the way"), g("Rope", 1, "kept", "Debtors run")] },
    finds: [["Letter From A Loved One", 2], ["Silver Ring", 1]] }),
  contact("millbrook-reeve", 1, "Reeve of Millbrook", `${ICON}commoner.webp`, "The reeve of a farming village posts the work nobody in the village wants to do.", {
    title: "Rats in the Granary", type: "kill", days: 0.5,
    brief: "Giant rats keep getting into the stores. Block the drains and smoke them out (vermin, not people).",
    kill: { gold: 2, gear: [g("Caltrops", 1, "used", "Across the drains so they can't escape"), g("Torch", 2, "used", "To smoke them out of the walls")] },
    finds: [["Bone Dice", 2], ["Skull Ring", 1]] }),
  // Tier 2: criminals and deserters.
  contact("garrison-quartermaster", 2, "Quartermaster Ivers, Garrison", `${ICON}infantry.webp`, "The garrison's quartermaster loses more men to the road than to battle.", {
    title: "Deserters", type: "alive", days: 2,
    brief: "Bring back any deserter from the garrison to face the court martial.",
    alive: { gold: 10, gear: [g("Manacles", 1, "kept", "They face a court martial"), g("Horseshoe", 2, "used", "They ride; keep your horse shod for the chase"), g("Rations", 2, "used", "Two days on the road")] },
    finds: [["Faction Earrings", 1], ["Unknown Letter", 2]] }),
  contact("road-warden", 2, "Road Warden of the Mill Road", `${ICON}cavalry.webp`, "A tired warden with too many miles of road and too few riders.", {
    title: "Highway Robbers", type: "either", days: 1,
    brief: "Any bandit robbing carts on the roads. The warden pays for proof; the magistrate pays more for a trial.",
    kill: { gold: 8, gear: [g("Arrows", 20, "used", "An ambush at range"), g("Rope", 1, "kept", "To string up proof")] },
    alive: { gold: 12, gear: [g("Manacles", 1, "kept", "For the magistrate"), g("Net", 1, "risk", "To bring them down without killing them")] },
    finds: [["Faded Map", 2], ["Moldavite Ring", 1]] }),
  contact("pawnbroker", 2, "Old Wenna, Pawnbroker", `${ICON}commoner.webp`, "A pawnbroker who quietly pays to get stolen goods back, and the thieves who sold them to her.", {
    title: "Thief-Taking", type: "alive", days: 1,
    brief: "Catch any burglar fencing stolen goods in town and bring back the loot with them.",
    alive: { gold: 9, gear: [g("Manacles", 1, "kept", "The thief comes back too"), g("Sack", 1, "kept", "For the stolen goods")] },
    finds: [["Gold Key", 1], ["Agate Ring", 2]] }),
  // Tier 3: bandit chiefs, smugglers, rogue mages, dangerous beasts.
  contact("harbourmaster-agent", 3, "Agent of the Harbourmaster", `${ICON}spearfighter.webp`, "The harbourmaster's quiet agent deals with smuggling captains the customs men can't touch.", {
    title: "Smuggling Captains", type: "either", days: 3,
    brief: "Any captain running contraband past the harbour. Dead ends the trade; alive, they name their buyers.",
    kill: { gold: 40, gear: [g("Dagger", 1, "kept", "Close work below decks"), g("Torch", 2, "used", "Dark holds")] },
    alive: { gold: 60, gear: [g("Manacles", 1, "kept", "They must talk"), g("Chain", 1, "risk", "Sailors are strong"), g("Sleep Tincture", 1, "used", "A quiet trip back to shore")] },
    finds: [["Pearl Earrings", 2], ["Jasper Ring", 1]] }),
  contact("college-proctor", 3, "Proctor Iselde, College of Mages", `${ICON}cleric-grey.webp`, "The college pays to bring home spellcasters who broke its oaths.", {
    title: "Rogue Spellcasters", type: "either", days: 3,
    brief: "Any rogue mage the college has disowned. It prefers them alive and gagged; dead will do.",
    kill: { gold: 35, gear: [g("Arrows", 20, "used", "Never let them finish a spell"), g("Antitoxin", 1, "used", "Hedge-mages love poison")] },
    alive: { gold: 55, gear: [g("Manacles", 1, "kept", "Bound hands cast no spells"), g("Sack", 1, "kept", "A hood over the eyes and mouth"), g("Sleep Tincture", 2, "used", "Keep them asleep on the road")] },
    finds: [["Amethyst", 2], ["Royal Signet", 1]] }),
  contact("lodge-master", 3, "Master of the Hunting Lodge", `${ICON}archer.webp`, "The lodge pays for beasts too dangerous for its own huntsmen, and more for live ones for the noble menageries.", {
    title: "Dangerous Beasts", type: "either", days: 2,
    brief: "Any beast terrorising the countryside: dire wolves, owlbears, giant boars.",
    kill: { gold: 30, gear: [g("Hunting Trap", 2, "risk", "To pin it down"), g("Spear", 1, "kept", "Reach to finish it")] },
    alive: { gold: 50, gear: [g("Hunting Trap", 2, "risk", "To pin it down"), g("Net", 1, "risk", "To keep it down"), g("Sleep Tincture", 2, "used", "It must stay calm in the cage")] },
    finds: [["Boar Head", 2], ["Beast Tusk", 2]] }),
  // Tier 4: assassins, cult leaders, monsters (mostly kill).
  contact("temple-inquisitor", 4, "Inquisitor Varn, the Temple", `${ICON}cleric-orange.webp`, "The temple's inquisitor pays for the cults it cannot be seen to fight.", {
    title: "Cult Leaders", type: "kill", days: 5,
    brief: "Any cult leader preaching in the shadows. The temple wants proof, not a trial.",
    kill: { gold: 150, gear: [g("Holy Water", 2, "used", "For what the cult has summoned"), g("Torch", 3, "used", "Cult hideouts are dark"), g("Antitoxin", 1, "used", "Ritual poisons")] },
    finds: [["Winged Pharaoh Necklace Piece", 1], ["Darkness Eye", 2]] }),
  contact("spymaster-handler", 4, "A Spymaster's Handler", `${ICON}group.webp`, "Someone close to the crown's spymaster. They never give a name.", {
    title: "Assassins", type: "either", days: 4,
    brief: "Any assassin working against the crown. Dead is safer; alive, they're worth more to the spymaster.",
    kill: { gold: 175, gear: [g("Antitoxin", 2, "used", "Assassins poison their blades"), g("Caltrops", 1, "used", "Cut off their escape")] },
    alive: { gold: 225, gear: [g("Manacles", 1, "kept", "They must be questioned"), g("Chain", 1, "risk", "They escape ordinary bonds"), g("Antitoxin", 1, "used", "And they will try poison")] },
    finds: [["Silver Blue Spinel Ring", 1], ["Aquamarine", 2]] }),
  contact("guild-steward", 4, "Steward of the Monster Hunters' Guild", `${ICON}charge.webp`, "The guild posts the contracts its own members won't touch.", {
    title: "Monsters", type: "kill", days: 4,
    brief: "Any monster preying on the roads or villages: trolls, wyverns, manticores. Bring back a trophy.",
    kill: { gold: 200, gear: [g("Alchemist's Fire", 2, "used", "Trolls fear fire"), g("Spear", 1, "kept", "Keep your distance"), g("Hunting Trap", 1, "risk", "To slow it down")] },
    finds: [["Topaz", 2], ["Fangs Necklace", 1]] }),
  // Tier 5: warlords, notorious villains, legendary monsters (heads and trophies).
  contact("crown-marshal", 5, "The Crown Marshal", `${ICON}cavalry-heavy.webp`, "The realm's marshal signs the warrants that end wars.", {
    title: "Warlords", type: "kill", days: 7,
    brief: "Any warlord raising banners against the crown. Bring back their head.",
    kill: { gold: 600, gear: [g("Sack", 1, "kept", "For the head"), g("Rations", 5, "used", "A long ride"), g("Horseshoe", 4, "used", "And a hard one")] },
    finds: [["Opal Earrings", 1], ["Blue-White Diamond", 1], ["Royal Signet", 2]] }),
  contact("shadow-broker", 5, "The Shadow Broker", `${ICON}group.webp`, "Nobody has met the Broker. Their letters arrive sealed in black wax.", {
    title: "Notorious Villains", type: "kill", days: 6,
    brief: "Any villain whose name is whispered in taverns. The Broker wants their head as proof.",
    kill: { gold: 500, gear: [g("Sack", 1, "kept", "For the head"), g("Antitoxin", 2, "used", "They have poisoners"), g("Wanted Poster", 1, "used", "To find who's been sheltering them")] },
    finds: [["Red Topaz", 1], ["Opal Earrings", 1]] }),
  contact("last-hunt", 5, "The Order of the Last Hunt", `${ICON}infantry-army.webp`, "An old order sworn to end the creatures of legend.", {
    title: "Legendary Monsters", type: "kill", days: 7,
    brief: "Any creature of legend. Bring back a trophy the Order can hang in its hall.",
    kill: { gold: 750, gear: [g("Alchemist's Fire", 3, "used", "Legends burn too"), g("Net", 1, "risk", "To ground a flyer"), g("Chain", 1, "risk", "To hold it down"), g("Spear", 1, "kept", "The killing blow")] },
    finds: [["Dragon's Heart", 1], ["Blue-White Diamond", 1]] })
]);

// The 0.3.0 named jobs, as example tier-1 contracts (towns are placeholders the GM can rename).
export const DEFAULT_CONTRACTS = Object.freeze([
  { id: "garrick-the-fence", tier: 1, town: "Saltmere", target: "Garrick the Fence", title: "Wanted: Garrick the Fence", type: "either", days: 1,
    brief: "Garrick buys and sells stolen goods out of the dockside warehouses. The watch wants him stopped; the magistrate pays more if he can stand trial.",
    kill: { gold: 8, gear: [g("Dagger", 1, "kept", "Close work in the dockside alleys")] },
    alive: { gold: 12, gear: [g("Manacles", 1, "kept", "He must arrive alive to stand trial"), g("Rope", 1, "risk", "To bind him if the manacles slip")] },
    finds: [["Gold Key", 2], ["Agate Ring", 3], ["Faded Map", 1]] },
  { id: "bellmakers-debt", tier: 1, town: "Saltmere", target: "Osric Vane", title: "The Bellmaker's Debt", type: "alive", days: 2,
    brief: "Osric Vane skipped town owing the Bellmaker's Guild forty crowns. The guild wants him back alive to work off the debt.",
    alive: { gold: 10, gear: [g("Manacles", 1, "kept", "He must arrive alive"), g("Rope", 1, "risk", "He's slippery on the road"), g("Wanted Poster", 1, "used", "So townsfolk recognise him and point the way")] },
    finds: [["Silver Ring", 2], ["Letter From A Loved One", 1]] },
  { id: "old-tusk", tier: 1, town: "Millbrook", target: "Old Tusk", title: "Old Tusk", type: "either", days: 1,
    brief: "A boar the size of a cart has gored two farmhands. The reeve pays for its head; the menagerie in Varn pays more to have it alive.",
    kill: { gold: 8, gear: [g("Hunting Trap", 2, "risk", "To pin it down"), g("Spear", 1, "kept", "Reach to finish it")] },
    alive: { gold: 12, gear: [g("Hunting Trap", 2, "risk", "To pin it down"), g("Rope", 1, "used", "To hobble its legs"), g("Sleep Tincture", 1, "used", "It must stay calm on the cart to Varn")] },
    finds: [["Boar Head", 3], ["Beast Tusk", 2]] },
  { id: "north-road-deserter", tier: 1, town: "Millbrook", target: "Corporal Dunst", title: "Deserter on the North Road", type: "alive", days: 2,
    brief: "Corporal Dunst ran from the garrison with the payroll ledger and is riding north. The captain wants him and the ledger back.",
    alive: { gold: 10, gear: [g("Manacles", 1, "kept", "He's to face a court martial"), g("Horseshoe", 2, "used", "His horse has a head start; keep yours shod"), g("Rations", 2, "used", "Two days on the road")] },
    finds: [["Faction Earrings", 1], ["Unknown Letter", 2]] }
]);

/* ---------------------------------------------------------------------- */
/* Storage (world settings; null = the defaults)                           */
/* ---------------------------------------------------------------------- */

function setting(key, fallback) {
  try { return game.settings.get(MODULE_ID, key) ?? fallback; } catch { return fallback; }
}
const cloned = value => structuredClone(value);
export function contacts() {
  const saved = setting("bountyContacts", null);
  return Array.isArray(saved?.list) ? saved.list : cloned(DEFAULT_CONTACTS);
}
export function contracts() {
  const saved = setting("bountyContracts", null);
  return Array.isArray(saved?.list) ? saved.list : cloned(DEFAULT_CONTRACTS);
}
export const findContact = id => contacts().find(entry => entry.id === id) ?? null;
export const findContract = id => contracts().find(entry => entry.id === id) ?? null;

/* ---------------------------------------------------------------------- */
/* Validation (GM editor and generator)                                    */
/* ---------------------------------------------------------------------- */

const MODES = ["used", "kept", "risk"];
const PER = ["longRest", "day", "none"];
const exists = name => Array.from(globalThis.game?.items ?? []).some(item => item.name === name);

function normalizeGear(list, label) {
  const rows = (list ?? []).map(row => ({ name: String(row?.name ?? "").trim(), quantity: Number(row?.quantity), mode: row?.mode, reason: String(row?.reason ?? "").trim() })).filter(row => row.name);
  if (new Set(rows.map(row => row.name)).size !== rows.length) throw new Error(`${label}: combine duplicate items into one quantity.`);
  for (const row of rows) {
    if (!exists(row.name)) throw new Error(`${label}: no world Item is named "${row.name}".`);
    if (!Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 99) throw new Error(`${label}: ${row.name} quantity must be 1 to 99.`);
    if (!MODES.includes(row.mode)) row.mode = "used";
  }
  if (!rows.length) throw new Error(`${label}: list at least one item to bring.`);
  return rows;
}

/** Validate a task or contract body; throws a readable Error. */
export function normalizeWork(data) {
  const tier = Number(data.tier);
  if (!Number.isInteger(tier) || tier < 1 || tier > 5) throw new Error("Tier must be 1 to 5.");
  const title = String(data.title ?? "").trim();
  if (!title) throw new Error("Give it a title.");
  const type = ["alive", "kill", "either"].includes(data.type) ? data.type : "alive";
  const result = { tier, title, brief: String(data.brief ?? "").trim(), type, days: Math.max(0, Number(data.days) || 0) };
  for (const choice of type === "either" ? ["kill", "alive"] : [type]) {
    const raw = data[choice]?.gold;
    const fallback = type === "either" && choice === "alive" && (raw === null || raw === undefined || raw === "");
    const gold = fallback ? 0 : Number(raw);
    if (!Number.isFinite(gold) || gold < 0) throw new Error(`${choice === "kill" ? "Kill" : "Alive"} reward must be 0 gp or more.`);
    result[choice] = { gold: fallback ? null : Math.round(gold), gear: normalizeGear(data[choice]?.gear, choice === "kill" ? "Kill gear" : "Alive gear") };
  }
  result.finds = (data.finds ?? []).map(([name, weight]) => [String(name ?? "").trim(), Math.max(1, Math.trunc(Number(weight) || 1))]).filter(([name]) => name);
  for (const [name] of result.finds) if (!exists(name)) throw new Error(`Rare finds: no world Item is named "${name}".`);
  return result;
}

const slug = text => String(text).toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "entry";
const requireGM = () => { if (!game.user.isGM) throw new Error("Only the GM may change bounties."); };

/** GM: create or update a contact. */
export async function saveContact(data, id = null) {
  requireGM();
  const name = String(data.name ?? "").trim();
  if (!name) throw new Error("Give the contact a name.");
  const task = normalizeWork({ ...data.task, tier: data.tier });
  const per = PER.includes(data.limit?.per) ? data.limit.per : "longRest";
  const count = Math.max(1, Math.trunc(Number(data.limit?.count) || 1));
  const list = contacts();
  const entry = { id: id ?? `${slug(name)}-${foundry.utils.randomID(4)}`, tier: task.tier, name, img: data.img || "icons/environment/people/commoner.webp", text: String(data.text ?? "").trim(), task, limit: { per, count } };
  const next = id ? list.map(row => (row.id === id ? entry : row)) : [...list, entry];
  await game.settings.set(MODULE_ID, "bountyContacts", { list: next });
  return entry;
}

/** GM: create or update a contract. */
export async function saveContract(data, id = null) {
  requireGM();
  const town = String(data.town ?? "").trim();
  if (!town) throw new Error("Which town is this contract in?");
  const target = String(data.target ?? "").trim();
  if (!target) throw new Error("Name the target.");
  const body = normalizeWork(data);
  const list = contracts();
  const entry = { id: id ?? `${slug(target)}-${foundry.utils.randomID(4)}`, town, target, ...body };
  const next = id ? list.map(row => (row.id === id ? entry : row)) : [...list, entry];
  await game.settings.set(MODULE_ID, "bountyContracts", { list: next });
  return entry;
}

export async function deleteContact(id) {
  requireGM();
  await game.settings.set(MODULE_ID, "bountyContacts", { list: contacts().filter(row => row.id !== id) });
}
export async function deleteContract(id) {
  requireGM();
  await game.settings.set(MODULE_ID, "bountyContracts", { list: contracts().filter(row => row.id !== id) });
}
export async function resetContacts() {
  requireGM();
  await game.settings.set(MODULE_ID, "bountyContacts", null);
}

/* ---------------------------------------------------------------------- */
/* Contract generator                                                      */
/* ---------------------------------------------------------------------- */

const FIRST = ["Aldo", "Bryn", "Cass", "Dorran", "Edda", "Fenn", "Gella", "Hollis", "Ines", "Jory", "Kesta", "Lorne", "Mira", "Nim", "Oswin", "Perrin", "Quill", "Rhea", "Sefa", "Tamsin", "Ulric", "Vesna", "Wick", "Yara"];
const LAST = ["Ashdown", "Brack", "Corwell", "Dunmore", "Elsby", "Fallow", "Grist", "Harrow", "Ivell", "Keld", "Lark", "Mallory", "Norrin", "Osgood", "Pike", "Quarry", "Rook", "Stane", "Thorne", "Underhill", "Vale", "Wren"];
const EPITHET = ["the Red", "Two-Knives", "the Fox", "Blackhand", "the Widow", "Iron Jaw", "the Pale", "Hookhand", "the Saint", "Ninefingers"];
const QUARRY = Object.freeze([
  [["debtor", "owes a moneylender more than they'll ever earn"], ["runaway apprentice", "fled their master with a purse of the shop's coin"], ["petty thief", "has been lifting purses in the market for weeks"], ["drunkard", "smashed up a tavern and ran without paying"]],
  [["deserter", "ran from the garrison with stolen arms"], ["burglar", "broke into a merchant's house and took the family silver"], ["smuggler", "has been running untaxed goods past the gate"], ["horse thief", "stole a lord's prize mare"]],
  [["bandit chief", "leads a gang that has burned two farmsteads"], ["smuggling captain", "has been landing contraband under the harbourmaster's nose"], ["rogue mage", "broke the college's oaths and burned a scholar"], ["beast", "has killed livestock and a shepherd on the high pasture"]],
  [["assassin", "killed a magistrate and was seen leaving the city"], ["cult leader", "has been gathering followers in the old catacombs"], ["monster", "has been dragging travellers off the road at night"], ["mercenary captain", "turned on their employer and sacked a village"]],
  [["warlord", "has raised banners against the crown"], ["notorious villain", "is wanted in three realms"], ["legendary monster", "has woken in the mountains"], ["traitor lord", "sold the border forts to the enemy"]]
]);
const TYPE_ROLL = Object.freeze([[["alive", 1]], [["alive", 0.7], ["either", 0.3]], [["either", 1]], [["kill", 0.8], ["either", 0.2]], [["kill", 1]]]);
const GEAR = Object.freeze({
  alive: [[g("Manacles", 1, "kept", "They must arrive alive"), g("Rope", 1, "risk", "In case they slip the manacles")],
    [g("Manacles", 1, "kept", "For the trial"), g("Net", 1, "risk", "To bring them down without killing them"), g("Rations", 2, "used", "A long walk back")],
    [g("Manacles", 1, "kept", "They must talk"), g("Chain", 1, "risk", "They're strong"), g("Sleep Tincture", 1, "used", "A quiet trip back")],
    [g("Manacles", 1, "kept", "They must face judgement"), g("Chain", 1, "risk", "Ordinary bonds won't hold"), g("Antitoxin", 1, "used", "They'll try poison")],
    [g("Chain", 2, "risk", "Nothing less will hold them"), g("Sleep Tincture", 2, "used", "Keep them down on the road"), g("Rations", 5, "used", "A long journey")]],
  kill: [[g("Dagger", 1, "kept", "Close work")],
    [g("Arrows", 20, "used", "Take them at range"), g("Rope", 1, "kept", "To bring back proof")],
    [g("Hunting Trap", 2, "risk", "To pin them down"), g("Torch", 2, "used", "Their lair is dark")],
    [g("Alchemist's Fire", 2, "used", "Fire for what steel won't stop"), g("Antitoxin", 1, "used", "They fight dirty")],
    [g("Sack", 1, "kept", "For the head"), g("Alchemist's Fire", 2, "used", "Fire for what steel won't stop"), g("Rations", 5, "used", "A long ride")]]
});
const FINDS = Object.freeze([
  [["Silver Ring", 2], ["Bone Dice", 2], ["Letter From A Loved One", 1]],
  [["Gold Key", 1], ["Moldavite Ring", 2], ["Faction Earrings", 1]],
  [["Pearl Earrings", 2], ["Jasper Ring", 1], ["Royal Signet", 1]],
  [["Silver Blue Spinel Ring", 1], ["Aquamarine", 2], ["Winged Pharaoh Necklace Piece", 1]],
  [["Opal Earrings", 1], ["Blue-White Diamond", 1], ["Red Topaz", 1]]
]);
export const GENERATOR_ITEMS = Object.freeze([...new Set([...Object.values(GEAR).flat(2).map(row => row.name), ...FINDS.flat().map(([name]) => name)])]);

const pick = (list, random) => list[Math.floor(random() * list.length) % list.length];
const between = ([low, high], random) => Math.round(low + random() * (high - low));
function weighted(list, random) {
  let roll = random();
  for (const [value, weight] of list) { roll -= weight; if (roll <= 0) return value; }
  return list.at(-1)[0];
}

/** A contract of a tier for a town, ready to edit and save (not saved). */
export function generateContract(tier, town, random = Math.random) {
  const level = Math.min(5, Math.max(1, Math.trunc(Number(tier)) || 1));
  const [role, reason] = pick(QUARRY[level - 1], random);
  const beast = /beast|monster/.test(role);
  const person = `${pick(FIRST, random)} ${pick(LAST, random)}`;
  const target = beast ? `the ${role} of ${town}` : level >= 3 ? `${person.split(" ")[0]} ${pick(EPITHET, random)}` : person;
  const type = weighted(TYPE_ROLL[level - 1], random);
  const gold = between(CONTRACT_GOLD[level - 1], random);
  const data = { tier: level, town, target, title: beast ? `The ${role[0].toUpperCase()}${role.slice(1)} of ${town}` : `Wanted: ${target}`, type, days: TIER_DAYS[level - 1],
    brief: `${beast ? "A" : `${target}, a ${role},`} ${beast ? `${role} ${reason}` : reason}.${type === "kill" ? level >= 5 ? " The reward is for their head." : " Proof of death is enough." : type === "alive" ? " They must be brought back alive." : " Dead or alive; more if alive."}`,
    finds: structuredClone(FINDS[level - 1]) };
  if (type !== "alive") data.kill = { gold: type === "either" ? Math.round(gold * 0.75) : gold, gear: structuredClone(GEAR.kill[level - 1]) };
  if (type !== "kill") data.alive = { gold: type === "either" ? null : gold, gear: structuredClone(GEAR.alive[level - 1]) };
  return data;
}

/* ---------------------------------------------------------------------- */
/* Recipes-window rows                                                     */
/* ---------------------------------------------------------------------- */

export const CONTACT_PREFIX = "contact.";
export const CONTRACT_PREFIX = "contract.";
const LIMIT_TEXT = { longRest: count => (count > 1 ? `${count}× per long rest` : "once per long rest"), day: count => (count > 1 ? `${count}× per day` : "once per day"), none: () => "repeatable" };

/** A blank alive override uses the configured factor; explicit values win. */
export function workGold(body, choice, rules = craftingRules()) {
  const gold = body[choice]?.gold;
  const fallback = body.type === "either" && choice === "alive" && (gold === null || gold === undefined || gold === "");
  return fallback ? Math.round((Number(body.kill?.gold) || 0) * rules.bounty.aliveRewardFactor) : Number(gold) || 0;
}

function workRows(profession, base, body, extra, rules) {
  const choices = body.type === "either" ? ["kill", "alive"] : [body.type];
  return choices.map((choice, index) => {
    const stored = body[choice] ?? { gold: 0, gear: [] };
    const spec = { ...stored, gold: workGold(body, choice, rules) };
    const typeLabel = body.type === "either" ? (choice === "kill" ? "Dead" : "Alive") : choice === "kill" ? "Kill" : "Retrieval";
    return {
      id: `${profession}:${base}:${choice}`, profession, kind: "bounty", jobId: base, learnId: base, choice,
      tier: body.tier, output: body.title, quantity: 1, gold: spec.gold,
      dcBonus: choice === "alive" ? rules.bounty.aliveDcBonus : 0, minutes: Math.round((Number(body.days) || 0) * 1440), finds: body.finds ?? [],
      inputs: spec.gear.map(row => [row.name, row.quantity]), inputMeta: spec.gear.map(row => ({ mode: row.mode, reason: row.reason })),
      title: `${body.title} · ${typeLabel}`, brief: index === 0 ? body.brief : "",
      actionLabel: body.type === "either" ? (choice === "kill" ? "Hunt: dead" : "Hunt: alive") : "Hunt",
      noBatch: true, ...extra(spec)
    };
  });
}

/** Rows for the Bounties tab: each contact's task (repeatable) and each contract (one-time, grouped by town). */
export function bountyRows(profession = "bountyhunter", rules = craftingRules()) {
  const rows = [];
  for (const entry of contacts()) {
    const base = `${CONTACT_PREFIX}${entry.id}`;
    rows.push(...workRows(profession, base, entry.task, spec => ({
      source: "contact", contactId: entry.id, repeatable: true, limit: entry.limit,
      group: base, groupLabel: `${entry.name} · Tier ${entry.tier}`, groupImg: entry.img,
      rewardText: `${spec.gold} gp · ${(LIMIT_TEXT[entry.limit?.per] ?? LIMIT_TEXT.longRest)(entry.limit?.count ?? 1)}${entry.task.finds?.length ? " · rare find possible" : ""}`
    }), rules));
  }
  for (const entry of contracts()) {
    const base = `${CONTRACT_PREFIX}${entry.id}`;
    rows.push(...workRows(profession, base, entry, spec => ({
      source: "contract", contractId: entry.id, repeatable: false, town: entry.town,
      group: `town.${entry.town}`, groupLabel: `Contracts · ${entry.town}`, groupImg: "icons/sundries/documents/document-sealed-red-tan.webp",
      rewardText: `${spec.gold} gp · one time${entry.finds?.length ? " · rare find possible" : ""}`
    }), rules));
  }
  return rows;
}

/** Every item name bounty work uses (for preparing world Items). */
export function bountyItemNames() {
  const all = [...contacts().map(entry => entry.task), ...contracts()];
  const names = all.flatMap(body => [...(body.kill?.gear ?? []), ...(body.alive?.gear ?? [])].map(row => row.name).concat((body.finds ?? []).map(([name]) => name)));
  return [...new Set([...names, ...GENERATOR_ITEMS])];
}
