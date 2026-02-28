export interface Participant {
  name: string;
  email: string;
}

export interface CallSummary {
  id: string;
  title: string;
  callDate: string;
  participants: Participant[];
  hasAnalysis: boolean;
  call_type?: string;
  deal_stage?: string;
  gongCallId: string;
}

export interface CallDetail {
  id: string;
  driveFileId: string;
  filename: string;
  title: string;
  callDate: string;
  gongCallId: string;
  participants: Participant[];
}

export interface CallAnalysisResult {
  call_id: string | null;
  date: string | null;
  call_type: string;
  deal_stage: string;
  participants: {
    cast_ai: string[];
    customer: string[];
  };
  sentiment: {
    customer: {
      score: number;
      rationale: string;
      arc: "improving" | "declining" | "flat";
      key_moments: {
        timestamp: string;
        quote: string;
        impact: string;
      }[];
      unresolved_concerns: string[];
    };
    cast_ai_rep: {
      score: number;
      rationale: string;
      notes: string[];
    };
  };
  scorecard: {
    universal: ScorecardItem[];
    call_type_specific: ScorecardItem[];
  };
  signal_flags: {
    competitor_mentions: {
      present: boolean;
      details: {
        competitor: string;
        quote: string;
        rep_handling: string;
      }[];
    };
    pricing_objections: {
      present: boolean;
      details: {
        quote: string;
        rep_handling: string;
      }[];
    };
    technical_objections: {
      present: boolean;
      details: {
        quote: string;
        resolved: boolean;
        rep_handling: string;
      }[];
    };
    champion_blocker_dynamics: {
      present: boolean;
      details: {
        person: string;
        role: "champion" | "blocker" | "unknown";
        evidence: string;
      }[];
    };
  };
  what_went_well: {
    title: string;
    transcript_reference: string;
    why_effective: string;
  }[];
  what_went_poorly: {
    title: string;
    transcript_reference: string;
    deal_impact: string;
  }[];
  recommendations: {
    communication_and_technique: string[];
    product_knowledge_and_positioning: string[];
    process_and_follow_through: string[];
  };
  overall_summary: string;
}

interface ScorecardItem {
  dimension: string;
  score: number | "N/A";
  evidence: string;
  what_worked: string;
  what_didnt: string;
}

export interface Analysis {
  id: string;
  callId: string;
  userId: string;
  version: number;
  status: "pending" | "processing" | "completed" | "failed";
  result?: CallAnalysisResult;
  modelUsed: string;
  createdAt: number;
  error?: string;
}

export interface AnalysisStatus {
  status: "pending" | "processing" | "completed" | "failed";
  error?: string;
}

export interface SentimentPoint {
  timestamp: string;
  score: number;
  label: string;
}

export interface Objection {
  text: string;
  speaker: string;
  timestamp: string;
  context: string;
}

export interface ObjectionHandling {
  objection: string;
  response: string;
  technique: string;
  qualityScore: number;
}

export interface ActionItem {
  item: string;
  owner: string;
  deadline?: string;
  timestamp: string;
}

export interface Topic {
  topic: string;
  relevance: number;
  timestamps?: string[];
}

export interface CompetitorMention {
  name: string;
  context: string;
  sentiment: string;
  timestamp: string;
}
