import type { BambooSpecies, MaterialPreset, ProfilePoint, ShapeDesign, WeaveDesign, WeaveKind } from '../types';

export const SPECIES: BambooSpecies[] = [
  { id: 'maozhu', name: '毛竹', greenFactor: 9, yellowFactor: 18, internodeCm: 32, usableCulmCm: 600 },
  { id: 'danzhu', name: '淡竹', greenFactor: 8, yellowFactor: 16, internodeCm: 38, usableCulmCm: 550 },
  { id: 'cizhu', name: '慈竹', greenFactor: 10, yellowFactor: 20, internodeCm: 45, usableCulmCm: 700 },
  { id: 'qingpi', name: '青皮竹', greenFactor: 7.5, yellowFactor: 15, internodeCm: 42, usableCulmCm: 650 },
];

function point(v: number, radiusCm: number, square = 0, role?: ProfilePoint['role']): ProfilePoint {
  return { id: `p_${role ?? Math.random().toString(36).slice(2, 8)}_${v}`, v, radiusCm, square, role };
}

const now = Date.now();

export const DEFAULT_SHAPES: ShapeDesign[] = [
  {
    id: 'shape_hex_fruit_basket_40',
    name: '40cm 六角孔果篮',
    kind: 'revolved',
    heightCm: 16,
    bellyV: 0.45,
    points: [
      point(0, 12, 0, 'bottom'),
      point(0.18, 15.5, 0, 'extra'),
      point(0.45, 20, 0, 'belly'),
      point(0.78, 19.6, 0, 'extra'),
      point(1, 18.5, 0, 'mouth'),
    ],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'shape_square_bottom_round_mouth',
    name: '方底圆口茶席筐',
    kind: 'variable',
    heightCm: 14,
    bellyV: 0.55,
    points: [
      point(0, 13, 1, 'bottom'),
      point(0.22, 14.2, 0.72, 'extra'),
      point(0.55, 16.5, 0.28, 'belly'),
      point(1, 16, 0, 'mouth'),
    ],
    createdAt: now,
    updatedAt: now,
  },
];

function grid(rows: number, cols: number, fn: (r: number, c: number) => boolean): boolean[][] {
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => fn(r, c)));
}

export function defaultCells(kind: WeaveKind, rows = 8, cols = 8): boolean[][] {
  switch (kind) {
    case 'cross':
      return grid(rows, cols, (r, c) => (r + c) % 2 === 0);
    case 'herringbone':
      return grid(rows, cols, (r, c) => {
        const mirror = c < cols / 2 ? c : cols - 1 - c;
        return ((mirror - r + 100) % 4) < 2;
      });
    case 'hex':
      return grid(Math.max(6, rows), Math.max(6, cols), (r, c) => (r + 2 * c) % 3 !== 1);
    case 'chrysanthemum':
      return grid(12, 16, (r, c) => {
        const petal = Math.floor(c / 2);
        return (r + petal) % 2 === 0 || r < 2;
      });
  }
}

export const DEFAULT_WEAVES: WeaveDesign[] = [
  {
    id: 'weave_cross',
    name: '十字平编',
    kind: 'cross',
    rows: 8,
    cols: 8,
    cells: defaultCells('cross'),
    gapMm: 5,
    hexHoleMm: 18,
    updatedAt: now,
  },
  {
    id: 'weave_herringbone',
    name: '人字编',
    kind: 'herringbone',
    rows: 8,
    cols: 8,
    cells: defaultCells('herringbone'),
    gapMm: 4,
    hexHoleMm: 18,
    updatedAt: now,
  },
  {
    id: 'weave_hex',
    name: '六角孔编',
    kind: 'hex',
    rows: 6,
    cols: 9,
    cells: defaultCells('hex', 6, 9),
    gapMm: 4,
    hexHoleMm: 18,
    updatedAt: now,
  },
  {
    id: 'weave_chrysanthemum',
    name: '菊花底起底',
    kind: 'chrysanthemum',
    rows: 12,
    cols: 16,
    cells: defaultCells('chrysanthemum', 12, 16),
    gapMm: 4,
    hexHoleMm: 18,
    petalCount: 16,
    updatedAt: now,
  },
];

export const DEFAULT_MATERIALS: MaterialPreset[] = [
  {
    id: 'mat_green_maozhu_6',
    name: '毛竹青篾 · 6mm',
    speciesId: 'maozhu',
    layer: 'green',
    widthMm: 6,
    thicknessMm: 0.55,
    finish: 'raw',
    bendRadiusOverrideCm: null,
    updatedAt: now,
  },
  {
    id: 'mat_yellow_maozhu_8',
    name: '毛竹黄篾 · 8mm',
    speciesId: 'maozhu',
    layer: 'yellow',
    widthMm: 8,
    thicknessMm: 0.8,
    finish: 'raw',
    bendRadiusOverrideCm: null,
    updatedAt: now,
  },
  {
    id: 'mat_smoked_green',
    name: '烟熏青篾 · 7mm',
    speciesId: 'qingpi',
    layer: 'green',
    widthMm: 7,
    thicknessMm: 0.65,
    finish: 'smoked',
    bendRadiusOverrideCm: null,
    updatedAt: now,
  },
  {
    id: 'mat_carbonized_yellow',
    name: '碳化黄篾 · 8mm',
    speciesId: 'maozhu',
    layer: 'yellow',
    widthMm: 8,
    thicknessMm: 0.8,
    finish: 'carbonized',
    bendRadiusOverrideCm: null,
    updatedAt: now,
  },
];

export function minBendRadiusCm(material: MaterialPreset): number {
  if (material.bendRadiusOverrideCm != null && material.bendRadiusOverrideCm > 0) {
    return material.bendRadiusOverrideCm;
  }
  const species = SPECIES.find((s) => s.id === material.speciesId) ?? SPECIES[0];
  const factor = material.layer === 'green' ? species.greenFactor : species.yellowFactor;
  return factor * (material.thicknessMm / 10);
}
