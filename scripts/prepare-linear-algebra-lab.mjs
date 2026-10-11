import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bootstrap = `// Study progress is supplied by the authenticated HETU parent, never browser storage.
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
`;

export async function prepareLinearAlgebraLab(directory) {
  for (const name of await readdir(directory)) {
    if (!/\.(?:html|js)$/.test(name) || name === 'account-storage.js') continue;
    const filename = path.join(directory, name);
    let text = (await readFile(filename, 'utf8')).replace(/\blocalStorage\b/g, 'hetuLabStorage');
    if (name.endsWith('.html')) {
      if (!text.includes('src="account-storage.js')) {
        text = text.replace('<head>', '<head>\n<script src="account-storage.js?storage=online-v1"></script>');
      }
      // Old static responses can remain cached for a week. Version the local
      // scripts as well as each page so they cannot revive device-only writes.
      text = text.replace(/src="([a-zA-Z0-9_.-]+\.js)"/g, 'src="$1?storage=online-v1"');
    }
    await writeFile(filename, text);
  }
  await writeFile(path.join(directory, 'account-storage.js'), bootstrap);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareLinearAlgebraLab(path.resolve(process.argv[2] ?? 'public/gate-topper-notes/linear-algebra-lab'));
}
