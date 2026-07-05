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

/** IDs that are the same logical CD for chain-validation purposes */
export const CD_ALIASES = {
  115310: [115310, 388615],
  322118: [322118, 325197],
  31884: [31884, 216331],
  33891: [33891, 117679],
};
