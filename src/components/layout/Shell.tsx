import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronRight, PanelLeftOpen, Search } from 'lucide-react';
import Nav from '@/components/layout/Nav';
import MobileTabs from '@/components/layout/MobileTabs';
import TopRightControls, { ExamCountdown } from '@/components/layout/TopRightControls';
import WorkspaceSearch from '@/components/layout/WorkspaceSearch';
import ContextualGateTip from '@/components/shared/ContextualGateTip';
import DailyQuote from '@/components/shared/DailyQuote';
import Brand, { BrandMark } from '@/components/shared/Brand';
import ThemeToggle from '@/components/shared/ThemeToggle';
import { useSyncBootstrap } from '@/hooks/useSync';
import { useUiStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import { flushAllDurableState } from '@/lib/durability';
import { resumeSync } from '@/lib/sync';
import { reloadAccountState } from '@/lib/account-state';
import './workspace-shell.css';

const ROUTE_CONTEXT: Record<string, [string, string]> = {
  '/': ['Overview', 'Dashboard'],
  '/today': ['Study', 'Do now'],
  '/session': ['Study', 'Session'],
  '/pyq': ['Study', 'PYQ practice'],
  '/log': ['Study', 'Log'],
  '/planner': ['Study', 'Planner'],
  '/capture': ['Study', 'Quick capture'],
  '/mocks': ['Study', 'Mock tests'],
  '/buddy': ['Study', 'Buddy'],
  '/journal': ['Reflect', 'Journal'],
  '/patterns': ['Reflect', 'Patterns'],
  '/reattempts': ['Reflect', 'Re-attempts'],
  '/weekly-review': ['Reflect', 'Weekly review'],
  '/heatmap': ['Reflect', 'Heatmap'],
  '/calibration': ['Reflect', 'Calibration'],
  '/readiness': ['Reflect', 'Readiness'],
  '/topper-notes': ['Library', 'Topper notes'],
  '/revision-pack': ['Library', 'Revision pack'],
  '/syllabus': ['Library', 'Syllabus tracker'],
  '/trigger-drill': ['Library', 'Trigger drill'],
  '/formulas': ['Library', 'Formulas'],
  '/settings': ['Workspace', 'Settings']
};

export default function Shell() {
  useSyncBootstrap();
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion();
  const navCollapsed = useUiStore((s) => s.navCollapsed);
  const setNavCollapsed = useUiStore((s) => s.setNavCollapsed);
  const toggleNavCollapsed = useUiStore((s) => s.toggleNavCollapsed);
  const [searchOpen, setSearchOpen] = useState(false);
  const [category, section] = ROUTE_CONTEXT[`/${pathname.split('/')[1]}`] ?? ['Workspace', 'Study'];
  const focusedSession =
    /\/session\/[^/]+\/solve$/.test(pathname) || /\/mocks\/[^/]+\/take$/.test(pathname);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((open) => !open);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && typeof target.closest === 'function' && target.closest('input, textarea, select, [contenteditable="true"], dialog')) return;
      if (event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleNavCollapsed();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleNavCollapsed]);

  const authUserId = useAuthStore((s) => s.user?.id);
  const isSandbox = useAuthStore((s) => s.sandbox);

  useEffect(() => {
    if (!authUserId || isSandbox) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void flushAllDurableState(authUserId);
      } else if (document.visibilityState === 'visible') {
        resumeSync();
        void reloadAccountState(authUserId);
      }
    };
    const onBeforeUnload = () => {
      void flushAllDurableState(authUserId);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [authUserId, isSandbox]);

  return (
    <div className="workspace-shell" data-collapsed={navCollapsed} data-focused={focusedSession}>
      <a href="#workspace-content" className="workspace-skip">
        Skip to content
      </a>
      <Nav />
      <header className="workspace-topbar">
        <div className="workspace-topbar__context">
          {navCollapsed && (
            <button
              type="button"
              onClick={() => setNavCollapsed(false)}
              aria-label="Expand sidebar"
              title="Expand sidebar (Ctrl+B)"
              className="workspace-icon-button"
            >
              <PanelLeftOpen size={18} strokeWidth={1.7} aria-hidden />
            </button>
          )}
          <span className="workspace-topbar__category">{category}</span>
          <ChevronRight size={13} aria-hidden />
          <span className="workspace-topbar__section">{section}</span>
        </div>
        <div className="workspace-topbar__actions">
          <button
            type="button"
            className="workspace-search-trigger"
            onClick={() => setSearchOpen(true)}
            aria-label="Search sections"
          >
            <Search size={15} aria-hidden />
            <span>Find a section</span>
            <kbd>⌘ K</kbd>
          </button>
          <TopRightControls />
        </div>
      </header>
      <header className="workspace-mobile-topbar native-top-bar">
        <div className="workspace-mobile-brand">
          <Brand size="sm" />
          <BrandMark decorative className="workspace-mobile-mark" />
        </div>
        <ExamCountdown />
        <div className="workspace-mobile-topbar__actions">
          <button
            type="button"
            className="workspace-icon-button"
            aria-label="Search sections"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={17} aria-hidden />
          </button>
          <ThemeToggle className="workspace-theme-toggle" />
        </div>
      </header>
      <main id="workspace-content" tabIndex={-1} className="workspace-main native-shell-main">
        <div
          className="u-shell-content workspace-content"
          data-wide={['/planner', '/pyq', '/syllabus'].some((route) => pathname.startsWith(route))}
        >
          <motion.div
            className="air-page"
            data-category={category.toLowerCase()}
            data-route={pathname.split('/')[1] || 'dashboard'}
            key={pathname}
            initial={reduceMotion ? false : { opacity: 0.7, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
            {pathname === '/' || focusedSession ? null : (
              <ContextualGateTip pathname={pathname} className="mt-4" />
            )}
          </motion.div>
          {pathname === '/' || focusedSession ? null : <DailyQuote />}
        </div>
      </main>
      <MobileTabs />
      <WorkspaceSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
