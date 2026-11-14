import { forwardRef, type ButtonHTMLAttributes, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { haptic, type HapticIntent } from '@/lib/native';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  hapticIntent?: HapticIntent | 'none';
}

// Keep controls still; color and focus communicate interaction.
const variantClasses: Record<Variant, string> = {
  primary: 'bg-accent font-medium text-accent-contrast hover:bg-accent-hover',
  secondary:
    'border border-border bg-bg-raised font-medium text-text hover:border-border-hover hover:bg-bg-overlay',
  ghost: 'font-medium text-text-muted hover:bg-bg-overlay hover:text-text',
  danger:
    'border border-danger/30 font-medium text-danger hover:border-danger hover:bg-danger-faint'
};

const sizeClasses: Record<Size, string> = {
  sm: 'min-h-8 px-3 py-1.5 text-[13px] leading-snug',
  md: 'min-h-10 px-4 py-2 text-sm leading-snug',
  icon: 'h-10 w-10 shrink-0 p-0'
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    hapticIntent,
    className,
    type = 'button',
    onPointerUp,
    disabled,
    ...props
  },
  ref
) {
  const resolvedHaptic =
    hapticIntent ?? (variant === 'primary' ? 'light' : variant === 'danger' ? 'warning' : 'none');

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (!disabled && resolvedHaptic !== 'none') haptic(resolvedHaptic);
    onPointerUp?.(event);
  }

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      onPointerUp={handlePointerUp}
      className={cn(
        'u-button inline-flex min-w-0 max-w-full select-none items-center justify-center gap-2 whitespace-normal rounded text-center [&>svg]:shrink-0',
        'transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  );
});
