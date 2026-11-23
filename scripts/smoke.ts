/**
 * 几何引擎冒烟测试(Node 直跑 TS 源码,不依赖 DOM):
 * 1. 40cm 六角孔果篮性能 < 2000ms
 * 2. 交叉点穿模检测:任意两篾片顶点最小间距不得为负(盒体相交)
 * 3. 放大/改口径后根数自动重算
 * 4. 折弯超限能标红
 */
import { buildWeave } from '../src/core/weaveBuilder';
import { recalcWarpCount, recalcWeftCount } from '../src/core/weaveBuilder';
import { VesselSurface } from '../src/core/vessel';
import { defaultVessel, defaultWeave, defaultMaterials, squareBottomVessel } from '../src/data/defaults';
import type { RibbonMeshData, Vec3 } from '../src/types';

/** 每环 8 角点均值 = 环中心(含挑压偏移后的篾片中心线) */
function ringCenters(r: RibbonMeshData): Vec3[] {
  const ring = 8;
  const out: Vec3[] = [];
  for (let i = 0; i < r.positions.length / 3; i += ring * 3) {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < ring; k++) {
      x += r.positions[i + k * 3];
      y += r.positions[i + k * 3 + 1];
      z += r.positions[i + k * 3 + 2];
    }
    out.push([x / ring, y / ring, z / ring]);
  }
  return out;
}

/**
 * 两篾片中心线最小间距。盒状篾不相交要求中心距 ≥ (t1+t2)/2,
 * 等厚时即 ≥ 一个篾厚,小于该值判为穿模。
 */
function minCenterGap(a: RibbonMeshData, b: RibbonMeshData): number {
  const pa = ringCenters(a);
  const pb = ringCenters(b);
  let min = Infinity;
  for (const p of pa) {
    for (const q of pb) {
      const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      if (d < min) min = d;
    }
  }
  return min;
}

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('❌ FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('✅ PASS:', msg);
  }
}

// ---- 1. 40cm 六角孔果篮性能 ----
const vessel = defaultVessel();
const hexWeave = defaultWeave('hex');
const plain = defaultWeave('plain');
const mat = defaultMaterials()[0];
const t0 = performance.now();
const r1 = buildWeave(vessel, hexWeave, mat);
const dt = performance.now() - t0;
console.log(`六角孔: ${r1.ribbons.length} 根篾, ${dt.toFixed(0)}ms, 畸变点 ${r1.hexIssues.length}`);
assert(dt < 2000, `六角孔生成 < 2s(实际 ${dt.toFixed(0)}ms)`);
assert(r1.ribbons.length > 60, `篾片数量充足(${r1.ribbons.length})`);

// ---- 2. 穿模检测:盒相交判据,确定性抽样不同组篾配对 ----
function checkClipping(result: ReturnType<typeof buildWeave>, label: string) {
  const t = result.ribbons[0]?.stripThickness ?? 1;
  // 按角色/族分组,只测不同组(同组篾平行不交叉)
  const groups = new Map<string, RibbonMeshData[]>();
  for (const r of result.ribbons) {
    const k = `${r.role}|${(r.label.split(' ')[0] ?? '').split('-')[0]}`;
    const arr = groups.get(k);
    if (arr) arr.push(r);
    else groups.set(k, [r]);
  }
  const keys = [...groups.keys()];
  let tested = 0;
  let clipping = 0;
  let worst = Infinity;
  for (let x = 0; x < keys.length && tested < 30; x++) {
    for (let y = x + 1; y < keys.length && tested < 30; y++) {
      const A = groups.get(keys[x])!;
      const B = groups.get(keys[y])!;
      // 确定性抽样
      const a = A[(x * 7 + y * 3) % A.length];
      const b = B[(y * 11 + x * 5) % B.length];
      const gap = minCenterGap(a, b);
      worst = Math.min(worst, gap);
      tested++;
      if (gap < t) clipping++;
    }
  }
  console.log(`[${label}] 抽测 ${tested} 对, 最小中心距 ${worst.toFixed(2)}mm (篾厚 ${t}mm)`);
  assert(clipping === 0, `[${label}] 无穿模(${clipping}/${tested} 对中心距 < 篾厚)`);
}

checkClipping(r1, '六角孔');
const rPlain = buildWeave(vessel, plain, mat);
checkClipping(rPlain, '十字平编');
const rHer = buildWeave(vessel, defaultWeave('herringbone'), mat);
checkClipping(rHer, '人字编');

// ---- 3. 改口径根数重算 ----
const surf1 = new VesselSurface(vessel);
const c1 = recalcWarpCount({ vessel: surf1, weave: plain, material: mat });
const big = { ...vessel, mouthDiameter: 600, bellyDiameter: 560 };
const surf2 = new VesselSurface(big);
const c2 = recalcWarpCount({ vessel: surf2, weave: plain, material: mat });
console.log(`口径 ${vessel.mouthDiameter}→${big.mouthDiameter}: 经篾 ${c1}→${c2} 根`);
assert(c2 > c1, '放大口径后经篾根数增加');
const w1 = recalcWeftCount({ vessel: surf1, weave: plain, material: mat });
const tall = { ...vessel, height: 300 };
const surf3 = new VesselSurface(tall);
const w2 = recalcWeftCount({ vessel: surf3, weave: plain, material: mat });
assert(w2 > w1, `加高后纬圈增加(${w1}→${w2})`);

// ---- 4. 折弯超限标红 ----
const sharp = { ...vessel, height: 60, bellyDiameter: 400, bellyT: 0.5 };
const rSharp = buildWeave(sharp, plain, mat);
const bad = rSharp.ribbons.filter((x) => x.bendViolations > 0).length;
console.log(`急变轮廓: ${bad} 根篾片标红`);
assert(bad > 0, '急弯轮廓能检出折弯超限');
const hasRed = rSharp.ribbons.some((x) => {
  for (let i = 0; i < x.colors.length; i += 3) {
    if (x.colors[i] > 0.8 && x.colors[i + 1] < 0.3) return true;
  }
  return false;
});
assert(hasRed, '超限段顶点色为红色');

// ---- 5. 方底圆口 ----
const sq = squareBottomVessel();
const rSq = buildWeave(sq, plain, mat);
assert(rSq.ribbons.length > 0, '方底圆口器型可正常生成');

// ---- 6. 平编/人字/斜纹各编法 ----
for (const fam of ['plain', 'twill', 'herringbone'] as const) {
  const w = defaultWeave(fam);
  const r = buildWeave(vessel, w, mat);
  assert(r.ribbons.length > 20, `${fam} 编法生成 ${r.ribbons.length} 根篾`);
}

// ---- 7. 三种收口 ----
for (const rim of ['roll', 'wrap', 'socket'] as const) {
  const w = { ...plain, rimType: rim };
  const r = buildWeave(vessel, w, mat);
  assert(r.ribbons.some((x) => x.role === 'rim'), `${rim} 收口存在`);
}

console.log('\n几何引擎测试完成。');
