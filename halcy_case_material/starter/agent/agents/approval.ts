// The traveller can only be sent to payment for a candidate whose latest
// validation on the live page was accepted. The hand-off takes its amounts
// from that validation, so this is a code rule, not a prompt request.

import type { RunState, ValidationResult } from "../types.ts";

export function latestValidation(state: RunState, candidateId: string): ValidationResult | undefined {
  return [...state.validations].reverse().find((v) => v.candidateId === candidateId);
}

/** Null when approval may be recorded, otherwise the reason it may not. */
export function approvalBlocker(state: RunState, candidateId: string): string | null {
  const v = latestValidation(state, candidateId);
  if (!v) return `${candidateId} has not been validated on the live site. Call run_validation first.`;
  if (!v.accepted) return `the latest validation of ${candidateId} was rejected: ${v.reasons.slice(-1)[0] ?? "no reason given"}. Validate again or choose another candidate.`;
  // One browser: it sits on the page of whichever candidate was validated last.
  const last = state.validations[state.validations.length - 1];
  if (last.candidateId !== candidateId) {
    return `the browser is on ${last.candidateId}, which was validated after ${candidateId}. Call run_validation for ${candidateId} again before sending the traveller to pay.`;
  }
  return null;
}
