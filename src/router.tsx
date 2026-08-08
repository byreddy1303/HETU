import { Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import RequireAuth from '@/components/shared/RequireAuth';
import LoadingScreen from '@/components/shared/LoadingScreen';
import Shell from '@/components/layout/Shell';
import RootErrorBoundary from '@/components/shared/RootErrorBoundary';
import { lazyWithRetry } from '@/lib/lazyWithRetry';

const Auth = lazyWithRetry(() => import('@/pages/Auth'));
const Signup = lazyWithRetry(() => import('@/pages/Signup'));
const ForgotPin = lazyWithRetry(() => import('@/pages/ForgotPin'));
const ResetPin = lazyWithRetry(() => import('@/pages/ResetPin'));
const RequestAccess = lazyWithRetry(() => import('@/pages/RequestAccess'));
const NotFound = lazyWithRetry(() => import('@/pages/NotFound'));
const Dashboard = lazyWithRetry(() => import('@/pages/Dashboard'));
const SessionNew = lazyWithRetry(() => import('@/pages/SessionNew'));
const SessionActive = lazyWithRetry(() => import('@/pages/SessionActive'));
const SessionReview = lazyWithRetry(() => import('@/pages/SessionReview'));
const Journal = lazyWithRetry(() => import('@/pages/Journal'));
const Patterns = lazyWithRetry(() => import('@/pages/Patterns'));
const Planner = lazyWithRetry(() => import('@/pages/Planner'));
const Reattempts = lazyWithRetry(() => import('@/pages/Reattempts'));
const WeeklyReview = lazyWithRetry(() => import('@/pages/WeeklyReview'));
const Heatmap = lazyWithRetry(() => import('@/pages/Heatmap'));
const Calibration = lazyWithRetry(() => import('@/pages/Calibration'));
const Log = lazyWithRetry(() => import('@/pages/Log'));
const Formulas = lazyWithRetry(() => import('@/pages/Formulas'));
const SyllabusTracker = lazyWithRetry(() => import('@/pages/SyllabusTracker'));
const TriggerDrill = lazyWithRetry(() => import('@/pages/TriggerDrill'));
const Settings = lazyWithRetry(() => import('@/pages/Settings'));
const Readiness = lazyWithRetry(() => import('@/pages/Readiness'));
const Buddy = lazyWithRetry(() => import('@/pages/Buddy'));
const Pyq = lazyWithRetry(() => import('@/pages/Pyq'));
const DevPrimitives = lazyWithRetry(() => import('@/pages/DevPrimitives'));

const devRoutes = import.meta.env.DEV
  ? [
      {
        path: '/dev/primitives',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <DevPrimitives />
          </Suspense>
        ),
        errorElement: <RootErrorBoundary />
      }
    ]
  : [];

// Application routes.
export const router = createBrowserRouter([
  ...devRoutes,
  { path: '/auth', element: <Auth />, errorElement: <RootErrorBoundary /> },
  { path: '/signup', element: <Signup />, errorElement: <RootErrorBoundary /> },
  { path: '/forgot-pin', element: <ForgotPin />, errorElement: <RootErrorBoundary /> },
  { path: '/reset-pin', element: <ResetPin />, errorElement: <RootErrorBoundary /> },
  { path: '/request-access', element: <RequestAccess />, errorElement: <RootErrorBoundary /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <Shell />
      </RequireAuth>
    ),
    errorElement: <RootErrorBoundary />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'session/new', element: <SessionNew /> },
      { path: 'session/:id/solve', element: <SessionActive /> },
      { path: 'session/:id/review', element: <SessionReview /> },
      { path: 'journal', element: <Journal /> },
      { path: 'log', element: <Log /> },
      { path: 'patterns', element: <Patterns /> },
      { path: 'pyq', element: <Pyq /> },
      { path: 'planner', element: <Planner /> },
      { path: 'reattempts', element: <Reattempts /> },
      { path: 'weekly-review', element: <WeeklyReview /> },
      { path: 'heatmap', element: <Heatmap /> },
      { path: 'calibration', element: <Calibration /> },
      { path: 'readiness', element: <Readiness /> },
      { path: 'trigger-drill', element: <TriggerDrill /> },
      { path: 'formulas', element: <Formulas /> },
      { path: 'syllabus', element: <SyllabusTracker /> },
      { path: 'buddy', element: <Buddy /> },
      { path: 'settings', element: <Settings /> }
    ]
  },
  { path: '*', element: <NotFound />, errorElement: <RootErrorBoundary /> }
]);
