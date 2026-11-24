// 竹编设计系统核心类型 —— 所有持久化数据的结构定义
// 长度单位统一为毫米(mm),角度为度(deg)

export type ID = string;

/** 超椭圆截面形状指数:2 = 椭圆/圆,<2 偏方(1=矩形圆角),>2 趋向正多边形 */
export interface CrossSection {
  /** 0..1 的高度位置(归一化) */
  t: number;
  /** 该处直径(mm) */
  diameter: number;
  /** 超椭圆指数:1 近方角,2 椭圆,越大越接近正多边形 */
  superN: number;
}

export interface VesselProfile {
  id: ID;
  name: string;
  /** 口径 mm */
  mouthDiameter: number;
  /** 腹径 mm */
  bellyDiameter: number;
  /** 底径 mm */
  baseDiameter: number;
  /** 高度 mm */
  height: number;
  /** 腹径所在高度比例 0..1(默认 0.55) */
  bellyTRatio: number;
  /** 口部截面指数 */
  mouthSuperN: number;
  /** 底部截面指数 */
  baseSuperN: number;
  /** 自定义截面控制点(可空,空则按口/腹/底自动生成) */
  sections: CrossSection[];
  createdAt: number;
  updatedAt: number;
}

export type WeaveKind = 'cross' | 'herringbone' | 'hex' | 'chrysanthemum';

/** 挑压格子图:1 = 挑(本篾在上),0 = 压(本篾在下)。行=纬向周期,列=经向周期 */
export interface WeavePattern {
  id: ID;
  name: string;
  kind: WeaveKind;
  /** 挑压矩阵(周期单元),height 行 × width 列 */
  matrix: number[][];
  /** 六角孔编专用:目标六边形对边距 mm(= 孔心间距) */
  hexCellSize?: number;
  /** 菊花底专用:放射篾根数(偶数) */
  chrysanthemumSpokes?: number;
  /** 备注 */
  note: string;
  createdAt: number;
  updatedAt: number;
}

export type BambooLayer = 'green' | 'yellow';
export type FinishKind = 'raw' | 'lacquer' | 'smoke';

export interface StripMaterial {
  id: ID;
  name: string;
  /** 青篾 / 黄篾 */
  layer: BambooLayer;
  /** 篾宽 mm */
  width: number;
  /** 篾厚 mm */
  thickness: number;
  /** 竹种 */
  bambooSpecies: string;
  /** 表面处理 */
  finish: FinishKind;
  /** 备料损耗余量 % */
  wastePercent: number;
  createdAt: number;
  updatedAt: number;
}

/** 竹种弯曲参数 */
export interface BambooSpecies {
  id: ID;
  name: string;
  /** 最小弯曲半径 = 系数 × 篾厚 */
  minBendRadiusFactor: number;
  /** 常见节距 mm(节与节之间的平均长度) */
  nodeSpacing: number;
  /** 单根可用长度 mm */
  culmLength: number;
  /** 竹杆可用直径 mm(算一根竹子能剖多少篾) */
  culmDiameter: number;
}

export type RimKind = 'rolled' | 'wrapped' | 'socket';

export interface RimSpec {
  kind: RimKind;
  /** 卷口直径 / 包边宽度 mm */
  size: number;
  /** 包边缠绕间距 mm(wrapped 用) */
  wrapSpacing: number;
}

/** 一个完整的编织设计方案 */
export interface DesignDoc {
  id: ID;
  name: string;
  profileId: ID;
  patternId: ID;
  materialId: ID;
  rim: RimSpec;
  /** 整体缩放倍率(改口径时联动) */
  scale: number;
  createdAt: number;
  updatedAt: number;
}

/** 六角孔失真/保持不住的位置 */
export interface DistortionMark {
  position: [number, number, number];
  /** 实测六边形两方向间距比,1 为正六边形 */
  aspectRatio: number;
  /** 角度偏差(度) */
  angleErrorDeg: number;
}

/** 弯曲超限段 */
export interface BendViolation {
  stripIndex: number;
  family: number;
  /** 超限段中心 */
  position: [number, number, number];
  /** 实测半径 mm */
  radius: number;
  /** 允许的最小半径 mm */
  minRadius: number;
}

/** 备料单中的一根篾 */
export interface MaterialLine {
  index: number;
  family: number;
  length: number;
  width: number;
  thickness: number;
  quantity: number;
  /** 含损耗的下料长度 */
  cutLength: number;
}

export interface MaterialBill {
  lines: MaterialLine[];
  totalStrips: number;
  /** 每根竹子能出的篾根数(按节距) */
  stripsPerCulm: number;
  /** 需要竹子根数 */
  culmsNeeded: number;
  species: BambooSpecies;
  wastePercent: number;
}

/** 编织回放步骤 */
export interface WeaveStep {
  index: number;
  /** 本步加入的篾在总篾表中的序号(第几根篾,1 起) */
  stripOrdinal: number;
  family: number;
  label: string;
}
