import type { BambooSpecies, StripMaterial, VesselProfile, WeavePattern } from '../types';
import { uid } from '../db/indexeddb';

const now = () => Date.now();

export function defaultProfiles(): VesselProfile[] {
  const t = now();
  return [
    {
      id: 'profile_guolan',
      name: '六角孔果篮(40cm)',
      mouthDiameter: 400,
      bellyDiameter: 380,
      baseDiameter: 200,
      height: 180,
      bellyTRatio: 0.35,
      mouthSuperN: 2,
      baseSuperN: 2,
      sections: [],
      createdAt: t,
      updatedAt: t,
    },
    {
      id: 'profile_fangdi',
      name: '方底圆口茶篓',
      mouthDiameter: 260,
      bellyDiameter: 300,
      baseDiameter: 180,
      height: 240,
      bellyTRatio: 0.55,
      mouthSuperN: 2,
      baseSuperN: 1.2,
      sections: [],
      createdAt: t,
      updatedAt: t,
    },
  ];
}

export function defaultPatterns(): WeavePattern[] {
  const t = now();
  return [
    {
      id: 'pattern_cross',
      name: '十字编(一挑一压)',
      kind: 'cross',
      matrix: [
        [1, 0],
        [0, 1],
      ],
      note: '最基础的平编,经纬各一挑一压',
      createdAt: t,
      updatedAt: t,
    },
    {
      id: 'pattern_herringbone',
      name: '人字编(三斜纹)',
      kind: 'herringbone',
      matrix: [
        [1, 1, 0, 0],
        [0, 1, 1, 0],
        [0, 0, 1, 1],
        [1, 0, 0, 1],
      ],
      note: '过中线斜纹反向,成人字形',
      createdAt: t,
      updatedAt: t,
    },
    {
      id: 'pattern_hex',
      name: '六角孔编',
      kind: 'hex',
      matrix: [
        [1, 0],
        [0, 1],
      ],
      hexCellSize: 24,
      note: '三向篾 60° 交织,孔为正六边形',
      createdAt: t,
      updatedAt: t,
    },
    {
      id: 'pattern_chrys',
      name: '菊花底起底',
      kind: 'chrysanthemum',
      matrix: [
        [1, 0],
        [0, 1],
      ],
      chrysanthemumSpokes: 16,
      note: '16 根放射筋,圈篾奇偶交替挑压',
      createdAt: t,
      updatedAt: t,
    },
  ];
}

export function defaultMaterials(): StripMaterial[] {
  const t = now();
  return [
    {
      id: 'mat_green_6',
      name: '青篾 6×1.2',
      layer: 'green',
      width: 6,
      thickness: 1.2,
      bambooSpecies: '毛竹',
      finish: 'raw',
      wastePercent: 12,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: 'mat_yellow_8',
      name: '黄篾 8×1.5 烟熏',
      layer: 'yellow',
      width: 8,
      thickness: 1.5,
      bambooSpecies: '毛竹',
      finish: 'smoke',
      wastePercent: 15,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: 'mat_lacquer_5',
      name: '青篾 5×1 上漆',
      layer: 'green',
      width: 5,
      thickness: 1,
      bambooSpecies: '早竹',
      finish: 'lacquer',
      wastePercent: 10,
      createdAt: t,
      updatedAt: t,
    },
  ];
}

export function defaultSpecies(): BambooSpecies[] {
  return [
    {
      id: 'species_moso',
      name: '毛竹',
      minBendRadiusFactor: 18,
      nodeSpacing: 220,
      culmLength: 9000,
      culmDiameter: 110,
    },
    {
      id: 'species_zao',
      name: '早竹',
      minBendRadiusFactor: 14,
      nodeSpacing: 180,
      culmLength: 7000,
      culmDiameter: 70,
    },
    {
      id: 'species_ci',
      name: '慈竹',
      minBendRadiusFactor: 10,
      nodeSpacing: 260,
      culmLength: 8000,
      culmDiameter: 80,
    },
  ];
}

export { uid };
