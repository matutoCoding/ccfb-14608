import type { MaterialSpec, VesselSpec, WeaveSpec } from '../types';
import { defaultPatternFor } from '../core/patterns';

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

export function defaultVessel(): VesselSpec {
  return {
    id: uid('v'),
    name: '六角孔果篮(40cm)',
    height: 180,
    mouthDiameter: 400,
    bellyDiameter: 360,
    bottomDiameter: 220,
    bellyT: 0.45,
    bottomExponent: 2,
    mouthExponent: 2,
    radialSegments: 128,
    heightSegments: 72,
  };
}

export function squareBottomVessel(): VesselSpec {
  return {
    ...defaultVessel(),
    id: uid('v'),
    name: '方底圆口收纳筐',
    bottomExponent: 4.5,
    mouthExponent: 2,
    bottomDiameter: 240,
  };
}

export function defaultWeave(family: WeaveSpec['family'] = 'plain'): WeaveSpec {
  const p = defaultPatternFor(family);
  return {
    id: uid('w'),
    name:
      family === 'hex'
        ? '六角孔标准编'
        : family === 'herringbone'
          ? '人字编 2/2'
          : family === 'twill'
            ? '斜纹 2/2'
            : '十字平编',
    family,
    baseStyle: 'chrysanthemum',
    rimType: 'roll',
    stripWidth: family === 'hex' ? 6 : 8,
    stripThickness: 1.2,
    gapH: family === 'hex' ? 10 : 1.5,
    gapV: family === 'hex' ? 0 : 1.5,
    patternRows: p.rows,
    patternCols: p.cols,
    pattern: p.pattern,
    hexCycle: [1, 0, 1, 0, 1, 0],
    hexTolerance: 0.08,
    baseSpokes: 16,
    baseRingCount: 3,
    rimWidth: 10,
    rimThickness: 1.5,
  };
}

export function defaultMaterials(): MaterialSpec[] {
  return [
    {
      id: uid('m'),
      name: '毛竹青篾(本色)',
      species: '毛竹',
      layer: '青篾',
      finish: '本色',
      bendFactor: 120,
      poleInternode: 220,
      poleUsableWidth: 90,
      internodesPerPole: 6,
      wasteRate: 0.08,
    },
    {
      id: uid('m'),
      name: '毛竹黄篾(本色)',
      species: '毛竹',
      layer: '黄篾',
      finish: '本色',
      bendFactor: 90,
      poleInternode: 220,
      poleUsableWidth: 80,
      internodesPerPole: 6,
      wasteRate: 0.1,
    },
    {
      id: uid('m'),
      name: '水竹青篾(烟熏碳化)',
      species: '水竹',
      layer: '青篾',
      finish: '烟熏碳化',
      bendFactor: 100,
      poleInternode: 180,
      poleUsableWidth: 70,
      internodesPerPole: 7,
      wasteRate: 0.1,
    },
    {
      id: uid('m'),
      name: '慈竹黄篾(上漆)',
      species: '慈竹',
      layer: '黄篾',
      finish: '上漆',
      bendFactor: 80,
      poleInternode: 200,
      poleUsableWidth: 75,
      internodesPerPole: 6,
      wasteRate: 0.12,
    },
  ];
}
