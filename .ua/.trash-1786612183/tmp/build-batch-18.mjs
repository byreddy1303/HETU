import fs from 'node:fs';
import path from 'node:path';

const uaDir = '/Users/bkalyankrishnareddy/Desktop/GATE PREP/hetu/.ua';
const input = JSON.parse(fs.readFileSync(path.join(uaDir, 'tmp/ua-file-analyzer-input-18.json'), 'utf8'));
const extraction = JSON.parse(fs.readFileSync(path.join(uaDir, 'tmp/ua-file-extract-results-18.json'), 'utf8'));

if (!extraction.scriptCompleted) throw new Error('Structural extraction did not complete');

const fileMeta = {
  '.deploy.env.example': ['Documents the placeholder deployment environment variables needed for the web application, Supabase, email delivery, Telegram, and push notifications without containing live credentials.', ['configuration-template', 'deployment', 'environment-variables', 'documentation']],
  '.gitattributes': ['Defines repository-level Git attribute handling for tracked artifacts.', ['configuration', 'git', 'repository', 'attributes']],
  '.nvmrc': ['Pins the Node.js runtime family expected by local development and build tooling.', ['configuration', 'nodejs', 'runtime', 'development']],
  '.ua/.understandignore': ['Excludes secrets, generated output, caches, binary artifacts, large datasets, and other low-signal paths from knowledge-graph analysis.', ['configuration', 'knowledge-graph', 'ignore-rules', 'security']],
  '.ua/config.json': ['Stores the minimal Understand-Anything project analysis configuration for this repository.', ['configuration', 'knowledge-graph', 'project-metadata']],
  'android-stub/.gitkeep': ['Keeps the otherwise empty Android stub directory represented in version control.', ['repository', 'placeholder', 'android']],
  'android/app/proguard-rules.pro': ['Provides application-specific Android shrinker and obfuscation rules layered onto the release build.', ['configuration', 'android', 'proguard', 'release-build']],
  'android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java': ['Provides the generated Android instrumentation smoke test that verifies the application context package on a device or emulator.', ['test', 'android', 'instrumentation', 'smoke-test']],
  'android/app/src/main/AndroidManifest.xml': ['Declares the Android application, main deep-link activity, push messaging service, notification action receivers, file provider, and required platform capabilities.', ['configuration', 'android', 'manifest', 'deep-linking', 'notifications']],
  'android/app/src/main/java/in/airjournal/app/BuddyMessagingService.java': ['Extends Capacitor Firebase messaging to render HETU buddy and study notifications with channels, safe deep links, inline replies, and authenticated action buttons.', ['service', 'android', 'push-notifications', 'firebase', 'interactive-actions']],
  'android/app/src/main/java/in/airjournal/app/BuddyReplyReceiver.java': ['Captures bounded Android inline-reply text, updates notification state, and enqueues unique network-constrained delivery work.', ['event-handler', 'android', 'inline-reply', 'workmanager']],
  'android/app/src/main/java/in/airjournal/app/BuddyReplyWorker.java': ['Posts an inline buddy reply to a validated HTTPS endpoint with retry-aware WorkManager results and notification delivery feedback.', ['service', 'android', 'inline-reply', 'workmanager', 'networking']],
  'android/app/src/main/java/in/airjournal/app/MainActivity.java': ['Hosts the Capacitor bridge, performs a one-time legacy service-worker cleanup, and safely translates supported app links into WebView routes.', ['entry-point', 'android', 'capacitor', 'deep-linking', 'migration']],
  'android/app/src/main/java/in/airjournal/app/NotificationActionReceiver.java': ['Validates notification action inputs, shows progress state, and enqueues unique network-constrained API work without opening the app.', ['event-handler', 'android', 'notification-actions', 'workmanager']],
  'android/app/src/main/java/in/airjournal/app/NotificationActionWorker.java': ['Executes token-authenticated notification actions against validated HTTPS endpoints with bounded retries and action-specific completion feedback.', ['service', 'android', 'notification-actions', 'workmanager', 'networking']],
  'android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml': ['Defines the Android version-24 vector foreground artwork supplied by the generated launcher resource set.', ['configuration', 'android-resource', 'launcher-icon', 'vector-drawable']],
  'android/app/src/main/res/layout/activity_main.xml': ['Defines the main Android activity layout as a full-screen WebView inside a CoordinatorLayout.', ['configuration', 'android-resource', 'layout', 'webview']],
  'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml': ['Defines the standard adaptive launcher icon by combining configured background and foreground resources.', ['configuration', 'android-resource', 'adaptive-icon', 'launcher-icon']],
  'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml': ['Defines the round adaptive launcher icon using the same configured background and foreground layers.', ['configuration', 'android-resource', 'adaptive-icon', 'launcher-icon']],
  'android/app/src/main/res/xml/file_paths.xml': ['Defines the external and cache path roots exposed through the application FileProvider.', ['configuration', 'android-resource', 'file-provider', 'file-sharing']],
  'android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java': ['Provides the generated local Android unit-test smoke check for the Java test harness.', ['test', 'android', 'unit-test', 'smoke-test']],
  'android/gradle/wrapper/gradle-wrapper.jar': ['Contains the binary Gradle wrapper bootstrap used to launch the repository-pinned build distribution.', ['build-system', 'gradle', 'wrapper', 'binary-artifact']],
  'android/gradle/wrapper/gradle-wrapper.properties': ['Configures the Gradle wrapper distribution and its local storage behavior.', ['configuration', 'gradle', 'wrapper', 'build-system']],
  'android/gradlew': ['Implements the generated Unix launcher that discovers Java and starts the pinned Gradle wrapper.', ['script', 'gradle', 'wrapper', 'build-system']],
  'android/keystore.properties.example': ['Documents placeholder Android signing-property names for a local keystore path, aliases, and passwords without containing production signing secrets.', ['configuration-template', 'android', 'signing', 'security']]
};

