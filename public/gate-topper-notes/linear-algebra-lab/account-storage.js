// Study progress is supplied by the authenticated HETU parent, never browser storage.
var hetuLabStorage = (function () {
  var host = window.frameElement;
  if (host && host.hetuLabStorage) {
    document.addEventListener('click', function (event) {
      var link = event.target.closest && event.target.closest('a[href]');
      if (!link) return;
      var url = new URL(link.href, location.href);
      if (url.origin === location.origin && url.pathname.startsWith('/gate-topper-notes/linear-algebra-lab/') && url.pathname.endsWith('.html')) {
        url.searchParams.set('storage', 'online-v1');
        link.href = url.href;
        link.target = '_self';
      }
    }, true);
    return host.hetuLabStorage;
  }
  // Direct bookmarks must enter the authenticated application before making edits.
  var page = location.pathname.split('/').pop() || 'index.html';
  location.replace('/linear-algebra-lab?module=' + encodeURIComponent(page));
  return { getItem: function () { return null; }, setItem: function () { throw new Error('Open the lab in HETU.'); }, removeItem: function () { throw new Error('Open the lab in HETU.'); } };
})();
