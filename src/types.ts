export type ID = string;

export type PageKey = 'shape' | 'weave' | 'material' | 'preview' | 'cutlist';

export type WeaveKind = 'cross' | 'herringbone' | 'hex' | 'chrysanthemum';

export type BambooLayer = 'green' | 'yellow';

export type FinishKind = 'raw' | 'clear-lacquer' | 'red-lacquer' | 'smoked' | 'carbonized';

export type RimKind = 'roll' | 'bind' | 'insert';

export interface ProfilePoint {
  id: ID;
  v: number;
  radiusCm: number;
  square: number;
  role?: 'center' | 'bottom' | 'belly' | 'mouth' | 'extra';
}

export interface ShapeDesign {
  id: ID;
  name: string;
  kind: 'revolved' | 'variable';
  heightCm: number;
  bellyV: number;
  points: ProfilePoint[];
  createdAt: number;
  updatedAt: number;
}

export interface WeaveDesign {
  id: ID;
  name: string;
  kind: WeaveKind;
  rows: number;
  cols: number;
  /** cells[row][col] = true 表示第一族/径向篾在该交叉点在上 */
  cells: boolean[][];
  /** 篾间净距，mm */
  gapMm: number;
  /** 六角孔对边内径，mm；仅 hex */
  hexHoleMm: number;
  /** 菊花底放射篾组数 */
  petalCount?: number;
  updatedAt: number;
}

export interface BambooSpecies {
  id: string;
  name: string;
  /** 最小弯曲半径 = factor * 篾厚 */
  greenFactor: number;
  yellowFactor: number;
  internodeCm: number;
  usableCulmCm: number;
}

export interface MaterialPreset {
  id: ID;
  name: string;
  speciesId: string;
  layer: BambooLayer;
  widthMm: number;
  thicknessMm: number;
  finish: FinishKind;
  /** 为空时按竹种系数和厚度计算 */
  bendRadiusOverrideCm?: number | null;
  updatedAt: number;
}

export interface RimConfig {
  kind: RimKind;
  /** 卷口芯/包边条直径或厚度，mm */
  coreMm: number;
  /** 缠绕篾宽度，mm */
  wrappingWidthMm: number;
  /** 缠绕圈间距，mm */
  wrappingGapMm: number;
}

export interface ProjectDoc {
  id: ID;
  name: string;
  shapeId: ID;
  weaveId: ID;
  materialId: ID;
  rim: RimConfig;
  lossRate: number;
  bambooLengthCm: number;
  showDanger: boolean;
  backlight: boolean;
  updatedAt: number;
}
