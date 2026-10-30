import { Fragment, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './math-text.css';

type Part = { kind: 'text' | 'code' | 'math'; value: string; display?: boolean };
const delimiters = [
  { left: '$$', right: '$$', display: true },
  { left: '\\[', right: '\\]', display: true },
  { left: '\\(', right: '\\)', display: false },
  { left: '$', right: '$', display: false }
];
function escaped(value: string, index: number) {
  let count = 0;
  while (index > 0 && value[--index] === '\\') count++;
  return count % 2 === 1;
}

/** Recognise explicit math without treating prices, paths, or code as formulas. */
function splitMathText(value: string): Part[] {
  const parts: Part[] = [];
  let start = 0;
  let cursor = 0;
  const flush = (end: number) => {
    if (end > start) parts.push({ kind: 'text', value: value.slice(start, end) });
  };
  while (cursor < value.length) {
    if (value[cursor] === '`') {
      const fence = value.slice(cursor).match(/^`+/)![0];
      const end = value.indexOf(fence, cursor + fence.length);
      if (end >= 0) {
        flush(cursor);
        parts.push({ kind: 'code', value: value.slice(cursor, end + fence.length) });
        cursor = start = end + fence.length;
        continue;
      }
    }
    const delimiter = delimiters.find((item) => value.startsWith(item.left, cursor));
    if (!delimiter || escaped(value, cursor)) {
      cursor++;
      continue;
    }
    const bodyStart = cursor + delimiter.left.length;
    if (delimiter.left === '$' && /\s/.test(value[bodyStart] || ' ')) {
      cursor++;
      continue;
    }
    let end = value.indexOf(delimiter.right, bodyStart);
    while (end >= 0 && escaped(value, end))
      end = value.indexOf(delimiter.right, end + delimiter.right.length);
    const body = end >= 0 ? value.slice(bodyStart, end) : '';
    if (
      end < 0 ||
      !body.trim() ||
      (delimiter.left === '$' &&
        (/\s$/.test(body) ||
          body.includes('\n') ||
          body.includes('`') ||
          /^\d/.test(value[end + 1] || '')))
    ) {
      cursor += delimiter.left.length;
      continue;
    }
    flush(cursor);
    parts.push({ kind: 'math', value: body, display: delimiter.display });
    cursor = start = end + delimiter.right.length;
  }
  flush(value.length);
  return parts;
}

function typeset(source: string, display: boolean) {
  if (source.length > 16000) return null;
  try {
    // Percentages in saved study text are values, not TeX comments.
    const expression = source.replace(/(?<!\\)%/g, '\\%');
    return katex.renderToString(expression, {
      displayMode: display,
      output: 'htmlAndMathml',
      throwOnError: true,
      strict: 'ignore',
      trust: false,
      maxExpand: 1000,
      maxSize: 10
    });
  } catch {
    // Preserve unsupported notation as readable text; never break the surrounding record.
    return null;
  }
}

/** Plain-text study prose with typeset math. Source HTML is never interpreted. */
export default function MathText({
  children,
  className = '',
  display = false,
  math = false
}: {
  children: string;
  className?: string;
  display?: boolean;
  math?: boolean;
}) {
  const content = useMemo(() => {
    const parsed = splitMathText(children);
    const parts: Part[] =
      math &&
      !parsed.some((part) => part.kind === 'math') &&
      !parsed.some((part) => part.kind === 'code')
        ? [{ kind: 'math', value: children, display }]
        : parsed;
    return parts.map((part, index) => {
      if (part.kind !== 'math') return <Fragment key={index}>{part.value}</Fragment>;
      const html = typeset(part.value, Boolean(part.display));
      return html ? (
        <span key={index} dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <span key={index}>{part.value}</span>
      );
    });
  }, [children, display, math]);
  const Wrapper = display ? 'div' : 'span';
  return (
    <Wrapper className={`math-text${math ? ' math-text--formula' : ''} ${className}`}>
      {content}
    </Wrapper>
  );
}
