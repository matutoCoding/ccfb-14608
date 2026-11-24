import { useMemo } from 'react';
import { NumberInput } from '../components/NumberInput';
import { db, saveProjectPatch } from '../db';
import { SPECIES, minBendRadiusCm } from '../lib/defaults';
import { materialSwatchUrl } from '../lib/material3d';
import { uid } from '../lib/vec';
import type { FinishKind, MaterialPreset, ProjectDoc } from '../types';

interface MaterialPageProps {
  materials: MaterialPreset[];
  current: MaterialPreset;
  project: ProjectDoc;
}

const FINISH_NAMES: Record<FinishKind, string> = {
  raw: '生篾/本色',
  'clear-lacquer': '透明清漆',
  'red-lacquer': '红漆',
  smoked: '烟熏',
  carbonized: '高温碳化',
};

export function MaterialPage({ materials, current, project }: MaterialPageProps) {
  const minRadius = minBendRadiusCm(current);
  const swatch = useMemo(() => materialSwatchUrl(current), [current]);

  function patch(p: Partial<MaterialPreset>) {
    void db.materials.put({ ...current, ...p, updatedAt: Date.now() });
  }

  async function createMaterial() {
    const copy: MaterialPreset = { ...current, id: uid('mat'), name: `${current.name} 副本`, updatedAt: Date.now() };
    await db.materials.put(copy);
    await saveProjectPatch({ materialId: copy.id });
  }

  async function removeMaterial() {
    if (materials.length <= 1) return;
    if (!window.confirm(`删除篾料“${current.name}”？`)) return;
    await db.materials.delete(current.id);
    const next = materials.find((m) => m.id !== current.id);
    if (next) await saveProjectPatch({ materialId: next.id });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>篾料与表面</h2>
          <p>按真实宽厚生成带状截面；竹青高光、篾黄纤维、漆/烟熏/碳化颜色由程序化 Canvas 纹理生成，UV 的 U 向始终顺篾片长度。</p>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={createMaterial}>复制篾料</button>
          <button className="btn danger" disabled={materials.length <= 1} onClick={removeMaterial}>删除</button>
        </div>
      </div>

      <div className="layout-grid">
        <div>
          <section className="panel">
            <h3>当前篾料</h3>
            <div className="swatch-row">
              <img className="swatch" src={swatch} alt="竹材纹理预览" />
              <div className="form-grid">
                <div className="field full">
                  <label>名称</label>
                  <input value={current.name} onChange={(e) => patch({ name: e.target.value })} />
                </div>
                <div className="field">
                  <label>竹种</label>
                  <select value={current.speciesId} onChange={(e) => patch({ speciesId: e.target.value })}>
                    {SPECIES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>竹层</label>
                  <select value={current.layer} onChange={(e) => patch({ layer: e.target.value as MaterialPreset['layer'] })}>
                    <option value="green">青篾（竹青面）</option>
                    <option value="yellow">黄篾（篾黄纤维）</option>
                  </select>
                </div>
                <div className="field">
                  <label>宽度 {current.widthMm} mm</label>
                  <NumberInput min={2} max={30} step={0.5} value={current.widthMm}
                    onCommit={(widthMm) => patch({ widthMm })} />
                </div>
                <div className="field">
                  <label>厚度 {current.thicknessMm} mm</label>
                  <NumberInput min={0.25} max={3} step={0.05} value={current.thicknessMm}
                    onCommit={(thicknessMm) => patch({ thicknessMm })} />
                </div>
                <div className="field full">
                  <label>后处理</label>
                  <select value={current.finish} onChange={(e) => patch({ finish: e.target.value as FinishKind })}>
                    {Object.entries(FINISH_NAMES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                  </select>
                </div>
                <div className="field full">
                  <label>最小弯曲半径覆盖（cm，留空按竹种系数）</label>
                  <NumberInput min={0.1} max={20} step={0.1} value={current.bendRadiusOverrideCm}
                    placeholder={`自动：${minRadius.toFixed(2)} cm`}
                    onCommit={(bendRadiusOverrideCm) => patch({ bendRadiusOverrideCm })} />
                  <button type="button" className="btn small" style={{ marginTop: 6 }}
                    onClick={() => patch({ bendRadiusOverrideCm: null })}>恢复自动计算</button>
                </div>
              </div>
            </div>
            <div className="radius-note" style={{ marginTop: 14 }}>
              当前最小允许弯曲半径：<b>{minRadius.toFixed(2)} cm</b>。
              算法为 Rmin = 竹种系数 × 篾厚；青篾系数较低、较柔韧，黄篾系数较高。生成器会计算每段实际曲率，超区段在三维模型标红并统计长度。
            </div>
          </section>

          <section className="panel">
            <h3>竹种节距参数</h3>
            <div className="data-table-wrap">
              <table className="data-table" style={{ minWidth: 520 }}>
                <thead><tr><th>竹种</th><th>青篾系数</th><th>黄篾系数</th><th>节距 cm</th><th>可用竿长 cm</th></tr></thead>
                <tbody>
                  {SPECIES.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td><td>{s.greenFactor}×厚</td><td>{s.yellowFactor}×厚</td><td>{s.internodeCm}</td><td>{s.usableCulmCm}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section className="panel">
          <h3>篾料库</h3>
          <div className="saved-list">
            {materials.map((m) => (
              <button key={m.id} className={`saved-item ${m.id === current.id ? 'active' : ''}`} onClick={() => void saveProjectPatch({ materialId: m.id })}>
                <span><strong>{m.name}</strong><span>{m.widthMm}×{m.thicknessMm}mm · {m.layer === 'green' ? '青篾' : '黄篾'} · {FINISH_NAMES[m.finish]}</span></span>
                <span>{project.materialId === m.id ? '当前' : '使用'}</span>
              </button>
            ))}
          </div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={createMaterial}>新增篾料</button>
          </div>
          <p className="formula" style={{ marginTop: 16 }}>
            材质节点说明：青篾使用较低粗糙度和清漆层表现竹青蜡质光泽；黄篾加强凹凸纤维；烟熏/碳化使用乘法叠色压暗并偏棕黑。
            纤维纹理沿 U 向重复，U 坐标按每 5.5cm 一个纹理周期生成。
          </p>
        </section>
      </div>
    </>
  );
}
