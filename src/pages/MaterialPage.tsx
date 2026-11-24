import { useState } from 'react';
import type { BambooLayer, BambooSpecies, FinishKind, StripMaterial } from '../types';
import { uid } from '../db/indexeddb';
import { useStore } from '../state/store';
import { Button, Card, Field, NumberInput, Select } from '../components/ui';

const LAYER_LABEL: Record<BambooLayer, string> = { green: '青篾(竹青面)', yellow: '黄篾(竹黄纤维)' };
const FINISH_LABEL: Record<FinishKind, string> = { raw: '本色', lacquer: '上漆', smoke: '烟熏碳化' };

function blankMaterial(speciesName: string): StripMaterial {
  const t = Date.now();
  return {
    id: uid('mat'),
    name: '新篾料',
    layer: 'green',
    width: 6,
    thickness: 1.2,
    bambooSpecies: speciesName,
    finish: 'raw',
    wastePercent: 12,
    createdAt: t,
    updatedAt: t,
  };
}

export function MaterialPage() {
  const { materials, species, saveMaterial, removeMaterial, select, selectedMaterialId, selectedSpeciesId } = useStore();
  const selected = materials.find((x) => x.id === selectedMaterialId) ?? materials[0];
  const activeSpecies = species.find((x) => x.id === selectedSpeciesId) ?? species[0];
  const [draft, setDraft] = useState<StripMaterial | null>(null);
  const m = draft ?? selected;
  if (!m) return <div className="empty">暂无篾料</div>;

  const update = (patch: Partial<StripMaterial>) => setDraft({ ...m, ...patch });
  const minR = activeSpecies ? activeSpecies.minBendRadiusFactor * m.thickness : 0;

  return (
    <div className="page-grid">
      <Card title="篾料库">
        <div className="item-list">
          {materials.map((x) => (
            <div
              key={x.id}
              className={`item ${x.id === m.id ? 'active' : ''}`}
              onClick={() => {
                setDraft(null);
                select('material', x.id);
              }}
            >
              <span>{x.name}</span>
              <button
                className="link-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  removeMaterial(x.id);
                }}
              >
                删
              </button>
            </div>
          ))}
        </div>
        <Button primary onClick={() => {
          const v = blankMaterial(activeSpecies?.name ?? '毛竹');
          saveMaterial(v);
          setDraft(v);
          select('material', v.id);
        }}>
          新建篾料
        </Button>
      </Card>

      <Card title="篾片规格">
        <div className="form-grid">
          <Field label="名称">
            <input className="select" value={m.name} onChange={(e) => update({ name: e.target.value })} />
          </Field>
          <Field label="篾层">
            <Select
              value={m.layer}
              onChange={(layer) => update({ layer })}
              options={(Object.keys(LAYER_LABEL) as BambooLayer[]).map((k) => ({ value: k, label: LAYER_LABEL[k] }))}
            />
          </Field>
          <Field label="真实宽度">
            <NumberInput value={m.width} min={1} max={40} step={0.1} onChange={(v) => update({ width: v })} unit="mm" />
          </Field>
          <Field label="真实厚度">
            <NumberInput value={m.thickness} min={0.3} max={6} step={0.1} onChange={(v) => update({ thickness: v })} unit="mm" />
          </Field>
          <Field label="竹种">
            <Select
              value={m.bambooSpecies}
              onChange={(bambooSpecies) => update({ bambooSpecies })}
              options={species.map((s) => ({ value: s.name, label: s.name }))}
            />
          </Field>
          <Field label="表面处理">
            <Select
              value={m.finish}
              onChange={(finish) => update({ finish })}
              options={(Object.keys(FINISH_LABEL) as FinishKind[]).map((k) => ({ value: k, label: FINISH_LABEL[k] }))}
            />
          </Field>
          <Field label="备料损耗余量">
            <NumberInput value={m.wastePercent} min={0} max={60} onChange={(v) => update({ wastePercent: v })} unit="%" />
          </Field>
        </div>
        {activeSpecies && (
          <div className="info-box">
            当前厚度 {m.thickness}mm × 系数 {activeSpecies.minBendRadiusFactor} →
            <strong> 最小弯曲半径 {minR.toFixed(1)} mm</strong>,模型中小于该半径的篾段标红。
          </div>
        )}
        <div className="btn-row end">
          <Button
            primary
            onClick={async () => {
              await saveMaterial(m);
              setDraft(null);
              select('material', m.id);
            }}
          >
            保存
          </Button>
        </div>
      </Card>

      <Card title="竹种弯曲与出材参数">
        <SpeciesEditor species={activeSpecies} all={species} />
      </Card>
    </div>
  );
}

function SpeciesEditor({ species, all }: { species?: BambooSpecies; all: BambooSpecies[] }) {
  const { select, selectedSpeciesId } = useStore();
  const [local, setLocal] = useState<BambooSpecies | null>(null);
  const s = local ?? species;
  if (!s) return null;
  const update = (patch: Partial<BambooSpecies>) => setLocal({ ...s, ...patch });

  return (
    <>
      <Field label="选择竹种">
        <Select
          value={selectedSpeciesId}
          onChange={(id) => {
            setLocal(null);
            select('species', id);
          }}
          options={all.map((x) => ({ value: x.id, label: x.name }))}
        />
      </Field>
      <div className="form-grid">
        <Field label="最小弯曲半径系数" hint="Rmin = 系数 × 篾厚">
          <NumberInput value={s.minBendRadiusFactor} min={4} max={40} step={1} onChange={(v) => update({ minBendRadiusFactor: v })} />
        </Field>
        <Field label="节距">
          <NumberInput value={s.nodeSpacing} min={80} max={500} step={10} onChange={(v) => update({ nodeSpacing: v })} unit="mm" />
        </Field>
        <Field label="竹杆可用长度">
          <NumberInput value={s.culmLength} min={1000} max={15000} step={100} onChange={(v) => update({ culmLength: v })} unit="mm" />
        </Field>
        <Field label="竹杆直径">
          <NumberInput value={s.culmDiameter} min={30} max={200} step={5} onChange={(v) => update({ culmDiameter: v })} unit="mm" />
        </Field>
      </div>
      <div className="btn-row end">
        <Button
          primary
          onClick={async () => {
            const { idbPut } = await import('../db/indexeddb');
            await idbPut('species', s);
            useStore.setState((st) => ({ species: st.species.map((x) => (x.id === s.id ? s : x)) }));
            setLocal(null);
          }}
        >
          保存竹种
        </Button>
      </div>
    </>
  );
}
