import * as THREE from 'three';
import type { BambooLayer, FinishKind, StripMaterial } from '../types';

/**
 * 程序化竹篾材质。
 * 纹理沿 UV.V(篾长方向)拉丝 → 纤维方向始终顺着篾片走。
 * 青篾:高光泽青绿;黄篾:哑光暖黄纤维纹;上漆加清漆层;烟熏碳化压暗偏褐。
 */
export function buildBambooMaterial(m: StripMaterial): THREE.MeshPhysicalMaterial {
  const tex = makeFiberTexture(m.layer, m.finish);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;

  const colors: Record<BambooLayer, Record<FinishKind, THREE.ColorRepresentation>> = {
    green: {
      raw: 0xdfe8c8,
      lacquer: 0xf2e3b0,
      smoke: 0x8a6f4e,
    },
    yellow: {
      raw: 0xf0e2b8,
      lacquer: 0xf5e8c4,
      smoke: 0x7d6547,
    },
  };

  const mat = new THREE.MeshPhysicalMaterial({
    map: tex,
    color: colors[m.layer][m.finish],
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: m.layer === 'green' ? 0.32 : 0.62,
    metalness: 0,
    clearcoat: m.finish === 'lacquer' ? 0.85 : m.layer === 'green' ? 0.35 : 0.08,
    clearcoatRoughness: m.finish === 'lacquer' ? 0.18 : 0.4,
    sheen: m.layer === 'yellow' ? 0.25 : 0,
    sheenColor: new THREE.Color(0xfff2cc),
  });
  if (m.finish === 'smoke') {
    // 碳化:整体压暗、粗糙度上升
    mat.roughness = Math.min(0.9, mat.roughness + 0.2);
    mat.clearcoat *= 0.5;
  }
  return mat;
}

/** 沿 V 方向的纤维拉丝纹理(Canvas 程序化) */
function makeFiberTexture(layer: BambooLayer, finish: FinishKind): THREE.CanvasTexture {
  const w = 128;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);

  const base = layer === 'green' ? [214, 228, 188] : [236, 220, 172];
  if (finish === 'smoke') {
    base[0] = Math.round(base[0] * 0.55);
    base[1] = Math.round(base[1] * 0.52);
    base[2] = Math.round(base[2] * 0.48);
  }

  // 每列一个纤维亮度相位,沿 V 缓慢漂移
  const colPhase = new Float32Array(w);
  for (let x = 0; x < w; x++) colPhase[x] = Math.random() * Math.PI * 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fiber = Math.sin(y * 0.35 + colPhase[x]) * 6 + Math.sin(y * 0.08 + x * 0.9) * 4;
      const noise = (Math.random() - 0.5) * 5;
      // 竹青面:偶发亮丝;竹黄:更明显的深浅纤维槽
      const groove = layer === 'yellow' ? Math.sin(x * 1.7 + colPhase[x]) * 10 : Math.sin(x * 0.8) * 4;
      const shade = fiber + noise + groove;
      const idx = (y * w + x) * 4;
      img.data[idx] = clamp255(base[0] + shade);
      img.data[idx + 1] = clamp255(base[1] + shade * (layer === 'green' ? 0.9 : 1));
      img.data[idx + 2] = clamp255(base[2] + shade * 0.7);
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // 竹青面加一层纵向高光带
  if (layer === 'green') {
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, finish === 'smoke' ? 'rgba(255,230,190,0.10)' : 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
