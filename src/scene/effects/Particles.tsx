/**
 * عارض الجسيمات: نظاما Points (دخان + بريق) — استدعاء رسم واحد لكل منهما.
 * أوامر الانبعاث (burstSmoke/burstSparkle/...) في ./particle-pool.
 *
 * ملاحظة: تعديل سمات BufferGeometry داخل useFrame هو نمط R3F القياسي
 * للحركة عالية التردد (react-dev.md) — لذا نعطّل قاعدة immutability هنا.
 */
/* eslint-disable react-hooks/immutability */
import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { usePrefersReducedMotion } from '../palette';
import { CAP_PER_SYSTEM, smokePool, sparklePool, type Particle } from './particle-pool';

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (140.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 tex = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor * tex.rgb, tex.a * vAlpha);
  if (gl_FragColor.a < 0.01) discard;
}`;

function ParticleSystem({ texture, pool }: { texture: THREE.Texture; pool: Particle[] }) {
  const reduced = usePrefersReducedMotion();

  const { geometry, posAttr, sizeAttr, alphaAttr, colorAttr } = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(new Float32Array(CAP_PER_SYSTEM * 3), 3);
    const sizeAttr = new THREE.BufferAttribute(new Float32Array(CAP_PER_SYSTEM), 1);
    const alphaAttr = new THREE.BufferAttribute(new Float32Array(CAP_PER_SYSTEM), 1);
    const colorAttr = new THREE.BufferAttribute(new Float32Array(CAP_PER_SYSTEM * 3), 3);
    geometry.setAttribute('position', posAttr);
    geometry.setAttribute('aSize', sizeAttr);
    geometry.setAttribute('aAlpha', alphaAttr);
    geometry.setAttribute('aColor', colorAttr);
    return { geometry, posAttr, sizeAttr, alphaAttr, colorAttr };
  }, []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uMap: { value: texture } },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
      }),
    [texture],
  );

  useFrame((_, dt) => {
    const step = reduced ? dt * 0.4 : dt;
    for (let i = 0; i < CAP_PER_SYSTEM; i++) {
      const p = pool[i];
      if (!p.alive) {
        alphaAttr.setX(i, 0);
        continue;
      }
      p.life -= step;
      if (p.life <= 0) {
        p.alive = false;
        alphaAttr.setX(i, 0);
        continue;
      }
      p.vy += p.gravity * step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.z += p.vz * step;
      if (p.y < 0.1) p.y = 0.1;
      const t = p.life / p.maxLife;
      posAttr.setXYZ(i, p.x, p.y, p.z);
      sizeAttr.setX(i, p.size + (1 - t) * p.grow);
      alphaAttr.setX(i, Math.min(1, t * 2));
      colorAttr.setXYZ(i, p.r, p.g, p.b);
    }
    posAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

export default function Particles() {
  const [sparkleTex, smokeTex] = useTexture(['./particle-coin-sparkle.png', './particle-smoke-puff.png']);
  return (
    <group>
      <ParticleSystem texture={smokeTex} pool={smokePool} />
      <ParticleSystem texture={sparkleTex} pool={sparklePool} />
    </group>
  );
}
