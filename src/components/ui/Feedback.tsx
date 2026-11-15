import React from 'react';
import { Inbox } from 'lucide-react';
import { Button } from './Button';

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-2xl bg-ink-100 ${className}`} />
);

export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; message?: string; actionLabel?: string; onAction?: () => void }> = ({
  icon, title, message, actionLabel, onAction,
}) => (
  <div className="flex flex-col items-center justify-center text-center py-14 px-4">
    <div className="w-20 h-20 rounded-full bg-mint-50 flex items-center justify-center mb-4 text-mint-500">
      {icon || <Inbox size={36} strokeWidth={1.5} />}
    </div>
    <h3 className="font-display text-xl font-bold text-ink-900 mb-1">{title}</h3>
    {message && <p className="text-ink-500 max-w-sm mb-5">{message}</p>}
    {actionLabel && onAction && <Button onClick={onAction}>{actionLabel}</Button>}
  </div>
);

export const ErrorState: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="rounded-3xl border-2 border-red-100 bg-red-50 p-6 text-center">
    <p className="font-bold text-red-600 mb-1">Something went wrong</p>
    <p className="text-sm text-red-500 mb-3">{message}</p>
    {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Try again</Button>}
  </div>
);
