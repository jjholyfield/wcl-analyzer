/**
 * Base cooldowns (seconds) for planned raid/healing CDs.
 * Used by nsrt-note.mjs to validate plan feasibility and flag zero-margin chains.
 * Talent-modified CDs vary — these are the planning baselines; if data shows a
 * shorter real cadence (e.g. Yu'lon ~125s observed), the base here stays conservative.
 */
export const SPELL_CDS = {
  740: 180,     // Tranquility
  15286: 120,   // Vampiric Embrace
  322118: 120,  // Invoke Yu'lon
  325197: 120,  // Invoke Chi-Ji
  115310: 180,  // Revival
  388615: 180,  // Revival (restoral)
  31821: 180,   // Aura Mastery
  62618: 180,   // Power Word: Barrier
  97462: 180,   // Rallying Cry
  196718: 180,  // Darkness
  51052: 120,   // Anti-Magic Zone
  443028: 90,   // Celestial Conduit
  31884: 60,    // Avenging Wrath
  216331: 60,   // Avenging Wrath (Awakening)
  391528: 120,  // Convoke the Spirits
  33891: 180,   // Incarnation: Tree of Life
  117679: 180,  // Incarnation (grove)
};

// Personal defensives (for per-player reminder validation)
Object.assign(SPELL_CDS, {
  48707: 60,   // Anti-Magic Shell
  48792: 180,  // Icebound Fortitude
  108416: 60,  // Dark Pact
  104773: 180, // Unending Resolve
  108271: 90,  // Astral Shift
  22812: 45,   // Barkskin
  61336: 180,  // Survival Instincts
  498: 60,     // Divine Protection
  122783: 90,  // Diffuse Magic
  115203: 180, // Fortifying Brew
  243435: 180, // Fortifying Brew (alt id)
  264735: 120, // Survival of the Fittest
  184364: 120, // Enraged Regeneration
  113862: 120, // Greater Invisibility
  363916: 150, // Obsidian Scales
  198589: 60,  // Blur
  1966: 15,    // Feint
  6262: 300,   // Healthstone
});

/** IDs that are the same logical CD for chain-validation purposes */
export const CD_ALIASES = {
  115310: [115310, 388615],
  322118: [322118, 325197],
  31884: [31884, 216331],
  33891: [33891, 117679],
};
