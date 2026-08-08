import { Outlet, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import Nav from '@/components/layout/Nav';
import MobileTabs from '@/components/layout/MobileTabs';
import DailyQuote from '@/components/shared/DailyQuote';
import OfflineBadge from '@/components/shared/OfflineBadge';
import ThemeToggle from '@/components/shared/ThemeToggle';
import { useSyncBootstrap } from '@/hooks/useSync';

export default function Shell() {
  useSyncBootstrap();
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion();
  return (
    <div className="min-h-dvh">
      <Nav />
      <OfflineBadge className="fixed right-4 top-3 z-40 hidden md:inline" />
      <div className="fixed right-3 top-[calc(var(--safe-top)+0.75rem)] z-40 flex items-center gap-2 md:hidden">
        <OfflineBadge />
        <ThemeToggle className="h-9 w-9" />
      </div>
      <main className="native-shell-main pb-[calc(4.5rem+var(--safe-bottom))] md:pb-0 md:pl-[220px]">
        <div
          className={`u-shell-content mx-auto w-full px-4 pb-6 pt-16 md:py-8 ${
            pathname === '/' ? 'max-w-[1120px]' : 'max-w-[800px]'
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
          </motion.div>
          {pathname === '/' ? null : <DailyQuote />}
        </div>
      </main>
      <MobileTabs />
    </div>
  );
}
