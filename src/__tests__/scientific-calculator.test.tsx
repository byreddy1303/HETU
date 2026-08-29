import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ScientificCalculator, { CalculatorTrigger } from '@/components/shared/ScientificCalculator';

describe('ScientificCalculator', () => {
  const getDisplay = () => screen.getByLabelText(/^Calculator display:/);

  it('renders trigger and opens dialog', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<CalculatorTrigger onClick={onToggle} active={false} />);

    const trigger = screen.getByRole('button', { name: 'Open scientific calculator' });
    expect(trigger).toBeInTheDocument();
    await user.click(trigger);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('renders well-organized numeric keypad and evaluates basic arithmetic', async () => {
    const user = userEvent.setup();
    render(<ScientificCalculator open={true} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Scientific calculator' })).toBeInTheDocument();
    expect(getDisplay()).toHaveTextContent('0');

    // Perform 7 + 8 * 2 = (7 + 8 × 2) = 23
    await user.click(screen.getByRole('button', { name: '7' }));
    await user.click(screen.getByRole('button', { name: '+' }));
    await user.click(screen.getByRole('button', { name: '8' }));
    await user.click(screen.getByRole('button', { name: '×' }));
    await user.click(screen.getByRole('button', { name: '2' }));
    await user.click(screen.getByRole('button', { name: '=' }));

    expect(getDisplay()).toHaveTextContent('23');
  });

  it('supports parentheses and order of operations', async () => {
    const user = userEvent.setup();
    render(<ScientificCalculator open={true} onClose={vi.fn()} />);

    // Perform ( 7 + 8 ) × 2 = 30
    await user.click(screen.getByRole('button', { name: '(' }));
    await user.click(screen.getByRole('button', { name: '7' }));
    await user.click(screen.getByRole('button', { name: '+' }));
    await user.click(screen.getByRole('button', { name: '8' }));
    await user.click(screen.getByRole('button', { name: ')' }));
    await user.click(screen.getByRole('button', { name: '×' }));
    await user.click(screen.getByRole('button', { name: '2' }));
    await user.click(screen.getByRole('button', { name: '=' }));

    expect(getDisplay()).toHaveTextContent('30');
  });

  it('supports scientific functions: sqrt, square, factorial, sin (DEG mode)', async () => {
    const user = userEvent.setup();
    render(<ScientificCalculator open={true} onClose={vi.fn()} />);

    // 16 -> sqrt -> 4
    await user.click(screen.getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: '6' }));
    await user.click(screen.getByRole('button', { name: '√' }));
    expect(getDisplay()).toHaveTextContent('4');

    // 4 -> x² -> 16
    await user.click(screen.getByRole('button', { name: 'x²' }));
    expect(getDisplay()).toHaveTextContent('16');

    // 5 -> n! -> 120
    await user.click(screen.getByRole('button', { name: '5' }));
    await user.click(screen.getByRole('button', { name: 'n!' }));
    expect(getDisplay()).toHaveTextContent('120');

    // 30 -> sin -> 0.5 (DEG mode is default)
    await user.click(screen.getByRole('button', { name: '3' }));
    await user.click(screen.getByRole('button', { name: '0' }));
    await user.click(screen.getByRole('button', { name: 'sin' }));
    expect(getDisplay()).toHaveTextContent('0.5');
  });

  it('supports modulo operator', async () => {
    const user = userEvent.setup();
    render(<ScientificCalculator open={true} onClose={vi.fn()} />);

    // 17 mod 5 = 2
    await user.click(screen.getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: '7' }));
    await user.click(screen.getByRole('button', { name: 'mod' }));
    await user.click(screen.getByRole('button', { name: '5' }));
    await user.click(screen.getByRole('button', { name: '=' }));

    expect(getDisplay()).toHaveTextContent('2');
  });

  it('supports sign toggle ± and memory operations', async () => {
    const user = userEvent.setup();
    render(<ScientificCalculator open={true} onClose={vi.fn()} />);

    // Type 42, toggle sign -> -42
    await user.click(screen.getByRole('button', { name: '4' }));
    await user.click(screen.getByRole('button', { name: '2' }));
    await user.click(screen.getByRole('button', { name: '±' }));
    expect(getDisplay()).toHaveTextContent('-42');

    // Store in memory MS
    await user.click(screen.getByRole('button', { name: 'MS' }));
    expect(screen.getByText('M = -42')).toBeInTheDocument();

    // Clear display AC
    await user.click(screen.getByRole('button', { name: 'AC' }));
    expect(getDisplay()).toHaveTextContent('0');

    // Recall memory MR
    await user.click(screen.getByRole('button', { name: 'MR' }));
    expect(getDisplay()).toHaveTextContent('-42');

    // Memory Clear MC
    await user.click(screen.getByRole('button', { name: 'MC' }));
    expect(screen.queryByText('M = -42')).not.toBeInTheDocument();
  });

  it('supports 2nd mode toggle for inverse trig and exponential functions', async () => {
    const user = userEvent.setup();
    render(<ScientificCalculator open={true} onClose={vi.fn()} />);

    // Click 2nd
    await user.click(screen.getByRole('button', { name: '2nd' }));
    expect(screen.getByText('2nd mode active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'sin⁻¹' })).toBeInTheDocument();

    // Type 0.5 -> sin⁻¹ -> 30 (in DEG)
    await user.click(screen.getByRole('button', { name: '0' }));
    await user.click(screen.getByRole('button', { name: '.' }));
    await user.click(screen.getByRole('button', { name: '5' }));
    await user.click(screen.getByRole('button', { name: 'sin⁻¹' }));
    expect(getDisplay()).toHaveTextContent('30');
  });

  it('supports angle mode switching between DEG and RAD', async () => {
    const user = userEvent.setup();
    render(<ScientificCalculator open={true} onClose={vi.fn()} />);

    // Switch to RAD
    await user.click(screen.getByRole('button', { name: 'RAD' }));
    expect(screen.getByRole('button', { name: 'RAD' })).toHaveAttribute('aria-pressed', 'true');

    // π -> sin -> 0 (in RAD, sin(π) is approximately 0)
    await user.click(screen.getByRole('button', { name: 'π' }));
    await user.click(screen.getByRole('button', { name: 'sin' }));
    const result = parseFloat(getDisplay().textContent || '0');
    expect(Math.abs(result)).toBeLessThan(1e-10);
  });
});