const structuralSummaries = {
  'function:android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java:useAppContext': 'Runs on Android instrumentation and checks that the resolved application context belongs to the expected package.',
  'class:android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java:ExampleInstrumentedTest': 'Groups the generated device-side application-context smoke test.',
  'function:android/app/src/main/java/in/airjournal/app/BuddyMessagingService.java:onMessageReceived': 'Preserves Capacitor push callbacks, filters fallback renders, supplies a stable tag, and dispatches interactive notification construction.',
  'function:android/app/src/main/java/in/airjournal/app/BuddyMessagingService.java:showIncomingNotification': 'Builds a safe notification with deep-link content, optional inline reply, and up to three validated open or API actions.',
  'function:android/app/src/main/java/in/airjournal/app/BuddyMessagingService.java:showReplyState': 'Replaces a buddy notification with inline-reply progress, success, or failure text.',
  'function:android/app/src/main/java/in/airjournal/app/BuddyMessagingService.java:showActionState': 'Replaces a notification with action progress or completion text on the validated channel.',
  'function:android/app/src/main/java/in/airjournal/app/BuddyMessagingService.java:baseBuilder': 'Creates the shared private notification builder with a safe app route, category, priority, icon, and display defaults.',
  'function:android/app/src/main/java/in/airjournal/app/BuddyMessagingService.java:ensureChannel': 'Creates the buddy or study Android notification channel with appropriate importance, description, vibration, light, sound, and privacy.',
  'class:android/app/src/main/java/in/airjournal/app/BuddyMessagingService.java:BuddyMessagingService': 'Owns native Firebase notification rendering and the constants and helpers shared by reply and action delivery components.',
  'function:android/app/src/main/java/in/airjournal/app/BuddyReplyReceiver.java:onReceive': 'Extracts and length-bounds inline reply text, reports sending state, and enqueues unique expedited delivery work with network and backoff constraints.',
  'class:android/app/src/main/java/in/airjournal/app/BuddyReplyReceiver.java:BuddyReplyReceiver': 'Receives Android RemoteInput replies and hands durable network delivery to WorkManager.',
  'function:android/app/src/main/java/in/airjournal/app/BuddyReplyWorker.java:BuddyReplyWorker': 'Initializes the WorkManager worker with its application context and input parameters.',
  'function:android/app/src/main/java/in/airjournal/app/BuddyReplyWorker.java:doWork': 'Validates reply inputs, posts JSON over HTTPS, distinguishes permanent from retryable failures, and updates notification state.',
  'function:android/app/src/main/java/in/airjournal/app/BuddyReplyWorker.java:showState': 'Delegates inline-reply delivery feedback to the shared messaging notification renderer.',
  'class:android/app/src/main/java/in/airjournal/app/BuddyReplyWorker.java:BuddyReplyWorker': 'Implements durable authenticated buddy-reply delivery with bounded WorkManager retries.',
  'function:android/app/src/main/java/in/airjournal/app/MainActivity.java:clearLegacyServiceWorkerDataOnce': 'Removes legacy WebView service-worker directories once and records success so cleanup does not repeat unnecessarily.',
  'function:android/app/src/main/java/in/airjournal/app/MainActivity.java:deleteRecursively': 'Deletes a file tree recursively and reports whether every child was removed.',
  'function:android/app/src/main/java/in/airjournal/app/MainActivity.java:openIntentRoute': 'Resolves an incoming app route and posts a corresponding URL load onto the Capacitor WebView.',
  'function:android/app/src/main/java/in/airjournal/app/MainActivity.java:routeFromIntent': 'Accepts only supported HTTPS app links or the custom app scheme and preserves encoded path, query, and fragment data.',
  'class:android/app/src/main/java/in/airjournal/app/MainActivity.java:MainActivity': 'Provides the Android Capacitor entry activity and native migration and deep-link behavior.',
  'function:android/app/src/main/java/in/airjournal/app/NotificationActionReceiver.java:onReceive': 'Validates action metadata, reports working state, and enqueues unique authenticated action work with connectivity and retry constraints.',
  'class:android/app/src/main/java/in/airjournal/app/NotificationActionReceiver.java:NotificationActionReceiver': 'Receives background notification buttons and delegates their durable execution to WorkManager.',
  'function:android/app/src/main/java/in/airjournal/app/NotificationActionWorker.java:NotificationActionWorker': 'Initializes the notification action worker with its application context and parameters.',
  'function:android/app/src/main/java/in/airjournal/app/NotificationActionWorker.java:doWork': 'Validates action input, posts a token-authenticated HTTPS request, and returns success, failure, or bounded retry with notification feedback.',
  'function:android/app/src/main/java/in/airjournal/app/NotificationActionWorker.java:successText': 'Maps known buddy and study action identifiers to localized completion messages.',
  'function:android/app/src/main/java/in/airjournal/app/NotificationActionWorker.java:showState': 'Delegates action progress or completion feedback to the shared notification renderer.',
  'class:android/app/src/main/java/in/airjournal/app/NotificationActionWorker.java:NotificationActionWorker': 'Implements durable token-authenticated execution for interactive notification actions.',
  'function:android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java:addition_isCorrect': 'Checks the generated Java unit-test harness with a basic arithmetic assertion.',
  'class:android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java:ExampleUnitTest': 'Groups the generated local Java unit-test smoke check.'
};

