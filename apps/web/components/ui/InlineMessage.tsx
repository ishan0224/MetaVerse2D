import type { ReactNode } from 'react';

type InlineMessageType = 'error' | 'hint' | 'success' | 'warning';

export interface InlineMessageProps {
  type: InlineMessageType;
  children: ReactNode;
  className?: string;
}

const CLASS_BY_TYPE: Record<InlineMessageType, string> = {
  error: 'text-rose-300',
  hint: 'text-zinc-300/85',
  success: 'text-emerald-200',
  warning: 'text-amber-200',
};

function cx(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(' ');
}

export function InlineMessage({ type, children, className }: InlineMessageProps) {
  return <div className={cx('min-h-6 pt-1 text-sm sm:text-base', CLASS_BY_TYPE[type], className)}>{children}</div>;
}
