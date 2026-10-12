export type TestAnalysisSummary = {
  id: string;
  name: string;
  test_date: string;
  summary: string;
  version: number;
  question_count: number;
  missing_information: string[];
  capture_origin: 'chatgpt' | 'app';
};

export type TestAnalysisList = {
  items: TestAnalysisSummary[];
  next_cursor: string | null;
  complete: boolean;
};

export type TestQuestion = {
  ref: string;
  subject: string;
  topic: string | null;
  question_text: string;
  answer_text: string | null;
  learner_answer: string | null;
  outcome: string | null;
  outcome_provenance: string | null;
  time_spent_sec: number | null;
  duration_source: string;
  capture_note: string | null;
  root_cause: string | null;
  pattern_name: string | null;
  trigger_sentence: string | null;
  analysis_provenance: string;
};

export type TestArtifact = {
  id: string;
  version: number;
  subject?: string;
  topic?: string;
  concept?: string;
  name?: string;
  expression?: string;
  phrase?: string;
  full_explanation?: string;
  prompt?: string;
  due_on?: string;
  scheduled_date?: string;
  stage?: string;
  total_marks?: number;
  max_marks?: number;
  correct?: number;
  wrong?: number;
  skipped?: number;
  evidence_status?: string;
  image_url?: string | null;
  has_image?: boolean;
  question_id?: string;
};

export type TestAnalysisDetail = {
  report: TestAnalysisSummary & {
    full_analysis: string;
    questions: TestQuestion[];
    sources: Array<{ kind: string; title: string; url: string | null; excerpt: string | null }>;
    next_steps: string[];
    unresolved: string[];
    session_id: string | null;
    workflow_id: string;
    revision_pack_id: string | null;
    artifact_maps: Record<string, Record<string, string>>;
    follow_up_receipts: Array<{ action: string; href: string }>;
  };
  artifacts: Record<string, TestArtifact[]>;
};
