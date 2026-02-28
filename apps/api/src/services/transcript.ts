import type { ParsedTranscript, Participant, SpeakerTurn } from "../lib/types";

/**
 * Parse a Gong transcript file into structured data.
 *
 * Expected format:
 *   Call Transcript
 *   ============================================================
 *   Call ID: 1463048971679673740
 *   Date: 2025-01-02
 *   Title: Allen Digital - Onboarding Planning
 *
 *   Participants:
 *     - Sarvesh Anand <sarvesh@cast.ai>
 *     - Akhil Srivastava <akhil.srivastava@allen.in>
 *   ============================================================
 *
 *   [4999092314777842233]
 *   [00:00] Hi, all.
 *   [00:01] Good morning.
 *
 *   [3851765349207337158] [Pricing]
 *   [00:03] Yeah, I'm good.
 */
export function parseTranscript(
  raw: string,
  filename: string
): ParsedTranscript {
  const lines = raw.split("\n");

  // Parse filename: "2025-01-02_Allen Digital - Onboarding Planning-14630489.txt"
  const filenameMatch = filename.match(
    /^(\d{4}-\d{2}-\d{2})_(.+?)-(\d+)\.txt$/
  );

  const metadata = {
    callId: "",
    date: "",
    title: "",
    filenameDate: filenameMatch?.[1],
    filenameGongId: filenameMatch?.[3],
  };

  const participants: Participant[] = [];
  const turns: SpeakerTurn[] = [];

  let inHeader = false;
  let inParticipants = false;
  let headerEnd = 0;

  // Parse header
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith("====")) {
      if (inHeader) {
        // Second separator marks end of header
        headerEnd = i + 1;
        break;
      }
      inHeader = true;
      continue;
    }

    if (!inHeader) continue;

    // Parse metadata fields
    const callIdMatch = line.match(/^Call ID:\s*(.+)$/);
    if (callIdMatch) {
      metadata.callId = callIdMatch[1].trim();
      continue;
    }

    const dateMatch = line.match(/^Date:\s*(.+)$/);
    if (dateMatch) {
      metadata.date = dateMatch[1].trim();
      continue;
    }

    const titleMatch = line.match(/^Title:\s*(.+)$/);
    if (titleMatch) {
      metadata.title = titleMatch[1].trim();
      continue;
    }

    if (line === "Participants:") {
      inParticipants = true;
      continue;
    }

    if (inParticipants) {
      // Parse "  - Name <email>"
      const participantMatch = line.match(
        /^-\s+(.+?)\s*<([^>]+)>$/
      );
      if (participantMatch) {
        participants.push({
          name: participantMatch[1].trim(),
          email: participantMatch[2].trim(),
        });
      }
    }
  }

  // Parse transcript body
  let currentSpeakerId = "";
  let currentTopicTag: string | undefined;

  for (let i = headerEnd; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check for speaker ID line: [numeric_id] or [numeric_id] [TopicTag]
    const speakerMatch = line.match(
      /^\[(\d{10,})\](?:\s+\[([^\]]+)\])?$/
    );
    if (speakerMatch) {
      currentSpeakerId = speakerMatch[1];
      currentTopicTag = speakerMatch[2] || undefined;
      continue;
    }

    // Check for timestamped content line: [MM:SS] text
    const contentMatch = line.match(/^\[(\d{2}:\d{2})\]\s*(.*)$/);
    if (contentMatch && currentSpeakerId) {
      const text = contentMatch[2].trim();
      if (text) {
        turns.push({
          speakerId: currentSpeakerId,
          timestamp: contentMatch[1],
          text,
          topicTag: currentTopicTag,
        });
      }
      continue;
    }
  }

  return { metadata, participants, turns };
}

/**
 * Convert parsed transcript back to a readable text format for Claude analysis.
 * Includes participant list and speaker turns with timestamps.
 */
export function formatTranscriptForAnalysis(parsed: ParsedTranscript): string {
  const lines: string[] = [];

  lines.push(`Call: ${parsed.metadata.title}`);
  lines.push(`Date: ${parsed.metadata.date}`);
  lines.push(`Call ID: ${parsed.metadata.callId}`);
  lines.push("");
  lines.push("Participants:");
  for (const p of parsed.participants) {
    lines.push(`  - ${p.name} <${p.email}>`);
  }
  lines.push("");
  lines.push("Transcript:");
  lines.push("");

  let lastSpeakerId = "";
  for (const turn of parsed.turns) {
    if (turn.speakerId !== lastSpeakerId) {
      lines.push("");
      const tagPart = turn.topicTag ? ` [${turn.topicTag}]` : "";
      lines.push(`[Speaker ${turn.speakerId}]${tagPart}`);
      lastSpeakerId = turn.speakerId;
    }
    lines.push(`[${turn.timestamp}] ${turn.text}`);
  }

  return lines.join("\n");
}

/**
 * Generate a SHA-256 hash of transcript content for change detection.
 */
export async function hashTranscript(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
