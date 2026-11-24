import Dexie, { type Table } from 'dexie';
import { DEFAULT_MATERIALS, DEFAULT_WEAVES, DEFAULT_SHAPES } from './lib/defaults';
import type { MaterialPreset, ProjectDoc, ShapeDesign, WeaveDesign } from './types';

export class StudioDatabase extends Dexie {
  shapes!: Table<ShapeDesign, string>;
  weaves!: Table<WeaveDesign, string>;
  materials!: Table<MaterialPreset, string>;
  project!: Table<ProjectDoc, string>;

  constructor() {
    super('bamboo-weave-studio');
    this.version(1).stores({
      shapes: 'id,name,updatedAt',
      weaves: 'id,kind,name,updatedAt',
      materials: 'id,name,layer,updatedAt',
      project: 'id',
    });
  }
}

export const db = new StudioDatabase();

const DEFAULT_PROJECT: ProjectDoc = {
  id: 'current',
  name: '40cm 六角孔果篮',
  shapeId: 'shape_hex_fruit_basket_40',
  weaveId: 'weave_hex',
  materialId: 'mat_green_maozhu_6',
  rim: { kind: 'roll', coreMm: 9, wrappingWidthMm: 3, wrappingGapMm: 4 },
  lossRate: 0.08,
  bambooLengthCm: 600,
  showDanger: true,
  backlight: true,
  updatedAt: Date.now(),
};

export async function ensureSeedData(): Promise<void> {
  const shapeCount = await db.shapes.count();
  if (shapeCount === 0) await db.shapes.bulkAdd(DEFAULT_SHAPES);

  const weaveCount = await db.weaves.count();
  if (weaveCount === 0) await db.weaves.bulkAdd(DEFAULT_WEAVES);

  const materialCount = await db.materials.count();
  if (materialCount === 0) await db.materials.bulkAdd(DEFAULT_MATERIALS);

  const project = await db.project.get('current');
  if (!project) await db.project.put(DEFAULT_PROJECT);
}

export async function saveProjectPatch(patch: Partial<ProjectDoc>): Promise<void> {
  const current = await db.project.get('current');
  const next: ProjectDoc = {
    ...(current ?? DEFAULT_PROJECT),
    ...patch,
    id: 'current',
    updatedAt: Date.now(),
  };
  await db.project.put(next);
}
