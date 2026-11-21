import React, { useMemo, useState } from 'react';
import {
  BoundaryCondition,
  calcPumpSystem,
  computeNiceScale,
  ControlValveConfig,
  formatAxisTick,
  PipeLegConfig,
  PumpCurvePoint,
  PumpSystemResult,
} from '../utils/hydraulicsSolver';

interface SystemCurveChartProps {
  flowRateM3h: number;
  suctionLeg: PipeLegConfig;
  dischargeLeg: PipeLegConfig;
  source: BoundaryCondition;
  dest: BoundaryCondition;
  densityKgM3: number;
  viscosityMPas: number;
  valve: ControlValveConfig;
  pvKpa: number;
  atmBar: number;
  currentResult: PumpSystemResult;
  sortedPumpPoints: PumpCurvePoint[];
}

interface CurvePoint {
  q: number;
  yTot: number;
  yUnthrottled: number;
  vd: number;
  vs: number;
}

export const SystemCurveChart: React.FC<SystemCurveChartProps> = ({
  flowRateM3h,
  suctionLeg,
  dischargeLeg,
  source,
  dest,
  densityKgM3,
  viscosityMPas,
  valve,
  pvKpa,
  atmBar,
  currentResult,
  sortedPumpPoints,
}) => {
  const [unit, setUnit] = useState<'bar' | 'kpa' | 'm'>('bar');
  const [rangeMult, setRangeMult] = useState<number>(1.6);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const W = 580;
  const H = 272;
  const pad = { l: 58, r: 18, t: 16, b: 38 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;

  const unitLabel = unit === 'bar' ? 'bar' : unit === 'kpa' ? 'kPa' : 'm';

  const toUnitVal = (headM: number, dpBar: number) => {
    if (unit === 'm') return headM;
    if (unit === 'kpa') return dpBar * 100;
    return dpBar;
  };

  const chartData = useMemo(() => {
    const D_m = Math.max(0.1, dischargeLeg.innerDiaMm) / 1000;
    const area = Math.PI * D_m * D_m * 0.25;
    const fallbackQmax = Math.max(5, 3.0 * area * 3600);
    const rawQmax = flowRateM3h > 0 ? flowRateM3h * rangeMult : fallbackQmax;
    const xScale = computeNiceScale(0, rawQmax, 6);
    const qMax = xScale.niceMax;

    const curveValve: ControlValveConfig =
      valve.mode === 'target_flow' &&
      currentResult.targetFlowFeasible &&
      Number.isFinite(currentResult.valveKvActive)
        ? {
            mode: 'throttle_kv',
            kv100: currentResult.valveKvActive,
            openingPct: 100,
            characteristic: 'linear',
          }
        : valve.mode === 'target_flow'
          ? { ...valve, mode: 'bypass' }
          : valve;

    const samples = 64;
    const pts: CurvePoint[] = [];
    let minY = 0;
    let maxY = 0;

    for (let i = 0; i <= samples; i++) {
      const q = (qMax * i) / samples;
      const r = calcPumpSystem(
        q,
        suctionLeg,
        dischargeLeg,
        source,
        dest,
        densityKgM3,
        viscosityMPas,
        curveValve,
        pvKpa,
        atmBar,
        sortedPumpPoints
      );
      const yTot = toUnitVal(r.totalPumpHeadM, r.totalPumpDpBar);
      const yUnthrottled = toUnitVal(r.unthrottledHeadM, r.unthrottledDpBar);
      pts.push({
        q,
        yTot,
        yUnthrottled,
        vd: r.discharge.v,
        vs: r.suction.v,
      });
      minY = Math.min(minY, yTot, yUnthrottled);
      maxY = Math.max(maxY, yTot, yUnthrottled);
    }

    const opY = toUnitVal(currentResult.totalPumpHeadM, currentResult.totalPumpDpBar);
    minY = Math.min(minY, opY, 0);
    maxY = Math.max(maxY, opY, 0.01);

    const yScale = computeNiceScale(minY, maxY * 1.06, 5);
    return { xScale, yScale, qMax, pts, opY };
  }, [
    flowRateM3h,
    suctionLeg,
    dischargeLeg,
    source,
    dest,
    densityKgM3,
    viscosityMPas,
    valve,
    pvKpa,
    atmBar,
    rangeMult,
    unit,
    currentResult.totalPumpHeadM,
    currentResult.totalPumpDpBar,
    currentResult.targetFlowFeasible,
    currentResult.valveKvActive,
    sortedPumpPoints,
  ]);

  const { xScale, yScale, qMax, pts, opY } = chartData;
  const yMin = yScale.niceMin;
  const yMax = yScale.niceMax;

  const mapX = (q: number) => pad.l + (q / qMax) * pw;
  const mapY = (val: number) => pad.t + ph - ((val - yMin) / (yMax - yMin)) * ph;

  const yZero = mapY(0);
  const totPolyPoints = pts
    .map((p) => `${mapX(p.q).toFixed(1)},${mapY(p.yTot).toFixed(1)}`)
    .join(' ');
  const unthrottledPolyPoints = pts
    .map((p) => `${mapX(p.q).toFixed(1)},${mapY(p.yUnthrottled).toFixed(1)}`)
    .join(' ');
  const areaPoints = `${mapX(0).toFixed(1)},${yZero.toFixed(1)} ${totPolyPoints} ${mapX(qMax).toFixed(1)},${yZero.toFixed(1)}`;

  const showUnthrottledCurve = valve.mode !== 'bypass' && currentResult.valveDpBar > 1e-5;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const my = ((e.clientY - rect.top) / rect.height) * H;
    if (mx < pad.l || mx > pad.l + pw || my < pad.t || my > pad.t + ph) {
      setHoverIdx(null);
      return;
    }
    const frac = (mx - pad.l) / pw;
    const idx = Math.max(0, Math.min(pts.length - 1, Math.round(frac * (pts.length - 1))));
    setHoverIdx(idx);
  };

  const hoverPoint = hoverIdx !== null ? pts[hoverIdx] : null;
  const hoverLabel = hoverPoint
    ? `Q=${hoverPoint.q.toFixed(1)} m³/h · Req=${
        unit === 'bar' ? hoverPoint.yTot.toFixed(3) : hoverPoint.yTot.toFixed(2)
      } ${unitLabel} · vd=${hoverPoint.vd.toFixed(2)} m/s`
    : '';

  return (
    <section className="bg-[#0E1520] border border-slate-800 rounded-lg p-4 flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100 tracking-tight">
            System Curve (Pump Requirement vs Flow Rate)
          </h2>
          <p className="text-xs text-slate-400 font-mono tabular-nums mt-0.5">
            {showUnthrottledCurve
              ? 'Solid: With Control Valve · Dashed: Unthrottled (Suction + Discharge + Static)'
              : 'Static (Δz + ΔP) + Suction + Discharge Colebrook–White Losses'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex border border-slate-800 rounded-md overflow-hidden bg-[#070B12]">
            {(['bar', 'kpa', 'm'] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className={`px-2 py-1 text-xs font-mono transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  unit === u
                    ? 'bg-cyan-500/15 text-cyan-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {u === 'kpa' ? 'kPa' : u}
              </button>
            ))}
          </div>

          <div className="inline-flex border border-slate-800 rounded-md overflow-hidden bg-[#070B12]">
            {[1.6, 2, 3].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setRangeMult(m)}
                className={`px-2 py-1 text-xs font-mono transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  rangeMult === m
                    ? 'bg-cyan-500/15 text-cyan-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {m}×Q
              </button>
            ))}
          </div>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-[265px] bg-[#070B12] border border-slate-800/80 rounded-md cursor-crosshair select-none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
        role="img"
        aria-label="Pump system requirement versus volumetric flow rate curve"
      >
        {xScale.ticks.map((qVal) => {
          const x = mapX(qVal);
          return (
            <g key={`x-${qVal}`}>
              <line x1={x} y1={pad.t} x2={x} y2={pad.t + ph} stroke="#162032" strokeWidth="1" />
              <text
                x={x}
                y={H - 20}
                fill="#94A3B8"
                fontSize="10"
                fontFamily="IBM Plex Mono, monospace"
                textAnchor="middle"
              >
                {formatAxisTick(qVal, xScale.step)}
              </text>
            </g>
          );
        })}

        {yScale.ticks.map((dpVal) => {
          const y = mapY(dpVal);
          const isZero = Math.abs(dpVal) < 1e-9;
          return (
            <g key={`y-${dpVal}`}>
              <line
                x1={pad.l}
                y1={y}
                x2={pad.l + pw}
                y2={y}
                stroke={isZero ? '#334155' : '#162032'}
                strokeWidth={isZero ? '1.2' : '1'}
              />
              <text
                x={pad.l - 7}
                y={y + 3}
                fill="#94A3B8"
                fontSize="10"
                fontFamily="IBM Plex Mono, monospace"
                textAnchor="end"
              >
                {formatAxisTick(dpVal, yScale.step)}
              </text>
            </g>
          );
        })}

        <text
          x={pad.l + pw / 2}
          y={H - 5}
          fill="#94A3B8"
          fontSize="10.5"
          fontFamily="IBM Plex Sans, sans-serif"
          textAnchor="middle"
        >
          Volumetric Flow Rate Q (m³/h)
        </text>
        <text
          x={14}
          y={pad.t + ph / 2}
          fill="#94A3B8"
          fontSize="10.5"
          fontFamily="IBM Plex Sans, sans-serif"
          transform={`rotate(-90 14 ${pad.t + ph / 2})`}
          textAnchor="middle"
        >
          {unit === 'm' ? 'Required Pump Head (m)' : `Required Pump ΔP (${unitLabel})`}
        </text>

        <polygon points={areaPoints} fill="rgba(6, 182, 212, 0.08)" />

        {showUnthrottledCurve && (
          <polyline
            points={unthrottledPolyPoints}
            fill="none"
            stroke="#64748B"
            strokeWidth="1.5"
            strokeDasharray="5,4"
          />
        )}

        <polyline
          points={totPolyPoints}
          fill="none"
          stroke="#22D3EE"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />

        {flowRateM3h >= 0 && flowRateM3h <= qMax && (
          <g>
            <line
              x1={mapX(flowRateM3h)}
              y1={pad.t}
              x2={mapX(flowRateM3h)}
              y2={pad.t + ph}
              stroke="rgba(34, 211, 238, 0.4)"
              strokeDasharray="3,3"
            />
            <line
              x1={pad.l}
              y1={mapY(opY)}
              x2={pad.l + pw}
              y2={mapY(opY)}
              stroke="rgba(34, 211, 238, 0.4)"
              strokeDasharray="3,3"
            />
            <circle
              cx={mapX(flowRateM3h)}
              cy={mapY(opY)}
              r="5"
              fill="#22D3EE"
              stroke="#070B12"
              strokeWidth="2"
            />
          </g>
        )}

        {hoverPoint && (
          <g>
            <line
              x1={mapX(hoverPoint.q)}
              y1={pad.t}
              x2={mapX(hoverPoint.q)}
              y2={pad.t + ph}
              stroke="#F59E0B"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
            <circle
              cx={mapX(hoverPoint.q)}
              cy={mapY(hoverPoint.yTot)}
              r="4.5"
              fill="#F59E0B"
              stroke="#070B12"
              strokeWidth="1.5"
            />
            {(() => {
              const cx = mapX(hoverPoint.q);
              const cy = mapY(hoverPoint.yTot);
              const boxW = hoverLabel.length * 6.2 + 16;
              const boxH = 22;
              let bx = cx + 10;
              if (bx + boxW > pad.l + pw) bx = cx - boxW - 10;
              let by = cy - 28;
              if (by < pad.t + 2) by = cy + 10;
              return (
                <>
                  <rect
                    x={bx}
                    y={by}
                    width={boxW}
                    height={boxH}
                    rx="4"
                    fill="#0E1520"
                    stroke="#334155"
                    strokeWidth="1"
                  />
                  <text
                    x={bx + 8}
                    y={by + 14.5}
                    fill="#E2E8F0"
                    fontSize="10"
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {hoverLabel}
                  </text>
                </>
              );
            })()}
          </g>
        )}
      </svg>

      <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-400 mt-2">
        <span>
          Operating Point: {flowRateM3h.toFixed(1)} m³/h ·{' '}
          {opY.toFixed(unit === 'bar' ? 4 : 2)} {unitLabel}
        </span>
        <span className="text-slate-500">Hover curve to probe</span>
      </div>
    </section>
  );
};
