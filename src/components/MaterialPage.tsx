import { useStore } from '../data/store';
import type { BambooSpecies, Finish, StripLayer } from '../types';
import { Button, Card, Field, NumberInput, Select, TextInput } from './controls';

const SPECIES: BambooSpecies[] = ['毛竹', '水竹', '慈竹', '淡竹'];
const LAYERS: StripLayer[] = ['青篾', '黄篾'];
const FINISHES: Finish[] = ['本色', '上漆', '烟熏碳化'];

// 竹种经验弯曲系数(最小弯曲半径 / 篾厚),青篾优于黄篾
const SPECIES_BEND: Record<BambooSpecies, number> = {
  毛竹: 120,
  水竹: 100,
  慈竹: 85,
  淡竹: 95,
};

export function MaterialPage() {
  const { materials, activeProject, saveMaterial, createMaterial, remove, setActiveProject } =
    useStore();
  const mat = materials.find((m) => m.id === activeProject?.materialId);
  if (!mat) return <div className="empty">暂无篾料</div>;

  const update = (patch: Partial<typeof mat>) =>
    void saveMaterial({ ...mat, ...patch });

  return (
    <div className="sidebar">
      <Card title="篾料库">
        <div className="entity-list">
          {materials.map((m) => (
            <div
              key={m.id}
              className={`entity-item ${m.id === mat.id ? 'active' : ''}`}
              onClick={() =>
                activeProject &&
                setActiveProject({ ...activeProject, materialId: m.id })
              }
            >
              <div>
                <div className="name">{m.name}</div>
                <div className="sub">
                  {m.species} · {m.layer} · {m.finish}
                </div>
              </div>
              <Button
                variant="danger"
                onClick={(e) => {
                  e.stopPropagation();
                  if (materials.length > 1) void remove('materials', m.id);
                }}
              >
                删
              </Button>
            </div>
          ))}
        </div>
        <Button
          onClick={async () => {
            const m = await createMaterial();
            if (activeProject)
              setActiveProject({ ...activeProject, materialId: m.id });
          }}
        >
          新建篾料
        </Button>
      </Card>

      <Card title="竹材属性">
        <Field label="名称">
          <TextInput value={mat.name} onChange={(name) => update({ name })} />
        </Field>
        <div className="row2">
          <Field label="竹种">
            <Select
              value={mat.species}
              options={SPECIES.map((s) => ({ value: s, label: s }))}
              onChange={(species) =>
                update({ species, bendFactor: SPECIES_BEND[species] })
              }
            />
          </Field>
          <Field label="篾层">
            <Select
              value={mat.layer}
              options={LAYERS.map((s) => ({ value: s, label: s }))}
              onChange={(layer) => update({ layer })}
            />
          </Field>
        </div>
        <Field label="表面处理">
          <Select
            value={mat.finish}
            options={FINISHES.map((s) => ({ value: s, label: s }))}
            onChange={(finish) => update({ finish })}
          />
        </Field>
      </Card>

      <Card title="弯曲极限(防折)">
        <Field
          label={`弯曲系数 ×篾厚 = 最小弯曲半径(当前 ${Math.round(
            mat.bendFactor,
          )} 倍)`}
        >
          <NumberInput
            value={mat.bendFactor}
            min={30}
            max={200}
            onChange={(bendFactor) => update({ bendFactor })}
          />
        </Field>
        <div className="legend">
          {SPECIES.map((s) => (
            <span key={s}>
              {s} {SPECIES_BEND[s]}×
            </span>
          ))}
        </div>
        <p className="unit" style={{ lineHeight: 1.6 }}>
          篾片任一段弯曲半径低于该值即判为会折,三维模型上整段标红,并在状态栏汇总。
        </p>
      </Card>

      <Card title="出材参数(备料用)">
        <div className="row2">
          <Field label="节距" unit="mm">
            <NumberInput
              value={mat.poleInternode}
              min={80}
              onChange={(poleInternode) => update({ poleInternode })}
            />
          </Field>
          <Field label="可用节间数">
            <NumberInput
              value={mat.internodesPerPole}
              min={1}
              max={12}
              onChange={(internodesPerPole) => update({ internodesPerPole })}
            />
          </Field>
        </div>
        <div className="row2">
          <Field label="节间有效宽" unit="mm">
            <NumberInput
              value={mat.poleUsableWidth}
              min={30}
              onChange={(poleUsableWidth) => update({ poleUsableWidth })}
            />
          </Field>
          <Field label="损耗率" unit="%">
            <NumberInput
              value={Math.round(mat.wasteRate * 100)}
              min={0}
              max={40}
              onChange={(p) => update({ wasteRate: p / 100 })}
            />
          </Field>
        </div>
      </Card>
    </div>
  );
}
