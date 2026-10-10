// Numbers and ordinals map for voice parser
export const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};

export const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  '1st': 1,
  second: 2,
  '2nd': 2,
  third: 3,
  '3rd': 3,
  fourth: 4,
  '4th': 4,
  fifth: 5,
  '5th': 5,
  sixth: 6,
  '6th': 6,
  seventh: 7,
  '7th': 7,
  eighth: 8,
  '8th': 8,
  ninth: 9,
  '9th': 9,
  tenth: 10,
  '10th': 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
};

/**
 * Parse an English number phrase (e.g. "twenty five", "two", "7") into a number.
 * Returns null if not a recognized number.
 */
export function parseNumberWord(text: string): number | null {
  const clean = text.trim().toLowerCase();
  if (/^\d+$/.test(clean)) {
    return parseInt(clean, 10);
  }

  if (NUMBER_WORDS[clean] !== undefined) {
    return NUMBER_WORDS[clean];
  }

  // Handle compound words like "twenty one" or "twenty-one"
  const parts = clean.replace(/-/g, ' ').split(/\s+/);
  if (parts.length === 2 && NUMBER_WORDS[parts[0]] !== undefined && NUMBER_WORDS[parts[1]] !== undefined) {
    const tens = NUMBER_WORDS[parts[0]];
    const ones = NUMBER_WORDS[parts[1]];
    if (tens >= 20 && tens <= 90 && ones >= 1 && ones <= 9) {
      return tens + ones;
    }
  }

  return null;
}

/**
 * Check if word is an ordinal (first, second, 3rd, etc.)
 */
export function parseOrdinal(text: string): number | null {
  const clean = text.trim().toLowerCase();
  if (ORDINAL_WORDS[clean] !== undefined) {
    return ORDINAL_WORDS[clean];
  }
  const match = clean.match(/^(\d+)(st|nd|rd|th)$/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}
