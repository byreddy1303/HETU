import { useEffect } from 'react';
import { useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Brand from './Brand';

export default function RootErrorBoundary() {
  const error = useRouteError();

  const errorMessage =
    (error instanceof Error && error.message) ||
    (isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : String(error));

  const isChunkError =
    errorMessage.includes('Failed to fetch dynamically imported module') ||
    errorMessage.includes('Importing a module script failed') ||
    errorMessage.includes('error loading dynamically imported module') ||
    errorMessage.includes('Loading chunk');

  useEffect(() => {
    if (isChunkError) {
      const pageHasBeenReloaded = sessionStorage.getItem('page_reloaded_for_chunk_error');
      if (!pageHasBeenReloaded) {
        sessionStorage.setItem('page_reloaded_for_chunk_error', 'true');
        window.location.reload();
      }
    }
  }, [isChunkError]);

  return (
    <div className="min-h-screen bg-bg text-fg flex flex-col justify-center items-center p-6 text-center">
      <div className="max-w-md w-full bg-surface border border-border rounded-xl p-6 shadow-sm flex flex-col items-center">
        <div className="mb-4">
          <Brand size="lg" />
        </div>

        <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6" />
        </div>

        <h1 className="text-xl font-bold mb-2">
          {isChunkError ? 'New Update Available' : 'Something went wrong'}
        </h1>

        <p className="text-muted text-sm mb-6">
          {isChunkError
            ? 'A new version of the app was deployed. Please refresh to load the latest version.'
            : 'An unexpected application error occurred.'}
        </p>

        {errorMessage && (
          <div className="w-full bg-bg border border-border/60 rounded-lg p-3 text-xs font-mono text-muted text-left mb-6 overflow-x-auto max-h-32">
            {errorMessage}
          </div>
        )}

        <button
          onClick={() => {
            sessionStorage.removeItem('page_reloaded_for_chunk_error');
            window.location.reload();
          }}
          className="w-full py-2.5 px-4 rounded-lg bg-accent text-accent-fg font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Reload Application
        </button>
      </div>
    </div>
  );
}
