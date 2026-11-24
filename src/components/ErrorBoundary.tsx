import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as { error?: string };
        if (parsed.error) {
          friendly = parsed.error;
        }
      } catch {
        // Keep plain message
      }

      return (
        <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-[#141413]">Something went wrong</h2>
            <p className="text-sm text-stone-600 leading-relaxed">{friendly}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-2.5 px-4 rounded-xl bg-[#D94E1F] text-white text-sm font-semibold hover:bg-[#BF4117] transition-colors cursor-pointer"
            >
              Reload Nkomazi Eats
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
