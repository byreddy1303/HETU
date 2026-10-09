export type PackRecord = {
  id: string;
  version: number;
  url: string;
  subject?: string | null;
  name?: string | null;
  expression?: string | null;
  phrase?: string | null;
  concept?: string | null;
  subtopic?: string | null;
  source_ref?: string | null;
  capture_note?: string | null;
  kind?: string | null;
  prompt?: string | null;
  due_on?: string | null;
  this_weeks_fix?: string | null;
};

export type PackConcept = PackRecord & {
  topic: string;
  concept: string;
  summary: string;
  reasoning_origin: string;
  reasoning_correction: string | null;
  recognition_cues: string[];
  recognition_cue_count: number;
  retrieval_question: string | null;
  due_review: boolean;
  sources_complete: boolean;
  sources: {
    id: string;
    captured_at: string;
    sources: { title: string; url: string | null; kind: string }[];
  }[];
  evidence_links_complete: boolean;
  evidence_links: {
    link_id: string;
    rationale: string;
    record: { title: string; section: string; section_path: string; version: number } | null;
  }[];
};

export type LearningRevisionPack = {
  as_of: string;
  timezone: string;
  subject: string | null;
  limit: number;
  content_hash: string;
  retrieved_at: string;
  complete: boolean;
  has_more: Record<string, boolean>;
  totals_within_scan: Record<string, number>;
  text: string;
  sections: {
    weekly_focus: PackRecord | null;
    due_formulas: PackRecord[];
    triggers: PackRecord[];
    repeated_mistakes: { subject: string; name: string; count: number }[];
    priority_questions: PackRecord[];
    saved_concepts: PackConcept[];
    due_reviews: PackRecord[];
  };
};

export type SavedRevisionPack = {
  id: string;
  url: string;
  created_at: string;
  snapshot: LearningRevisionPack;
  idempotent_replay: boolean;
};

export type RevisionPackList = {
  items: { id: string; as_of: string; subject: string | null; created_at: string; url: string }[];
  next_offset: number | null;
  complete: boolean;
};
