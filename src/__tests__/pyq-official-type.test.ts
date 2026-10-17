import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('official question type correction', () => {
  it('ships GATE 2025 CS2 master Q47 as MSQ/D with official provenance in both banks', async () => {
    const files = [
      'public/pyq/subjects/operating-systems.json',
      'backends/python/app/data/pyq/subjects/operating-systems.json'
    ];
    for (const file of files) {
      const bank = JSON.parse(await readFile(file, 'utf8'));
      const rows = bank.questions.filter((question: { id: string }) => question.id === 'go:460798');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        type: 'MSQ',
        answer: ['D'],
        marks: 2,
        number: '37',
        answerSource: {
          kind: 'pdf_answer_key',
          year: 2025,
          question_no: 47,
          question_paper_page: 36,
          pdf: 'https://gate2025.iitr.ac.in/doc/2025/2025_Key/CS2_Keys.pdf'
        }
      });
      expect(bank.bankVersion).toContain('v13-official-cs2-q47');
    }
  });
});
