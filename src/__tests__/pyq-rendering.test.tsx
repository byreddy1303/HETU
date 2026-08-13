import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PyqQuestionContent from '@/components/pyq/PyqQuestionContent';

describe('PYQ question rendering', () => {
  it('renders a source table split by line breaks instead of exposing LaTeX', async () => {
    const html = String.raw`<div itemprop="text"><p>Match each addressing mode in $\textbf{List I}$ with $\textbf{List II}$:<br>\[<br>\begin{array}{|l|l|}<br>\hline<br>{\textbf{List I}} &amp; {\textbf{List II}} \\<br>\hline<br>P.\ \text{Immediate} &amp; 1.\ \text{Element of an array} \\<br>\hline<br>\end{array}<br>\]</p></div>`;
    const { container } = render(<PyqQuestionContent html={html} />);

    await waitFor(() => expect(container.querySelector('.katex-display')).not.toBeNull());
    const visibleMath = container.querySelector('.katex-display .katex-html');
    expect(visibleMath).not.toHaveTextContent(String.raw`\begin{array}`);
    expect(visibleMath).not.toHaveTextContent(String.raw`\hline`);
    expect(visibleMath).toHaveTextContent('Immediate');
    expect(visibleMath).toHaveTextContent('Element of an array');
  });

  it('renders an archive environment that arrived without math delimiters', async () => {
    const html = String.raw`<p>R-type format:<br>\begin{array}{|l|l|}<br>\hline OPCODE &amp; REGISTER \\<br>\hline<br>\end{array}</p>`;
    const { container } = render(<PyqQuestionContent html={html} />);

    await waitFor(() => expect(container.querySelector('.katex-display')).not.toBeNull());
    const visibleMath = container.querySelector('.katex-display .katex-html');
    expect(visibleMath).not.toHaveTextContent(String.raw`\begin{array}`);
    expect(visibleMath).toHaveTextContent('OPCODE');
    expect(visibleMath).toHaveTextContent('REGISTER');
  });

  it('repairs legacy triple delimiters and matrix syntax', async () => {
    const html = String.raw`<p>$$$\left[ {\matrix{1 &amp; 4 \cr 0 &amp; 3 \cr}} \right]$$$</p>`;
    const { container } = render(<PyqQuestionContent html={html} />);

    await waitFor(() => expect(container.querySelector('.katex-display')).not.toBeNull());
    expect(container.querySelector('.katex-error')).toBeNull();
    expect(container.querySelector('.katex-display .katex-html')).toHaveTextContent('1');
  });

  it('repairs legacy eqalign and reserved text characters', async () => {
    const html = String.raw`<p>$$\eqalign{&amp; F_1 = a \cr &amp; F_2 = b \cr}$$</p><p>$$\textbf{Profit %} = \text{Bank_Manager #1}$$</p>`;
    const { container } = render(<PyqQuestionContent html={html} />);

    await waitFor(() => expect(container.querySelectorAll('.katex')).toHaveLength(2));
    expect(container.querySelector('.katex-error')).toBeNull();
    expect(container).toHaveTextContent('Profit %');
    expect(container).toHaveTextContent('Bank_Manager #1');
  });

  it('renders the 2005 switching-expression stem and all four choices as math', async () => {
    const html = String.raw`<p>The switching expression corresponding to $f(A,B,C,D)=\Sigma(1, 4, 5, 9, 11, 12)$ is:</p>
<ol style="list-style-type:upper-alpha">
<li><p>$BC’D’ + A’C’D + AB’D$</p></li>
<li><p>$ABC’ + ACD + B’C’D$</p></li>
<li><p>$ACD’ + A’BC’ + AC’D’$</p></li>
<li><p>$A’BD + ACD’ + BCD’$</p></li>
</ol>`;
    const { container } = render(<PyqQuestionContent html={html} />);

    await waitFor(() => expect(container.querySelectorAll('.katex')).toHaveLength(5));
    expect(container.querySelectorAll('ol > li')).toHaveLength(4);
    expect(container.querySelector('.katex-error')).toBeNull();
    expect(container).not.toHaveTextContent('$BC’D’');
  });
});
