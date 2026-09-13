import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PyqPracticeAnswer from '@/components/pyq/PyqPracticeAnswer';
import type { PyqQuestion } from '@/lib/pyq';

const question: PyqQuestion = {
  id: 'practice-options',
  year: 2026,
  set: 1,
  number: '1',
  paperLabel: 'GATE CSE 2026 Set 1',
  subject: 'Discrete Mathematics',
  subjectSlug: 'discrete-mathematics',
  topic: 'Logic',
  topicSlug: 'logic',
  subtopics: [],
  marks: 1,
  type: 'MCQ',
  answer: 'B',
  tolerance: null,
  answerStatus: 'available',
  sourceUrl: 'https://gateoverflow.in/test',
  answerSource: null,
  html: String.raw`<p>Choose the expression for $x$.</p><ol style="list-style-type:upper-alpha"><li><p>$x+1$</p></li><li><p>Second option</p><img src="/pyq/diagram.png" alt="Option diagram" onerror="alert('unsafe')"></li><li>Third option</li><li>Fourth option</li></ol>`
};

function InteractiveAnswer({
  value = question,
  disabled = false
}: {
  value?: PyqQuestion;
  disabled?: boolean;
}) {
  const [choices, onChoices] = useState<string[]>([]);
  const [numeric, onNumeric] = useState('');
  return (
    <PyqPracticeAnswer
      question={value}
      choices={choices}
      numeric={numeric}
      disabled={disabled}
      onChoices={onChoices}
      onNumeric={onNumeric}
    />
  );
}

describe('PYQ clickable practice answers', () => {
  it('makes rich option content clickable and preserves sanitized images and rendered math', async () => {
    const user = userEvent.setup();
    const { container } = render(<InteractiveAnswer />);
    expect(container.querySelectorAll('.katex')).toHaveLength(2);
    expect(container.querySelector('ol')).toBeNull();
    const first = screen.getByRole('button', { name: 'A' });
    expect(within(first).getByText('A', { exact: true })).toBeInTheDocument();
    const description = document.getElementById(first.getAttribute('aria-describedby')!);
    expect(description?.querySelector('.katex')).not.toBeNull();
    await user.click(first);
    expect(first).toHaveAttribute('aria-pressed', 'true');
    const image = screen.getByRole('img', { name: 'Option diagram' });
    expect(image).not.toHaveAttribute('onerror');
    await user.click(image);
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'true');
    expect(first).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles multiple options with keyboard and pointer input', async () => {
    const user = userEvent.setup();
    render(
      <InteractiveAnswer
        value={{
          ...question,
          type: 'MSQ',
          html: question.html.replace('style="list-style-type:upper-alpha"', 'type="A"')
        }}
      />
    );
    const first = screen.getByRole('button', { name: 'A' });
    first.focus();
    await user.keyboard('[Space]');
    await user.click(screen.getByText('Third option'));
    expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'C' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(first);
    expect(first).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'C' })).toHaveAttribute('aria-pressed', 'true');
  });

  it.each([
    [
      'ordinary numbered list',
      '<p>Consider these statements.</p><ol><li>One</li><li>Two</li><li>Three</li><li>Four</li></ol>'
    ],
    ['incorrect option count', '<ol type="A"><li>One</li><li>Two</li></ol>'],
    [
      'multiple explicit option lists',
      '<ol type="A"><li>A1</li><li>A2</li><li>A3</li><li>A4</li></ol><ol type="A"><li>B1</li><li>B2</li><li>B3</li><li>B4</li></ol>'
    ],
    [
      'shifted numbering',
      '<ol type="A" start="2"><li>One</li><li>Two</li><li>Three</li><li>Four</li></ol>'
    ],
    [
      'nested alpha list',
      '<ul><li><ol type="A"><li>One</li><li>Two</li><li>Three</li><li>Four</li></ol></li></ul>'
    ]
  ])('keeps the source intact and falls back to letter buttons for an %s', (_label, html) => {
    const { container } = render(<InteractiveAnswer value={{ ...question, html }} />);
    expect(container.querySelector('ol')).not.toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(4);
    for (const choice of ['A', 'B', 'C', 'D']) {
      expect(screen.getByRole('button', { name: choice })).toHaveTextContent(choice);
      expect(screen.getByRole('button', { name: choice })).not.toHaveAttribute('aria-describedby');
    }
  });

  it('supports explicit five-option lists and image-only fallback questions', () => {
    const { rerender } = render(
      <InteractiveAnswer
        value={{
          ...question,
          choices: ['A', 'B', 'C', 'D', 'E'],
          html: '<p>Choose one.</p><ol type="A"><li>One</li><li>Two</li><li>Three</li><li>Four</li><li>Five</li></ol>'
        }}
      />
    );
    expect(screen.getByRole('button', { name: 'E' })).toHaveTextContent('Five');
    rerender(
      <InteractiveAnswer
        value={{
          ...question,
          html: '<img src="/pyq/question.png" alt="Question with printed options">'
        }}
      />
    );
    expect(screen.getByRole('img', { name: 'Question with printed options' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('keeps disabled responses unchanged', async () => {
    const user = userEvent.setup();
    const onChoices = vi.fn();
    render(
      <PyqPracticeAnswer
        question={question}
        choices={['B']}
        numeric=""
        disabled
        onChoices={onChoices}
        onNumeric={vi.fn()}
      />
    );
    await user.click(screen.getByText('Third option'));
    expect(onChoices).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'B' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders and edits a numeric answer without interpreting the stem list as options', async () => {
    const user = userEvent.setup();
    const { container } = render(<InteractiveAnswer value={{ ...question, type: 'NAT' }} />);
    expect(container.querySelector('ol')).not.toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    const input = screen.getByRole('spinbutton', { name: 'Your numeric answer' });
    await user.type(input, '0');
    expect(input).toHaveValue(0);
    await user.clear(input);
    await user.type(input, '12.5');
    expect(input).toHaveValue(12.5);
  });
});
