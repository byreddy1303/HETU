// Accounts that are previewed "core-only": deep links always land on the
// GATE CSE core catalogue, the Recommended set system is hidden, and the
// sidebar groups are collapsed so the account sees fewer choices at once.
// Matches are case-insensitive trimmed usernames.
export const CORE_SETUP_ONLY_USERNAMES = new Set(['rishi', 'ganirishivardhangmailcom']);

export function isCoreSetupOnlyUsername(username: string | null | undefined): boolean {
  return !!username && CORE_SETUP_ONLY_USERNAMES.has(username.trim().toLowerCase());
}