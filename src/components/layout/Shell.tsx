import { Outlet, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import Nav from '@/components/layout/Nav';
import MobileTabs from '@/components/layout/MobileTabs';
import ContextualGateTip from '@/components/shared/ContextualGateTip';
import DailyQuote from '@/components/shared/DailyQuote';
import OfflineBadge from '@/components/shared/OfflineBadge';
import ThemeToggle from '@/components/shared/ThemeToggle';
import Brand from '@/components/shared/Brand';
import { useSyncBootstrap } from '@/hooks/useSync';

export default function Shell() {
  useSyncBootstrap();
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion();
  return (
    <div className="min-h-dvh">
      <Nav />
      <OfflineBadge className="fixed right-4 top-3 z-40 hidden md:inline" />
      <div className="web-mobile-controls fixed right-3 top-[calc(var(--safe-top)+0.75rem)] z-40 flex items-center gap-2 md:hidden">
        <OfflineBadge />
        <ThemeToggle className="h-9 w-9" />
      </div>
      <header className="native-top-bar fixed inset-x-0 top-0 z-30 hidden h-[calc(56px+var(--safe-top))] items-end justify-between border-b border-border/80 bg-bg-raised/95 px-[calc(1rem+var(--safe-right))] pb-2.5 pl-[calc(1rem+var(--safe-left))] backdrop-blur md:hidden">
        <Brand size="sm" />
        <div className="flex min-h-9 items-center gap-2">
          <OfflineBadge />
          <ThemeToggle className="h-9 w-9" />
        </div>
      </header>
      <main className="native-shell-main pb-[calc(4.5rem+var(--safe-bottom))] md:pb-0 md:pl-[220px]">
        <div
          className={`u-shell-content mx-auto w-full px-4 pb-6 pt-16 md:py-8 ${
            pathname === '/' || pathname === '/syllabus' ? 'max-w-[1120px]' : 'max-w-[800px]'
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
