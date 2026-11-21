import React, { useMemo, useState } from 'react';
import { Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import {
  calcHydraulics,
  computeNiceScale,
  evaluateMonotoneCurve,
  findPumpSystemIntersection,
  formatAxisTick,
  PumpCurvePoint,
} from '../utils/hydraulicsSolver';

interface PumpCurveSectionProps {
  flowRateM3h: number;
  pipeLengthM: number;
  innerDiaMm: number;
  roughnessMm: number;
  densityKgM3: number;
  viscosityMPas: number;
  sumK: number;
  elevZM: number;
  currentSystemHeadM: number;
  onApplyDutyFlow: (qM3h: number) => void;
}

const DEFAULT_PUMP_POINTS: PumpCurvePoint[] = [
  { id: 'p1', q: 0, h: 32.0, eff: 0 },
  { id: 'p2', q: 10, h: 31.0, eff: 52 },
  { id: 'p3', q: 20, h: 27.5, eff: 73 },
  { id: 'p4', q: 26, h: 24.0, eff: 78 },
  { id: 'p5', q: 32, h: 19.2, eff: 72 },
  { id: 'p6', q: 38, h: 12.5, eff: 56 },
];

export const PumpCurveSection: React.FC<PumpCurveSectionProps> = ({
  flowRateM3h,
  pipeLengthM,
  innerDiaMm,
  roughnessMm,
  densityKgM3,
  viscosityMPas,
  sumK,
  elevZM,
  currentSystemHeadM,
  onApplyDutyFlow,
}) => {
  const [points, setPoints] = useState<PumpCurvePoint[]>(DEFAULT_PUMP_POINTS);
  const [showEfficiency, setShowEfficiency] = useState<boolean>(true);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const sortedPoints = useMemo(
    () =>
      [...points]
        .filter((p) => Number.isFinite(p.q) && Number.isFinite(p.h) && p.q >= 0)
        .sort((a, b) => a.q - b.q),
    [points]
  );

  const bepInfo = useMemo(() => {
    if (sortedPoints.length < 2) return null;
    const xs = sortedPoints.map((p) => p.q);
    const hs = sortedPoints.map((p) => p.h);
    const effs = sortedPoints.map((p) => p.eff);
    const hasEff = effs.some((e) => e > 0);
    if (!hasEff) return null;

    // Sample 120 points to capture smooth peak efficiency on interpolated curve
    const qMin = xs[0];
    const qMax = xs[xs.length - 1];
    let bestQ = qMin;
    let bestEff = -1;
    for (let i = 0; i <= 120; i++) {
      const q = qMin + ((qMax - qMin) * i) / 120;
      const e = evaluateMonotoneCurve(xs, effs, q);
      if (e > bestEff) {
        bestEff = e;
        bestQ = q;
      }
    }
    const bestH = evaluateMonotoneCurve(xs, hs, bestQ);
    return {
      q: bestQ,
      h: bestH,
      eff: Math.min(100, bestEff),
      porMin: bestQ * 0.7,
      porMax: bestQ * 1.2,
    };
  }, [sortedPoints]);

  const duty = useMemo(
    () =>
      findPumpSystemIntersection(
        sortedPoints,
        pipeLengthM,
        innerDiaMm,
        roughnessMm,
        densityKgM3,
        viscosityMPas,
        sumK,
        elevZM
      ),
    [
      sortedPoints,
      pipeLengthM,
      innerDiaMm,
      roughnessMm,
      densityKgM3,
      viscosityMPas,
      sumK,
      elevZM,
    ]
  );

  // Build SVG geometry
  const W = 680;
  const H = 310;
  const pad = { l: 56, r: showEfficiency ? 52 : 20, t: 18, b: 40 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;

  const chartModel = useMemo(() => {
    const xs = sortedPoints.map((p) => p.q);
    const hs = sortedPoints.map((p) => p.h);
    const effs = sortedPoints.map((p) => p.eff);

    const maxPumpQ = xs.length > 0 ? xs[xs.length - 1] : 40;
    const rawMaxQ = Math.max(maxPumpQ, flowRateM3h * 1.15, 10);
    const xScale = computeNiceScale(0, rawMaxQ, 7);
    const qMax = xScale.niceMax;

    const samples = 80;
    const series: {
      q: number;
      hSys: number;
      hPump: number | null;
      eff: number | null;
    }[] = [];

    let minH = Math.min(0, elevZM);
    let maxH = Math.max(10, currentSystemHeadM * 1.1);

    if (hs.length > 0) {
      maxH = Math.max(maxH, ...hs);
      minH = Math.min(minH, ...hs);
    }

    for (let i = 0; i <= samples; i++) {
      const q = (qMax * i) / samples;
      const sys = calcHydraulics(
        q,
        pipeLengthM,
        innerDiaMm,
        roughnessMm,
        densityKgM3,
        viscosityMPas,
        sumK,
        elevZM
      );
      const inPumpRange = xs.length >= 2 && q >= xs[0] - 1e-6 && q <= xs[xs.length - 1] + 1e-6;
      const hPump = inPumpRange ? evaluateMonotoneCurve(xs, hs, q) : null;
      const eff = inPumpRange
        ? Math.max(0, Math.min(100, evaluateMonotoneCurve(xs, effs, q)))
        : null;

      series.push({ q, hSys: sys.hTot, hPump, eff });
      if (q <= (xs.length >= 2 ? xs[xs.length - 1] * 1.08 : qMax)) {
        maxH = Math.max(maxH, sys.hTot);
      }
      if (hPump !== null) {
        maxH = Math.max(maxH, hPump);
        minH = Math.min(minH, hPump);
      }
    }

    const yScale = computeNiceScale(Math.min(0, minH), maxH * 1.08, 6);
    return { xScale, yScale, qMax, series };
  }, [
    sortedPoints,
    flowRateM3h,
    pipeLengthM,
    innerDiaMm,
    roughnessMm,
    densityKgM3,
    viscosityMPas,
    sumK,
    elevZM,
    currentSystemHeadM,
  ]);

  const { xScale, yScale, qMax, series } = chartModel;
  const yMin = yScale.niceMin;
  const yMax = yScale.niceMax;

  const mapX = (q: number) => pad.l + (q / qMax) * pw;
  const mapY = (h: number) => pad.t + ph - ((h - yMin) / (yMax - yMin)) * ph;
  const mapEffY = (eff: number) => pad.t + ph - (Math.max(0, Math.min(100, eff)) / 100) * ph;

  const sysLinePts = series
    .filter((pt) => pt.hSys <= yMax * 1.15 && pt.hSys >= yMin - 5)
    .map((pt) => `${mapX(pt.q).toFixed(1)},${mapY(pt.hSys).toFixed(1)}`)
    .join(' ');

  const pumpLinePts = series
    .filter((pt) => pt.hPump !== null)
    .map((pt) => `${mapX(pt.q).toFixed(1)},${mapY(pt.hPump!).toFixed(1)}`)
    .join(' ');

  const effLinePts = series
    .filter((pt) => pt.eff !== null)
    .map((pt) => `${mapX(pt.q).toFixed(1)},${mapEffY(pt.eff!).toFixed(1)}`)
    .join(' ');

  const handlePointChange = (
    id: string,
    field: 'q' | 'h' | 'eff',
    rawVal: string
  ) => {
    const num = parseFloat(rawVal);
    setPoints((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              [field]: Number.isFinite(num) ? Math.max(0, field === 'eff' ? Math.min(100, num) : num) : 0,
            }
          : p
      )
    );
  };

  const handleAddPoint = () => {
    const last = sortedPoints[sortedPoints.length - 1];
    const nextQ = last ? Number((last.q + 5).toFixed(1)) : 10;
    const nextH = last ? Math.max(0, Number((last.h * 0.8).toFixed(1))) : 20;
    const nextEff = last ? Math.max(0, Number((last.eff * 0.85).toFixed(0))) : 60;
    setPoints((prev) => [
      ...prev,
      { id: `pt_${Date.now()}`, q: nextQ, h: nextH, eff: nextEff },
    ]);
  };

  const handleRemovePoint = (id: string) => {
    if (points.length <= 2) return;
    setPoints((prev) => prev.filter((p) => p.id !== id));
  };

  const handleFitSampleToSystem = () => {
    const qRef = Math.max(2, flowRateM3h);
    const sysAtRef = calcHydraulics(
      qRef,
      pipeLengthM,
      innerDiaMm,
      roughnessMm,
      densityKgM3,
      viscosityMPas,
      sumK,
      elevZM
    ).hTot;
    const hRef = Math.max(5, sysAtRef);
    const hShutoff = Math.max(hRef * 1.32, elevZM + hRef * 0.35 + 4);
    const qRunout = qRef * 1.48;

    const template: PumpCurvePoint[] = [
      { id: 'fit_1', q: 0, h: Number(hShutoff.toFixed(1)), eff: 0 },
      {
        id: 'fit_2',
        q: Number((qRef * 0.4).toFixed(1)),
        h: Number((hShutoff - (hShutoff - hRef) * 0.18).toFixed(1)),
        eff: 52,
      },
      {
        id: 'fit_3',
        q: Number((qRef * 0.75).toFixed(1)),
        h: Number((hShutoff - (hShutoff - hRef) * 0.56).toFixed(1)),
        eff: 73,
      },
      {
        id: 'fit_4',
        q: Number(qRef.toFixed(1)),
        h: Number(hRef.toFixed(1)),
        eff: 78,
      },
      {
        id: 'fit_5',
        q: Number((qRef * 1.25).toFixed(1)),
        h: Number((hRef * 0.78).toFixed(1)),
        eff: 71,
      },
      {
        id: 'fit_6',
        q: Number(qRunout.toFixed(1)),
        h: Number((hRef * 0.50).toFixed(1)),
        eff: 54,
      },
    ];
    setPoints(template);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const my = ((e.clientY - rect.top) / rect.height) * H;
    if (mx < pad.l || mx > pad.l + pw || my < pad.t || my > pad.t + ph) {
      setHoverIdx(null);
      return;
    }
    const frac = (mx - pad.l) / pw;
    const idx = Math.max(0, Math.min(series.length - 1, Math.round(frac * (series.length - 1))));
    setHoverIdx(idx);
  };

  const hoverPt = hoverIdx !== null ? series[hoverIdx] : null;

  // BEP status vs Duty Point
  let bepRatioStatus = { label: '— Enter η% to locate BEP', tone: 'text-slate-400' };
  let bepRatioPct: number | null = null;
  if (duty.found && bepInfo && bepInfo.q > 0) {
    bepRatioPct = (duty.qOp / bepInfo.q) * 100;
    if (bepRatioPct < 70) {
      bepRatioStatus = { label: '▲ Below POR (<70% BEP)', tone: 'text-amber-400' };
    } else if (bepRatioPct <= 120) {
      bepRatioStatus = { label: '● Within POR (70–120% BEP)', tone: 'text-emerald-400' };
    } else {
      bepRatioStatus = { label: '✖ Above POR (>120% BEP)', tone: 'text-rose-400' };
    }
  }

  return (
    <section
      id="pump-curve"
      className="bg-[#0E1520] border border-slate-800 rounded-lg p-4 scroll-mt-16"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100 tracking-tight">
            Centrifugal Pump Curve &amp; Best Efficiency Point (BEP)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Plot pump Head–Flow (H–Q) and Efficiency (η–Q) datasheet points against the calculated Colebrook–White system curve
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowEfficiency((v) => !v)}
            className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap cursor-pointer ${
              showEfficiency
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                : 'bg-[#070B12] text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            {showEfficiency ? 'η% Overlay: On' : 'η% Overlay: Off'}
          </button>

          <button
            type="button"
            onClick={handleFitSampleToSystem}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-cyan-300 bg-cyan-500/10 border border-cyan-500/35 rounded hover:bg-cyan-500/20 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Fit Pump to Current Q/H
          </button>

          <button
            type="button"
            onClick={() => setPoints(DEFAULT_PUMP_POINTS)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 bg-[#070B12] border border-slate-800 rounded hover:border-slate-700 hover:text-slate-100 transition-colors whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Default Pump
          </button>
        </div>
      </div>

      {/* 4-Metric Operating & BEP Readout Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4 bg-[#070B12] border border-slate-800/90 rounded-md p-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400">
            Duty Point (Intersection)
          </div>
          {duty.found ? (
            <div className="mt-0.5 flex items-baseline gap-2 flex-wrap">
              <span className="text-base font-mono tabular-nums font-semibold text-emerald-300">
                {duty.qOp.toFixed(2)} m³/h
              </span>
              <span className="text-xs font-mono tabular-nums text-slate-300">
                @ {duty.hOp.toFixed(2)} m ({duty.dpOpBar.toFixed(3)} bar)
              </span>
            </div>
          ) : (
            <div className="mt-0.5 text-xs font-medium text-rose-400">
              ✖ No intersection within pump Q range
            </div>
          )}
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400">
            Best Efficiency Point (BEP)
          </div>
          {bepInfo ? (
            <div className="mt-0.5 flex items-baseline gap-2 flex-wrap">
              <span className="text-base font-mono tabular-nums font-semibold text-amber-300">
                {bepInfo.q.toFixed(1)} m³/h
              </span>
              <span className="text-xs font-mono tabular-nums text-slate-300">
                @ {bepInfo.h.toFixed(1)} m · η {bepInfo.eff.toFixed(1)}%
              </span>
            </div>
          ) : (
            <div className="mt-0.5 text-xs text-slate-500">Enter η (%) values below</div>
          )}
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400">
            Operating Ratio (% of BEP)
          </div>
          <div className="mt-0.5 flex items-baseline gap-2 flex-wrap">
            <span className="text-base font-mono tabular-nums font-semibold text-slate-100">
              {bepRatioPct !== null ? `${bepRatioPct.toFixed(1)}%` : '—'}
            </span>
            <span className={`text-xs font-medium ${bepRatioStatus.tone}`}>
              {bepRatioStatus.label}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400">
              Duty Power (Hyd / Shaft)
            </div>
            <div className="mt-0.5 text-sm font-mono tabular-nums font-semibold text-slate-100">
              {duty.found ? (
                <>
                  {duty.hydPowerKw.toFixed(2)} kW
                  <span className="text-slate-400 font-normal ml-1">
                    /{' '}
                    {duty.shaftPowerKw !== null
                      ? `${duty.shaftPowerKw.toFixed(2)} kW`
                      : '—'}
                  </span>
                </>
              ) : (
                '—'
              )}
            </div>
          </div>

          {duty.found && (
            <button
              type="button"
              onClick={() => onApplyDutyFlow(Number(duty.qOp.toFixed(2)))}
              title="Set calculator Flow Rate (Q) to the Pump/System intersection"
              className="px-2.5 py-1.5 text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/35 rounded hover:bg-emerald-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Use Duty Q
            </button>
          )}
        </div>
      </div>

      {/* Main Chart + Editable Pump Curve Points Table */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* SVG Chart */}
        <div className="xl:col-span-8 flex flex-col">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-[310px] bg-[#070B12] border border-slate-800/90 rounded-md cursor-crosshair select-none"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIdx(null)}
            role="img"
            aria-label="Centrifugal pump head-flow curve versus system head curve and Best Efficiency Point"
          >
            {/* Preferred Operating Region (70% - 120% of Q_BEP) */}
            {bepInfo && (
              <rect
                x={Math.max(pad.l, mapX(bepInfo.porMin))}
                y={pad.t}
                width={Math.max(
                  0,
                  Math.min(pad.l + pw, mapX(bepInfo.porMax)) -
                    Math.max(pad.l, mapX(bepInfo.porMin))
                )}
                height={ph}
                fill="rgba(245, 158, 11, 0.06)"
              />
            )}

            {/* X Grid */}
            {xScale.ticks.map((qv) => {
              const x = mapX(qv);
              return (
                <g key={`px-${qv}`}>
                  <line x1={x} y1={pad.t} x2={x} y2={pad.t + ph} stroke="#162032" strokeWidth="1" />
                  <text
                    x={x}
                    y={H - 21}
                    fill="#94A3B8"
                    fontSize="10"
                    fontFamily="IBM Plex Mono, monospace"
                    textAnchor="middle"
                  >
                    {formatAxisTick(qv, xScale.step)}
                  </text>
                </g>
              );
            })}

            {/* Left Y Grid (Head in m) */}
            {yScale.ticks.map((hv) => {
              const y = mapY(hv);
              return (
                <g key={`py-${hv}`}>
                  <line x1={pad.l} y1={y} x2={pad.l + pw} y2={y} stroke="#162032" strokeWidth="1" />
                  <text
                    x={pad.l - 7}
                    y={y + 3}
                    fill="#94A3B8"
                    fontSize="10"
                    fontFamily="IBM Plex Mono, monospace"
                    textAnchor="end"
                  >
                    {formatAxisTick(hv, yScale.step)}
                  </text>
                </g>
              );
            })}

            {/* Right Y Ticks (Efficiency 0-100%) */}
            {showEfficiency &&
              [0, 25, 50, 75, 100].map((ev) => {
                const y = mapEffY(ev);
                return (
                  <text
                    key={`eff-${ev}`}
                    x={pad.l + pw + 7}
                    y={y + 3}
                    fill="#F59E0B"
                    opacity="0.75"
                    fontSize="9.5"
                    fontFamily="IBM Plex Mono, monospace"
                    textAnchor="start"
                  >
                    {ev}%
                  </text>
                );
              })}

            {/* Axis labels */}
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
              Total Head H (m)
            </text>
            {showEfficiency && (
              <text
                x={W - 11}
                y={pad.t + ph / 2}
                fill="#F59E0B"
                opacity="0.85"
                fontSize="10"
                fontFamily="IBM Plex Sans, sans-serif"
                transform={`rotate(90 ${W - 11} ${pad.t + ph / 2})`}
                textAnchor="middle"
              >
                Efficiency η (%)
              </text>
            )}

            {/* Efficiency Curve (dashed amber) */}
            {showEfficiency && effLinePts && (
              <polyline
                points={effLinePts}
                fill="none"
                stroke="#F59E0B"
                strokeWidth="1.6"
                strokeDasharray="4,3"
                opacity="0.8"
              />
            )}

            {/* System Head Curve (solid cyan) */}
            {sysLinePts && (
              <polyline
                points={sysLinePts}
                fill="none"
                stroke="#22D3EE"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
            )}

            {/* Pump H-Q Curve (solid emerald) */}
            {pumpLinePts && (
              <polyline
                points={pumpLinePts}
                fill="none"
                stroke="#34D399"
                strokeWidth="2.4"
                strokeLinejoin="round"
              />
            )}

            {/* User-entered pump datasheet points */}
            {sortedPoints.map((pt) => (
              <circle
                key={pt.id}
                cx={mapX(pt.q)}
                cy={mapY(pt.h)}
                r="3.2"
                fill="#070B12"
                stroke="#34D399"
                strokeWidth="1.8"
              />
            ))}

            {/* BEP Vertical Guide + Marker */}
            {bepInfo && (
              <g>
                <line
                  x1={mapX(bepInfo.q)}
                  y1={pad.t}
                  x2={mapX(bepInfo.q)}
                  y2={pad.t + ph}
                  stroke="rgba(245, 158, 11, 0.45)"
                  strokeDasharray="3,3"
                />
                {/* Diamond marker on Pump H-Q at BEP */}
                <polygon
                  points={`${mapX(bepInfo.q)},${mapY(bepInfo.h) - 7} ${mapX(bepInfo.q) + 6},${mapY(bepInfo.h)} ${mapX(bepInfo.q)},${mapY(bepInfo.h) + 7} ${mapX(bepInfo.q) - 6},${mapY(bepInfo.h)}`}
                  fill="#F59E0B"
                  stroke="#070B12"
                  strokeWidth="1.5"
                />
                {showEfficiency && (
                  <circle
                    cx={mapX(bepInfo.q)}
                    cy={mapEffY(bepInfo.eff)}
                    r="4"
                    fill="#F59E0B"
                    stroke="#070B12"
                    strokeWidth="1.5"
                  />
                )}
                <text
                  x={Math.min(pad.l + pw - 36, mapX(bepInfo.q) + 8)}
                  y={Math.max(pad.t + 14, mapY(bepInfo.h) - 9)}
                  fill="#FCD34D"
                  fontSize="10"
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight="600"
                >
                  BEP ({bepInfo.eff.toFixed(0)}%)
                </text>
              </g>
            )}

            {/* Duty Point Intersection Marker */}
            {duty.found && (
              <g>
                <circle
                  cx={mapX(duty.qOp)}
                  cy={mapY(duty.hOp)}
                  r="6"
                  fill="#E2E8F0"
                  stroke="#070B12"
                  strokeWidth="2"
                />
                <circle
                  cx={mapX(duty.qOp)}
                  cy={mapY(duty.hOp)}
                  r="2.5"
                  fill="#06B6D4"
                />
              </g>
            )}

            {/* Hover Probe */}
            {hoverPt && (
              <g>
                <line
                  x1={mapX(hoverPt.q)}
                  y1={pad.t}
                  x2={mapX(hoverPt.q)}
                  y2={pad.t + ph}
                  stroke="#94A3B8"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />
                <circle
                  cx={mapX(hoverPt.q)}
                  cy={mapY(hoverPt.hSys)}
                  r="3.5"
                  fill="#22D3EE"
                />
                {hoverPt.hPump !== null && (
                  <circle
                    cx={mapX(hoverPt.q)}
                    cy={mapY(hoverPt.hPump)}
                    r="3.5"
                    fill="#34D399"
                  />
                )}
                {(() => {
                  const pumpStr =
                    hoverPt.hPump !== null ? ` · Pump ${hoverPt.hPump.toFixed(1)}m` : '';
                  const effStr =
                    showEfficiency && hoverPt.eff !== null
                      ? ` · η ${hoverPt.eff.toFixed(0)}%`
                      : '';
                  const txt = `Q=${hoverPt.q.toFixed(1)} m³/h · Sys ${hoverPt.hSys.toFixed(1)}m${pumpStr}${effStr}`;
                  const boxW = txt.length * 6.1 + 14;
                  const boxH = 22;
                  const cx = mapX(hoverPt.q);
                  let bx = cx + 10;
                  if (bx + boxW > pad.l + pw) bx = cx - boxW - 10;
                  const by = pad.t + 6;
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
                        x={bx + 7}
                        y={by + 14.5}
                        fill="#E2E8F0"
                        fontSize="10"
                        fontFamily="IBM Plex Mono, monospace"
                      >
                        {txt}
                      </text>
                    </>
                  );
                })()}
              </g>
            )}
          </svg>

          {/* Chart Legend */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-mono text-slate-400 mt-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 bg-emerald-400 inline-block" />
              Pump Curve (H–Q)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 bg-cyan-400 inline-block" />
              System Curve (H–Q)
            </span>
            {showEfficiency && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3.5 h-0.5 border-t-2 border-dashed border-amber-400 inline-block" />
                Efficiency (η%)
              </span>
            )}
            {bepInfo && (
              <span className="inline-flex items-center gap-1.5 text-amber-300">
                ◆ BEP &amp; POR Band (70–120%)
              </span>
            )}
          </div>
        </div>

        {/* Editable Pump Curve Points Table */}
        <div className="xl:col-span-4 bg-[#070B12] border border-slate-800/90 rounded-md p-3 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Pump Curve Points ({points.length})
            </h3>
            <button
              type="button"
              onClick={handleAddPoint}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-cyan-300 bg-cyan-500/15 border border-cyan-500/35 rounded hover:bg-cyan-500/25 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Point
            </button>
          </div>

          <div className="max-h-[250px] overflow-y-auto">
            <table className="w-full border-collapse text-xs font-mono tabular-nums">
              <thead className="sticky top-0 bg-[#070B12] border-b border-slate-800 text-slate-400 font-sans">
                <tr>
                  <th className="text-left font-medium py-1.5 pr-1.5">Q (m³/h)</th>
                  <th className="text-left font-medium py-1.5 px-1.5">Head (m)</th>
                  <th className="text-left font-medium py-1.5 px-1.5">Eff (%)</th>
                  <th className="w-7" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {points.map((pt) => (
                  <tr key={pt.id}>
                    <td className="py-1.5 pr-1.5">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        aria-label="Pump flow rate m3/h"
                        value={pt.q}
                        onChange={(e) => handlePointChange(pt.id, 'q', e.target.value)}
                        className="w-full bg-[#0E1520] border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                      />
                    </td>
                    <td className="py-1.5 px-1.5">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        aria-label="Pump head meters"
                        value={pt.h}
                        onChange={(e) => handlePointChange(pt.id, 'h', e.target.value)}
                        className="w-full bg-[#0E1520] border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                      />
                    </td>
                    <td className="py-1.5 px-1.5">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        aria-label="Pump efficiency percent"
                        value={pt.eff}
                        onChange={(e) => handlePointChange(pt.id, 'eff', e.target.value)}
                        className="w-full bg-[#0E1520] border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                      />
                    </td>
                    <td className="py-1.5 pl-1 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemovePoint(pt.id)}
                        disabled={points.length <= 2}
                        aria-label="Remove pump curve point"
                        className="p-1 text-slate-500 hover:text-rose-400 disabled:opacity-25 disabled:pointer-events-none cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-slate-500 mt-2.5 leading-relaxed">
            Points are automatically sorted by Q and interpolated with a smooth monotone cubic spline. Enter efficiency (%) to compute BEP and the 70–120% Preferred Operating Region.
          </p>
        </div>
      </div>
    </section>
  );
};
