import { useMemo } from 'react';
import { NumberInput } from '../components/NumberInput';
import { saveProjectPatch } from '../db';
import { buildBom } from '../lib/bom';
import type { BuildResult } from '../lib/engine';
import type { MaterialPreset, ProjectDoc, ShapeDesign } from '../types';

interface CutListPageProps {
  project: ProjectDoc;
  shape: ShapeDesign;
  material: MaterialPreset;
  result: BuildResult | null;
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = `﻿${rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CutListPage({ project, shape, material, result }: CutListPageProps) {
  const bom = useMemo(() => {
    if (!result) return null;
    return buildBom(result.strips, material, shape, project.rim, project.bambooLengthCm, project.lossRate);
  }, [result, material, shape, project.rim, project.bambooLengthCm, project.lossRate]);

  if (!result || !bom) {
    return <div className="panel">正在生成备料单…</div>;
  }

  function exportCsv() {
    const currentBom = bom;
    if (!currentBom) return;
    const rows: Array<Array<string | number>> = [
      ['根序号', '名称', '圈/组', '净长cm', `含${Math.round(project.lossRate * 100)}%损耗落料cm`, '宽mm', '厚mm'],
      ...currentBom.roots.map((r) => [r.rootNo, r.name, r.group, r.netLengthCm.toFixed(2), r.cutLengthCm.toFixed(2), r.widthMm, r.thicknessMm]),
      [],
      ['口沿料', '数量', '长度cm', '宽mm', '厚mm', '备注'],
      ...currentBom.rimRows.map((r) => [r.name, r.count, r.lengthCm.toFixed(1), r.widthMm, r.thicknessMm, r.note]),
    ];
    downloadCsv(`${shape.name}-备料单.csv`, rows);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>备料单与出竹计算</h2>
          <p>每一根篾的真实曲面长度、长宽厚和损耗后落料长度都单独列出；再按竹种节距和可用竿长折算一根竹子可出几根、总共需要几竿竹。</p>
        </div>
        <div className="btn-row no-print">
          <button className="btn" onClick={() => window.print()}>打印/另存 PDF</button>
          <button className="btn primary" onClick={exportCsv}>导出 CSV</button>
        </div>
      </div>

      <div className="summary-cards">
        <div className="summary-card"><b>{bom.totalRoots}</b><span>主体篾条根数</span></div>
        <div className="summary-card"><b>{bom.totalCutLengthM.toFixed(1)}m</b><span>含损耗总长（净 {bom.totalNetLengthM.toFixed(1)}m）</span></div>
        <div className="summary-card"><b>{bom.totalBambooPoles} 竿</b><span>{bom.speciesName} · 竿长 {project.bambooLengthCm}cm</span></div>
        <div className="summary-card"><b>{Math.round(project.lossRate * 100)}%</b><span>损耗余量 · {bom.nodeCount} 个竹节/竿</span></div>
      </div>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h3>下料参数</h3>
        <div className="form-grid">
          <div className="field">
            <label>损耗余量 {Math.round(project.lossRate * 100)}%</label>
            <input type="range" min={0} max={0.25} step={0.01} value={project.lossRate}
              onChange={(e) => void saveProjectPatch({ lossRate: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>一根竹子可用长度 cm</label>
            <NumberInput min={180} max={900} step={10} value={project.bambooLengthCm}
              onCommit={(bambooLengthCm) => void saveProjectPatch({ bambooLengthCm })} />
          </div>
        </div>
        <p className="formula" style={{ marginTop: 12 }}>
          折算公式：每竿竹节数 N≈floor(可用竿长 / 节距 {bom.internodeCm}cm)；修节预留 {bom.nodeAllowanceCm}cm/节，另留 8cm 两头截头。
          可用出篾长度 = 竿长 − N×{bom.nodeAllowanceCm}cm − 8cm；每竹根数 = floor(可用出篾长度 / 单根落料长度)。
          口沿缠绕长度按螺旋圈数单独估算。
        </p>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h3>分组采购/截料单</h3>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>类别</th><th>根数</th><th>单根落料长 cm</th><th>宽×厚 mm</th><th>总长度 m</th><th>每竿出几根</th><th>需竹子/组</th></tr>
            </thead>
            <tbody>
              {bom.groups.map((g) => (
                <tr key={g.key}>
                  <td>{g.category}</td>
                  <td>{g.count}</td>
                  <td>{g.lengthCm.toFixed(1)}</td>
                  <td>{g.widthMm.toFixed(1)}×{g.thicknessMm.toFixed(2)}</td>
                  <td>{(g.totalLengthCm / 100).toFixed(2)}</td>
                  <td>{g.stripsPerBamboo || '长度超竿'}</td>
                  <td><b>{g.bambooPoles}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h3>口沿锁边备料</h3>
        <div className="data-table-wrap">
          <table className="data-table" style={{ minWidth: 680 }}>
            <thead><tr><th>部件</th><th>数量</th><th>单根长度 cm</th><th>宽/径 mm</th><th>厚 mm</th><th>工艺备注</th></tr></thead>
            <tbody>
              {bom.rimRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td><td>{r.count}</td><td>{r.lengthCm.toFixed(1)}</td><td>{r.widthMm}</td><td>{r.thicknessMm}</td><td style={{ whiteSpace: 'normal', textAlign: 'left' }}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <details className="panel" open>
        <summary style={{ cursor: 'pointer', fontWeight: 800, marginBottom: 12 }}>按根明细（{bom.roots.length} 根，回放时的全局根序号与此一致）</summary>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>第几根</th><th>名称</th><th>圈/组</th><th>净长 cm</th><th>落料长 cm</th><th>宽 mm</th><th>厚 mm</th></tr></thead>
            <tbody>
              {bom.roots.map((r) => (
                <tr key={r.stripId}>
                  <td><b>#{r.rootNo}</b></td>
                  <td>{r.name}</td>
                  <td>{r.group}</td>
                  <td>{r.netLengthCm.toFixed(2)}</td>
                  <td>{r.cutLengthCm.toFixed(2)}</td>
                  <td>{r.widthMm.toFixed(1)}</td>
                  <td>{r.thicknessMm.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
