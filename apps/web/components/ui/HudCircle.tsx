import type { ReactNode } from 'react';

type HudCircleSize = 'sm' | 'md' | 'lg';

export interface HudCircleProps {
  size?: HudCircleSize;
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
}

const SIZE_CLASS_BY_SIZE: Record<HudCircleSize, string> = {
  sm: 'h-11 w-11 sm:h-12 sm:w-12',
  md: 'h-12 w-12',
  lg: 'h-14 w-14',
};

function cx(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(' ');
}

export function HudCircle({ size = 'sm', children, ariaLabel, className }: HudCircleProps) {
  return (
    <div
      aria-label={ariaLabel}
      className={cx(
        'flex items-center justify-center overflow-hidden rounded-full border border-white/20 bg-black/60 text-zinc-100 shadow-md backdrop-blur',
        SIZE_CLASS_BY_SIZE[size],
        className,
      )}
    >
      {children}
    </div>
  );
}
