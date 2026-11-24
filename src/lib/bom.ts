import { SPECIES } from './defaults';
import type { MaterialPreset, RimConfig, ShapeDesign } from '../types';
import { BambooSurface } from './shape';
import type { StripResult } from './ribbon';

export interface RootCutRow {
  rootNo: number;
  stripId: string;
  name: string;
  group: string;
  count: 1;
  netLengthCm: number;
  cutLengthCm: number;
  widthMm: number;
  thicknessMm: number;
}

export interface GroupedCutRow {
  key: string;
  category: string;
  count: number;
  /** 同规格中最大落料长度，按它下料可覆盖组内全部根 */
  lengthCm: number;
  widthMm: number;
  thicknessMm: number;
  totalLengthCm: number;
  stripsPerBamboo: number;
  bambooPoles: number;
}

export interface RimBomRow {
  id: string;
  name: string;
  count: number;
  lengthCm: number;
  widthMm: number;
  thicknessMm: number;
  note: string;
}

export interface BomResult {
  roots: RootCutRow[];
  groups: GroupedCutRow[];
  rimRows: RimBomRow[];
  totalRoots: number;
  totalNetLengthM: number;
  totalCutLengthM: number;
  totalBambooPoles: number;
  speciesName: string;
  internodeCm: number;
  nodeCount: number;
  nodeAllowanceCm: number;
  lossRate: number;
}

export function bambooYield(
  cutLengthCm: number,
  material: MaterialPreset,
  bambooLengthCm: number,
  nodeAllowanceCm = 1.4,
): { stripsPerBamboo: number; nodeCount: number; usableAfterNodesCm: number } {
  const species = SPECIES.find((s) => s.id === material.speciesId) ?? SPECIES[0];
  const usable = bambooLengthCm > 0 ? bambooLengthCm : species.usableCulmCm;
  const nodeCount = Math.max(1, Math.floor(usable / species.internodeCm));
  // 每个竹节断口/修节预留一段损耗；节距决定一根竹上有多少节。
  const usableAfterNodes = usable - nodeCount * nodeAllowanceCm - 8; // 8cm 为两头截头
  const stripsPerBamboo = Math.max(0, Math.floor(usableAfterNodes / Math.max(1, cutLengthCm)));
  return { stripsPerBamboo, nodeCount, usableAfterNodesCm: usableAfterNodes };
}

export function getRimBom(shape: ShapeDesign, rim: RimConfig): { perimeterCm: number; rows: RimBomRow[] } {
  const surface = new BambooSurface(shape);
  const perimeterCm = surface.perimeterAtS(surface.lengthCm);
  const coreRadiusCm = rim.coreMm / 20;
  const wrapWidthCm = rim.wrappingWidthMm / 10;
  const gapCm = rim.wrappingGapMm / 10;
  const turns = Math.max(1, Math.round(perimeterCm / Math.max(0.15, gapCm + wrapWidthCm * 0.4)));
  const wrapLengthCm = turns * Math.sqrt(Math.pow(2 * Math.PI * (coreRadiusCm + wrapWidthCm / 2), 2) + Math.pow(perimeterCm / turns, 2));

  if (rim.kind === 'roll') {
    return {
      perimeterCm,
      rows: [
        { id: 'rim_roll_core', name: '卷口芯条', count: 1, lengthCm: perimeterCm + 4, widthMm: rim.coreMm, thicknessMm: rim.coreMm, note: '口沿主圈，含搭接余量 4cm' },
        { id: 'rim_roll_wrap', name: '卷口缠绕篾', count: 1, lengthCm: wrapLengthCm + 6, widthMm: rim.wrappingWidthMm, thicknessMm: 0.45, note: `约 ${turns} 道螺旋锁扎` },
      ],
    };
  }

  if (rim.kind === 'bind') {
    const lashLength = turns * (rim.coreMm / 10) * 2.4 + 8;
    return {
      perimeterCm,
      rows: [
        { id: 'rim_bind_outer', name: '外包边篾', count: 1, lengthCm: perimeterCm + 3, widthMm: rim.coreMm, thicknessMm: 0.6, note: '口沿外侧整圈' },
        { id: 'rim_bind_inner', name: '内包边篾', count: 1, lengthCm: perimeterCm + 3, widthMm: rim.coreMm, thicknessMm: 0.6, note: '口沿内侧整圈' },
        { id: 'rim_bind_lash', name: '包边锁扎篾', count: 1, lengthCm: lashLength, widthMm: rim.wrappingWidthMm, thicknessMm: 0.45, note: `约 ${turns} 道夹紧锁扎` },
      ],
    };
  }

  const tabCount = Math.max(12, Math.round(perimeterCm / 2.2));
  return {
    perimeterCm,
    rows: [
      { id: 'rim_insert_band', name: '插口口沿篾', count: 1, lengthCm: perimeterCm + 6, widthMm: rim.coreMm + 4, thicknessMm: 0.7, note: '宽篾整圈插口' },
      { id: 'rim_insert_tongue', name: '内侧插舌长篾', count: 1, lengthCm: perimeterCm + 4, widthMm: rim.coreMm, thicknessMm: 0.55, note: '插入器壁内侧' },
      { id: 'rim_insert_tabs', name: '短插片', count: tabCount, lengthCm: 3.2, widthMm: rim.wrappingWidthMm + 2, thicknessMm: 0.5, note: '每 2.2cm 一片' },
    ],
  };
}

