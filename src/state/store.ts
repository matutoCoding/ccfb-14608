import { create } from 'zustand';
import { idbAll, idbBulkPut, idbDelete, idbPut } from '../db/indexeddb';
import { defaultMaterials, defaultPatterns, defaultProfiles, defaultSpecies } from '../db/defaults';
import type {
  BambooSpecies,
  DesignDoc,
  RimSpec,
  StripMaterial,
  VesselProfile,
  WeavePattern,
} from '../types';

export type PageKey = 'profile' | 'pattern' | 'material' | 'viewer' | 'bill';

interface AppState {
  ready: boolean;
  page: PageKey;
  profiles: VesselProfile[];
  patterns: WeavePattern[];
  materials: StripMaterial[];
  species: BambooSpecies[];
  designs: DesignDoc[];
  selectedProfileId: string;
  selectedPatternId: string;
  selectedMaterialId: string;
  selectedSpeciesId: string;
  rim: RimSpec;
  backlight: boolean;
  hydrated: () => Promise<void>;
  setPage: (p: PageKey) => void;
  saveProfile: (p: VesselProfile) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;
  savePattern: (p: WeavePattern) => Promise<void>;
  removePattern: (id: string) => Promise<void>;
  saveMaterial: (m: StripMaterial) => Promise<void>;
  removeMaterial: (id: string) => Promise<void>;
  select: (kind: 'profile' | 'pattern' | 'material' | 'species', id: string) => void;
  setRim: (r: RimSpec) => void;
  setBacklight: (v: boolean) => void;
}

export const useStore = create<AppState>((set, get) => ({
  ready: false,
  page: 'viewer',
  profiles: [],
  patterns: [],
  materials: [],
  species: [],
  designs: [],
  selectedProfileId: 'profile_guolan',
  selectedPatternId: 'pattern_hex',
  selectedMaterialId: 'mat_green_6',
  selectedSpeciesId: 'species_moso',
  rim: { kind: 'rolled', size: 8, wrapSpacing: 12 },
  backlight: false,

  hydrated: async () => {
    let profiles = await idbAll<VesselProfile>('profiles');
    let patterns = await idbAll<WeavePattern>('patterns');
    let materials = await idbAll<StripMaterial>('materials');
    let species = await idbAll<BambooSpecies>('species');
    const designs = await idbAll<DesignDoc>('designs');
    if (!profiles.length) {
      profiles = defaultProfiles();
      patterns = defaultPatterns();
      materials = defaultMaterials();
      species = defaultSpecies();
      await idbBulkPut('profiles', profiles);
      await idbBulkPut('patterns', patterns);
      await idbBulkPut('materials', materials);
      await idbBulkPut('species', species);
    }
    set({
      ready: true,
      profiles,
      patterns,
      materials,
      species,
      designs,
      selectedProfileId: profiles[0]?.id ?? '',
      selectedPatternId: patterns.find((p) => p.kind === 'hex')?.id ?? patterns[0]?.id ?? '',
      selectedMaterialId: materials[0]?.id ?? '',
      selectedSpeciesId: species[0]?.id ?? '',
    });
  },

  setPage: (page) => set({ page }),

  saveProfile: async (p) => {
    const v = { ...p, updatedAt: Date.now() };
    await idbPut('profiles', v);
    set((s) => ({ profiles: [v, ...s.profiles.filter((x) => x.id !== v.id)] }));
  },
  removeProfile: async (id) => {
    await idbDelete('profiles', id);
    set((s) => ({ profiles: s.profiles.filter((x) => x.id !== id) }));
  },
  savePattern: async (p) => {
    const v = { ...p, updatedAt: Date.now() };
    await idbPut('patterns', v);
    set((s) => ({ patterns: [v, ...s.patterns.filter((x) => x.id !== v.id)] }));
  },
  removePattern: async (id) => {
    await idbDelete('patterns', id);
    set((s) => ({ patterns: s.patterns.filter((x) => x.id !== id) }));
  },
  saveMaterial: async (m) => {
    const v = { ...m, updatedAt: Date.now() };
    await idbPut('materials', v);
    set((s) => ({ materials: [v, ...s.materials.filter((x) => x.id !== v.id)] }));
  },
  removeMaterial: async (id) => {
    await idbDelete('materials', id);
    set((s) => ({ materials: s.materials.filter((x) => x.id !== id) }));
  },
  select: (kind, id) => {
    if (kind === 'profile') set({ selectedProfileId: id });
    if (kind === 'pattern') set({ selectedPatternId: id });
    if (kind === 'material') set({ selectedMaterialId: id });
    if (kind === 'species') set({ selectedSpeciesId: id });
  },
  setRim: (rim) => set({ rim }),
  setBacklight: (backlight) => set({ backlight }),
}));

export function useSelectedDesign() {
  const s = useStore();
  const profile = s.profiles.find((p) => p.id === s.selectedProfileId);
  const pattern = s.patterns.find((p) => p.id === s.selectedPatternId);
  const material = s.materials.find((m) => m.id === s.selectedMaterialId);
  const species = s.species.find((x) => x.id === s.selectedSpeciesId);
  return { profile, pattern, material, species, rim: s.rim };
}
