import { useEffect, useState } from 'react';
import { Copy, RefreshCcw } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { backendConfig } from '@/lib/backend-config';
import { useUiStore } from '@/stores/ui';

type DatabaseState = 'checking' | 'ready' | 'error';

/** Database readiness is observable here; an external MCP client's connection is not. */
export default function LocalWorkspaceCard() {
  const [database, setDatabase] = useState<DatabaseState>('checking');
  const [detail, setDetail] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const pushToast = useUiStore((state) => state.pushToast);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    setDatabase('checking');
    setDetail(null);
    const timeout = setTimeout(() => controller.abort(), 5_000);
    void (async () => {
      try {
        const response = await fetch(`${backendConfig.apiUrl}/health/ready`, {
          signal: controller.signal,
          cache: 'no-store'
        });
        const body = (await response.json()) as { checks?: { database?: string } };
        if (disposed) return;
        if (!response.ok || body.checks?.database !== 'ok') {
          throw new Error('The local database is unavailable. Restart HETU and check again.');
        }
        setDatabase('ready');
      } catch (cause) {
        if (disposed) return;
        setDatabase('error');
        setDetail(
          controller.signal.aborted
            ? 'The local database check timed out. Try again.'
            : cause instanceof Error
              ? cause.message
              : 'Unable to check the local database.'
        );
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      disposed = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [retry]);

  return (
    <Card id="settings-local" className="settings-anchor" tabIndex={-1}>
      <CardHeader
        title="Local app & MCP"
        aside={
          <Badge
            tone={database === 'ready' ? 'success' : database === 'error' ? 'danger' : 'neutral'}
          >
            {database === 'ready'
              ? 'Database ready'
              : database === 'error'
                ? 'Check failed'
                : 'Checking database…'}
          </Badge>
        }
      />
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-xl text-[12.5px] leading-relaxed text-text-muted">
            <p>
              Your profile and study records are stored in your personal database on this device.
              Closing HETU keeps your work saved.
            </p>
            {detail && (
              <p role="alert" className="mt-2 text-danger">
                {detail}
              </p>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={database === 'checking'}
            onClick={() => setRetry((value) => value + 1)}
          >
            <RefreshCcw size={13} className="mr-1" aria-hidden />
            Check database
          </Button>
        </div>
        <details className="rounded border border-border bg-bg-overlay/30 p-3 text-[12.5px] leading-relaxed">
          <summary className="cursor-pointer font-semibold text-text">
            Connect an AI client through local MCP
          </summary>
          <p className="mt-1 text-text-muted">
            HETU includes a local MCP server for compatible clients, including Codex and Claude
            Desktop. It uses the same personal database as this app.
          </p>
          <p className="mt-2 text-text-muted">
            Run <code className="u-num">npm run mcp:setup</code> from the HETU project folder for
            your client configuration, or follow the{' '}
            <a
              className="text-accent underline"
              href="https://github.com/byreddy1303/HETU/blob/main/docs/local-desktop-mcp.md"
              target="_blank"
              rel="noreferrer"
            >
              connection guide
            </a>
            .
          </p>
          <p className="mt-2 text-text-muted">
            For a manual stdio launch, run this command from the HETU project folder:
          </p>
          <div className="mt-2 flex items-center justify-between gap-2 rounded border border-border bg-bg-raised px-3 py-2">
            <code className="u-num text-text">npm run mcp</code>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Copy MCP command"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText('npm run mcp');
                  pushToast('MCP command copied.', 'success');
                } catch {
                  pushToast('Unable to copy. Select the command and copy it manually.', 'neutral');
                }
              }}
            >
              <Copy size={13} aria-hidden />
            </Button>
          </div>
          <p className="mt-2 text-[11.5px] text-text-faint">
            The MCP client starts its own stdio process. Connection status and enabled tools are
            shown in that client. ChatGPT remote connectors require a separately configured HTTPS
            MCP endpoint.
          </p>
        </details>
      </CardBody>
    </Card>
  );
}