export function buildBom(
  strips: StripResult[],
  material: MaterialPreset,
  shape: ShapeDesign,
  rim: RimConfig,
  bambooLengthCm: number,
  lossRate: number,
): BomResult {
  const roots: RootCutRow[] = strips.map((s) => ({
    rootNo: s.rootNo,
    stripId: s.id,
    name: s.label,
    group: s.group,
    count: 1,
    netLengthCm: s.lengthCm,
    cutLengthCm: s.cutLengthCm,
    widthMm: s.widthCm * 10,
    thicknessMm: s.thicknessCm * 10,
  }));

  const groupMap = new Map<string, GroupedCutRow & { totalCutLengthCm: number }>();
  for (const r of roots) {
    // 长度按 1cm 向上归组，保证组内最大落料长度可覆盖全部根。
    const roundedLength = Math.ceil(r.cutLengthCm);
    const key = `${r.group.split(' ')[0]}_${Math.round(r.widthMm)}x${Math.round(r.thicknessMm * 10)}_${roundedLength}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.count += 1;
      existing.lengthCm = Math.max(existing.lengthCm, r.cutLengthCm);
      existing.totalLengthCm += r.cutLengthCm;
    } else {
      const y = bambooYield(r.cutLengthCm, material, bambooLengthCm);
      groupMap.set(key, {
        key,
        category: r.group,
        count: 1,
        lengthCm: r.cutLengthCm,
        widthMm: r.widthMm,
        thicknessMm: r.thicknessMm,
        totalLengthCm: r.cutLengthCm,
        stripsPerBamboo: y.stripsPerBamboo,
        bambooPoles: 0,
        totalCutLengthCm: 0,
      });
    }
  }

  const groups: GroupedCutRow[] = [...groupMap.values()].map((g) => {
    const y = bambooYield(g.lengthCm, material, bambooLengthCm);
    const stripsPerBamboo = y.stripsPerBamboo;
    return {
      ...g,
      stripsPerBamboo,
      bambooPoles: stripsPerBamboo > 0 ? Math.ceil(g.count / stripsPerBamboo) : 0,
    };
  });

  const rimBom = getRimBom(shape, rim);
  for (const row of rimBom.rows) {
    if (row.id === 'rim_roll_wrap' || row.id === 'rim_bind_lash') {
      const y = bambooYield(row.lengthCm, material, bambooLengthCm);
      row.note += `；每竹约 ${y.stripsPerBamboo} 根`;
    }
  }

  const totalNetLengthCm = roots.reduce((sum, r) => sum + r.netLengthCm, 0);
  // cutLengthCm 已在几何层按 project.lossRate 计入损耗。
  const totalCutLengthCm = roots.reduce((sum, r) => sum + r.cutLengthCm, 0);
  const totalBambooPoles = groups.reduce((sum, g) => sum + g.bambooPoles, 0) + rimBom.rows.reduce((sum, r) => {
    if (r.count > 2) {
      const y = bambooYield(r.lengthCm, material, bambooLengthCm);
      return sum + (y.stripsPerBamboo > 0 ? Math.ceil(r.count / y.stripsPerBamboo) : r.count);
    }
    const y = bambooYield(r.lengthCm, material, bambooLengthCm);
    return sum + (y.stripsPerBamboo > 0 ? Math.ceil(r.count / y.stripsPerBamboo) : 1);
  }, 0);

  const species = SPECIES.find((s) => s.id === material.speciesId) ?? SPECIES[0];
  const nodeCount = Math.floor((bambooLengthCm || species.usableCulmCm) / species.internodeCm);

  return {
    roots,
    groups,
    rimRows: rimBom.rows,
    totalRoots: roots.length,
    totalNetLengthM: totalNetLengthCm / 100,
    totalCutLengthM: totalCutLengthCm / 100,
    totalBambooPoles: Math.max(1, totalBambooPoles),
    speciesName: species.name,
    internodeCm: species.internodeCm,
    nodeCount,
    nodeAllowanceCm: 1.4,
    lossRate,
  };
}
