/**
 * Semantic Dictionaries for Anime Similarity Analysis
 * Adapted and enhanced from AniPredict for semantic cluster matching,
 * tone classification, narrative patterns, and demographic analysis.
 */

export const THEME_GROUPS: Record<string, string[]> = {
  psychological: ['psychological', 'mystery', 'thriller', 'suspense', 'horror', 'mind games'],
  action: ['action', 'martial arts', 'super power', 'military', 'mecha', 'combat', 'gun battles'],
  emotional: ['drama', 'romance', 'slice of life', 'josei', 'shoujo', 'tearjerker', 'coming of age'],
  intellectual: ['mystery', 'psychological', 'sci-fi', 'detective', 'police', 'conspiracy', 'cyberpunk'],
  adventure: ['adventure', 'fantasy', 'isekai', 'magic', 'mythology', 'swords & sorcery', 'exploration'],
  comedy: ['comedy', 'parody', 'gag humor', 'ecchi', 'slapstick', 'satire', 'otaku culture'],
  dark: ['horror', 'psychological', 'thriller', 'gore', 'tragedy', 'survival', 'dark fantasy', 'demons'],
  wholesome: ['slice of life', 'iyashikei', 'cgdct', 'kids', 'cute girls doing cute things', 'family friendly'],
  philosophical: ['psychological', 'sci-fi', 'supernatural', 'seinen', 'existential', 'philosophical', 'dystopian'],
  competitive: ['sports', 'game', 'strategy', 'tournament', 'racing', 'gambling', 'e-sports'],
}

export const TONE_INDICATORS: Record<string, string[]> = {
  serious: ['drama', 'psychological', 'thriller', 'seinen', 'military', 'crime', 'war', 'tragedy'],
  lighthearted: ['comedy', 'slice of life', 'cgdct', 'shoujo', 'kids', 'school', 'parody', 'gag'],
  dark: ['horror', 'psychological', 'gore', 'tragedy', 'mature', 'demons', 'vampire', 'dark fantasy'],
  uplifting: ['slice of life', 'iyashikei', 'sports', 'shounen', 'music', 'friendship', 'wholesome'],
  cerebral: ['mystery', 'psychological', 'sci-fi', 'detective', 'time travel', 'cyberpunk', 'strategy'],
  emotional: ['drama', 'romance', 'tragedy', 'melodrama', 'family', 'historical', 'loss'],
}

export const NARRATIVE_PATTERNS: Record<string, string[]> = {
  episodic: ['slice of life', 'comedy', 'anthology', 'monster of the week', 'detective'],
  serialized: ['mystery', 'thriller', 'drama', 'psychological', 'conspiracy'],
  arc_based: ['shounen', 'adventure', 'tournament', 'battle', 'martial arts', 'sports'],
  character_driven: ['drama', 'slice of life', 'psychological', 'romance', 'seinen', 'coming of age'],
  plot_driven: ['mystery', 'thriller', 'sci-fi', 'action', 'conspiracy', 'dystopian'],
  ensemble: ['slice of life', 'comedy', 'sports', 'idol', 'school club', 'military squad'],
  hero_journey: ['adventure', 'fantasy', 'isekai', 'shounen', 'magic', 'super power'],
}

export const DEMOGRAPHICS = ['shounen', 'seinen', 'shoujo', 'josei', 'kids'] as const
export type Demographic = (typeof DEMOGRAPHICS)[number]
