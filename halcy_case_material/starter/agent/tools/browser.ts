// Browser tools for the search and validation agents, bound to one Playwright
// page and one PaymentBoundary. They wrap the starter's observe/act/screenshot
// and add the boundary check, logging and a compact text rendering.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Page } from "playwright";
import { z } from "zod";
import { act, observe, type Observation } from "../../browser.ts";
import type { RunLog } from "../../log.ts";
import type { RunnableTool } from "../llm/client.ts";
import type { PaymentBoundary } from "./boundary.ts";
import { cleanUrl, serialise } from "./serial.ts";

export interface BrowserToolDeps {
  page: Page;
  boundary: PaymentBoundary;
  log: RunLog;
}

/** Drops frames the boundary forbids and renders the rest as compact text. */
export function renderObservation(seen: Observation, boundary: PaymentBoundary): string {
  const lines: string[] = [`URL: ${seen.url}`, `Title: ${seen.title}`, ""];
  for (const frame of seen.text) {
    if (!boundary.allows(frame.frameUrl)) {
      lines.push(boundary.describeHidden(frame.frameUrl), "");
      continue;
    }
    lines.push(`--- text (${frame.frameUrl}) ---`, frame.text, "");
  }
  lines.push("--- elements (id | tag/type | name | value | state) ---");
  for (const el of seen.elements) {
    if (!boundary.allows(el.frameUrl)) continue;
    const state = [el.disabled ? "disabled" : "", el.readOnly ? "read-only" : "", el.checked === true ? "checked" : el.checked === false ? "unchecked" : ""]
      .filter(Boolean)
      .join(",");
    const type = el.type ? `${el.tag}/${el.type}` : el.role ? `${el.tag}/${el.role}` : el.tag;
    lines.push(`${el.id} | ${type} | ${el.name} | ${el.value ?? ""} | ${state}`);
  }
  return lines.join("\n");
}

export function browserTools(deps: BrowserToolDeps): RunnableTool[] {
  const { page, boundary, log } = deps;

  const observeTool = betaZodTool({
    name: "observe",
    description:
      "Look at the current page: visible text and every element you can click, fill, select or check, each with an id. Ids are only valid until your next action. Frames outside the hotel's site are not read.",
    inputSchema: z.object({}),
    run: async () => {
      if (boundary.blind) return "Blind mode: the traveller is in control, nothing is observed.";
      const seen = await observe(page);
      const text = renderObservation(seen, boundary);
      log.event("observe", { url: seen.url, title: seen.title, elements: seen.elements.length, hidden: seen.text.filter((f) => !boundary.allows(f.frameUrl)).length });
      return text;
    },
  });

  const actTool = betaZodTool({
    name: "act",
    description:
      "Do one thing on the page: click an element, fill a text field, select an option by its label, or check/uncheck a box. Use ids from the latest observe. Several calls in one turn run in the order you issue them.",
    inputSchema: z.object({
      kind: z.enum(["click", "fill", "select", "check"]),
      id: z.string().describe("Element id from observe, e.g. 0:12"),
      value: z.string().optional().describe("Text for fill, option label for select"),
      checked: z.boolean().optional().describe("For check: true to tick, false to untick"),
    }),
    run: async (input) => {
      if (boundary.blind) return "Blind mode: refused.";
      const frameUrl = frameUrlOf(page, input.id);
      if (frameUrl && !boundary.allows(frameUrl)) {
        log.event("act.refused", { ...input, frameUrl });
        return `Refused: element ${input.id} is in a frame outside the hotel's site.`;
      }
      try {
        if (input.kind === "click") await act(page, { kind: "click", id: input.id });
        else if (input.kind === "fill") await act(page, { kind: "fill", id: input.id, value: input.value ?? "" });
        else if (input.kind === "select") await act(page, { kind: "select", id: input.id, value: input.value ?? "" });
        else await act(page, { kind: "check", id: input.id, checked: input.checked ?? true });
        log.event("act", { ...input, url: page.url() });
        return `Done. Page is now ${page.url()}. Observe to see the result.`;
      } catch (e) {
        log.event("act.error", { ...input, error: String(e).slice(0, 300) });
        return `Failed: ${String(e).slice(0, 300)}`;
      }
    },
  });

  const gotoTool = betaZodTool({
    name: "goto",
    description: "Navigate to a URL on the hotel's own site. Other sites are refused.",
    inputSchema: z.object({ url: z.string() }),
    run: async (input) => {
      const url = cleanUrl(input.url);
      if (!boundary.allows(url)) return `Refused: ${url} is not on the hotel's site.`;
      await page.goto(url);
      log.event("goto", { url });
      return `Now at ${page.url()}.`;
    },
  });

  const screenshotTool = betaZodTool({
    name: "screenshot",
    description: "Save a screenshot to the run log for humans to review later. Embedded frames from other sites are masked. Returns the file name, not the image.",
    inputSchema: z.object({ label: z.string().optional() }),
    run: async ({ label }) => {
      if (boundary.blind) return "Blind mode: refused.";
      const png = await page.screenshot({ mask: [page.locator("iframe")] });
      const file = log.screenshot(png, label ?? "");
      return `Saved ${file}.`;
    },
  });

  // Calls issued in one turn run in order, never concurrently: see serial.ts.
  return serialise([observeTool, actTool, gotoTool, screenshotTool]);
}

/** Resolves which frame an observe id points at, using the same index scheme as browser.ts. */
function frameUrlOf(page: Page, id: string): string | null {
  const [fi] = id.split(":");
  const frame = page.frames()[Number(fi)];
  return frame ? frame.url() : null;
}
