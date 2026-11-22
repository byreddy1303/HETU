import { motion, useReducedMotion } from 'motion/react';
import Brand from '@/components/shared/Brand';

export default function LoadingScreen() {
  const reduceMotion = useReducedMotion();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16, delay: reduceMotion ? 0 : 0.1 }}
        className="text-center"
      >
        <Brand size="lg" tagline className="items-center" />
      </motion.div>
    </div>
  );
}
