import Anthropic from "@anthropic-ai/sdk";
import { env } from "../lib/env";
import { ExternalServiceError } from "../lib/errors";
import { logger } from "../lib/logger";
import type {
  ParsedTranscript,
  CallAnalysisResult,
} from "../lib/types";
import { formatTranscriptForAnalysis } from "./transcript";

const MODEL = "claude-sonnet-4-20250514";
const SERVICE = "claude";
const MAX_RETRIES = 3;
const ANALYSIS_TIMEOUT_MS = 90_000;

const ANALYSIS_PROMPT = `You are an expert sales coach analyzing a call recording transcript between Cast AI 
personnel and a customer or prospect. Cast AI is a Kubernetes cost optimization and 
automation platform.

You will be given a raw transcript. Speaker labels may or may not be present. If they 
are absent, infer speakers from context (e.g., who is asking vs. answering questions, 
who knows the product deeply, who is asking about pricing or timelines).

Work through the following steps in order. Do not skip steps. Use all steps to inform 
your final output, but only return the JSON object — no intermediate reasoning, no 
commentary, no markdown.

---

## STEP 1: CALL CLASSIFICATION

Identify:
- Call type: Discovery / Demo / Technical Deep-Dive / Follow-Up / Negotiation / 
  Renewal / Onboarding / Handoff / Mixed (describe)
- Participants: Cast AI rep(s) and customer/prospect role(s) if determinable
- Deal stage signal: Early exploration / Active evaluation / Late-stage / 
  Existing customer

This classification determines which call-type-specific scoring criteria apply in Step 3.

---

## STEP 2: SENTIMENT ANALYSIS

### Customer/Prospect Sentiment
Score 1–5 (1 = strongly negative, 3 = neutral, 5 = strongly positive).
Assess:
- Overall score and one-sentence rationale
- Sentiment arc: did it improve, decline, or stay flat across the call?
- Key moments that shifted sentiment — quote the transcript briefly
- Unresolved concerns or frustrations at call end

### Cast AI Rep Sentiment & Presence
Score 1–5.
Assess:
- Confidence and command of the product
- Tone calibration (too aggressive / too passive / well-matched)
- Energy and engagement
- Any moments of defensiveness, uncertainty, or over-promising

---

## STEP 3: SCORECARD

Score each applicable dimension 1–5. If a dimension is not relevant to this call 
type, set score to "N/A" and leave evidence/what_worked/what_didnt as empty strings.

### Universal Dimensions (all call types)
- Opening & agenda-setting
- Active listening & discovery quality
- Objection handling
- Cast AI value proposition clarity
- Call control & pacing
- Clear next steps established

### Call-Type Specific Dimensions
Apply the relevant block based on Step 1 classification. Include only the block(s) 
that apply.

**Discovery:** MEDDIC/BANT qualification quality, pain identification depth, 
budget/timeline probing, competitor intelligence gathered

**Demo:** Technical accuracy, customization to prospect's environment, 
"so what" framing of features shown

**Negotiation/Renewal:** Anchor management, concession discipline, mutual value framing

**Technical Deep-Dive:** Accuracy of technical claims, handling of unknown questions, 
ability to translate complexity for non-technical attendees

**Onboarding/Handoff:** Clarity of handoff, next steps defined, blockers identified 
and owned, customer confidence in Cast AI team

---

## STEP 4: SIGNAL FLAGS

Scan the full transcript and flag the following if present. For each, quote the 
relevant excerpt and assess how the rep handled it.

- Competitor mentions (Karpenter, Cloudability, OpenCost, or any other tool 
  mentioned as an alternative to Cast AI)
- Pricing objections (cost pushback, ROI skepticism, budget constraints)
- Technical objections (unresolved blockers, skepticism about integration, 
  performance, or reliability — note whether each was resolved on the call)
- Champion vs. blocker dynamics (who is advocating for Cast AI internally vs. 
  creating friction)

---

## STEP 5: WHAT WENT WELL

Identify 3–5 specific things the Cast AI rep did well. Each must:
- Reference a concrete moment in the transcript
- Explain why it was effective — not just that it was good

---

## STEP 6: WHAT WENT POORLY

Identify 3–5 specific things that went poorly or were missed opportunities. 
Be direct. Each must:
- Reference a concrete moment in the transcript
- Explain the likely impact on the customer or deal
- Be specific — "the rep could have probed more" is not acceptable without 
  stating exactly what they should have asked and why

---

## STEP 7: IMPROVEMENT RECOMMENDATIONS

Provide actionable recommendations in three categories:

**Communication & Sales Technique:** Specific behaviors to add, remove, or modify, 
grounded in this call.

**Product Knowledge & Positioning:** Gaps in product knowledge, inaccurate claims, 
or missed differentiation opportunities. Flag anything needing correction.

**Process & Follow-Through:** Missing next steps, unclear ownership, follow-up gaps, 
or CRM hygiene issues (commitments made on the call that need to be logged).

---

## OUTPUT FORMAT

Return a single valid JSON object. No text before or after it. No markdown code 
fences. All strings must be properly escaped. Scores must be integers 1–5 or the 
string "N/A". Booleans must be true or false, not "yes" or "no".

The overall_summary field must be 2–3 sentences maximum.

{call_id: string | null, date: string | null, call_type: string, deal_stage: string, participants: {cast_ai: string[], customer: string[]}, sentiment: {customer: {score: number, rationale: string, arc: "improving" | "declining" | "flat", key_moments: [{timestamp: string, quote: string, impact: string}], unresolved_concerns: string[]}, cast_ai_rep: {score: number, rationale: string, notes: string[]}}, scorecard: {universal: [{dimension: string, score: number | "N/A", evidence: string, what_worked: string, what_didnt: string}], call_type_specific: [{dimension: string, score: number | "N/A", evidence: string, what_worked: string, what_didnt: string}]}, signal_flags: {competitor_mentions: {present: boolean, details: [{competitor: string, quote: string, rep_handling: string}]}, pricing_objections: {present: boolean, details: [{quote: string, rep_handling: string}]}, technical_objections: {present: boolean, details: [{quote: string, resolved: boolean, rep_handling: string}]}, champion_blocker_dynamics: {present: boolean, details: [{person: string, role: "champion" | "blocker" | "unknown", evidence: string}]}}, what_went_well: [{title: string, transcript_reference: string, why_effective: string}], what_went_poorly: [{title: string, transcript_reference: string, deal_impact: string}], recommendations: {communication_and_technique: string[], product_knowledge_and_positioning: string[], process_and_follow_through: string[]}, overall_summary: string}

---

TRANSCRIPT_PLACEHOLDER`;

