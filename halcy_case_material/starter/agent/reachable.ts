// Which known hotels answer right now. The places database lists every hotel
// Halcy knows, but at any moment some of their sites may be down (in the
// prototype: a mock that was not started). A hotel that does not answer is
// not offered and not searched; if the traveller named it, they are told.

export type Probe = (url: string, timeoutMs: number) => Promise<boolean>;

/** Any HTTP answer counts as up; a refused connection or a timeout does not. */
export const httpProbe: Probe = async (url, timeoutMs) => {
  try {
    const res = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    await res.body?.cancel().catch(() => {});
    return true;
  } catch {
    return false;
  }
};

/** Splits the known hotels into those that answer and those that do not, probing all at once. */
export async function reachableHotels(hotels: Record<string, string>, probe: Probe = httpProbe, timeoutMs = 1000): Promise<{ up: Record<string, string>; down: string[] }> {
  const entries = Object.entries(hotels);
  const answers = await Promise.all(entries.map(([, url]) => probe(url, timeoutMs)));
  const up: Record<string, string> = {};
  const down: string[] = [];
  entries.forEach(([name, url], i) => (answers[i] ? (up[name] = url) : down.push(name)));
  return { up, down };
}
