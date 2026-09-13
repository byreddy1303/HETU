import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandMark } from '@/components/shared/Brand';
import WorkspaceEmblem, { type WorkspaceEmblemVariant } from '@/components/shared/WorkspaceEmblem';

function getWorkspaceContext(title: string): { category: string; variant: WorkspaceEmblemVariant } {
  const name = title.toLowerCase();
  if (/planner|do now|syllabus/.test(name)) return { category: 'Daily direction', variant: 'plan' };
  if (/journal|patterns|heatmap|calibration|readiness|weekly review|complete/.test(name)) {
    return { category: 'Evidence & review', variant: 'analysis' };
  }
  if (/notes|formulas|revision pack/.test(name))
    return { category: 'Study library', variant: 'library' };
  if (/buddy/.test(name)) return { category: 'Study together', variant: 'practice' };
  if (/settings/.test(name)) return { category: 'Your workspace', variant: 'plan' };
  return { category: 'Practice studio', variant: 'practice' };
}

export default function PageHeader({
  title,
  description,
  actions,
  showMobileMark = false,
  className
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  showMobileMark?: boolean;
  className?: string;
}) {
  const context = getWorkspaceContext(title);
  const headerRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    let visible = true;
    const sync = () => {
      header.dataset.sceneVisible = String(visible && !document.hidden);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(header);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  function tiltScene(event: PointerEvent<HTMLElement>) {
    if (reducedMotion || paused || event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    event.currentTarget.style.setProperty('--scene-y', `${(x - 0.5) * 14}deg`);
    event.currentTarget.style.setProperty('--scene-x', `${(0.5 - y) * 10}deg`);
    event.currentTarget.style.setProperty('--light-x', `${x * 100}%`);
  }

  function resetScene() {
    headerRef.current?.style.removeProperty('--scene-x');
    headerRef.current?.style.removeProperty('--scene-y');
    headerRef.current?.style.removeProperty('--light-x');
  }

  return (
    <header
      ref={headerRef}
      className={cn('u-page-header workspace-page-header', className)}
      data-scene={context.variant}
      data-motion={paused || reducedMotion ? 'paused' : 'playing'}
      onPointerMove={tiltScene}
      onPointerLeave={resetScene}
    >
      <div className="workspace-page-header__copy">
        <span className="workspace-page-header__category">{context.category}</span>
        <h1 className="font-display font-bold tracking-tight text-text">{title}</h1>
        {description && <p className="workspace-page-header__description">{description}</p>}
        {(showMobileMark || actions) && (
        <div className="workspace-page-header__actions">
          {showMobileMark && <BrandMark className="page-header-brand-mark h-9 w-9 md:hidden" />}
          {actions}
        </div>
        )}
      </div>
      <div className="workspace-page-header__scene" aria-hidden="true">
        <div className="workspace-page-header__meridian" />
        <div className="workspace-page-header__grid" />
        <div className="workspace-page-header__plinth" />
        <WorkspaceEmblem variant={context.variant} className="workspace-page-header__emblem" />
        <span className="workspace-page-header__spark workspace-page-header__spark--one" />
        <span className="workspace-page-header__spark workspace-page-header__spark--two" />
      </div>
      {!reducedMotion && (
        <button
          type="button"
          className="workspace-page-header__motion"
          aria-label={paused ? 'Resume ambient motion' : 'Pause ambient motion'}
          aria-pressed={paused}
          onClick={() => { resetScene(); setPaused((value) => !value); }}
        >
          {paused ? <Play size={11} aria-hidden /> : <Pause size={11} aria-hidden />}
          <span>Motion {paused ? 'off' : 'on'}</span>
        </button>
      )}
    </header>
  );
}