const resultByPath = new Map(extraction.results.map((result) => [result.path, result]));
const batchByPath = new Map(input.batchFiles.map((file) => [file.path, file]));
const nodeComplexity = (lines) => lines > 200 ? 'complex' : lines >= 50 ? 'moderate' : 'simple';
const nodes = [];

for (const batchFile of input.batchFiles) {
  const meta = fileMeta[batchFile.path];
  if (!meta) throw new Error(`Missing file metadata for ${batchFile.path}`);
  const result = resultByPath.get(batchFile.path);
  const type = batchFile.fileCategory === 'config' ? 'config' : 'file';
  const prefix = type === 'config' ? 'config' : 'file';
  let complexity = nodeComplexity(result?.nonEmptyLines ?? batchFile.sizeLines);
  if (batchFile.path.endsWith('.jar')) complexity = 'simple';
  if (batchFile.path === 'android/gradlew') complexity = 'moderate';
  nodes.push({
    id: `${prefix}:${batchFile.path}`,
    type,
    name: path.basename(batchFile.path),
    filePath: batchFile.path,
    summary: meta[0],
    tags: meta[1],
    complexity
  });
}

for (const [id, summary] of Object.entries(structuralSummaries)) {
  const type = id.startsWith('class:') ? 'class' : 'function';
  const remainder = id.slice(type.length + 1);
  const separator = remainder.lastIndexOf(':');
  const filePath = remainder.slice(0, separator);
  const name = remainder.slice(separator + 1);
  const result = resultByPath.get(filePath);
  const extracted = type === 'class'
    ? result?.classes?.find((candidate) => candidate.name === name)
    : result?.functions?.find((candidate) => candidate.name === name);
  if (!extracted) throw new Error(`Missing extracted ${type} ${id}`);
  nodes.push({
    id,
    type,
    name,
    filePath,
    lineRange: [extracted.startLine, extracted.endLine],
    summary,
    tags: [...fileMeta[filePath][1].slice(0, 3), type],
    complexity: nodeComplexity(extracted.endLine - extracted.startLine + 1)
  });
}

