import { forwardRef, type InputHTMLAttributes } from 'react';

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string | null;
  errorClassName?: string;
}

function cx(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(' ');
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { error, errorClassName, className, ...props },
  ref,
) {
  return (
    <div>
      <input
        ref={ref}
        className={cx(
          'mt-2 w-full rounded-xl border border-sky-100/45 bg-black/52 px-4 py-3 text-xl text-zinc-50 outline-none transition-colors duration-75 ease-out focus:border-sky-300/85 focus:ring-2 focus:ring-sky-300/50 disabled:cursor-not-allowed disabled:opacity-70 sm:text-2xl',
          className,
        )}
        {...props}
      />
      {error !== undefined ? (
        <div className={cx('min-h-6 pt-1 text-sm text-rose-300 sm:text-base', errorClassName)}>{error ?? ''}</div>
      ) : null}
    </div>
  );
});
