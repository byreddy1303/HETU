import type { CSSProperties } from 'react';
import { useImmersiveScene } from '@/components/immersive/scene-context';

export default function ImmersiveScene() {
  const { config } = useImmersiveScene();

  return (
    <div className="immersive-scene" aria-hidden="true">
      <div className="immersive-scene__wash" />
      <div className="immersive-scene__grid" />
      <div className="immersive-scene__cursor" />
      <div className="immersive-scene__pulse" />

      <svg className="immersive-thread" viewBox="0 0 1440 1000" preserveAspectRatio="none">
        <path
          className="immersive-thread__shadow"
          d="M-90 210 C140 70 260 420 465 242 S770 92 895 360 S1190 770 1530 548"
        />
        <path
          className="immersive-thread__line"
          d="M-90 210 C140 70 260 420 465 242 S770 92 895 360 S1190 770 1530 548"
        />
        <path
          className="immersive-thread__echo"
          d="M180 1060 C360 760 592 840 720 632 S1082 284 1508 390"
        />
      </svg>

      <div className="immersive-orbit immersive-orbit--outer">
        <span />
        <span />
        <span />
      </div>
      <div className="immersive-orbit immersive-orbit--inner">
        <span />
        <span />
      </div>
      <div className="immersive-focus-core">
        <span className="immersive-focus-core__mark">हेतु</span>
        <span className="immersive-focus-core__signal" />
      </div>

      <div className="immersive-scene__identity" key={`${config.world}-identity`}>
        <span>{config.eyebrow}</span>
        <strong>{config.title}</strong>
        <i>{config.index}</i>
      </div>

      {config.nodes.map((node, index) => (
        <div
          className={`immersive-evidence immersive-evidence--${node.position}`}
          data-depth={node.depth}
          style={
            {
              '--node-duration': `${9 + index * 1.4}s`,
              '--node-delay': `${index * -1.3}s`
            } as CSSProperties
          }
          key={`${config.world}-${node.code}-${node.position}`}
        >
          <span className="immersive-evidence__pin" />
          <strong>{node.code}</strong>
          <span>{node.label}</span>
        </div>
      ))}

      <div className="immersive-scene__axis immersive-scene__axis--x">EVIDENCE → ACTION</div>
      <div className="immersive-scene__axis immersive-scene__axis--y">CAUSE / RECALL / PROOF</div>
    </div>
  );
}