const edges = [];
for (const batchFile of input.batchFiles) {
  const sourcePrefix = batchFile.fileCategory === 'config' ? 'config' : 'file';
  for (const importedPath of input.batchImportData[batchFile.path]) {
    edges.push({ source: `${sourcePrefix}:${batchFile.path}`, target: `file:${importedPath}`, type: 'imports', direction: 'forward', weight: 0.7 });
  }
}

for (const node of nodes.filter((candidate) => candidate.type === 'function' || candidate.type === 'class')) {
  const fileId = `file:${node.filePath}`;
  edges.push({ source: fileId, target: node.id, type: 'contains', direction: 'forward', weight: 1.0 });
  if ((resultByPath.get(node.filePath).exports ?? []).some((exported) => exported.name === node.name)) {
    edges.push({ source: fileId, target: node.id, type: 'exports', direction: 'forward', weight: 0.8 });
  }
}

const structuralByPath = new Map();
for (const node of nodes.filter((candidate) => candidate.type === 'function')) {
  if (!structuralByPath.has(node.filePath)) structuralByPath.set(node.filePath, new Map());
  structuralByPath.get(node.filePath).set(node.name, node.id);
}
const callKeys = new Set();
for (const result of extraction.results) {
  const functions = structuralByPath.get(result.path);
  if (!functions) continue;
  for (const call of result.callGraph ?? []) {
    const source = functions.get(call.caller);
    const target = functions.get(call.callee);
    if (!source || !target || source === target) continue;
    const key = `${source}->${target}`;
    if (callKeys.has(key)) continue;
    callKeys.add(key);
    edges.push({ source, target, type: 'calls', direction: 'forward', weight: 0.8 });
  }
}

const addEdge = (source, target, type, weight) => edges.push({ source, target, type, direction: 'forward', weight });
addEdge('config:android/app/src/main/AndroidManifest.xml', 'file:android/app/src/main/java/in/airjournal/app/MainActivity.java', 'configures', 0.6);
addEdge('config:android/app/src/main/AndroidManifest.xml', 'file:android/app/src/main/java/in/airjournal/app/BuddyMessagingService.java', 'configures', 0.6);
addEdge('config:android/app/src/main/AndroidManifest.xml', 'file:android/app/src/main/java/in/airjournal/app/BuddyReplyReceiver.java', 'configures', 0.6);
addEdge('config:android/app/src/main/AndroidManifest.xml', 'file:android/app/src/main/java/in/airjournal/app/NotificationActionReceiver.java', 'configures', 0.6);
addEdge('config:android/app/src/main/AndroidManifest.xml', 'config:android/app/src/main/res/xml/file_paths.xml', 'depends_on', 0.6);
addEdge('config:android/app/src/main/res/layout/activity_main.xml', 'file:android/app/src/main/java/in/airjournal/app/MainActivity.java', 'configures', 0.6);
addEdge('config:android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml', 'config:android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', 'related', 0.5);
addEdge('file:android/app/src/main/java/in/airjournal/app/BuddyMessagingService.java', 'file:android/app/src/main/java/in/airjournal/app/BuddyReplyReceiver.java', 'depends_on', 0.6);
addEdge('file:android/app/src/main/java/in/airjournal/app/BuddyMessagingService.java', 'file:android/app/src/main/java/in/airjournal/app/NotificationActionReceiver.java', 'depends_on', 0.6);
addEdge('file:android/app/src/main/java/in/airjournal/app/BuddyMessagingService.java', 'file:android/app/src/main/java/in/airjournal/app/MainActivity.java', 'depends_on', 0.6);
addEdge('file:android/app/src/main/java/in/airjournal/app/BuddyReplyReceiver.java', 'file:android/app/src/main/java/in/airjournal/app/BuddyReplyWorker.java', 'depends_on', 0.6);
addEdge('file:android/app/src/main/java/in/airjournal/app/BuddyReplyWorker.java', 'file:android/app/src/main/java/in/airjournal/app/BuddyMessagingService.java', 'depends_on', 0.6);
addEdge('file:android/app/src/main/java/in/airjournal/app/NotificationActionReceiver.java', 'file:android/app/src/main/java/in/airjournal/app/NotificationActionWorker.java', 'depends_on', 0.6);
addEdge('file:android/app/src/main/java/in/airjournal/app/NotificationActionWorker.java', 'file:android/app/src/main/java/in/airjournal/app/BuddyMessagingService.java', 'depends_on', 0.6);
addEdge('file:android/gradlew', 'file:android/gradle/wrapper/gradle-wrapper.jar', 'depends_on', 0.6);
addEdge('file:android/gradlew', 'config:android/gradle/wrapper/gradle-wrapper.properties', 'depends_on', 0.6);
addEdge('file:.gitattributes', 'file:android/gradle/wrapper/gradle-wrapper.jar', 'configures', 0.6);
addEdge('config:.ua/config.json', 'file:.ua/.understandignore', 'related', 0.5);
addEdge('file:android/app/proguard-rules.pro', 'file:android/app/src/main/java/in/airjournal/app/MainActivity.java', 'configures', 0.6);

