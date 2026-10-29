/** Remove obsolete web-shell caches before the desktop's first navigation.
 * Keep learner storage (including IndexedDB and localStorage) intact.
 */
async function prepareDesktopRenderer(session, targetUrl) {
  const url = new URL(targetUrl);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('Desktop renderer cleanup requires the local app origin.');
  }
  await session.clearStorageData({
    origin: url.origin,
    storages: ['serviceworkers', 'cachestorage'],
  });
  await session.clearData({ origins: [url.origin], dataTypes: ['cache'] });
}

module.exports = { prepareDesktopRenderer };
