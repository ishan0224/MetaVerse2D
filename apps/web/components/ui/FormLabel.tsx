import type { LabelHTMLAttributes, ReactNode } from 'react';

export interface FormLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children: ReactNode;
}

function cx(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(' ');
}

export function FormLabel({ children, className, ...props }: FormLabelProps) {
  return (
    <label
      className={cx('mt-4 block text-base uppercase tracking-widest text-zinc-200 sm:text-lg', className)}
      {...props}
    >
      {children}
    </label>
  );
}
