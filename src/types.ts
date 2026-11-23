// 全局领域类型。长度单位统一毫米(mm),角度弧度。
export type Vec3 = [number, number, number];

/** 器型:回转(变截面)体 */
export interface VesselSpec {
  id: string;
  name: string;
  height: number; // 总高 H
  mouthDiameter: number; // 口径
  bellyDiameter: number; // 腹径
  bottomDiameter: number; // 底径
  bellyT: number; // 腹径所在高度比例 0~1
  bottomExponent: number; // 底截面超椭圆指数:2=圆,4≈方,越大越方
  mouthExponent: number; // 口截面指数
  radialSegments: number; // 周向采样
  heightSegments: number; // 高度采样
}

export type WeaveFamily = 'plain' | 'twill' | 'herringbone' | 'hex';
export type BaseStyle = 'chrysanthemum' | 'plain';
export type RimType = 'roll' | 'wrap' | 'socket' | 'none';

/** 编法 */
export interface WeaveSpec {
  id: string;
  name: string;
  family: WeaveFamily;
  baseStyle: BaseStyle;
  rimType: RimType;
  stripWidth: number; // 篾宽 w
  stripThickness: number; // 篾厚 t
  gapH: number; // 经向(周向)间隙
  gapV: number; // 纬向(高度)间隙
  // 挑压格子图:行=纬圈,列=经篾;1=纬压经(纬在上),0=经压纬
  patternRows: number;
  patternCols: number;
  pattern: number[][];
  // 六角孔:三组篾各自的挑压循环(1=上挑),长度即循环节
  hexCycle: number[];
  hexTolerance: number; // 正六边形畸变容差(边长不均/角度偏差)
  baseSpokes: number; // 菊花底辐条(经篾)数,偶数
  baseRingCount: number; // 底圈纬环数
  rimWidth: number; // 收口篾宽
  rimThickness: number; // 收口篾厚
}

export type BambooSpecies = '毛竹' | '水竹' | '慈竹' | '淡竹';
export type StripLayer = '青篾' | '黄篾';
export type Finish = '本色' | '上漆' | '烟熏碳化';

/** 篾料 */
export interface MaterialSpec {
  id: string;
  name: string;
  species: BambooSpecies;
  layer: StripLayer;
  finish: Finish;
  bendFactor: number; // 最小弯曲半径 = bendFactor × 篾厚
  poleInternode: number; // 节距(单个节间长度)mm
  poleUsableWidth: number; // 单节间可剖篾有效宽度 mm
  internodesPerPole: number; // 一根竹子可用节间数
  wasteRate: number; // 备料损耗率 0~1
}

export interface ProjectSpec {
  id: string;
  name: string;
  vesselId: string;
  weaveId: string;
  materialId: string;
  updatedAt: number;
}

export type RibbonRole =
  | 'warp'
  | 'weft'
  | 'hexStrip'
  | 'spoke'
  | 'baseRing'
  | 'rim';

export interface HexIssue {
  center: Vec3;
  edgeDeviation: number; // 边长相对偏差
  angleDeviation: number; // 角度偏离 120°(度)
  strain: number; // 周长方向拉伸/压缩率
}

export interface BuildWarning {
  level: 'error' | 'warn' | 'info';
  message: string;
}

/** 单根篾片的带状盒几何(每采样环 4 角点 × 厚向) */
export interface RibbonMeshData {
  id: number;
  order: number; // 编织顺序序号(回放用)
  role: RibbonRole;
  label: string;
  stripWidth: number;
  stripThickness: number;
  length: number; // 中心线弧长
  minBendRadius: number; // 本段最小弯曲半径
  bendViolations: number; // 超限采样点数
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

export interface BuildResult {
  ribbons: RibbonMeshData[];
  hexIssues: HexIssue[];
  warnings: BuildWarning[];
  warpCount: number;
  weftCount: number;
  timingMs: number;
}