const expectedStructural = extraction.results.flatMap((result) => {
  const exported = new Set((result.exports ?? []).map((entry) => entry.name));
  const functions = (result.functions ?? [])
    .filter((fn) => fn.endLine - fn.startLine + 1 >= 10 || exported.has(fn.name))
    .map((fn) => `function:${result.path}:${fn.name}`);
  const classes = (result.classes ?? [])
    .filter((cls) => (cls.methods ?? []).length >= 2 || cls.endLine - cls.startLine + 1 >= 20 || exported.has(cls.name))
    .map((cls) => `class:${result.path}:${cls.name}`);
  return [...functions, ...classes];
}).sort();
const actualStructural = nodes.filter((node) => node.type === 'function' || node.type === 'class').map((node) => node.id).sort();
if (JSON.stringify(actualStructural) !== JSON.stringify(expectedStructural)) {
  const actual = new Set(actualStructural);
  const expected = new Set(expectedStructural);
  throw new Error(`Structural coverage mismatch ${JSON.stringify({ missing: expectedStructural.filter((id) => !actual.has(id)), extra: actualStructural.filter((id) => !expected.has(id)) })}`);
}

const filePaths = nodes.filter((node) => node.filePath && node.type !== 'function' && node.type !== 'class').map((node) => node.filePath).sort();
const expectedPaths = input.batchFiles.map((file) => file.path).sort();
if (JSON.stringify(filePaths) !== JSON.stringify(expectedPaths)) throw new Error('File-node coverage mismatch');
if (new Set(nodes.map((node) => node.id)).size !== nodes.length) throw new Error('Duplicate node IDs');
if (edges.some((edge) => edge.source === edge.target)) throw new Error('Self-referencing edge detected');

const importEdges = edges.filter((edge) => edge.type === 'imports');
const expectedImports = Object.values(input.batchImportData).reduce((sum, imports) => sum + imports.length, 0);
if (importEdges.length !== expectedImports) throw new Error(`Import count mismatch: ${importEdges.length} != ${expectedImports}`);

for (const node of nodes) {
  if (!node.id || !node.type || !node.name || !node.summary || !Array.isArray(node.tags) || node.tags.length < 3 || node.tags.length > 5) throw new Error(`Invalid node ${node.id}`);
  if (!['simple', 'moderate', 'complex'].includes(node.complexity)) throw new Error(`Invalid complexity ${node.id}`);
}

const edgeKeys = edges.map((edge) => `${edge.source}|${edge.target}|${edge.type}`);
if (new Set(edgeKeys).size !== edgeKeys.length) throw new Error('Duplicate edges');
const parts = Math.ceil(Math.max(nodes.length / 60, edges.length / 120));
if (parts !== 1) throw new Error(`Unexpected split requirement: ${parts}`);
const output = `${JSON.stringify({ nodes, edges }, null, 2)}\n`;
if (/api[_-]?key\s*[:=]|client[_-]?secret\s*[:=]|private[_-]?key\s*[:=]|AIza[0-9A-Za-z_-]{20,}/i.test(output)) throw new Error('Credential-like output detected');
fs.writeFileSync(path.join(uaDir, 'intermediate/batch-18.json'), output);

console.log(JSON.stringify({ parts, nodes: nodes.length, edges: edges.length, imports: importEdges.length, calls: callKeys.size, extractorSkipped: extraction.filesSkipped.length }));
