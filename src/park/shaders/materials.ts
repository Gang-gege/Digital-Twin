import * as THREE from 'three';

/**
 * 着色器材质。
 * - 管线：沿 UV.y 滚动的条带，用来表示介质流动
 * - 飞线：沿弧线跑动的光点
 * - 告警：实例化球壳，菲涅尔边缘光 + 按级别变速的闪烁
 *
 * Three 在编译 ShaderMaterial 时会自动注入 position / normal / uv /
 * instanceMatrix / instanceColor，这里不要再声明一遍，否则会编译失败。
 */

export function createFlowMaterial(color: string, speed: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uSpeed: { value: speed },
      uHighlight: { value: 0 },
    },
    transparent: false,
    depthWrite: true,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalW;
      void main() {
        vUv = uv;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      varying vec3 vNormalW;
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uSpeed;
      uniform float uHighlight;
      void main() {
        float band = fract(vUv.y * 6.0 - uTime * uSpeed);
        float stripe = smoothstep(0.42, 0.0, abs(band - 0.12));
        float shade = 0.55 + 0.45 * abs(vNormalW.z);
        vec3 col = mix(uColor * 0.22, uColor * 1.35, stripe) * shade;
        col = mix(col, vec3(1.0), uHighlight * 0.38);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

export function createFlyLineMaterial(color: string) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uColor;
      void main() {
        float head = fract(uTime * 0.38);
        float dist = abs(vUv.y - head);
        dist = min(dist, 1.0 - dist);
        float pulse = smoothstep(0.16, 0.0, dist);
        float tail = smoothstep(0.45, 0.0, dist) * 0.35;
        float alpha = tail + pulse;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
}

export function createAlarmGlowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aLevel;
      varying vec3 vColor;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vLevel;
      void main() {
        vLevel = aLevel;
        vColor = instanceColor;
        vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorld = worldPos.xyz;
        vNormalW = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vColor;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vLevel;
      uniform float uTime;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fresnel = pow(1.0 - max(dot(normalize(vNormalW), viewDir), 0.0), 1.8);
        float speed = vLevel > 1.5 ? 7.5 : 3.6;
        float blink = 0.28 + 0.72 * (0.5 + 0.5 * sin(uTime * speed));
        float alpha = (0.18 + 0.82 * fresnel) * blink;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
  });
}

/** 收集需要每帧写入 uTime 的材质。 */
export function trackTime(list: THREE.ShaderMaterial[], material: THREE.ShaderMaterial) {
  if (material.uniforms.uTime) list.push(material);
  return material;
}
