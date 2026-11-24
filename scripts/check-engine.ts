declare const process: { exitCode?: number };

import { DEFAULT_MATERIALS, DEFAULT_SHAPES, DEFAULT_WEAVES } from '../src/lib/defaults';
import { generateWeave } from '../src/lib/engine';

const shape = DEFAULT_SHAPES[0];
const material = DEFAULT_MATERIALS[0];

for (const weave of DEFAULT_WEAVES) {
  const result = generateWeave({ shape, weave, material, lossRate: 0.08 });
  console.log(`\n[${weave.name}]`);
  console.log('strips', result.stats.stripCount, 'crossings', result.stats.crossingCount);
  console.log('vertices', result.stats.vertexCount, 'triangles', Math.round(result.stats.triangleCount));
  console.log('buildMs', result.stats.buildMs.toFixed(1), 'centerClear', result.stats.minClearanceCm.toFixed(3), 'patchClear', result.stats.minPatchClearanceCm.toFixed(3), `(${result.stats.checkedPatches} samples)`);
  console.log('danger strips', result.stats.dangerStripCount, 'danger length cm', result.stats.dangerLengthCm.toFixed(1));
  console.log('hex markers', result.stats.hexMarkerCount, 'max err', result.stats.hexMaxAngleErrorDeg.toFixed(1));
  const tight = result.strips.map((s) => ({ id: s.id, tr: s.minTransitionCm, r: s.minRadiusFoundCm })).sort((a, b) => a.tr - b.tr).slice(0, 8);
  console.log('tight transitions', tight.map((x) => `${x.id}:${x.tr.toFixed(2)}/R${x.r.toFixed(2)}`).join(' '));
  const radii = result.strips.map((s) => s.minRadiusFoundCm).sort((a, b) => a - b).slice(0, 8);
  console.log('small radii', radii.map((r) => r.toFixed(2)).join(','));
  if (weave.kind === 'hex') {
    const lowAngles = result.crossings.map((x) => x.angleDeg).sort((a, b) => a - b).slice(0, 10);
    console.log('low angles', lowAngles.map((a) => a.toFixed(1)).join(','));
    console.log('low ids', result.crossings.filter((x) => x.angleDeg < 25).slice(0, 12).map((x) => `${x.id}:${x.kind}:${x.angleDeg.toFixed(1)}`).join(' '));
    for (const s of result.strips.filter((x) => x.family !== 'weft').slice(0, 3)) {
      const ks = [...s.offsetKeys].sort((a, b) => a.d - b.d);
      const gaps = ks.slice(1).map((k, i) => ({ gap: k.d - ks[i].d, id0: ks[i].crossingId, id1: k.crossingId, d0: ks[i].d, d1: k.d, h0: ks[i].holdCm, h1: k.holdCm })).sort((a, b) => a.gap - b.gap).slice(0, 4);
      console.log(s.id, gaps.map((g) => `gap${g.gap.toFixed(2)}@${g.d0.toFixed(1)}/${g.d1.toFixed(1)} ${g.id0}~${g.id1}`).join(' | '));
    }
  }
  const bad = result.warnings.filter((w) => w.level !== 'info');
  if (bad.length) console.log('warnings:', bad.map((w) => w.message));
  if (weave.kind === 'hex') {
    if (result.stats.crossingCount < 1000) {
      console.error(`HEX crossing target failed: ${result.stats.crossingCount} < 1000`);
      process.exitCode = 1;
    }
    if (result.stats.buildMs > 2000) {
      console.error(`Performance target failed: ${result.stats.buildMs}ms > 2000ms`);
      process.exitCode = 1;
    }
    if (result.stats.minClearanceCm < 0.05 || result.stats.minPatchClearanceCm <= 0) {
      console.error('Clearance target failed', {
        center: result.stats.minClearanceCm,
        patch: result.stats.minPatchClearanceCm,
      });
      process.exitCode = 1;
    }
  }
}

const enlarged = { ...shape, points: shape.points.map((p) => ({ ...p, radiusCm: p.radiusCm * 1.18 })) };
const t0 = performance.now();
const again = generateWeave({ shape: enlarged, weave: DEFAULT_WEAVES.find((w) => w.kind === 'hex')!, material, lossRate: 0.08 });
console.log('\n[enlarged hex]', again.stats.crossingCount, 'crossings', again.stats.buildMs.toFixed(1), 'ms (outer', (performance.now() - t0).toFixed(1), 'ms)');

const squareShape = DEFAULT_SHAPES[1];
for (const kind of ['cross', 'hex'] as const) {
  const weave = DEFAULT_WEAVES.find((w) => w.kind === kind)!;
  const squareResult = generateWeave({ shape: squareShape, weave, material, lossRate: 0.08 });
  console.log(`[square-bottom ${kind}]`, squareResult.stats.stripCount, 'strips', squareResult.stats.crossingCount, 'crossings', squareResult.stats.buildMs.toFixed(1), 'ms patch', squareResult.stats.minPatchClearanceCm.toFixed(3));
  if (squareResult.stats.minPatchClearanceCm <= 0) process.exitCode = 1;
}
