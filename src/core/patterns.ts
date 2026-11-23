import type { WeaveFamily, WeaveSpec } from '../types';
import { mod } from './mathUtils';

export interface WeavePreset {
  family: WeaveFamily;
  label: string;
  rows: number;
  cols: number;
  build: () => number[][];
}

/** 十字编(平编):1/1 挑压 */
function plainMatrix(r = 2, c = 2): number[][] {
  return Array.from({ length: r }, (_, j) =>
    Array.from({ length: c }, (_, i) => (i + j) % 2),
  );
}

/** 人字编:左右两半斜纹方向相反,折成人字纹 */
function herringboneMatrix(r = 8, c = 8): number[][] {
  const half = Math.floor(c / 2);
  return Array.from({ length: r }, (_, j) =>
    Array.from({ length: c }, (_, i) => {
      if (i < half) return mod(i - j, 4) < 2 ? 1 : 0; // 右斜 2/2
      const i2 = c - 1 - i; // 镜像 → 左斜
      return mod(i2 - j, 4) < 2 ? 1 : 0;
    }),
  );
}

/** 斜纹(多经多纬),默认 2/2 */
function twillMatrix(r = 4, c = 4): number[][] {
  return Array.from({ length: r }, (_, j) =>
    Array.from({ length: c }, (_, i) => (mod(i - j, r) < 2 ? 1 : 0)),
  );
}

export const WEAVE_PRESETS: Record<WeaveFamily, WeavePreset> = {
  plain: {
    family: 'plain',
    label: '十字编',
    rows: 2,
    cols: 2,
    build: () => plainMatrix(),
  },
  twill: {
    family: 'twill',
    label: '斜纹编',
    rows: 4,
    cols: 4,
    build: () => twillMatrix(),
  },
  herringbone: {
    family: 'herringbone',
    label: '人字编',
    rows: 8,
    cols: 8,
    build: () => herringboneMatrix(),
  },
  hex: {
    family: 'hex',
    label: '六角孔编',
    rows: 6,
    cols: 6,
    build: () => plainMatrix(6, 6),
  },
};

export function patternAt(weave: WeaveSpec, row: number, col: number): 0 | 1 {
  const r = mod(row, weave.patternRows);
  const c = mod(col, weave.patternCols);
  return weave.pattern[r]?.[c] ? 1 : 0;
}

/** 新建编法时按族初始化格子图 */
export function defaultPatternFor(family: WeaveFamily): {
  rows: number;
  cols: number;
  pattern: number[][];
} {
  const preset = WEAVE_PRESETS[family];
  return { rows: preset.rows, cols: preset.cols, pattern: preset.build() };
}

/** 调整格子图尺寸,保留左上重叠区域,新格补平编规律 */
export function resizePattern(
  pattern: number[][],
  rows: number,
  cols: number,
): number[][] {
  return Array.from({ length: rows }, (_, j) =>
    Array.from({ length: cols }, (_, i) =>
      j < pattern.length && i < pattern[j].length
        ? pattern[j][i]
        : (i + j) % 2,
    ),
  );
}
