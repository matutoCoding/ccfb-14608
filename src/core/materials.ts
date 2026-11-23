import type { Finish, MaterialSpec, StripLayer } from '../types';

export interface BambooLook {
  base: [number, number, number];
  fiber: [number, number, number];
  roughness: number;
  clearcoat: number;
  sheen: number;
}

/** 竹种 × 篾层 × 表面处理 → 外观参数 */
export function bambooLook(mat: MaterialSpec): BambooLook {
  const layer: StripLayer = mat.layer;
  const green: BambooLook = {
    base: [0.78, 0.86, 0.55],
    fiber: [0.42, 0.55, 0.28],
    roughness: 0.45,
    clearcoat: 0.15,
    sheen: 0.35,
  };
  const yellow: BambooLook = {
    base: [0.9, 0.78, 0.52],
    fiber: [0.66, 0.52, 0.3],
    roughness: 0.6,
    clearcoat: 0,
    sheen: 0.15,
  };
  const look = layer === '青篾' ? { ...green } : { ...yellow };

  switch (mat.finish as Finish) {
    case '上漆':
      look.base = look.base.map((v) => v * 0.92 + 0.05) as [
        number,
        number,
        number,
      ];
      look.roughness = 0.22;
      look.clearcoat = 0.85;
      look.sheen = 0.5;
      break;
    case '烟熏碳化':
      look.base = [
        look.base[0] * 0.38 + 0.08,
        look.base[1] * 0.34 + 0.06,
        look.base[2] * 0.3 + 0.05,
      ];
      look.fiber = [look.fiber[0] * 0.5, look.fiber[1] * 0.5, look.fiber[2] * 0.5];
      look.roughness = 0.55;
      look.clearcoat = 0.1;
      break;
    case '本色':
    default:
      break;
  }
  return look;
}

/**
 * 程序生成篾片纹理:纵向纤维条纹(v 方向=篾长),带深浅变化与细纤维丝。
 * 在 canvas 上绘制,返回 dataURL 供 THREE.CanvasTexture 使用。
 */
export function makeFiberTexture(mat: MaterialSpec): string {
  const W = 128;
  const H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const look = bambooLook(mat);
  const [br, bg, bb] = look.base;
  const [fr, fg, fb] = look.fiber;
  const img = ctx.createImageData(W, H);
  // 固定伪随机,保证每次纹理一致
  let seed = hashString(mat.id + mat.species + mat.layer);
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // 纤维:沿 y 走的条带 + 细丝波动
      const stripe =
        0.12 * Math.sin(x * 0.55 + Math.sin(y * 0.02) * 2) +
        0.06 * Math.sin(x * 1.7 + y * 0.015);
      const grain = (rnd() - 0.5) * 0.07;
      const mix = clamp01(0.35 + stripe + grain);
      const idx = (y * W + x) * 4;
      img.data[idx] = (br * (1 - mix) + fr * mix) * 255;
      img.data[idx + 1] = (bg * (1 - mix) + fg * mix) * 255;
      img.data[idx + 2] = (bb * (1 - mix) + fb * mix) * 255;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // 竹青面的高光蜡质感:加几条纵向亮丝
  if (mat.layer === '青篾') {
    ctx.strokeStyle = 'rgba(255,255,230,0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const x = rnd() * W;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 4, H * 0.3, x - 4, H * 0.7, x + 2, H);
      ctx.stroke();
    }
  }
  return canvas.toDataURL();
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}
