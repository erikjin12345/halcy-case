// Which chat events a page gets. A normal page gets exactly what it got before
// test mode existed; a test-mode page (/events?test=1) also gets the
// test-only trace lines: traps, decisions and the trap checks.

import { TEST_KINDS } from "../agent/trace.ts";

export function forPage(e: { type: string; step?: { kind?: string } }, test: boolean): boolean {
  return test || e.type !== "trace" || !e.step?.kind || !TEST_KINDS.has(e.step.kind);
}
