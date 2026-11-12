/**
 * Shared desktop/mobile menu search. Deterministic discovery over the real
 * published catalogue; NOT a source of pricing, stock, allergen or dietary facts.
 *
 * Match words in any order (including option/section labels) and tolerate one
 * minor spelling slip only for words of at least five characters. No model,
 * external service or private customer data is involved.
 */
function searchableWords(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-GB")
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function oneEditAway(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const differences: number[] = [];
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        differences.push(i);
        if (differences.length > 2) return false;
      }
    }
    if (differences.length === 1) return true;
    return differences.length === 2 &&
      differences[1] === differences[0]! + 1 &&
      a[differences[0]!] === b[differences[1]!] &&
      a[differences[1]!] === b[differences[0]!];
  }
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i++;
      j++;
    } else {
      if (skipped) return false;
      skipped = true;
      j++;
    }
  }
  return true;
}

/** Search results are suggestions; the live canonical menu remains authoritative. */
export function matchesLaunchMenuSearch(
  query: string,
  fields: readonly (string | null | undefined)[],
): boolean {
  const input = query.trim();
  if (!input) return true;
  // Bound accidental paste and fuzzy matching work on long inputs.
  if (input.length > 120) return false;
  const terms = searchableWords(input);
  if (!terms.length || terms.length > 8) return false;
  const words = searchableWords(fields.filter((v): v is string => typeof v === "string").join(" "));
  if (!words.length) return false;

  let correctedOneTypo = false;
  for (const term of terms) {
    if (words.some((word) => word.includes(term))) continue;
    // A single bounded typo can help customers find "chikcen wings".
    // Avoid fuzzy matching short terms such as "ham", "nut" or "soy".
    if (
      !correctedOneTypo &&
      term.length >= 5 &&
      words.some((word) => oneEditAway(term, word))
    ) {
      correctedOneTypo = true;
      continue;
    }
    return false;
  }
  return true;
}
