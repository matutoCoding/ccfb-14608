import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { RimSpec } from '../types';
import { VesselSurface } from './surface';

/**
 * 口沿收口结构单独建模:
 * - rolled 卷口:沿口沿曲线扫掠一根圆管(竹篾卷成圆箍)
 * - wrapped 包边:宽篾条沿口沿外包一圈,另加等距缠绕扎篾
 * - socket 插口:U 形截面(顶壁+内外壁)插套在口沿
 */
export function buildRimGeometry(surface: VesselSurface, rim: RimSpec, stripThickness: number): THREE.BufferGeometry {
  const N = 240;
  const parts: THREE.BufferGeometry[] = [];
  const mouthPts: THREE.Vector3[] = [];
  const tangents: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];

  for (let i = 0; i < N; i++) {
    const u = (i / N) * Math.PI * 2;
    const p = surface.mouthPoint(u);
    const f = { normal: new THREE.Vector3(), tangentU: new THREE.Vector3() };
    surface.mouthFrame(u, f);
    mouthPts.push(p);
    tangents.push(f.tangentU);
    normals.push(f.normal);
  }

  if (rim.kind === 'rolled') {
    const radius = Math.max(rim.size / 2, stripThickness);
    const tube = sweepCircle(mouthPts, tangents, normals, radius, 12);
    parts.push(tube);
  } else if (rim.kind === 'wrapped') {
    // 主包边篾:覆盖口沿内外侧的扁带
    const band = sweepBand(mouthPts, tangents, normals, rim.size, stripThickness);
    parts.push(band);
    // 缠绕扎篾:沿口沿每 wrapSpacing 一圈螺旋细篾
    const spacing = Math.max(rim.wrapSpacing, 8);
    const turns = Math.round(mouthLength(mouthPts) / spacing);
    const tie = sweepHelix(mouthPts, tangents, normals, turns, Math.max(stripThickness * 0.7, 1.2), rim.size * 0.75);
    parts.push(tie);
  } else {
    // socket 插口:U 形截面,深 = 2.5×口沿直径
    const depth = Math.max(rim.size * 2.5, 18);
    const wall = Math.max(stripThickness, 1);
    const socket = sweepUSocket(mouthPts, tangents, normals, rim.size, depth, wall);
    parts.push(socket);
  }

  const merged = mergeGeometries(parts, false)!;
  merged.computeVertexNormals();
  return merged;
}

function mouthLength(pts: THREE.Vector3[]): number {
  let len = 0;
  for (let i = 0; i < pts.length; i++) len += pts[i].distanceTo(pts[(i + 1) % pts.length]);
  return len;
}

