import MathText from '@/components/shared/MathText';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/fastapi-client';
import type { TestAnalysisList } from '@/lib/test-analysis';
import { formatDate } from '@/lib/utils';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function SavedTestAnalyses() {
  const { userId } = useAuth();
  return userId ? <ConnectedTestAnalyses key={userId} /> : null;
}

function ConnectedTestAnalyses() {
  const [result, setResult] = useState<TestAnalysisList | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const refreshOnReturn = () => setRefresh((value) => value + 1);
    window.addEventListener('focus', refreshOnReturn);
    return () => window.removeEventListener('focus', refreshOnReturn);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void apiRequest<TestAnalysisList>('/v1/test-analyses?limit=10', { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setResult(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Saved test analyses could not load.');
      });
    return () => controller.abort();
  }, [refresh]);

  async function loadMore() {
    if (!result?.next_cursor || loadingMore) return;
    setLoadingMore(true);
    setError('');
    try {
      const value = await apiRequest<TestAnalysisList>(
        `/v1/test-analyses?limit=10&cursor=${encodeURIComponent(result.next_cursor)}`
      );
      setResult((previous) => ({ ...value, items: [...(previous?.items ?? []), ...value.items] }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'More test analyses could not load.');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Saved test analyses"
        aside={
          <Button
            size="sm"
            variant="ghost"
            aria-label="Refresh saved test analyses"
            onClick={() => setRefresh((value) => value + 1)}
          >
            <RefreshCw size={14} />
          </Button>
        }
      />
      <CardBody>
        <p className="mb-4 max-w-prose text-[13px] text-text-muted">
          Continue from a test you analyzed in ChatGPT. Your question log, saved discussions,
          formulas, and review work stay connected here.
        </p>
        {!result && !error && (
          <p role="status" className="text-[13px] text-text-muted">
            Loading saved tests…
          </p>
        )}
        {result?.items.length === 0 && (
          <p className="text-[13px] text-text-muted">
            After analyzing your screenshots, ask ChatGPT: “Save this test to Hetu, including the
            concepts and formulas, and add every question to Re-attempts.”
          </p>
        )}
        <ul className="divide-y divide-border">
          {result?.items.map((item) => (
            <li key={item.id}>
              <Link
                to={`/mocks/analysis/${item.id}`}
                className="flex items-center gap-4 py-4 text-text"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-text-faint">
                    {formatDate(item.test_date, 'dd MMM yyyy')} · {item.question_count} captured{' '}
                    {item.question_count === 1 ? 'question' : 'questions'}
                  </p>
                  <p className="mt-1 font-semibold"><MathText>{item.name}</MathText></p>
                  <p className="mt-1 line-clamp-2 text-[13px] text-text-muted"><MathText>{item.summary}</MathText></p>
                  {item.missing_information.length > 0 && (
                    <p className="mt-2 text-[12px] text-warn">
                      {item.missing_information.length}{' '}
                      {item.missing_information.length === 1 ? 'detail' : 'details'} to confirm
                    </p>
                  )}
                </div>
                <ArrowRight size={18} aria-hidden="true" className="shrink-0 text-accent" />
              </Link>
            </li>
          ))}
        </ul>
        {result?.next_cursor && (
          <Button size="sm" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? 'Loading…' : 'Load more tests'}
          </Button>
        )}
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}{' '}
            <button className="underline" onClick={() => setRefresh((value) => value + 1)}>
              Retry
            </button>
          </p>
        )}
      </CardBody>
    </Card>
  );
}
