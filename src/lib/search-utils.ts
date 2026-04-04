/**
 * Fuzzy city name search utilities
 * 
 * Handles common search issues:
 * - Trailing/leading whitespace: "Miami " → "Miami"
 * - Punctuation: "St Petersburg" → matches "St. Petersburg"
 * - Abbreviations: "Saint Petersburg" → matches "St. Petersburg"
 * - "Ft Worth" → matches "Fort Worth"
 * - Case insensitive
 */

// Common abbreviation mappings (expanded → abbreviated as stored in DB)
const ABBREVIATION_MAP: Record<string, string[]> = {
  'saint': ['st', 'st.'],
  'st': ['saint', 'st.'],
  'st.': ['saint', 'st'],
  'fort': ['ft', 'ft.'],
  'ft': ['fort', 'ft.'],
  'ft.': ['fort', 'ft'],
  'mount': ['mt', 'mt.'],
  'mt': ['mount', 'mt.'],
  'mt.': ['mount', 'mt'],
  'north': ['n', 'n.'],
  'south': ['s', 's.'],
  'east': ['e', 'e.'],
  'west': ['w', 'w.'],
  'point': ['pt', 'pt.'],
  'pt': ['point', 'pt.'],
  'port': ['pt'],
};

/**
 * Normalize a string for fuzzy matching:
 * - lowercase
 * - trim whitespace
 * - remove punctuation (periods, commas, hyphens)
 */
function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[.\-,]/g, '');
}

/**
 * Generate search variants of a query by expanding abbreviations.
 * e.g., "saint petersburg" → ["saint petersburg", "st petersburg", "st. petersburg"]
 * e.g., "ft worth" → ["ft worth", "fort worth", "ft. worth"]
 */
function generateSearchVariants(query: string): string[] {
  const words = query.toLowerCase().trim().split(/\s+/);
  if (words.length === 0) return [query.toLowerCase().trim()];

  // Start with the original query (normalized)
  const variants: Set<string> = new Set();
  variants.add(normalize(query));

  // For each word, check if it has abbreviation alternatives
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const normalizedWord = word.replace(/[.]/g, '');
    
    // Check both the raw word and the normalized word
    const alts = ABBREVIATION_MAP[word] || ABBREVIATION_MAP[normalizedWord] || [];
    
    for (const alt of alts) {
      const newWords = [...words];
      newWords[i] = alt;
      variants.add(normalize(newWords.join(' ')));
    }
  }

  return Array.from(variants);
}

/**
 * Check if a city name matches a search query, handling:
 * - Trimming whitespace
 * - Removing punctuation
 * - Expanding abbreviations (Saint ↔ St., Fort ↔ Ft., etc.)
 */
export function fuzzyMatchCity(cityName: string, searchQuery: string): boolean {
  const trimmed = searchQuery.trim();
  if (!trimmed) return true;

  const normalizedCity = normalize(cityName);
  const variants = generateSearchVariants(trimmed);

  return variants.some(v => normalizedCity.includes(v));
}

/**
 * Generate Supabase-compatible search patterns for a query.
 * Returns an array of ilike patterns to OR together.
 * e.g., "Saint Petersburg" → ["%saint%petersburg%", "%st%petersburg%", "%st.%petersburg%"]
 */
export function getSupabaseSearchPatterns(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const variants = generateSearchVariants(trimmed);
  
  // Convert each variant to a Supabase ilike pattern
  // Use the original (non-normalized) patterns too, to handle periods properly
  const patterns: Set<string> = new Set();
  
  // Always add a plain trimmed pattern
  patterns.add(`%${trimmed}%`);

  // Add variant patterns  
  const words = trimmed.toLowerCase().split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const normalizedWord = word.replace(/[.]/g, '');
    const alts = ABBREVIATION_MAP[word] || ABBREVIATION_MAP[normalizedWord] || [];
    
    for (const alt of alts) {
      const newWords = [...words];
      newWords[i] = alt;
      patterns.add(`%${newWords.join('%')}%`);
    }
  }

  return Array.from(patterns);
}
