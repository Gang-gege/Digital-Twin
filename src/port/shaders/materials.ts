import * as THREE from 'three';

/** 水面、告警、轨迹共用一个时间，暂停作业时特效仍可轻微流动。 */
export const sharedTime = { value: 0 };

const WATER_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const WATER_FRAG = `
uniform float uTime;
varying vec2 vUv;
void main() {
  float wave = sin(vUv.x * 34.0 + uTime * 1.3) * sin(vUv.y * 22.0 - uTime * 0.9);
  float rip = sin((vUv.x + vUv.y) * 48.0 - uTime * 1.6);
  float fres = smoothstep(0.15, 0.95, vUv.y);
  vec3 deep = vec3(0.02, 0.12, 0.22);
  vec3 mid = vec3(0.05, 0.32, 0.48);
  vec3 spec = vec3(0.72, 0.88, 0.95);
  vec3 color = mix(deep, mid, fres);
  color = mix(color, spec, clamp(wave * 0.22 + rip * 0.08, 0.0, 0.45));
  gl_FragColor = vec4(color, 0.78);
}
`;

const GLOW_VERT = `
varying vec3 vNormal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const GLOW_FRAG = `
uniform float uTime;
uniform float uSpeed;
uniform vec3 uColor;
varying vec3 vNormal;
void main() {
  float pulse = 0.35 + 0.65 * abs(sin(uTime * uSpeed));
  float rim = pow(1.0 - abs(vNormal.z), 1.4);
  gl_FragColor = vec4(uColor * (0.55 + rim), pulse);
}
`;

const TRAIL_VERT = `
attribute float aFade;
varying float vFade;
void main() {
  vFade = aFade;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const TRAIL_FRAG = `
varying float vFade;
void main() {
  gl_FragColor = vec4(0.25, 0.86, 0.98, vFade);
}
`;

/** 码头水面：波纹叠加一层高光，当作简易反光。 */
export function createWaterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: sharedTime },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
  });
}

/** 三级告警的发光闪烁。urgent 的 uSpeed 更大。 */
export function createAlarmMaterial(color: string, speed: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: sharedTime,
      uSpeed: { value: speed },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
  });
}

/** 集卡轨迹。aFade 从头到尾升高，看起来像拖尾渐隐。 */
export function createTrailMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: TRAIL_VERT,
    fragmentShader: TRAIL_FRAG,
  });
}
