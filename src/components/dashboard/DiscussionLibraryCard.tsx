import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, LibraryBig } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { backendConfig } from '@/lib/backend-config';
import { apiRequest } from '@/lib/fastapi-client';

type SavedConcept = {
  id: string;
  subject: string;
  topic: string;
  concept: string;
  summary: string;
};

type SearchResult = {
  items: SavedConcept[];
  total_matches: number;
  complete: boolean;
};

export default function DiscussionLibraryCard({ userId }: { userId: string | null }) {
  const [recent, setRecent] = useState<SavedConcept[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(backendConfig.fastapi);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!backendConfig.fastapi) return;
    setRecent([]);
    setTotal(0);
    setError(false);
    setLoading(Boolean(userId));
    if (!userId) return;
    let cancelled = false;
    apiRequest<SearchResult>('/v1/learning/search?limit=3&offset=0')
      .then((result) => {
        if (cancelled) return;
        setRecent(result.items);
        setTotal(result.total_matches);
        setError(false);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <Card className="overflow-hidden">
      <CardBody className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-faint text-accent" aria-hidden="true">
            <LibraryBig size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="u-label text-accent">Knowledge from your conversations</p>
            <h2 className="mt-1 font-display text-[19px] font-semibold text-text">Saved discussions</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-text-muted">
              Ideas, reasoning corrections, examples, and sources organized by subject, topic, and concept.
            </p>
          </div>
        </div>

        {!backendConfig.fastapi ? (
          <p className="mt-4 rounded-md border border-border bg-bg-overlay/25 px-3 py-2 text-[12px] text-text-muted">
            This account is still on the existing backend. Your Learning Library opens after its Python connection and data migration are verified.
          </p>
        ) : error ? (
          <p role="status" className="mt-4 text-[12px] text-text-muted">Saved discussions could not be loaded right now.</p>
        ) : loading || !userId ? (
          <p role="status" className="mt-4 text-[12px] text-text-muted">Loading saved discussions…</p>
        ) : recent.length > 0 ? (
          <div className="mt-4">
            <p className="u-label text-text-faint">{total} saved concept{total === 1 ? '' : 's'} · most recent</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-3">
              {recent.map((item) => (
                <li key={item.id}>
                  <Link to={`/learning-library/${item.id}`} aria-label={`${item.subject} / ${item.topic}: ${item.concept}`} className="block h-full rounded-md border border-border bg-bg-overlay/20 p-3 transition-colors hover:border-accent/40 hover:bg-accent-faint/25">
                    <span className="block text-[10px] text-text-faint">{item.subject} / {item.topic}</span>
                    <strong className="mt-1 block text-[13px] text-text">{item.concept}</strong>
                    <span className="mt-1 line-clamp-2 block text-[11px] leading-relaxed text-text-muted">{item.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 text-[12px] text-text-muted">No discussions saved yet. In ChatGPT, say “Save to HETU” after an explanation you want to remember.</p>
        )}

        <Link to="/learning-library" className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent hover:underline">
          Open Learning Library <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </CardBody>
    </Card>
  );
}
