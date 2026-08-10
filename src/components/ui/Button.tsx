import { forwardRef, type ButtonHTMLAttributes, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { haptic, type HapticIntent } from '@/lib/native';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  hapticIntent?: HapticIntent | 'none';
}

/* Key-cap physics: rest on a hard under-shadow, sink into it on press. */
const variantClasses: Record<Variant, string> = {
  primary: cn(
    'bg-accent font-semibold text-accent-contrast shadow-key',
    'hover:-translate-y-px hover:bg-accent-hover hover:shadow-key-hover',
    'active:scale-[0.96] active:translate-y-0 active:shadow-none'
  ),
  secondary: cn(
    'border border-border bg-bg-raised font-medium text-text shadow-[0_2px_0_theme(colors.border.DEFAULT)]',
    'hover:-translate-y-px hover:border-border-hover hover:shadow-[0_3px_0_theme(colors.border.hover)]',
    'active:scale-[0.97] active:translate-y-0 active:shadow-none'
  ),
  ghost: 'font-medium text-text-muted hover:bg-bg-overlay hover:text-text active:scale-[0.95]',
  danger: cn(
    'border border-danger/40 font-medium text-danger shadow-[0_2px_0_theme(colors.danger.faint)]',
    'hover:border-danger hover:bg-danger-faint',
    'active:scale-[0.96] active:translate-y-0 active:shadow-none'
  )
};

const sizeClasses: Record<Size, string> = {
  sm: 'min-h-8 px-3 py-1.5 text-[13px] leading-snug',
  md: 'min-h-10 px-4 py-2 text-sm leading-snug'
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
        'transition-[transform,background-color,border-color,box-shadow,color] duration-100',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  );
});
