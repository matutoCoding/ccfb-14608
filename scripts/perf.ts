import { buildWeave } from '../src/core/weaveBuilder';
import {
  defaultVessel,
  defaultWeave,
  defaultMaterials,
} from '../src/data/defaults';

const mat = defaultMaterials()[0];
const hex = defaultWeave('hex');
const plain = defaultWeave('plain');

console.log('=== 连续改口径(模拟拖动),六角孔 ===');
for (const mouth of [320, 360, 400, 440, 480, 520, 600]) {
  const v = { ...defaultVessel(), mouthDiameter: mouth, bellyDiameter: mouth - 40 };
  const t0 = performance.now();
  const r = buildWeave(v, hex, mat);
  const dt = performance.now() - t0;
  console.log(
    `口径 ${mouth}mm: ${r.ribbons.length} 根, ${dt.toFixed(0)}ms ${dt < 2000 ? '✅' : '❌'}`,
  );
}

console.log('\n=== 千交叉点规模(大篮 60cm,加密篾) ===');
const big = { ...defaultVessel(), mouthDiameter: 600, bellyDiameter: 560, height: 260 };
const dense = { ...hex, stripWidth: 4, gapH: 6 };
const t0 = performance.now();
const r = buildWeave(big, dense, mat);
const dt = performance.now() - t0;
const crossings = r.warpCount * r.weftCount * 3;
console.log(
  `60cm 加密篮: ${r.ribbons.length} 根, 估算交叉点 ~${crossings}, ${dt.toFixed(0)}ms ${dt < 2000 ? '✅ <2s' : '❌'}`,
);

console.log('\n=== 平编改尺寸响应 ===');
for (const mouth of [400, 500, 600]) {
  const v = { ...defaultVessel(), mouthDiameter: mouth };
  const t = performance.now();
  const rr = buildWeave(v, plain, mat);
  console.log(`口径 ${mouth}: ${rr.ribbons.length} 根, ${(performance.now() - t).toFixed(0)}ms`);
}
