/**
 * نصوص الضرر/الغنيمة العائمة فوق المشهد (DamageFloat — battles-convoys.md §9):
 * Cairo 900 أبيض بحواف، يرتفع 60px ويختفي خلال 1.2ث، ملوّن حسب النوع.
 * تُغذى عبر pushFloat في جسر المشهد؛ بحد أقصى ~12 متزامنًا.
 */
import { Html } from '@react-three/drei';
import { useSceneBridge, type FloatText } from '../bridge';

const COLORS: Record<FloatText['color'], string> = {
  red: '#FF6B5E',
  gold: '#F5D76E',
  gray: '#C9CFD9',
  green: '#7CE495',
  white: '#FFFFFF',
};

function FloatChip({ f }: { f: FloatText }) {
  return (
    <Html center position={[f.position.x, f.position.y + 1.5, f.position.z]} zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
      <style>{`@keyframes sceneFloatRise{0%{transform:translateY(0);opacity:0}12%{opacity:1}70%{opacity:1}100%{transform:translateY(-60px);opacity:0}}`}</style>
      <div
        className="scene-float"
        style={{
          fontFamily: "'Cairo', sans-serif",
          fontWeight: 900,
          fontSize: 26,
          color: COLORS[f.color],
          textShadow: '0 0 4px #2B2118, 0 2px 0 #2B2118, 2px 0 0 #2B2118, -2px 0 0 #2B2118, 0 -2px 0 #2B2118',
          whiteSpace: 'nowrap',
          animation: 'sceneFloatRise 1.25s ease-out forwards',
        }}
      >
        {f.text}
      </div>
    </Html>
  );
}

export default function DamageFloats() {
  const floats = useSceneBridge((s) => s.floats);
  return (
    <group>
      {floats.map((f) => (
        <FloatChip key={f.id} f={f} />
      ))}
    </group>
  );
}
