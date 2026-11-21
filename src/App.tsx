import React, { useMemo, useState } from 'react';
import { Download, RotateCcw } from 'lucide-react';
import {
  FITTINGS_CATALOG,
  FLUID_PRESETS,
  PIPE_STANDARDS,
  ROUGHNESS_PRESETS,
} from './data/hydraulicsData';
import {
  calcHydraulics,
  CustomFitting,
  GRAVITY,
} from './utils/hydraulicsSolver';
import { SystemCurveChart } from './components/SystemCurveChart';
import { MoodyDiagramChart } from './components/MoodyDiagramChart';
import { PumpCurveSection } from './components/PumpCurveSection';
import { FittingsBuilder } from './components/FittingsBuilder';
import { PipeSizingTable } from './components/PipeSizingTable';

const DEFAULT_STANDARD_ID = 'asme_sch40';
const DEFAULT_SIZE_IDX = 5; // DN 50 (2")
const DEFAULT_FITTINGS: Record<string, number> = {
  ent_sharp: 1,
  exit_tank: 1,
};

function getVelocityStatus(v: number): { label: string; colorClass: string } {
  if (v === 0) return { label: '— No Flow', colorClass: 'text-slate-400' };
  if (v < 0.5) return { label: '▲ Low (<0.5 m/s)', colorClass: 'text-amber-400' };
  if (v <= 2.5) return { label: '● Optimal (0.5–2.5 m/s)', colorClass: 'text-emerald-400' };
  if (v <= 4.0) return { label: '▲ High (2.5–4.0 m/s)', colorClass: 'text-amber-400' };
  return { label: '✖ Excessive (>4.0 m/s)', colorClass: 'text-rose-400' };
}

function getRegimeStatus(regime: string): { label: string; colorClass: string } {
  if (regime === 'Laminar') return { label: '● Laminar (Re < 2300)', colorClass: 'text-emerald-400' };
  if (regime === 'Transitional') return { label: '▲ Transitional (2300–4000)', colorClass: 'text-amber-400' };
  if (regime === 'Turbulent') return { label: '● Turbulent (Colebrook)', colorClass: 'text-cyan-300' };
  return { label: '— Zero Flow', colorClass: 'text-slate-400' };
}

