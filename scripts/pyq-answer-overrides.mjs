// Audited corrections to archive answer metadata. Historical attempt snapshots
// are immutable; these values apply only when building a new bank version.
export const OFFICIAL_ANSWER_OVERRIDES = {
  'go:460798': {
    type: 'MSQ',
    answer: ['D'],
    tolerance: null,
    source: {
      kind: 'pdf_answer_key',
      year: 2025,
      session: 2,
      section: 'CS-2',
      question_no: 47,
      marks: 2,
      pdf: 'https://gate2025.iitr.ac.in/doc/2025/2025_Key/CS2_Keys.pdf',
      question_paper_url: 'https://gate2025.iitr.ac.in/doc/2025/2025_QP/CS2.pdf',
      question_paper_page: 36,
      correction:
        'Official master Q47 is multiple-select; archive display Q37 excludes General Aptitude.'
    }
  }
};
