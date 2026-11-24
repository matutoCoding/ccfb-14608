import type { BambooSpecies, MaterialBill, MaterialLine, StripMaterial } from '../types';
import type { StripGeometryData } from './ribbon';

/**
 * 备料单:
 * 1. 按 family 合并同长宽厚的篾,逐根给尺寸
 * 2. 加损耗余量 → 下料长度
 * 3. 按竹子节距:篾长不超过节距则每段节间出一根;超过则按贯通节疤处理
 * 4. 一根竹子的篾产量 = 周长/篾宽 × 可用节段数
 */
export function buildMaterialBill(
  strips: StripGeometryData[],
  material: StripMaterial,
  species: BambooSpecies,
): MaterialBill {
  const groups = new Map<number, StripGeometryData[]>();
  for (const s of strips) {
    const arr = groups.get(s.family) ?? [];
    arr.push(s);
    groups.set(s.family, arr);
  }

  const lines: MaterialLine[] = [];
  let index = 0;
  for (const [family, arr] of groups) {
    // 同族按长度排序后做相邻聚合:长度差 ≤20mm 的归入同一行,取最长值保证下料够用
    const sorted = [...arr].sort((a, b) => b.length - a.length);
    const clusters: StripGeometryData[][] = [];
    for (const s of sorted) {
      const last = clusters[clusters.length - 1];
      if (last && last[0].length - s.length <= 20) last.push(s);
      else clusters.push([s]);
    }
    for (const cluster of clusters) {
      const len = Math.round(cluster[0].length / 5) * 5; // 取该簇最长,向上对齐 5mm
      const cutLength = Math.round(len * (1 + material.wastePercent / 100));
      lines.push({
        index: index++,
        family,
        length: len,
        width: material.width,
        thickness: material.thickness,
        quantity: cluster.length,
        cutLength,
      });
    }
  }
  lines.sort((a, b) => a.family - b.family || b.length - a.length);

  // 一根竹子能出几根篾:
  // 圆周可剖篾数(留 15% 刮青余量)
  const stripsAround = Math.max(1, Math.floor((species.culmDiameter * Math.PI * 0.85) / material.width));
  // 节间可用段数
  const usableSegments = Math.max(1, Math.floor(species.culmLength / species.nodeSpacing));
  const stripsPerCulm = stripsAround * usableSegments;

  const totalStrips = lines.reduce((n, l) => n + l.quantity, 0);
  const culmsNeeded = Math.ceil(totalStrips / stripsPerCulm);

  return {
    lines,
    totalStrips,
    stripsPerCulm,
    culmsNeeded,
    species,
    wastePercent: material.wastePercent,
  };
}
