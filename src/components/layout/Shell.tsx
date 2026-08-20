import { Outlet, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import Nav from '@/components/layout/Nav';
import MobileTabs from '@/components/layout/MobileTabs';
import TopRightControls, { ExamCountdown } from '@/components/layout/TopRightControls';
import ContextualGateTip from '@/components/shared/ContextualGateTip';
import DailyQuote from '@/components/shared/DailyQuote';
import Brand, { BrandMark } from '@/components/shared/Brand';
import ThemeToggle from '@/components/shared/ThemeToggle';
import OfflineBadge from '@/components/shared/OfflineBadge';
import { useSyncBootstrap } from '@/hooks/useSync';
import { SceneProvider } from '@/components/immersive/SceneProvider';
import ImmersiveScene from '@/components/immersive/ImmersiveScene';
import '@/immersive.css';

export default function Shell() {
  useSyncBootstrap();
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion();
  return (
    <SceneProvider pathname={pathname}>
      <ImmersiveScene />
      <div className="immersive-app relative min-h-dvh">
        <Nav />
        {/* Top Right Corner Controls (Countdown T-Days, Nightshift Toggle, Offline status) */}
        <div className="immersive-top-controls fixed right-4 top-3.5 z-40 hidden md:block">
          <TopRightControls />
        </div>
        <header className="immersive-mobile-header fixed inset-x-0 top-0 z-40 grid h-[calc(56px+var(--safe-top))] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-border/80 bg-bg-raised/95 pl-[calc(1rem+var(--safe-left))] pr-[calc(1rem+var(--safe-right))] pt-[var(--safe-top)] backdrop-blur md:hidden">
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
        <main className="native-shell-main immersive-main relative z-10 pb-[calc(4.5rem+var(--safe-bottom))] md:pb-0 md:pl-[224px]">
          <div
            className={`u-shell-content mx-auto w-full px-4 pb-8 pt-16 md:px-8 md:pb-16 md:pt-24 ${
              ['/', '/today', '/syllabus', '/mocks', '/revision-pack', '/topper-notes'].includes(
                pathname
              )
                ? 'max-w-[1180px]'
                : 'max-w-[880px]'
            }`}
          >
            <motion.div
              className="air-page immersive-route-stage"
              key={pathname}
              initial={
                reduceMotion
                  ? false
                  : { opacity: 0, y: 24, scale: 0.985, rotateX: 1.4, filter: 'blur(7px)' }
              }
              animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.56, ease: [0.22, 1, 0.36, 1] }}
            >
              <Outlet />
              {pathname === '/' ? null : <ContextualGateTip pathname={pathname} className="mt-6" />}
            </motion.div>
            {pathname === '/' ? null : <DailyQuote />}
          </div>
        </main>
        <MobileTabs />
      </div>
    </SceneProvider>
  );
}