async function withRetry<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;

      const status = err?.status ?? err?.statusCode;
      const isRetryable =
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 529 ||
        err?.code === "ECONNRESET" ||
        err?.code === "ETIMEDOUT";

      if (!isRetryable || attempt === MAX_RETRIES) {
        break;
      }

      const retryAfter = err?.headers?.["retry-after"];
      const delayMs = retryAfter
        ? Math.min(Number(retryAfter) * 1000, 30_000)
        : Math.min(1000 * 2 ** (attempt - 1), 16_000);

      logger.warn(`retrying ${operation} (attempt ${attempt + 1}/${MAX_RETRIES})`, {
        service: SERVICE,
        operation,
        error: err,
        delayMs,
        status,
      });

      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw new ExternalServiceError(
    SERVICE,
    `${operation} failed after ${MAX_RETRIES} attempts: ${lastError?.message}`,
    lastError
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new ExternalServiceError(SERVICE, `${label} timed out after ${ms}ms`)),
      ms
    );
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

export async function analyzeTranscript(
  parsed: ParsedTranscript
): Promise<CallAnalysisResult> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const transcriptText = formatTranscriptForAnalysis(parsed);

  const prompt = ANALYSIS_PROMPT.replace("TRANSCRIPT_PLACEHOLDER", transcriptText);

  const response = await withRetry("analyzeTranscript", () =>
    withTimeout(
      client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      }),
      ANALYSIS_TIMEOUT_MS,
      "Claude analysis"
    )
  );

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new ExternalServiceError(SERVICE, "No text response from Claude");
  }

  let jsonText = textBlock.text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let result: CallAnalysisResult;
  try {
    result = JSON.parse(jsonText);
  } catch (e) {
    throw new ExternalServiceError(
      SERVICE,
      `Failed to parse Claude response as JSON: ${(e as Error).message}. Raw (truncated): ${jsonText.slice(0, 500)}`
    );
  }

  if (!result.call_type || !result.deal_stage || !result.participants || !result.overall_summary) {
    throw new ExternalServiceError(
      SERVICE,
      "Claude response missing required fields (call_type, deal_stage, participants, or overall_summary)"
    );
  }

  logger.info("transcript analysis completed", {
    service: SERVICE,
    operation: "analyzeTranscript",
    callType: result.call_type,
    dealStage: result.deal_stage,
  });

  return result;
}

export { MODEL as ANALYSIS_MODEL };
