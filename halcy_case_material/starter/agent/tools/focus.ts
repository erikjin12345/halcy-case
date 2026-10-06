// Gives the screen back to whatever app the traveller was in (the chat's
// browser) after the agent's own browser window opens. Launching a visible
// Chromium makes macOS activate it; minimising the window does not hand the
// focus back. macOS only, best effort: any failure leaves things as they are.
// Uses lsappinfo and open, which need no Automation permission.

import { execFile } from "node:child_process";

const run = (cmd: string, args: string[]) =>
  new Promise<string>((resolve) => execFile(cmd, args, { timeout: 1500 }, (err, out) => resolve(err ? "" : String(out))));

/** The bundle id of the app in front, or undefined off macOS or on any failure. */
export async function frontmostApp(platform = process.platform, exec = run): Promise<string | undefined> {
  if (platform !== "darwin") return undefined;
  const asn = (await exec("lsappinfo", ["front"])).trim();
  if (!asn) return undefined;
  const info = await exec("lsappinfo", ["info", "-only", "bundleid", asn]);
  return info.match(/"CFBundleIdentifier"="([^"]+)"/)?.[1];
}

/** True for the browsers Playwright launches; giving focus back to them would be pointless. */
export const isAgentBrowser = (bundleId: string) => /chromium|chrome\.for\.testing/i.test(bundleId);

/** Brings that app back to the front. Does nothing for an unknown or agent-browser id. */
export async function activateApp(bundleId: string | undefined, platform = process.platform, exec = run): Promise<boolean> {
  if (platform !== "darwin" || !bundleId || isAgentBrowser(bundleId) || !/^[\w.-]+$/.test(bundleId)) return false;
  await exec("open", ["-b", bundleId]);
  return true;
}
