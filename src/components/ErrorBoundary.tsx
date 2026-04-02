import { Component, ErrorInfo, ReactNode } from 'react';
import { Icons } from './Icons';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl p-8 max-w-md text-center border-t-4 border-red-500">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 text-red-600">
                    <Icons.Alert className="w-8 h-8" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
                <p className="text-gray-600 mb-6">
                    The application encountered an unexpected error. We've logged this issue.
                </p>
                <div className="bg-gray-100 p-3 rounded text-left text-xs font-mono text-red-800 mb-6 overflow-x-auto">
                    {this.state.error?.message}
                </div>
                <button 
                    onClick={() => window.location.reload()}
                    className="w-full bg-jam-black text-white py-3 rounded-lg font-bold hover:bg-gray-800 transition-colors flex items-center justify-center"
                >
                    <Icons.Refresh className="w-4 h-4 mr-2" />
                    Reload Application
                </button>
            </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;