import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { PanelLeftOpen } from 'lucide-react';
import Nav from '@/components/layout/Nav';
import MobileTabs from '@/components/layout/MobileTabs';
import TopRightControls, { ExamCountdown } from '@/components/layout/TopRightControls';
import ContextualGateTip from '@/components/shared/ContextualGateTip';
import DailyQuote from '@/components/shared/DailyQuote';
import Brand, { BrandMark } from '@/components/shared/Brand';
import ThemeToggle from '@/components/shared/ThemeToggle';
import OfflineBadge from '@/components/shared/OfflineBadge';
import { useSyncBootstrap } from '@/hooks/useSync';
import { useUiStore } from '@/stores/ui';
import { cn } from '@/lib/utils';

export default function Shell() {
  useSyncBootstrap();
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion();
  const navCollapsed = useUiStore((s) => s.navCollapsed);
  const setNavCollapsed = useUiStore((s) => s.setNavCollapsed);
  const toggleNavCollapsed = useUiStore((s) => s.toggleNavCollapsed);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleNavCollapsed();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleNavCollapsed]);

  return (
    <div className="min-h-dvh">
      <Nav />
      {/* Floating expand button on desktop when sidebar is collapsed */}
      {navCollapsed && (
        <div className="fixed left-4 top-3.5 z-40 hidden md:block">
          <button
            type="button"
            onClick={() => setNavCollapsed(false)}
            aria-label="Expand sidebar"
            title="Expand sidebar (Ctrl+B)"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-bg-raised/95 text-text shadow-sm backdrop-blur transition-all hover:bg-bg-overlay hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <PanelLeftOpen size={16} strokeWidth={1.75} />
          </button>
        </div>
      )}
      {/* Top Right Corner Controls (Countdown T-Days, Nightshift Toggle, Offline status) */}
      <div className="fixed right-4 top-3.5 z-40 hidden md:block">
        <TopRightControls />
      </div>
      <header className="fixed inset-x-0 top-0 z-40 grid h-[calc(56px+var(--safe-top))] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-border/80 bg-bg-raised/95 pl-[calc(1rem+var(--safe-left))] pr-[calc(1rem+var(--safe-right))] pt-[var(--safe-top)] backdrop-blur md:hidden">
        <div className="min-w-0 justify-self-start">
          <BrandMark decorative className="h-7 w-auto min-[360px]:hidden" />
          <Brand size="sm" className="hidden min-[360px]:inline-flex" />
        </div>
        <ExamCountdown className="justify-self-center" />
        <div className="flex min-w-0 items-center justify-self-end gap-2">
          <OfflineBadge className="hidden max-w-16 truncate min-[360px]:inline" />
          <ThemeToggle className="h-9 w-9" />
        </div>
      </header>
      <main
        className={cn(
          'native-shell-main pb-[calc(4.5rem+var(--safe-bottom))] transition-[padding] duration-200 ease-in-out md:pb-0',
          navCollapsed ? 'md:pl-0' : 'md:pl-[220px]'
        )}
      >
        <div
          className={`u-shell-content mx-auto w-full px-4 pb-6 pt-16 md:py-8 ${
            [
              '/',
              '/today',
              '/syllabus',
              '/mocks',
              '/pyq',
              '/revision-pack',
              '/topper-notes'
            ].includes(pathname) || pathname.endsWith('/review')
              ? 'max-w-[1120px]'
              : 'max-w-[800px]'
          }`}
        >
          <motion.div
            className="air-page"
            key={pathname}
            initial={reduceMotion ? false : { opacity: 0.72, y: 7 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
            {pathname === '/' ? null : <ContextualGateTip pathname={pathname} className="mt-4" />}
          </motion.div>
          {pathname === '/' ? null : <DailyQuote />}
        </div>
      </main>
      <MobileTabs />
    </div>
  );
}
