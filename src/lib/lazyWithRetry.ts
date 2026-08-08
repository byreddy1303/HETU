import { lazy, ComponentType } from 'react';

/**
 * Wraps dynamic `import()` calls to handle deployment chunk mismatches automatically.
 * When a new deployment renders old chunk hashes invalid (resulting in a 404 / Failed to fetch module error),
 * this helper automatically reloads the page once to pull the latest index.html and asset map.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    const pageHasBeenReloaded = sessionStorage.getItem('page_reloaded_for_chunk_error');

    try {
      const component = await componentImport();
      sessionStorage.removeItem('page_reloaded_for_chunk_error');
      return component;
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      const isChunkError =
        error?.name === 'TypeError' ||
        errorMessage.includes('Failed to fetch dynamically imported module') ||
        errorMessage.includes('Importing a module script failed') ||
        errorMessage.includes('error loading dynamically imported module') ||
        errorMessage.includes('Loading chunk');

      if (isChunkError && !pageHasBeenReloaded) {
        sessionStorage.setItem('page_reloaded_for_chunk_error', 'true');
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }

      sessionStorage.removeItem('page_reloaded_for_chunk_error');
      throw error;
    }
  });
}
