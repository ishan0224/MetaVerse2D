import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'dismiss' | 'toggle' | 'active';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  selected?: boolean;
  fullWidthOnMobile?: boolean;
}

const SIZE_CLASS_BY_SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-sm sm:text-base',
  md: 'px-4 py-2 text-base sm:text-lg',
  lg: 'px-4 py-2 text-lg sm:text-xl',
};

const VARIANT_CLASS_BY_VARIANT: Record<Exclude<ButtonVariant, 'toggle'>, string> = {
  primary:
    'border border-cyan-100/85 bg-cyan-300 text-slate-950 hover:bg-cyan-400 focus-visible:outline-cyan-100 disabled:hover:bg-cyan-300',
  secondary:
    'border border-white/45 bg-white/12 text-zinc-50 hover:bg-white/24 focus-visible:outline-white/80',
  danger:
    'border border-transparent bg-gradient-to-r from-orange-400 to-amber-300 text-slate-950 hover:from-orange-300 hover:to-amber-200 focus-visible:outline-amber-100 disabled:hover:from-orange-400 disabled:hover:to-amber-300',
  dismiss:
    'border-2 border-zinc-50/95 bg-zinc-100/55 text-slate-900 shadow-[0_2px_10px_rgba(0,0,0,0.34)] hover:bg-zinc-100/70 focus-visible:outline-white',
  active:
    'border border-transparent bg-emerald-500 text-black hover:bg-emerald-400 focus-visible:outline-emerald-200',
};

function cx(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(' ');
}

function resolveToggleVariantClass(selected: boolean): string {
  if (selected) {
    return 'border-cyan-100/85 bg-cyan-300 text-slate-950';
  }

  return 'border-white/40 bg-transparent text-zinc-100 hover:border-white/65 hover:bg-white/20';
}

export function Button({
  variant = 'primary',
  size = 'md',
  selected = false,
  fullWidthOnMobile = false,
  className,
  type,
  ...props
}: ButtonProps) {
  const variantClass =
    variant === 'toggle' ? resolveToggleVariantClass(selected) : VARIANT_CLASS_BY_VARIANT[variant];

  return (
    <button
      type={type ?? 'button'}
      className={cx(
        'rounded-xl font-semibold transition duration-75 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-70',
        SIZE_CLASS_BY_SIZE[size],
        variantClass,
        fullWidthOnMobile ? 'w-full sm:w-auto' : null,
        className,
      )}
      {...props}
    />
  );
}
