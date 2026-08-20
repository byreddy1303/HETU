import Brand from '@/components/shared/Brand';

export default function LoadingScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg">
      <div className="latency-fade-in text-center">
        <Brand size="lg" className="justify-center" />
        <p className="u-label mt-3">finding the reason</p>
      </div>
    </div>
  );
}
