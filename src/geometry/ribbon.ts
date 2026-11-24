import * as THREE from 'three';

/** 一条篾的采样中心线(已映射到曲面,含挑压抬升) */
export interface StripSample {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  widthAxis: THREE.Vector3;
  lift: number;
  bendBad: boolean;
}

export interface StripGeometryData {
  ordinal: number;
  family: number;
  label: string;
  width: number;
  thickness: number;
  length: number;
  samples: StripSample[];
}

/**
 * 三点圆的外接圆半径(3D):R = abc / (4·三角形面积)
 * 共线时返回 Infinity
 */
export function circumRadius(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): number {
  const ab = a.distanceTo(b);
  const bc = b.distanceTo(c);
  const ca = c.distanceTo(a);
  const cross = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  const area = cross.length() / 2;
  if (area < 1e-9) return Infinity;
  return (ab * bc * ca) / (4 * area);
}

/**
 * 把一条篾生成闭合截面的带状 BufferGeometry(带厚度的长方体柔韧条)
 * 截面四角: ±宽向(w/2) × 法向(lift ± t/2)
 * 顶点色:正常白(由材质贴图染色),超限段红
 */
export function buildRibbonGeometry(strip: StripGeometryData): THREE.BufferGeometry {
  const n = strip.samples.length;
  const vertCount = n * 4;
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const colors = new Float32Array(vertCount * 3);

  const hw = strip.width / 2;
  const ht = strip.thickness / 2;
  const tmp = new THREE.Vector3();

  for (let i = 0; i < n; i++) {
    const s = strip.samples[i];
    const base = tmp.copy(s.position).addScaledVector(s.normal, s.lift);
    // 4 个角点:0 左上,1 右上,2 左下,3 右下(沿宽度方向看)
    const corners = [
      new THREE.Vector3().copy(base).addScaledVector(s.widthAxis, -hw).addScaledVector(s.normal, ht),
      new THREE.Vector3().copy(base).addScaledVector(s.widthAxis, hw).addScaledVector(s.normal, ht),
      new THREE.Vector3().copy(base).addScaledVector(s.widthAxis, -hw).addScaledVector(s.normal, -ht),
      new THREE.Vector3().copy(base).addScaledVector(s.widthAxis, hw).addScaledVector(s.normal, -ht),
    ];
    for (let k = 0; k < 4; k++) {
      const vi = i * 4 + k;
      positions[vi * 3] = corners[k].x;
      positions[vi * 3 + 1] = corners[k].y;
      positions[vi * 3 + 2] = corners[k].z;
      normals[vi * 3] = s.normal.x;
      normals[vi * 3 + 1] = s.normal.y;
      normals[vi * 3 + 2] = s.normal.z;
      // U 横跨篾宽(纤维沿 V 方向)
      uvs[vi * 2] = k === 0 || k === 2 ? 0 : 1;
      uvs[vi * 2 + 1] = (i / (n - 1)) * (strip.length / 40); // 纹理按 40mm 周期
      const r = s.bendBad ? 1 : 1;
      const g = s.bendBad ? 0.12 : 1;
      const b = s.bendBad ? 0.12 : 1;
      colors[vi * 3] = r;
      colors[vi * 3 + 1] = g;
      colors[vi * 3 + 2] = b;
    }
  }

  const indices: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    // 顶面 0-1 / 底面 2-3
    indices.push(a, b, a + 1, a + 1, b, b + 1);
    indices.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
    // 左侧 0-2 / 右侧 1-3
    indices.push(a, a + 2, b, a + 2, b + 2, b);
    indices.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3);
  }
  // 两端封口
  indices.push(0, 1, 2, 1, 3, 2);
  const e = (n - 1) * 4;
  indices.push(e, e + 2, e + 1, e + 1, e + 2, e + 3);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * 挑压抬升:交叉点处严格 ±t/2(over=上,under=下),
 * 相邻交叉之间用半波余弦平滑过渡。两篾在同一交叉点抬升相反,
 * 法向中心线间距严格等于一个篾厚 → 表面相切、不穿模。
 */
export function stepWaveLift(s: number, crossings: { s: number; over: boolean }[], thickness: number): number {
  if (!crossings.length) return 0;
  const half = thickness / 2;
  const value = (c: { over: boolean }) => (c.over ? half : -half);
  if (s <= crossings[0].s) {
    // 端点外平缓衰减到 0,避免口沿/底边突变
    const d = crossings[0].s - s;
    return value(crossings[0]) * Math.max(0, 1 - d / (thickness * 4));
  }
  const last = crossings[crossings.length - 1];
  if (s >= last.s) {
    const d = s - last.s;
    return value(last) * Math.max(0, 1 - d / (thickness * 4));
  }
  let i = 0;
  while (i < crossings.length - 1 && crossings[i + 1].s < s) i++;
  const c0 = crossings[i];
  const c1 = crossings[i + 1];
  const v0 = value(c0);
  const v1 = value(c1);
  const span = Math.max(1e-9, c1.s - c0.s);
  const f = (s - c0.s) / span;
  // 余弦缓动:两端导数为 0,过渡光滑
  const w = 0.5 - 0.5 * Math.cos(f * Math.PI);
  return v0 + (v1 - v0) * w;
}
