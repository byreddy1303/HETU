import { useEffect, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { backendConfig } from '@/lib/backend-config';

type DatabaseState = 'checking' | 'ready' | 'error';

/** Database readiness is observable here; an external MCP client's connection is not. */
export default function LocalWorkspaceCard() {
  const [database, setDatabase] = useState<DatabaseState>('checking');
  const [detail, setDetail] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

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
        title="Workspace status"
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
            <p>Your study records are saved on this Mac.</p>
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
        <a
          className="text-[12.5px] text-accent underline underline-offset-4"
          href="https://github.com/byreddy1303/HETU/blob/main/docs/local-desktop-mcp.md"
          target="_blank"
          rel="noreferrer"
        >
          Connect a desktop AI client
        </a>
      </CardBody>
    </Card>
  );
}
