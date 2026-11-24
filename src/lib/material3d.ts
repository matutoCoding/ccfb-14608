import * as THREE from 'three';
import type { MaterialPreset } from '../types';

interface ColorSet {
  base: [string, string];
  fiberDark: string;
  fiberLight: string;
}

function colorsFor(material: MaterialPreset): ColorSet {
  if (material.layer === 'green') {
    return { base: ['#9db95d', '#5f8433'], fiberDark: 'rgba(38,70,20,0.34)', fiberLight: 'rgba(224,241,157,0.42)' };
  }
  return { base: ['#e5c27a', '#bd8840'], fiberDark: 'rgba(111,69,24,0.32)', fiberLight: 'rgba(255,235,177,0.5)' };
}

function finishOverlay(finish: MaterialPreset['finish']): { color: string; alpha: number; composite: GlobalCompositeOperation } | null {
  switch (finish) {
    case 'clear-lacquer':
      return { color: '#8a4d18', alpha: 0.16, composite: 'multiply' };
    case 'red-lacquer':
      return { color: '#7d2117', alpha: 0.72, composite: 'source-over' };
    case 'smoked':
      return { color: '#5b432d', alpha: 0.5, composite: 'multiply' };
    case 'carbonized':
      return { color: '#24180f', alpha: 0.78, composite: 'multiply' };
    default:
      return null;
  }
}

export function createBambooCanvas(material: MaterialPreset): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const colors = colorsFor(material);
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, colors.base[0]);
  gradient.addColorStop(0.5, colors.base[1]);
  gradient.addColorStop(1, colors.base[0]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 纤维方向固定为画布 X；带状几何的 U 向沿篾片长度，因此纤维会顺篾走。
  for (let i = 0; i < 420; i += 1) {
    const y = Math.random() * canvas.height;
    const amp = 1 + Math.random() * 5;
    const phase = Math.random() * Math.PI * 2;
    ctx.beginPath();
    for (let x = -20; x <= canvas.width + 20; x += 18) {
      const yy = y + Math.sin(x * 0.018 + phase) * amp + Math.sin(x * 0.006 + phase * 2) * amp * 0.7;
      if (x === -20) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.strokeStyle = Math.random() > 0.28 ? colors.fiberDark : colors.fiberLight;
    ctx.lineWidth = 0.45 + Math.random() * 1.5;
    ctx.stroke();
  }

  // 稀疏的竹节/导管斑点。
  for (let i = 0; i < 26; i += 1) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    ctx.fillStyle = colors.fiberDark;
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    ctx.ellipse(x, y, 18 + Math.random() * 34, 1.2 + Math.random() * 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const overlay = finishOverlay(material.finish);
  if (overlay) {
    ctx.globalCompositeOperation = overlay.composite;
    ctx.globalAlpha = overlay.alpha;
    ctx.fillStyle = overlay.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // 漆面上光的纵向高光带。
  if (material.finish === 'clear-lacquer' || material.finish === 'red-lacquer') {
    const sheen = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sheen.addColorStop(0, 'rgba(255,255,255,0.18)');
    sheen.addColorStop(0.45, 'rgba(255,255,255,0.03)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  return canvas;
}

export function createBambooTexture(material: MaterialPreset): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(createBambooCanvas(material));
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

export function createBambooMaterial(material: MaterialPreset): THREE.MeshPhysicalMaterial {
  const map = createBambooTexture(material);
  const lacquered = material.finish === 'clear-lacquer' || material.finish === 'red-lacquer';
  const threeMaterial = new THREE.MeshPhysicalMaterial({
    map,
    bumpMap: map,
    bumpScale: material.layer === 'yellow' ? 0.025 : 0.014,
    roughness: lacquered ? 0.24 : material.finish === 'raw' ? (material.layer === 'green' ? 0.42 : 0.68) : 0.78,
    metalness: 0,
    clearcoat: lacquered ? 0.85 : material.layer === 'green' ? 0.22 : 0.04,
    clearcoatRoughness: lacquered ? 0.18 : 0.55,
    sheen: material.layer === 'green' ? 0.25 : 0.12,
    sheenColor: new THREE.Color(material.layer === 'green' ? '#d8ef9a' : '#ffe0a0'),
    side: THREE.DoubleSide,
    vertexColors: true,
  });

  threeMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
      float bambooDangerMask = smoothstep(0.18, 0.52, vColor.r - vColor.g);
      totalEmissiveRadiance += vec3(0.95, 0.025, 0.01) * bambooDangerMask;
#endif`,
    );
  };
  threeMaterial.customProgramCacheKey = () => 'bamboo-danger-v1';
  return threeMaterial;
}

export function materialSwatchUrl(material: MaterialPreset): string {
  return createBambooCanvas(material).toDataURL('image/png');
}
