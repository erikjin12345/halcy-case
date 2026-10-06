// Test cases for the test-mode sidebar, read from the scenario case files
// themselves (no copies): the opening message and what the scripted
// traveller says or presses, grouped by the hotel the message names.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface SidebarCase {
  id: string;
  title: string;
  message: string;
  /** What the scripted traveller answers: a typed reply, or the button it presses. */
  replies: string[];
}

export interface SidebarGroup {
  hotel: string;
  cases: SidebarCase[];
}

/** A button pattern ("^2$|2 adult|two") as words a person can type: its first readable alternative. */
function buttonText(pattern: string): string {
  const first = pattern.split("|").map((p) => p.replace(/[\\^$()[\]?*+.]/g, "").trim()).find((p) => p.length > 0);
  return first ?? pattern;
}

export function loadCases(dirs: string[], hotels: string[]): SidebarGroup[] {
  const groups = new Map<string, SidebarCase[]>();
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
      try {
        const c = JSON.parse(readFileSync(join(dir, file), "utf8"));
        if (typeof c.message !== "string") continue;
        const replies = (Array.isArray(c.replies) ? c.replies : []).map((r: { say?: string; press?: string }) =>
          typeof r.say === "string" ? r.say : typeof r.press === "string" ? `(press) ${buttonText(r.press)}` : "",
        ).filter(Boolean);
        const hotel = hotels.find((h) => c.message.toLowerCase().includes(h.toLowerCase())) ?? "Other";
        const list = groups.get(hotel) ?? [];
        list.push({ id: String(c.id ?? file.replace(/\.json$/, "")), title: String(c.title ?? ""), message: c.message, replies });
        groups.set(hotel, list);
      } catch {
        // A broken case file is left out of the sidebar, not fatal to the chat.
      }
    }
  }
  return [...groups.entries()].map(([hotel, cases]) => ({ hotel, cases }));
}