export default function App() {
  // Flow & pipeline inputs
  const [flowRateStr, setFlowRateStr] = useState<string>('25');
  const [pipeLengthStr, setPipeLengthStr] = useState<string>('100');
  const [elevZStr, setElevZStr] = useState<string>('0');

  // Pipe database inputs
  const [standardId, setStandardId] = useState<string>(DEFAULT_STANDARD_ID);
  const [sizeIdx, setSizeIdx] = useState<number>(DEFAULT_SIZE_IDX);
  const defaultPipe = PIPE_STANDARDS[0].sizes[DEFAULT_SIZE_IDX];
  const defaultIdMm = (defaultPipe.od - 2 * defaultPipe.wt).toFixed(2);
  const [innerDiaStr, setInnerDiaStr] = useState<string>(defaultIdMm);
  const [roughnessStr, setRoughnessStr] = useState<string>('0.045');
  const [roughnessPresetId, setRoughnessPresetId] = useState<string>('cs_new');

  // Fluid inputs
  const [fluidPresetId, setFluidPresetId] = useState<string>('water_20');
  const [densityStr, setDensityStr] = useState<string>('998.2');
  const [viscosityStr, setViscosityStr] = useState<string>('1.002');

  // Fittings & minor loss state
  const [fittingQuantities, setFittingQuantities] = useState<Record<string, number>>({
    ...DEFAULT_FITTINGS,
  });
  const [customFittings, setCustomFittings] = useState<CustomFitting[]>([]);
  const [manualKOverride, setManualKOverride] = useState<boolean>(false);
  const [manualKStr, setManualKStr] = useState<string>('1.50');

  const activeStandard = useMemo(
    () => PIPE_STANDARDS.find((s) => s.id === standardId) || PIPE_STANDARDS[0],
    [standardId]
  );

  const builderTotal = useMemo(() => {
    let kSum = 0;
    let count = 0;
    FITTINGS_CATALOG.forEach((f) => {
      const q = fittingQuantities[f.id] || 0;
      if (q > 0) {
        kSum += q * f.k;
        count += q;
      }
    });
    customFittings.forEach((cf) => {
      if (cf.qty > 0) {
        kSum += cf.qty * cf.k;
        count += cf.qty;
      }
    });
    return { kSum, count };
  }, [fittingQuantities, customFittings]);

  const effectiveSumKStr = manualKOverride ? manualKStr : builderTotal.kSum.toFixed(2);

  // Parsed numeric values
  const flowRateM3h = Math.max(0, parseFloat(flowRateStr) || 0);
  const pipeLengthM = Math.max(0, parseFloat(pipeLengthStr) || 0);
  const elevZM = parseFloat(elevZStr) || 0;
  const innerDiaMm = Math.max(0.1, parseFloat(innerDiaStr) || 1);
  const roughnessMm = Math.max(0, parseFloat(roughnessStr) || 0);
  const densityKgM3 = Math.max(0.1, parseFloat(densityStr) || 998.2);
  const viscosityMPas = Math.max(0.0001, parseFloat(viscosityStr) || 1.002);
  const sumK = Math.max(0, parseFloat(effectiveSumKStr) || 0);

  const result = useMemo(
    () =>
      calcHydraulics(
        flowRateM3h,
        pipeLengthM,
        innerDiaMm,
        roughnessMm,
        densityKgM3,
        viscosityMPas,
        sumK,
        elevZM
      ),
    [flowRateM3h, pipeLengthM, innerDiaMm, roughnessMm, densityKgM3, viscosityMPas, sumK, elevZM]
  );

  const selectedPipeGeom = useMemo(() => {
    if (activeStandard.id === 'custom' || activeStandard.sizes.length === 0) return null;
    const clampedIdx = Math.min(sizeIdx, activeStandard.sizes.length - 1);
    return activeStandard.sizes[clampedIdx];
  }, [activeStandard, sizeIdx]);

  const handleStandardChange = (nextStdId: string) => {
    setStandardId(nextStdId);
    const std = PIPE_STANDARDS.find((s) => s.id === nextStdId);
    if (!std) return;

    if (std.sizes.length > 0) {
      const nextIdx = Math.min(sizeIdx, std.sizes.length - 1);
      setSizeIdx(nextIdx);
      const s = std.sizes[nextIdx];
      setInnerDiaStr((s.od - 2 * s.wt).toFixed(2));
    }

    setRoughnessStr(String(std.defaultRoughness));
    const matchRough = ROUGHNESS_PRESETS.find((r) => r.eps === std.defaultRoughness);
    if (matchRough) setRoughnessPresetId(matchRough.id);
  };

  const handleSizeChange = (nextIdx: number) => {
    setSizeIdx(nextIdx);
    const s = activeStandard.sizes[nextIdx];
    if (s) {
      setInnerDiaStr((s.od - 2 * s.wt).toFixed(2));
    }
  };

  const handleRoughnessPresetChange = (presetId: string) => {
    setRoughnessPresetId(presetId);
    const p = ROUGHNESS_PRESETS.find((r) => r.id === presetId);
    if (p) setRoughnessStr(String(p.eps));
  };

  const handleFluidPresetChange = (presetId: string) => {
    setFluidPresetId(presetId);
    const fl = FLUID_PRESETS.find((f) => f.id === presetId);
    if (fl && fl.rho !== null && fl.mu !== null) {
      setDensityStr(String(fl.rho));
      setViscosityStr(String(fl.mu));
    }
  };

  const handleChangeFittingQty = (id: string, delta: number) => {
    setManualKOverride(false);
    setFittingQuantities((prev) => {
      const nextQty = Math.max(0, (prev[id] || 0) + delta);
      const updated = { ...prev };
      if (nextQty === 0) delete updated[id];
      else updated[id] = nextQty;
      return updated;
    });
  };

  const handleAddCustomFitting = (name: string, k: number) => {
    setManualKOverride(false);
    setCustomFittings((prev) => [
      ...prev,
      { id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name, k, qty: 1 },
    ]);
  };

  const handleRemoveCustomFitting = (id: string) => {
    setManualKOverride(false);
    setCustomFittings((prev) => prev.filter((cf) => cf.id !== id));
  };

  const handleClearAllFittings = () => {
    setManualKOverride(false);
    setFittingQuantities({});
    setCustomFittings([]);
  };

  const handleResetDefaults = () => {
    setFlowRateStr('25');
    setPipeLengthStr('100');
    setElevZStr('0');
    setStandardId(DEFAULT_STANDARD_ID);
    setSizeIdx(DEFAULT_SIZE_IDX);
    setInnerDiaStr(defaultIdMm);
    setRoughnessStr('0.045');
    setRoughnessPresetId('cs_new');
    setFluidPresetId('water_20');
    setDensityStr('998.2');
    setViscosityStr('1.002');
    setFittingQuantities({ ...DEFAULT_FITTINGS });
    setCustomFittings([]);
    setManualKOverride(false);
  };

  const handleExportCsv = () => {
    const rows: [string, string, string][] = [
      ['Parameter', 'Value', 'Unit'],
      ['Pipe Standard', activeStandard.name, '-'],
      ['Nominal Size', selectedPipeGeom ? selectedPipeGeom.label : 'Custom', '-'],
      ['Inner Diameter (D)', innerDiaMm.toFixed(2), 'mm'],
      ['Wall Roughness (epsilon)', roughnessMm.toString(), 'mm'],
      ['Volumetric Flow (Q)', flowRateM3h.toFixed(3), 'm3/h'],
      ['Pipe Length (L)', pipeLengthM.toFixed(2), 'm'],
      ['Elevation Change (dz)', elevZM.toFixed(2), 'm'],
      ['Minor Loss Sum (Sigma K)', sumK.toFixed(3), '-'],
      ['Fluid Density (rho)', densityKgM3.toFixed(2), 'kg/m3'],
      ['Dynamic Viscosity (mu)', viscosityMPas.toFixed(4), 'mPa.s'],
      ['Velocity (v)', result.v.toFixed(4), 'm/s'],
      ['Reynolds Number (Re)', Math.round(result.Re).toString(), '-'],
      ['Flow Regime', result.regime, '-'],
      ['Relative Roughness (eps/D)', result.relRough.toExponential(4), '-'],
      ['Darcy Friction Factor (f)', result.f.toFixed(6), '-'],
      ['Friction Head Loss (hf)', result.hf.toFixed(4), 'm'],
      ['Minor Head Loss (hm)', result.hm.toFixed(4), 'm'],
      ['Dynamic Head Loss (hf + hm)', result.hDyn.toFixed(4), 'm'],
      ['Total Pump Head (hf + hm + dz)', result.hTot.toFixed(4), 'm'],
      ['Dynamic Pressure Drop', (result.dpDynPa / 1e5).toFixed(5), 'bar'],
      ['Dynamic Pressure Drop', (result.dpDynPa / 1e3).toFixed(3), 'kPa'],
      ['Total Pressure Required', (result.dpTotPa / 1e5).toFixed(5), 'bar'],
      ['Hydraulic Power Loss', result.powerKw.toFixed(4), 'kW'],
    ];

    const csvContent = rows
      .map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hydraulics_DN_${innerDiaMm.toFixed(0)}mm_${flowRateM3h.toFixed(0)}m3h.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const velStatus = getVelocityStatus(result.v);
  const regimeStatus = getRegimeStatus(result.regime);
  const kinViscMm2s = ((viscosityMPas * 1e-3) / densityKgM3) * 1e6;
  const dpBarDyn = result.dpDynPa / 1e5;
  const dpKpaDyn = result.dpDynPa / 1e3;
  const dpBarPer100m = pipeLengthM > 0 ? ((result.dpFrictionPa / 1e5) / pipeLengthM) * 100 : 0;
  const hfPer100m = pipeLengthM > 0 ? (result.hf / pipeLengthM) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#070B12] text-slate-100 flex flex-col">
      {/* Top Bar Contract: Wordmark — 4 single-line nav links — 1 primary action */}
      <header className="sticky top-0 z-30 bg-[#070B12]/95 backdrop-blur-sm border-b border-slate-800/90">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          <a
            href="#overview"
            className="text-base font-semibold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
          >
            SI Fluid Hydraulics
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-400">
            <a
              href="#overview"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Summary
            </a>
            <a
              href="#curves"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              System Curve
            </a>
            <a
              href="#pump-curve"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Pump &amp; BEP
            </a>
            <a
              href="#fittings"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Fittings &amp; Losses
            </a>
            <a
              href="#sizing"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Pipe Sizing
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 rounded-md hover:bg-cyan-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>
      </header>

      {/* Main Split Console */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5">
        <div className="flex flex-col lg:flex-row gap-5 items-start">
          {/* LEFT PARAMETER COLUMN */}
          <aside className="w-full lg:w-[365px] shrink-0 flex flex-col gap-4">
            {/* Section 01: Flow & Geometry */}
            <section className="bg-[#0E1520] border border-slate-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
                  01. Flow &amp; Pipeline Geometry
                </h2>
                <span className="text-[11px] font-mono text-slate-500">SI Metric</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="flowRate"
                    className="flex items-baseline justify-between text-xs text-slate-300 mb-1"
                  >
                    <span>Flow Rate (Q)</span>
                    <span className="font-mono text-[11px] text-slate-400">m³/h</span>
                  </label>
                  <input
                    id="flowRate"
                    type="number"
                    min="0"
                    step="any"
                    value={flowRateStr}
                    onChange={(e) => setFlowRateStr(e.target.value)}
                    className="w-full bg-[#070B12] border border-slate-800 rounded-md px-2.5 py-2 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                  <p className="text-[11px] font-mono tabular-nums text-slate-400 mt-1">
                    {(flowRateM3h / 3.6).toFixed(3)} L/s · {((flowRateM3h * 1000) / 60).toFixed(1)} L/m
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="pipeLength"
                    className="flex items-baseline justify-between text-xs text-slate-300 mb-1"
                  >
                    <span>Pipe Length (L)</span>
                    <span className="font-mono text-[11px] text-slate-400">m</span>
                  </label>
                  <input
                    id="pipeLength"
                    type="number"
                    min="0"
                    step="any"
                    value={pipeLengthStr}
                    onChange={(e) => setPipeLengthStr(e.target.value)}
                    className="w-full bg-[#070B12] border border-slate-800 rounded-md px-2.5 py-2 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                  <p className="text-[11px] font-mono text-slate-500 mt-1">Straight pipe run</p>
                </div>

                <div>
                  <label
                    htmlFor="sumK"
                    className="flex items-baseline justify-between text-xs text-slate-300 mb-1"
                  >
                    <span>Minor Loss (ΣK)</span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {manualKOverride ? 'manual' : `${builderTotal.count} items`}
                    </span>
                  </label>
                  <input
                    id="sumK"
                    type="number"
                    min="0"
                    step="0.05"
                    value={effectiveSumKStr}
                    onChange={(e) => {
                      setManualKOverride(true);
                      setManualKStr(e.target.value);
                    }}
                    className="w-full bg-[#070B12] border border-slate-800 rounded-md px-2.5 py-2 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                  <p className="text-[11px] font-mono text-slate-400 mt-1">
                    {manualKOverride ? 'Manual override' : 'Synced with builder'}
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="elevZ"
                    className="flex items-baseline justify-between text-xs text-slate-300 mb-1"
                  >
                    <span>Elevation (Δz)</span>
                    <span className="font-mono text-[11px] text-slate-400">m</span>
                  </label>
                  <input
                    id="elevZ"
                    type="number"
                    step="any"
                    value={elevZStr}
                    onChange={(e) => setElevZStr(e.target.value)}
                    className="w-full bg-[#070B12] border border-slate-800 rounded-md px-2.5 py-2 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                  <p className="text-[11px] font-mono text-slate-500 mt-1">+ lift / - drop</p>
                </div>
              </div>
            </section>

            {/* Section 02: Pipe Database */}
            <section className="bg-[#0E1520] border border-slate-800 rounded-lg p-4 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
                02. Pipe Database (SI / Metric)
              </h2>

              <div>
                <label htmlFor="pipeStandard" className="block text-xs text-slate-300 mb-1">
                  Pipe Standard / Series
                </label>
                <select
                  id="pipeStandard"
                  value={standardId}
                  onChange={(e) => handleStandardChange(e.target.value)}
                  className="w-full bg-[#070B12] border border-slate-800 rounded-md px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                >
                  {PIPE_STANDARDS.map((std) => (
                    <option key={std.id} value={std.id}>
                      {std.name}
                    </option>
                  ))}
                </select>
              </div>

              {activeStandard.id !== 'custom' && activeStandard.sizes.length > 0 && (
                <div>
                  <label htmlFor="pipeSize" className="block text-xs text-slate-300 mb-1">
                    Nominal Pipe Size
                  </label>
                  <select
                    id="pipeSize"
                    value={Math.min(sizeIdx, activeStandard.sizes.length - 1)}
                    onChange={(e) => handleSizeChange(parseInt(e.target.value, 10))}
                    className="w-full bg-[#070B12] border border-slate-800 rounded-md px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                  >
                    {activeStandard.sizes.map((s, idx) => {
                      const id = s.od - 2 * s.wt;
                      return (
                        <option key={s.label} value={idx}>
                          {s.label} — ID {id.toFixed(2)} mm
                        </option>
                      );
                    })}
                  </select>
                  {selectedPipeGeom && (
                    <p className="text-[11px] font-mono tabular-nums text-slate-400 mt-1">
                      OD {selectedPipeGeom.od.toFixed(1)} mm · Wall {selectedPipeGeom.wt.toFixed(2)} mm
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="innerDia"
                    className="flex items-baseline justify-between text-xs text-slate-300 mb-1"
                  >
                    <span>Inner Dia (D)</span>
                    <span className="font-mono text-[11px] text-slate-400">mm</span>
                  </label>
                  <input
                    id="innerDia"
                    type="number"
                    min="0.1"
                    step="any"
                    disabled={activeStandard.id !== 'custom'}
                    value={innerDiaStr}
                    onChange={(e) => setInnerDiaStr(e.target.value)}
                    className="w-full bg-[#070B12] border border-slate-800 rounded-md px-2.5 py-2 text-sm font-mono tabular-nums text-slate-100 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="roughness"
                    className="flex items-baseline justify-between text-xs text-slate-300 mb-1"
                  >
                    <span>Roughness (ε)</span>
                    <span className="font-mono text-[11px] text-slate-400">mm</span>
                  </label>
                  <input
                    id="roughness"
                    type="number"
                    min="0"
                    step="0.001"
                    value={roughnessStr}
                    onChange={(e) => setRoughnessStr(e.target.value)}
                    className="w-full bg-[#070B12] border border-slate-800 rounded-md px-2.5 py-2 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="roughnessPreset" className="block text-xs text-slate-300 mb-1">
                  Material Roughness Preset
                </label>
                <select
                  id="roughnessPreset"
                  value={roughnessPresetId}
                  onChange={(e) => handleRoughnessPresetChange(e.target.value)}
                  className="w-full bg-[#070B12] border border-slate-800 rounded-md px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                >
                  {ROUGHNESS_PRESETS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            {/* Section 03: Fluid Properties */}
            <section className="bg-[#0E1520] border border-slate-800 rounded-lg p-4 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
                03. Fluid Properties
              </h2>

              <div>
                <label htmlFor="fluidPreset" className="block text-xs text-slate-300 mb-1">
                  Fluid Preset
                </label>
                <select
                  id="fluidPreset"
                  value={fluidPresetId}
                  onChange={(e) => handleFluidPresetChange(e.target.value)}
                  className="w-full bg-[#070B12] border border-slate-800 rounded-md px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                >
                  {FLUID_PRESETS.map((fl) => (
                    <option key={fl.id} value={fl.id}>
                      {fl.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="density"
                    className="flex items-baseline justify-between text-xs text-slate-300 mb-1"
                  >
                    <span>Density (ρ)</span>
                    <span className="font-mono text-[11px] text-slate-400">kg/m³</span>
                  </label>
                  <input
                    id="density"
                    type="number"
                    min="0.1"
                    step="any"
                    value={densityStr}
                    onChange={(e) => {
                      setFluidPresetId('custom');
                      setDensityStr(e.target.value);
                    }}
                    className="w-full bg-[#070B12] border border-slate-800 rounded-md px-2.5 py-2 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="viscosity"
                    className="flex items-baseline justify-between text-xs text-slate-300 mb-1"
                  >
                    <span>Viscosity (μ)</span>
                    <span className="font-mono text-[11px] text-slate-400">mPa·s</span>
                  </label>
                  <input
                    id="viscosity"
                    type="number"
                    min="0.0001"
                    step="any"
                    value={viscosityStr}
                    onChange={(e) => {
                      setFluidPresetId('custom');
                      setViscosityStr(e.target.value);
                    }}
                    className="w-full bg-[#070B12] border border-slate-800 rounded-md px-2.5 py-2 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <p className="text-[11px] font-mono tabular-nums text-slate-400">
                Kinematic viscosity ν = {kinViscMm2s.toFixed(3)} mm²/s (cSt)
              </p>
            </section>

            <button
              type="button"
              onClick={handleResetDefaults}
              className="inline-flex items-center justify-center gap-2 py-2 px-4 text-xs font-medium text-slate-400 hover:text-slate-100 border border-slate-800 rounded-md bg-[#0E1520] hover:border-slate-700 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Inputs to Defaults
            </button>
          </aside>

          {/* RIGHT ANALYTICAL VIEWPORT */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {/* KPI Readout Row */}
            <section
              id="overview"
              className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 scroll-mt-16"
            >
              <div className="bg-[#0E1520] border border-slate-800 rounded-lg p-4">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Flow Velocity (v)
                </div>
                <div className="mt-1.5 flex items-baseline">
                  <span className="text-2xl font-mono tabular-nums font-semibold text-slate-100">
                    {result.v.toFixed(3)}
                  </span>
                  <span className="text-xs font-mono text-slate-400 ml-1.5">m/s</span>
                </div>
                <div className={`mt-1.5 text-xs font-medium ${velStatus.colorClass}`}>
                  {velStatus.label}
                </div>
              </div>

              <div className="bg-[#0E1520] border border-slate-800 rounded-lg p-4">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Friction + Minor ΔP
                </div>
                <div className="mt-1.5 flex items-baseline">
                  <span className="text-2xl font-mono tabular-nums font-semibold text-cyan-300">
                    {dpBarDyn.toFixed(4)}
                  </span>
                  <span className="text-xs font-mono text-slate-400 ml-1.5">bar</span>
                </div>
                <div className="mt-1.5 text-xs font-mono tabular-nums text-slate-400">
                  {dpKpaDyn.toFixed(2)} kPa · {dpBarPer100m.toFixed(3)} bar/100m
                </div>
              </div>

              <div className="bg-[#0E1520] border border-slate-800 rounded-lg p-4">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Dynamic Head Loss (h_f + h_m)
                </div>
                <div className="mt-1.5 flex items-baseline">
                  <span className="text-2xl font-mono tabular-nums font-semibold text-slate-100">
                    {result.hDyn.toFixed(3)}
                  </span>
                  <span className="text-xs font-mono text-slate-400 ml-1.5">m</span>
                </div>
                <div className="mt-1.5 text-xs font-mono tabular-nums text-slate-400">
                  {hfPer100m.toFixed(2)} m / 100 m (friction)
                </div>
              </div>

              <div className="bg-[#0E1520] border border-slate-800 rounded-lg p-4">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Darcy Friction Factor (f)
                </div>
                <div className="mt-1.5 flex items-baseline">
                  <span className="text-2xl font-mono tabular-nums font-semibold text-slate-100">
                    {result.f > 0 ? result.f.toFixed(5) : '—'}
                  </span>
                </div>
                <div className={`mt-1.5 text-xs font-medium ${regimeStatus.colorClass}`}>
                  {regimeStatus.label}
                </div>
              </div>
            </section>

            {/* Dual Scientific Charts: System Curve + Moody Diagram */}
            <div id="curves" className="grid grid-cols-1 xl:grid-cols-2 gap-4 scroll-mt-16">
              <SystemCurveChart
                flowRateM3h={flowRateM3h}
                pipeLengthM={pipeLengthM}
                innerDiaMm={innerDiaMm}
                roughnessMm={roughnessMm}
                densityKgM3={densityKgM3}
                viscosityMPas={viscosityMPas}
                sumK={sumK}
                elevZM={elevZM}
                currentResult={result}
              />

              <MoodyDiagramChart
                currentRe={result.Re}
                currentF={result.f}
                currentRelRough={result.relRough}
              />
            </div>

            {/* Hydraulic Breakdown */}
            <section className="bg-[#0E1520] border border-slate-800 rounded-lg p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="text-sm font-semibold text-slate-100 tracking-tight">
                  Hydraulic Breakdown &amp; Solver Telemetry
                </h2>
                <span className="text-xs font-mono tabular-nums text-slate-300">
                  Hydraulic Power Loss: {result.powerKw.toFixed(4)} kW
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                <dl className="divide-y divide-slate-800/70 text-xs">
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-slate-400">Volumetric Flow (Q)</dt>
                    <dd className="font-mono tabular-nums text-slate-200">
                      {result.Q.toExponential(4)} m³/s ({flowRateM3h.toFixed(2)} m³/h)
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-slate-400">Cross-Sectional Area (A)</dt>
                    <dd className="font-mono tabular-nums text-slate-200">
                      {(result.area * 1e4).toFixed(3)} cm² ({result.area.toExponential(3)} m²)
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-slate-400">Reynolds Number (Re)</dt>
                    <dd className="font-mono tabular-nums text-slate-200">
                      {result.Re > 0 ? Math.round(result.Re).toLocaleString() : '0'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-slate-400">Relative Roughness (ε / D)</dt>
                    <dd className="font-mono tabular-nums text-slate-200">
                      {result.relRough.toExponential(3)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-slate-400">Velocity Head (v² / 2g)</dt>
                    <dd className="font-mono tabular-nums text-slate-200">
                      {result.velHead.toFixed(4)} m ({((densityKgM3 * GRAVITY * result.velHead) / 1e3).toFixed(2)} kPa)
                    </dd>
                  </div>
                </dl>

                <dl className="divide-y divide-slate-800/70 text-xs border-t md:border-t-0 border-slate-800/70">
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-slate-400">Friction Head Loss (h_f)</dt>
                    <dd className="font-mono tabular-nums text-slate-200">
                      {result.hf.toFixed(4)} m ({(result.dpFrictionPa / 1e5).toFixed(4)} bar)
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-slate-400">Minor / Fitting Losses (h_m)</dt>
                    <dd className="font-mono tabular-nums text-slate-200">
                      {result.hm.toFixed(4)} m ({(result.dpMinorPa / 1e5).toFixed(4)} bar)
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-slate-400">Static Elevation Head (Δz)</dt>
                    <dd className="font-mono tabular-nums text-slate-200">
                      {elevZM.toFixed(2)} m ({((densityKgM3 * GRAVITY * elevZM) / 1e5).toFixed(4)} bar)
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-slate-400">Total Pump Head (h_f + h_m + Δz)</dt>
                    <dd className="font-mono tabular-nums font-semibold text-cyan-300">
                      {result.hTot.toFixed(3)} m
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-slate-400">Total Pressure Required (incl. Δz)</dt>
                    <dd className="font-mono tabular-nums font-semibold text-cyan-300">
                      {(result.dpTotPa / 1e5).toFixed(4)} bar ({(result.dpTotPa / 1e3).toFixed(2)} kPa)
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-xs font-mono tabular-nums text-slate-400">
                {result.Re >= 2300
                  ? `Colebrook–White converged in ${result.iter} Newton-Raphson iterations (residual ${result.residual.toExponential(2)}).`
                  : result.Re > 0
                    ? 'Laminar flow (Re < 2300): exact Hagen–Poiseuille friction factor f = 64 / Re.'
                    : 'Enter a positive volumetric flow rate to compute hydraulics.'}
              </div>
            </section>

            {/* Centrifugal Pump Curve & BEP Matching */}
            <PumpCurveSection
              flowRateM3h={flowRateM3h}
              pipeLengthM={pipeLengthM}
              innerDiaMm={innerDiaMm}
              roughnessMm={roughnessMm}
              densityKgM3={densityKgM3}
              viscosityMPas={viscosityMPas}
              sumK={sumK}
              elevZM={elevZM}
              currentSystemHeadM={result.hTot}
              onApplyDutyFlow={(q) => setFlowRateStr(String(q))}
            />

            {/* Expanded Fittings & Minor Losses Builder */}
            <FittingsBuilder
              fittingQuantities={fittingQuantities}
              customFittings={customFittings}
              activeDiaMm={innerDiaMm}
              velHeadM={result.velHead}
              densityKgM3={densityKgM3}
              manualKOverride={manualKOverride}
              onChangeQty={handleChangeFittingQty}
              onAddCustom={handleAddCustomFitting}
              onRemoveCustom={handleRemoveCustomFitting}
              onClearAll={handleClearAllFittings}
              onResyncFromBuilder={() => setManualKOverride(false)}
            />

            {/* Pipe Sizing Comparison Table */}
            <PipeSizingTable
              standard={activeStandard}
              selectedSizeIdx={sizeIdx}
              flowRateM3h={flowRateM3h}
              pipeLengthM={pipeLengthM}
              roughnessMm={roughnessMm}
              densityKgM3={densityKgM3}
              viscosityMPas={viscosityMPas}
              onSelectSize={handleSizeChange}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