function sweepCircle(
  pts: THREE.Vector3[],
  tangents: THREE.Vector3[],
  normals: THREE.Vector3[],
  radius: number,
  radialSeg: number,
): THREE.BufferGeometry {
  const N = pts.length;
  const positions: number[] = [];
  const normalsOut: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < N; i++) {
    const n = normals[i];
    const b = new THREE.Vector3().crossVectors(tangents[i], n).normalize();
    for (let k = 0; k <= radialSeg; k++) {
      const a = (k / radialSeg) * Math.PI * 2;
      const off = new THREE.Vector3()
        .addScaledVector(n, Math.cos(a) * radius)
        .addScaledVector(b, Math.sin(a) * radius);
      positions.push(pts[i].x + off.x, pts[i].y + off.y, pts[i].z + off.z);
      normalsOut.push(off.x / radius, off.y / radius, off.z / radius);
      uvs.push(i / N, k / radialSeg);
    }
  }
  const row = radialSeg + 1;
  for (let i = 0; i < N; i++) {
    const a = i * row;
    const c = ((i + 1) % N) * row;
    for (let k = 0; k < radialSeg; k++) {
      indices.push(a + k, c + k, a + k + 1, a + k + 1, c + k, c + k + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normalsOut, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  void up;
  return geo;
}

function sweepBand(
  pts: THREE.Vector3[],
  tangents: THREE.Vector3[],
  normals: THREE.Vector3[],
  width: number,
  thickness: number,
): THREE.BufferGeometry {
  const N = pts.length;
  const positions: number[] = [];
  const normalsOut: number[] = [];
  const indices: number[] = [];
  // 截面 4 角(沿法向 × 竖直方向):篾带跨在口沿,中心线略高
  for (let i = 0; i < N; i++) {
    const n = normals[i];
    const b = new THREE.Vector3().crossVectors(tangents[i], n).normalize();
    const center = pts[i].clone().addScaledVector(b, width * 0.15);
    const hw = width / 2;
    const ht = thickness / 2;
    const corners = [
      new THREE.Vector3().copy(center).addScaledVector(b, hw).addScaledVector(n, ht),
      new THREE.Vector3().copy(center).addScaledVector(b, -hw).addScaledVector(n, ht),
      new THREE.Vector3().copy(center).addScaledVector(b, hw).addScaledVector(n, -ht),
      new THREE.Vector3().copy(center).addScaledVector(b, -hw).addScaledVector(n, -ht),
    ];
    for (const c of corners) {
      positions.push(c.x, c.y, c.z);
      normalsOut.push(n.x, n.y, n.z);
    }
  }
  for (let i = 0; i < N; i++) {
    const a = i * 4;
    const c = ((i + 1) % N) * 4;
    indices.push(a, c, a + 1, a + 1, c, c + 1);
    indices.push(a + 2, a + 3, c + 2, a + 3, c + 3, c + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normalsOut, 3));
  geo.setIndex(indices);
  return geo;
}

function sweepHelix(
  pts: THREE.Vector3[],
  tangents: THREE.Vector3[],
  normals: THREE.Vector3[],
  turns: number,
  radius: number,
  bandHalfWidth: number,
): THREE.BufferGeometry {
  const steps = pts.length;
  const positions: number[] = [];
  const normalsOut: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const idx = i % pts.length;
    const phase = (i / steps) * turns * Math.PI * 2;
    const n = normals[idx];
    const b = new THREE.Vector3().crossVectors(tangents[idx], n).normalize();
    const center = pts[idx]
      .clone()
      .addScaledVector(b, Math.sin(phase) * bandHalfWidth)
      .addScaledVector(n, Math.cos(phase) * bandHalfWidth * 0.4 + radius);
    const side = tangents[idx].clone().multiplyScalar(radius * 0.8);
    const p1 = center.clone().sub(side);
    const p2 = center.clone().add(side);
    positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    normalsOut.push(n.x, n.y, n.z, n.x, n.y, n.z);
  }
  for (let i = 0; i < steps; i++) {
    indices.push(i * 2, (i + 1) * 2, i * 2 + 1, i * 2 + 1, (i + 1) * 2, (i + 1) * 2 + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normalsOut, 3));
  geo.setIndex(indices);
  return geo;
}

function sweepUSocket(
  pts: THREE.Vector3[],
  tangents: THREE.Vector3[],
  normals: THREE.Vector3[],
  size: number,
  depth: number,
  wall: number,
): THREE.BufferGeometry {
  const N = pts.length;
  const positions: number[] = [];
  const normalsOut: number[] = [];
  const indices: number[] = [];
  // U 截面(沿 b 法向平面):外壁 → 顶 → 内壁,共 6 个角
  for (let i = 0; i < N; i++) {
    const n = normals[i];
    const b = new THREE.Vector3().crossVectors(tangents[i], n).normalize();
    const top = pts[i].clone().addScaledVector(b, wall);
    const rOut = size / 2 + wall;
    const rIn = size / 2;
    const corners = [
      new THREE.Vector3().copy(top).addScaledVector(n, rOut).addScaledVector(b, 0),
      new THREE.Vector3().copy(top).addScaledVector(n, rOut).addScaledVector(b, -depth),
      new THREE.Vector3().copy(top).addScaledVector(n, rIn).addScaledVector(b, 0),
      new THREE.Vector3().copy(top).addScaledVector(n, rIn).addScaledVector(b, -depth),
    ];
    for (const c of corners) {
      positions.push(c.x, c.y, c.z);
      normalsOut.push(n.x, n.y, n.z);
    }
  }
  for (let i = 0; i < N; i++) {
    const a = i * 4;
    const c = ((i + 1) % N) * 4;
    // 外壁 0-1、内壁 2-3、顶面 0-2
    indices.push(a, a + 1, c, a + 1, c + 1, c);
    indices.push(a + 2, c + 2, a + 3, a + 3, c + 2, c + 3);
    indices.push(a, c, a + 2, a + 2, c, c + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normalsOut, 3));
  geo.setIndex(indices);
  return geo;
}
