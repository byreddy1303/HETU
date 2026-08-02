import { useEffect, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';
import renderMathInElement from 'katex/contrib/auto-render';
import 'katex/dist/katex.min.css';

export default function PyqQuestionContent({ html }: { html: string }) {
  const root = useRef<HTMLDivElement>(null);
  const safeHtml = useMemo(
    () =>
      DOMPurify.sanitize(html, {
        FORBID_TAGS: ['a'],
        FORBID_ATTR: ['onclick', 'onerror', 'onload']
      }),
    [html]
  );

  useEffect(() => {
    if (!root.current) return;
    renderMathInElement(root.current, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
        { left: '$', right: '$', display: false }
      ],
      throwOnError: false,
      strict: false
    });
  }, [safeHtml]);

  return <div ref={root} className="pyq-content" dangerouslySetInnerHTML={{ __html: safeHtml }} />;
}
