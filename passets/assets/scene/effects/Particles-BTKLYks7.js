import{jsxs as b,jsx as u}from"react/jsx-runtime";import{useMemo as A}from"react";import*as a from"three";import{useFrame as w}from"@react-three/fiber";import{useTexture as z}from"@react-three/drei";import{usePrefersReducedMotion as C}from"../palette-hu8nmRRv.js";import{smokePool as M,sparklePool as P,CAP_PER_SYSTEM as s}from"./particle-pool-C_4ANuCD.js";import{assetUrl as d}from"../../asset-base-CYUHfv_h.js";const S=`
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
}`,F=`
uniform sampler2D uMap;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 tex = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor * tex.rgb, tex.a * vAlpha);
  if (gl_FragColor.a < 0.01) discard;
}`;function g({texture:l,pool:p}){const y=C(),{geometry:x,posAttr:f,sizeAttr:m,alphaAttr:n,colorAttr:c}=A(()=>{const o=new a.BufferGeometry,i=new a.BufferAttribute(new Float32Array(s*3),3),r=new a.BufferAttribute(new Float32Array(s),1),e=new a.BufferAttribute(new Float32Array(s),1),t=new a.BufferAttribute(new Float32Array(s*3),3);return o.setAttribute("position",i),o.setAttribute("aSize",r),o.setAttribute("aAlpha",e),o.setAttribute("aColor",t),{geometry:o,posAttr:i,sizeAttr:r,alphaAttr:e,colorAttr:t}},[]),h=A(()=>new a.ShaderMaterial({uniforms:{uMap:{value:l}},vertexShader:S,fragmentShader:F,transparent:!0,depthWrite:!1}),[l]);return w((o,i)=>{const r=y?i*.4:i;for(let e=0;e<s;e++){const t=p[e];if(!t.alive){n.setX(e,0);continue}if(t.life-=r,t.life<=0){t.alive=!1,n.setX(e,0);continue}t.vy+=t.gravity*r,t.x+=t.vx*r,t.y+=t.vy*r,t.z+=t.vz*r,t.y<.1&&(t.y=.1);const v=t.life/t.maxLife;f.setXYZ(e,t.x,t.y,t.z),m.setX(e,t.size+(1-v)*t.grow),n.setX(e,Math.min(1,v*2)),c.setXYZ(e,t.r,t.g,t.b)}f.needsUpdate=!0,m.needsUpdate=!0,n.needsUpdate=!0,c.needsUpdate=!0}),u("points",{geometry:x,material:h,frustumCulled:!1})}function U(){const[l,p]=z([d("/particle-coin-sparkle.png"),d("/particle-smoke-puff.png")]);return b("group",{children:[u(g,{texture:p,pool:M}),u(g,{texture:l,pool:P})]})}export{U as default};
