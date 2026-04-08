import type { ReactNode } from 'react';

export interface PanelSectionProps {
  left: ReactNode;
  right: ReactNode;
  className?: string;
  leftClassName?: string;
  rightClassName?: string;
}

function cx(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(' ');
}

export function PanelSection({ left, right, className, leftClassName, rightClassName }: PanelSectionProps) {
  return (
    <div className={cx('grid grid-cols-1 md:grid-cols-2', className)}>
      <section className={cx('border-b border-white/15 p-5 md:border-b-0 md:border-r md:border-white/15 md:p-8', leftClassName)}>{left}</section>
      <section className={cx('flex items-center justify-center p-6 md:p-8', rightClassName)}>{right}</section>
    </div>
  );
}
