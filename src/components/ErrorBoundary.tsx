import React from 'react';

/** Catches rendering crashes so the user sees a recovery screen instead of a blank page. */
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error('Unhandled UI error:', error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-cream-50">
        <div className="max-w-md text-center rounded-4xl bg-white shadow-soft-lg p-8">
          <h1 className="font-display text-2xl font-extrabold text-ink-900">Something went wrong</h1>
          <p className="text-ink-500 mt-2">The page hit an unexpected problem. Your saved data is safe. Please reload and try again.</p>
          <button onClick={() => window.location.reload()} className="mt-6 rounded-full bg-mint-500 hover:bg-mint-600 text-white font-bold px-6 py-2.5">Reload page</button>
        </div>
      </div>
    );
  }
}
