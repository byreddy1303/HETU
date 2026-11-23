import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PIPELINE_STAGES, type PipelineStage, type ReattemptPipeline } from '@/lib/study-signals';
import './study-signals.css';

const STAGES: Record<PipelineStage, { name: string; hint: string; alpha: string }> = {
  D3: { name: 'D3', hint: 'back in 3 days', alpha: '32%' },
  D10: { name: 'D10', hint: '10 days later', alpha: '50%' },
  D30: { name: 'D30', hint: '30 days later', alpha: '68%' },
  TRANSFER: { name: 'Transfer', hint: 'a fresh variant', alpha: '84%' },
  MASTERED: { name: 'Mastered', hint: 'off the list', alpha: '100%' }
};

/** Where every saved question sits on the spaced re-attempt ladder. */
export default function ReattemptLadder({
  pipeline,
  dueNow
}: {
  pipeline: ReattemptPipeline;
  dueNow: number;
}) {
  const onLadder = PIPELINE_STAGES.reduce((sum, stage) => sum + pipeline.stages[stage], 0);
  const moved = onLadder - pipeline.stages.D3;
  return (
    <section className="signal-card" aria-labelledby="ladder-title">
      <div className="signal-card__head">
        <h2 id="ladder-title" className="study-section-label">
          Re-attempt ladder
        </h2>
        <Link className="signal-link" to="/reattempts">
          {dueNow > 0 ? `${dueNow} due now` : 'Open re-attempts'}{' '}
          <ArrowRight size={13} aria-hidden />
        </Link>
      </div>
      <p className="signal-card__note">
        A correct, unaided re-attempt moves a question one rung; a miss sends it back to D3.
        {onLadder > 0 &&
          (moved > 0
            ? ` ${moved} of ${onLadder} have climbed past D3.`
            : ` All ${onLadder} are still on the first rung.`)}
      </p>
      {onLadder > 0 && (
        <div className="ladder__strip" aria-hidden>
          {PIPELINE_STAGES.filter((stage) => pipeline.stages[stage] > 0).map((stage) => (
            <span
              key={stage}
              style={
                {
                  flex: `${pipeline.stages[stage]} 1 0`,
                  '--step-alpha': STAGES[stage].alpha
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
      <ol className="ladder__stages">
        {PIPELINE_STAGES.map((stage) => (
          <li
            key={stage}
            className="ladder__stage"
            style={{ '--step-alpha': STAGES[stage].alpha } as CSSProperties}
          >
            <span className="ladder__swatch" aria-hidden />
            <span className="ladder__count">{pipeline.stages[stage]}</span>
            <span className="ladder__name">{STAGES[stage].name}</span>
            <span className="ladder__hint">{STAGES[stage].hint}</span>
          </li>
        ))}
      </ol>
      {(pipeline.needsRepair > 0 || pipeline.paused > 0) && (
        <p className="ladder__aside">
          {pipeline.needsRepair > 0 && <span>{pipeline.needsRepair} need a focused repair</span>}
          {pipeline.paused > 0 && <span>{pipeline.paused} parked (result unknown)</span>}
        </p>
      )}
    </section>
  );
}
