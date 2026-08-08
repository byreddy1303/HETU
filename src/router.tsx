import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import RequireAuth from '@/components/shared/RequireAuth';
import LoadingScreen from '@/components/shared/LoadingScreen';
import Shell from '@/components/layout/Shell';
const Auth = lazy(() => import('@/pages/Auth'));
const Signup = lazy(() => import('@/pages/Signup'));
const ForgotPin = lazy(() => import('@/pages/ForgotPin'));
const ResetPin = lazy(() => import('@/pages/ResetPin'));
const RequestAccess = lazy(() => import('@/pages/RequestAccess'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const SessionNew = lazy(() => import('@/pages/SessionNew'));
const SessionActive = lazy(() => import('@/pages/SessionActive'));
const SessionReview = lazy(() => import('@/pages/SessionReview'));
const Journal = lazy(() => import('@/pages/Journal'));
const Patterns = lazy(() => import('@/pages/Patterns'));
const Planner = lazy(() => import('@/pages/Planner'));
const Reattempts = lazy(() => import('@/pages/Reattempts'));
const WeeklyReview = lazy(() => import('@/pages/WeeklyReview'));
const Heatmap = lazy(() => import('@/pages/Heatmap'));
const Calibration = lazy(() => import('@/pages/Calibration'));
const Log = lazy(() => import('@/pages/Log'));
const Formulas = lazy(() => import('@/pages/Formulas'));
const SyllabusTracker = lazy(() => import('@/pages/SyllabusTracker'));
const TriggerDrill = lazy(() => import('@/pages/TriggerDrill'));
const Settings = lazy(() => import('@/pages/Settings'));
const Readiness = lazy(() => import('@/pages/Readiness'));
const Buddy = lazy(() => import('@/pages/Buddy'));
const Pyq = lazy(() => import('@/pages/Pyq'));
const DevPrimitives = lazy(() => import('@/pages/DevPrimitives'));

const devRoutes = import.meta.env.DEV
  ? [
      {
        path: '/dev/primitives',
        element: (
          <Suspense fallback={<LoadingScreen />}>
            <DevPrimitives />
          </Suspense>
        )
      }
    ]
  : [];

// Application routes.
export const router = createBrowserRouter([
  ...devRoutes,
  { path: '/auth', element: <Auth /> },
  { path: '/signup', element: <Signup /> },
  { path: '/forgot-pin', element: <ForgotPin /> },
  { path: '/reset-pin', element: <ResetPin /> },
  { path: '/request-access', element: <RequestAccess /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <Shell />
      </RequireAuth>
    ),
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
  { path: '*', element: <NotFound /> }
]);
