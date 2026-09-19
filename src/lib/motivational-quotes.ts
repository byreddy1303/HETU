// The browser and notification functions intentionally share one quote source.
// Keeping the presets in the edge-function-safe module prevents Telegram,
// email, and the in-app daily line from drifting apart.
import {
  QUOTES,
  pickQuoteForDay,
  type QuotePreset
} from '../../backends/typescript/supabase/functions/_shared/quotes';

export { QUOTES, pickQuoteForDay, type QuotePreset };

export const MOTIVATIONAL_QUOTES: readonly string[] = QUOTES.map((quote) => quote.text);

/** Deterministic quote text for legacy callers. */
export function quoteForDate(dateISO: string, seedSalt = ''): string {
  return pickQuoteForDay(dateISO, seedSalt).text;
}

/** Random quote text for an explicit user-requested refresh. */
export function randomQuote(): string {
  const idx = Math.floor(Math.random() * QUOTES.length);
  return QUOTES[idx].text;
}
