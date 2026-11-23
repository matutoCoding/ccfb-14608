import type {
  BuildResult,
  MaterialSpec,
  RibbonMeshData,
  WeaveSpec,
} from '../types';

export interface BillLine {
  category: string;
  role: string;
  width: number;
  thickness: number;
  count: number;
  singleLength: number; // 单根净长 mm
  totalLength: number; // 含损耗总长度 mm
  perPole: number; // 一根竹子能出几根同规格篾
  polesNeeded: number; // 需要竹子根数
}

export interface Bill {
  lines: BillLine[];
  totalStrips: number;
  totalLength: number;
  totalPoles: number;
  wasteRate: number;
}

/**
 * 备料单:
 * 1. 按角色分组统计每根篾的长宽厚、数量;
 * 2. 加损耗余量;
 * 3. 按竹子节距算可用断料长度,按节间有效宽度算每段能剖几根 → 一根竹子出几根。
 */
export function buildBill(
  result: BuildResult,
  weave: WeaveSpec,
  material: MaterialSpec,
): Bill {
  const groups = new Map<string, RibbonMeshData[]>();
  for (const r of result.ribbons) {
    const key = `${r.role}|${r.stripWidth.toFixed(2)}|${r.stripThickness.toFixed(2)}`;
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }

  const roleLabel: Record<string, string> = {
    warp: '经篾',
    weft: '纬圈篾',
    hexStrip: '六角孔篾',
    spoke: '菊花底辐条',
    baseRing: '底圈篾',
    rim: '收口篾',
  };

  const lines: BillLine[] = [];
  const usableSegment = material.poleInternode * material.internodesPerPole;

  for (const [key, arr] of groups) {
    const [role, wStr, tStr] = key.split('|');
    const width = Number(wStr);
    const thickness = Number(tStr);
    const maxLen = Math.max(...arr.map((r) => r.length));
    const count = arr.length;
    const singleLength = Math.ceil(maxLen / 10) * 10; // 取整到 10mm
    const totalLength =
      singleLength * count * (1 + material.wasteRate);

    // 一根竹子:节间有效宽度能剖几根同宽篾(留 2mm 剖缝)
    const stripsAcross = Math.max(
      1,
      Math.floor((material.poleUsableWidth + 2) / (width + 2)),
    );
    // 一根竹子的连续可用长度能切几段
    const segmentsAlong = Math.max(1, Math.floor(usableSegment / singleLength));
    const perPole = stripsAcross * segmentsAlong;
    const polesNeeded = Math.ceil(count / perPole);

    lines.push({
      category: roleLabel[role] ?? role,
      role,
      width,
      thickness,
      count,
      singleLength,
      totalLength,
      perPole,
      polesNeeded,
    });
  }

  lines.sort((a, b) => b.totalLength - a.totalLength);
  const totalStrips = lines.reduce((s, l) => s + l.count, 0);
  const totalLength = lines.reduce((s, l) => s + l.totalLength, 0);
  const totalPoles = lines.reduce((s, l) => s + l.polesNeeded, 0);

  void weave;
  return {
    lines,
    totalStrips,
    totalLength,
    totalPoles,
    wasteRate: material.wasteRate,
  };
}
