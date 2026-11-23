import { useMemo } from 'react';
import { useStore } from '../data/store';
import { buildBill } from '../core/bill';
import { useWeaveBuild } from '../hooks/useWeaveBuild';
import { Card } from './controls';

export function BillPage() {
  const { vessels, weaves, materials, activeProject } = useStore();
  const vessel = vessels.find((v) => v.id === activeProject?.vesselId);
  const weave = weaves.find((w) => w.id === activeProject?.weaveId);
  const material = materials.find((m) => m.id === activeProject?.materialId);
  const { result } = useWeaveBuild(vessel, weave, material);

  const bill = useMemo(
    () => (result && weave && material ? buildBill(result, weave, material) : null),
    [result, weave, material],
  );

  if (!bill || !material) return <div className="empty">备料单生成中…</div>;

  return (
    <div className="scroll-col" style={{ width: '100%' }}>
      <Card title="备料汇总">
        <div className="kpi">
          <div className="item">
            <div className="num">{bill.totalStrips}</div>
            <div className="lbl">篾片总根数</div>
          </div>
          <div className="item">
            <div className="num">{(bill.totalLength / 1000).toFixed(1)}</div>
            <div className="lbl">总长度(米,含损耗)</div>
          </div>
          <div className="item">
            <div className="num">{bill.totalPoles}</div>
            <div className="lbl">需备竹子(根)</div>
          </div>
          <div className="item">
            <div className="num">{Math.round(bill.wasteRate * 100)}%</div>
            <div className="lbl">损耗余量</div>
          </div>
        </div>
      </Card>

      <Card title="分规格备料单">
        <table className="bill">
          <thead>
            <tr>
              <th>类别</th>
              <th>宽(mm)</th>
              <th>厚(mm)</th>
              <th>数量(根)</th>
              <th>单根净长(mm)</th>
              <th>总长含损(m)</th>
              <th>单竹出材(根)</th>
              <th>需竹(根)</th>
            </tr>
          </thead>
          <tbody>
            {bill.lines.map((l) => (
              <tr key={l.role}>
                <td>{l.category}</td>
                <td>{l.width.toFixed(1)}</td>
                <td>{l.thickness.toFixed(1)}</td>
                <td>{l.count}</td>
                <td>{l.singleLength}</td>
                <td>{(l.totalLength / 1000).toFixed(2)}</td>
                <td>{l.perPole}</td>
                <td>{l.polesNeeded}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="出材计算口径">
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--muted)', lineHeight: 1.9 }}>
          <li>
            单根长度按同类篾片中的最大弧长向上取整到 10mm,再加 {Math.round(material.wasteRate * 100)}% 损耗余量。
          </li>
          <li>
            单竹连续可用长度 = 节距 {material.poleInternode}mm × 节间数 {material.internodesPerPole} = {material.poleInternode * material.internodesPerPole}mm。
          </li>
          <li>
            每节间有效宽 {material.poleUsableWidth}mm,按篾宽 + 2mm 剖缝计算可剖根数,再乘以长度方向可切段数。
          </li>
          <li>收口篾、菊花底辐条单独列项,避免和侧壁篾混料导致收口圈长度不够。</li>
        </ul>
      </Card>
    </div>
  );
}
