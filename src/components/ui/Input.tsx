import React from 'react';
import { cn } from '../../lib/utils';

const baseInput = 'w-full rounded-2xl border-2 border-ink-100 bg-white px-4 py-2.5 text-ink-900 placeholder-ink-300 transition focus:border-mint-400 focus:ring-2 focus:ring-mint-100 disabled:bg-ink-50 disabled:text-ink-400';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(baseInput, className)} {...props} />
  )
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(baseInput, 'min-h-[100px] resize-y', className)} {...props} />
  )
);
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(baseInput, 'appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%23677691%27 stroke-width=%272%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")] bg-no-repeat bg-[right_1rem_center]', className)} {...props}>
      {children}
    </select>
  )
);
Select.displayName = 'Select';

export const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({ className, ...props }) => (
  <label className={cn('mb-1.5 block text-sm font-bold text-ink-700', className)} {...props} />
);

/** Label + control + hint/error. The label is linked to the control (click-to-focus, screen readers) and errors are announced. */
export const Field: React.FC<{ label: string; error?: string; hint?: string; children: React.ReactNode; className?: string }> = ({ label, error, hint, children, className }) => {
  const id = React.useId();
  const msgId = `${id}-msg`;
  const control = React.isValidElement<Record<string, unknown>>(children) && typeof children.type !== 'string'
    ? React.cloneElement(children, { id: children.props.id ?? id, 'aria-invalid': error ? true : undefined, 'aria-describedby': error || hint ? msgId : undefined })
    : children;
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      {control}
      {hint && !error && <p id={msgId} className="mt-1 text-xs text-ink-400">{hint}</p>}
      {error && <p id={msgId} role="alert" className="mt-1 text-xs font-semibold text-red-500">{error}</p>}
    </div>
  );
};
