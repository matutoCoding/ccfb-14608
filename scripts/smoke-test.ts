// 无头几何验证:交叉点结构保证、性能、曲率、缩放、备料
import { WeaveEngine } from '../src/geometry/weave';
import type { BambooSpecies, StripMaterial, VesselProfile, WeavePattern } from '../src/types';

const species: BambooSpecies = { id: 's', name: '毛竹', minBendRadiusFactor: 18, nodeSpacing: 220, culmLength: 9000, culmDiameter: 110 };
const material: StripMaterial = { id: 'm', name: 't', layer: 'green', width: 6, thickness: 1.2, bambooSpecies: '毛竹', finish: 'raw', wastePercent: 12, createdAt: 0, updatedAt: 0 };
const hexPattern: WeavePattern = { id: 'p', name: 'hex', kind: 'hex', matrix: [[1, 0], [0, 1]], hexCellSize: 24, note: '', createdAt: 0, updatedAt: 0 };
const crossPattern: WeavePattern = { id: 'c', name: 'cross', kind: 'cross', matrix: [[1, 0], [0, 1]], note: '', createdAt: 0, updatedAt: 0 };
const profile = (d: number): VesselProfile => ({
  id: 'v', name: '篮', mouthDiameter: d, bellyDiameter: d * 0.95, baseDiameter: d * 0.5,
  height: d * 0.45, bellyTRatio: 0.35, mouthSuperN: 2, baseSuperN: 2, sections: [], createdAt: 0, updatedAt: 0,
});

function run(label: string, pat: WeavePattern, prof: VesselProfile, th = material.thickness) {
  const mat = { ...material, thickness: th };
  const r = new WeaveEngine(prof, pat, mat, species).build();
  const cc = r.crossingCheck;
  const ok = cc.conflict === 0 ? '✓ 不穿模' : `✗ ${cc.conflict} 个交叉冲突`;
  console.log(`${label}: ${r.stripCount}根/${r.crossingCount}交叉/${r.buildMs.toFixed(0)}ms | 交叉对 ${cc.total}, ${ok}(中心距=${cc.minCenterGap}mm=篾厚) | 弯超${r.bendViolations.length} 失真${r.distortionMarks.length}`);
  return r;
}

console.log('=== 1. 40cm 六角孔果篮 ===');
const r1 = run('六角', hexPattern, profile(400));
console.log('=== 2. 缩放重算(篾数随周长)===');
for (const d of [200, 400, 600]) run(`口径${d}`, hexPattern, profile(d));
console.log('=== 3. 四种编法 ===');
run('十字编', crossPattern, profile(400));
run('人字编', { ...crossPattern, kind: 'herringbone' }, profile(400));
run('六角孔', hexPattern, profile(400));
run('菊花底', { ...crossPattern, kind: 'chrysanthemum', chrysanthemumSpokes: 16 }, profile(400));
console.log('=== 4. 方底圆口 ===');
run('方底圆口', hexPattern, { ...profile(300), baseSuperN: 1.2, mouthSuperN: 2 });
console.log('=== 5. 薄篾/厚篾 ===');
run('篾厚0.5', hexPattern, profile(400), 0.5);
run('篾厚3.0', hexPattern, profile(400), 3);
console.log('=== 6. 连续 5 次重建 ===');
const ts: number[] = [];
for (let i = 0; i < 5; i++) ts.push(new WeaveEngine(profile(400), hexPattern, material, species).build().buildMs);
console.log(`各次 ${ts.map((t) => t.toFixed(0)).join(',')} ms, 平均 ${(ts.reduce((a, b) => a + b, 0) / 5).toFixed(0)} ms(目标 <2000)`);
console.log('=== 7. 备料单 ===');
const { buildMaterialBill } = await import('../src/geometry/materialBill');
const bill = buildMaterialBill(r1.strips, material, species);
console.log(`行数 ${bill.lines.length}, 总篾 ${bill.totalStrips}, 一竹出 ${bill.stripsPerCulm}, 需竹 ${bill.culmsNeeded}`);
console.log('=== 8. 回放步骤 ===');
console.log(`共 ${r1.steps.length} 步, 首3步: ${r1.steps.slice(0, 3).map((s) => s.label).join(' | ')}`);
