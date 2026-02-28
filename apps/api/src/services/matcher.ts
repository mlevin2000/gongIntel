import type { Participant } from "../lib/types";

/**
 * Check if a user email is among the call participants.
 * Case-insensitive strict match.
 */
export function isUserParticipant(
  participants: Participant[],
  userEmail: string
): boolean {
  const normalizedEmail = userEmail.toLowerCase().trim();
  return participants.some(
    (p) => p.email.toLowerCase().trim() === normalizedEmail
  );
}

/**
 * Filter a list of participants arrays to only those containing the user's email.
 * Returns the indices of matching items.
 */
export function filterCallsByParticipant(
  callParticipants: Participant[][],
  userEmail: string
): number[] {
  const matching: number[] = [];
  for (let i = 0; i < callParticipants.length; i++) {
    if (isUserParticipant(callParticipants[i], userEmail)) {
      matching.push(i);
    }
  }
  return matching;
}
