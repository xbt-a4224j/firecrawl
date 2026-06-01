/** Map a raw error into an actionable, teaching hint (or null if we don't recognize it). */
export function errorHint(message: string): string | null {
  const m = message.toLowerCase();
  if (/\b402\b|payment required|insufficient|out of credit|no credit/.test(m))
    return "You're out of Firecrawl credits — top up at firecrawl.dev.";
  if (/\b401\b|unauthorized|invalid api key|forbidden api|api key/.test(m))
    return "Check your FIRECRAWL_API_KEY — it must be a valid cloud (fc-) key.";
  if (/\b403\b|forbidden|blocked|bot|captcha/.test(m))
    return "The site blocked the scrape — try a different page (or stealth/proxy on Firecrawl cloud).";
  if (/timeout|timed out|etimedout/.test(m))
    return "The page was too slow — raise the timeout or try again.";
  if (/zero data retention|zdr/.test(m))
    return "changeTracking needs data retention on — disable zeroDataRetention.";
  return null;
}
