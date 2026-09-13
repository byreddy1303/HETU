import type { PyqQuestion } from '@/lib/pyq';

export const DEFAULT_PRACTICE_CHOICES = ['A', 'B', 'C', 'D'];

/** Only split option lists whose source explicitly identifies A, B, C… labels. */
export function splitPyqPracticeQuestion(html: string, choices: string[]) {
  const fallback = { stem: html, options: null };
  if (typeof DOMParser === 'undefined') return fallback;
  const document = new DOMParser().parseFromString(html, 'text/html');
  const lists = Array.from(document.querySelectorAll('ol')).filter((list) => {
    const styleType = list.style.listStyleType;
    return styleType === 'upper-alpha' || (!styleType && list.getAttribute('type') === 'A');
  });
  if (lists.length !== 1) return fallback;

  const list = lists[0];
  const items = Array.from(list.children);
  if (
    list.parentElement?.closest('ol, ul, li') ||
    list.hasAttribute('reversed') ||
    (list.hasAttribute('start') && list.getAttribute('start') !== '1') ||
    items.length !== choices.length ||
    choices.some((choice, index) => choice !== String.fromCharCode(65 + index)) ||
    items.some(
      (item, index) =>
        item.tagName !== 'LI' ||
        (item.hasAttribute('value') && item.getAttribute('value') !== String(index + 1))
    )
  ) {
    return fallback;
  }

  const options = items.map((item) => item.innerHTML);
  list.remove();
  return { stem: document.body.innerHTML, options };
}

/** Return question content without a duplicate option list. */
export function pyqPracticeQuestionStem(question: PyqQuestion): string {
  const inputType = question.type === 'MSQ' || question.type === 'NAT' ? question.type : 'MCQ';
  if (inputType === 'NAT') return question.html;
  const answerChoices = question.choices?.length ? question.choices : DEFAULT_PRACTICE_CHOICES;
  return splitPyqPracticeQuestion(question.html, answerChoices).stem;
}
