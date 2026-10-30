import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import MathText from '@/components/shared/MathText';

afterEach(cleanup);
describe('study math typography', () => {
  it('typesets mixed prose with inline and display delimiters, Greek letters, fractions and powers', () => {
    const { container } = render(
      <MathText>{String.raw`Let $\alpha \leq x^2$. Then \(\frac{a}{b}\) and $$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$$.`}</MathText>
    );
    expect(container.querySelectorAll('.katex')).toHaveLength(3);
    expect(container.querySelector('.katex-display')).not.toBeNull();
    expect(container.querySelectorAll('math')).toHaveLength(3);
    expect(container.querySelector('.katex-html')).toHaveTextContent('α≤x2');
    expect(container.querySelector('.mfrac')).not.toBeNull();
    expect(container.querySelector('.math-text')?.textContent).not.toContain('$$');
  });
  it('renders standalone formula fields and updates when saved content changes', () => {
    const { container, rerender } = render(
      <MathText math>{String.raw`P(A\mid B)=\frac{P(B\mid A)P(A)}{P(B)}`}</MathText>
    );
    expect(container.querySelector('.mfrac')).not.toBeNull();
    rerender(<MathText>{String.raw`New value: \[\sqrt{x}\neq\infty\]`}</MathText>);
    expect(container.querySelectorAll('.katex')).toHaveLength(1);
    expect(container.querySelector('.katex-html')).toHaveTextContent('x');
    expect(container).toHaveTextContent('New value:');
  });
  it('preserves currency, percentages, routes, URLs and literal code', () => {
    const prose =
      String.raw`Budget $5-$10, save 20%; /api/formulas and https://example.com/a/b. Code: \`$x^2$\`. Incomplete $x.`.replaceAll(
        '\\`',
        '`'
      );
    const { container } = render(<MathText>{prose}</MathText>);
    expect(container.querySelector('.katex')).toBeNull();
    expect(container).toHaveTextContent(prose);
  });
  it('keeps percent values visible instead of interpreting them as TeX comments', () => {
    const { container } = render(<MathText math>{String.raw`p = 50% + 25\%`}</MathText>);
    expect(container.querySelector('.katex-html')).toHaveTextContent('p=50%+25%');
  });

  it('escapes source HTML and cannot create executable links or images through TeX', () => {
    const { container } = render(
      <MathText>{String.raw`<img src=x onerror=alert(1)> $\href{javascript:alert(1)}{click}$ $\includegraphics{https://example.com/tracker}$`}</MathText>
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container).toHaveTextContent('<img src=x onerror=alert(1)>');
  });
  it('keeps malformed or unsupported expressions readable without a renderer error panel', () => {
    const { container } = render(
      <MathText>{String.raw`Keep this: $\frac{1}{$ and $\unknownCommand{z}$.`}</MathText>
    );
    expect(container.querySelector('.katex-error')).toBeNull();
    expect(container).toHaveTextContent('Keep this:');
    expect(container).toHaveTextContent(String.raw`\unknownCommand{z}`);
  });
});
