import React, { useMemo, useState } from 'react';
import { Download, FileDown, Lock, RotateCcw, Unlock } from 'lucide-react';
import {
  FITTINGS_CATALOG,
  FLUID_PRESETS,
  PIPE_STANDARDS,
  ROUGHNESS_PRESETS,
} from './data/hydraulicsData';
import {
  BoundaryCondition,
  calcPumpSystem,
  ControlValveCharacteristic,
  ControlValveConfig,
  ControlValveMode,
  CustomFitting,
  findPumpNetworkIntersection,
  PipeLegConfig,
  PumpCurvePoint,
} from './utils/hydraulicsSolver';
import { SystemSchematicStrip } from './components/SystemSchematicStrip';
import { SystemCurveChart } from './components/SystemCurveChart';
import { MoodyDiagramChart } from './components/MoodyDiagramChart';
import { DEFAULT_PUMP_POINTS, PumpCurveSection } from './components/PumpCurveSection';
import { FittingsBuilder } from './components/FittingsBuilder';
import { PipeSizingTable } from './components/PipeSizingTable';

const DEFAULT_STANDARD_ID = 'asme_sch40';
const DEFAULT_SUCTION_SIZE_IDX = 7; // DN 80 (3")
const DEFAULT_DISCHARGE_SIZE_IDX = 6; // DN 65 (2-1/2")

const DEFAULT_SUCTION_FITTINGS: Record<string, number> = {
  ent_sharp: 1,
  val_gate_open: 1,
  elb_90_lr: 2,
};

const DEFAULT_DISCHARGE_FITTINGS: Record<string, number> = {
  val_chk_swing: 1,
  val_gate_open: 1,
  elb_90_lr: 4,
  exit_tank: 1,
};

function getPipeIdMm(standardId: string, sizeIdx: number): string {
  const std = PIPE_STANDARDS.find((s) => s.id === standardId) || PIPE_STANDARDS[0];
  const clamped = Math.min(sizeIdx, Math.max(0, std.sizes.length - 1));
  const sz = std.sizes[clamped];
  return sz ? (sz.od - 2 * sz.wt).toFixed(2) : '52.48';
}

function getSuctionVelStatus(v: number): { label: string; colorClass: string } {
  if (v === 0) return { label: '— No Flow', colorClass: 'text-slate-400' };
  if (v < 0.4) return { label: '▲ Low (<0.4)', colorClass: 'text-amber-400' };
  if (v <= 1.5) return { label: '● Optimal (0.4–1.5)', colorClass: 'text-emerald-400' };
  if (v <= 2.2) return { label: '▲ High (1.5–2.2)', colorClass: 'text-amber-400' };
  return { label: '✖ Excessive (>2.2)', colorClass: 'text-rose-400' };
}

function getDischargeVelStatus(v: number): { label: string; colorClass: string } {
  if (v === 0) return { label: '— No Flow', colorClass: 'text-slate-400' };
  if (v < 0.5) return { label: '▲ Low (<0.5)', colorClass: 'text-amber-400' };
  if (v <= 2.5) return { label: '● Optimal (0.5–2.5)', colorClass: 'text-emerald-400' };
  if (v <= 4.0) return { label: '▲ High (2.5–4.0)', colorClass: 'text-amber-400' };
  return { label: '✖ Excessive (>4.0)', colorClass: 'text-rose-400' };
}

function getNpshaStatus(npsha: number): { label: string; colorClass: string } {
  if (npsha < 0.5) return { label: '✖ Cavitation Risk (<0.5 m)', colorClass: 'text-rose-400' };
  if (npsha < 2.0) return { label: '▲ Low Margin (<2.0 m)', colorClass: 'text-amber-400' };
  return { label: '● Adequate Margin', colorClass: 'text-emerald-400' };
}

function sumBuilderK(
  quantities: Record<string, number>,
  customList: CustomFitting[]
): { kSum: number; count: number } {
  let kSum = 0;
  let count = 0;
  FITTINGS_CATALOG.forEach((f) => {
    const q = quantities[f.id] || 0;
    if (q > 0) {
      kSum += q * f.k;
      count += q;
    }
  });
  customList.forEach((cf) => {
    if (cf.qty > 0) {
      kSum += cf.qty * cf.k;
      count += cf.qty;
    }
  });
  return { kSum, count };
}

export default function App() {
  // Flow & duty lock
  const [flowRateStr, setFlowRateStr] = useState<string>('25');
  const [followDutyFlow, setFollowDutyFlow] = useState<boolean>(true);

  // Fluid properties (incl. vapor & atmospheric pressure for NPSHa)
  const [fluidPresetId, setFluidPresetId] = useState<string>('water_20');
  const [densityStr, setDensityStr] = useState<string>('998.2');
  const [viscosityStr, setViscosityStr] = useState<string>('1.002');
  const [vaporPressKpaStr, setVaporPressKpaStr] = useState<string>('2.34');
  const [atmPressBarStr, setAtmPressBarStr] = useState<string>('1.01325');

  // Source & Destination boundary conditions (elevations relative to pump centerline z = 0)
  const [sourceGaugeBarStr, setSourceGaugeBarStr] = useState<string>('0.00');
  const [sourceElevMStr, setSourceElevMStr] = useState<string>('2.0');
  const [destGaugeBarStr, setDestGaugeBarStr] = useState<string>('1.00');
  const [destElevMStr, setDestElevMStr] = useState<string>('10.0');

  // Suction pipe parameters
  const [suctionStdId, setSuctionStdId] = useState<string>(DEFAULT_STANDARD_ID);
  const [suctionSizeIdx, setSuctionSizeIdx] = useState<number>(DEFAULT_SUCTION_SIZE_IDX);
  const [suctionDiaStr, setSuctionDiaStr] = useState<string>(() =>
    getPipeIdMm(DEFAULT_STANDARD_ID, DEFAULT_SUCTION_SIZE_IDX)
  );
  const [suctionLenStr, setSuctionLenStr] = useState<string>('8');
  const [suctionRoughStr, setSuctionRoughStr] = useState<string>('0.045');
  const [suctionRoughPresetId, setSuctionRoughPresetId] = useState<string>('cs_new');
  const [suctionFittings, setSuctionFittings] = useState<Record<string, number>>({
    ...DEFAULT_SUCTION_FITTINGS,
  });
  const [suctionCustomFittings, setSuctionCustomFittings] = useState<CustomFitting[]>([]);
  const [suctionManualK, setSuctionManualK] = useState<boolean>(false);
  const [suctionManualKStr, setSuctionManualKStr] = useState<string>('1.90');

  // Discharge pipe parameters
  const [dischargeStdId, setDischargeStdId] = useState<string>(DEFAULT_STANDARD_ID);
  const [dischargeSizeIdx, setDischargeSizeIdx] = useState<number>(DEFAULT_DISCHARGE_SIZE_IDX);
  const [dischargeDiaStr, setDischargeDiaStr] = useState<string>(() =>
    getPipeIdMm(DEFAULT_STANDARD_ID, DEFAULT_DISCHARGE_SIZE_IDX)
  );
  const [dischargeLenStr, setDischargeLenStr] = useState<string>('65');
  const [dischargeRoughStr, setDischargeRoughStr] = useState<string>('0.045');
  const [dischargeRoughPresetId, setDischargeRoughPresetId] = useState<string>('cs_new');
  const [dischargeFittings, setDischargeFittings] = useState<Record<string, number>>({
    ...DEFAULT_DISCHARGE_FITTINGS,
  });
  const [dischargeCustomFittings, setDischargeCustomFittings] = useState<CustomFitting[]>([]);
  const [dischargeManualK, setDischargeManualK] = useState<boolean>(false);
  const [dischargeManualKStr, setDischargeManualKStr] = useState<string>('5.60');

  // Discharge Control Valve parameters
  const [valveMode, setValveMode] = useState<ControlValveMode>('throttle_kv');
  const [valveKv100Str, setValveKv100Str] = useState<string>('60');
  const [valveOpeningStr, setValveOpeningStr] = useState<string>('84');
  const [valveChar, setValveChar] = useState<ControlValveCharacteristic>('equal_pct');

  // Pump Curve Points (lifted so Target Flow CV sizing and Duty Lock both access it)
  const [pumpPoints, setPumpPoints] = useState<PumpCurvePoint[]>(DEFAULT_PUMP_POINTS);

  // Active target line in Builders / Sizing table
  const [activeLineTab, setActiveLineTab] = useState<'suction' | 'discharge'>('discharge');

  // Packaging HTML state
  const [isPackagingHtml, setIsPackagingHtml] = useState<boolean>(false);

  const sortedPumpPoints = useMemo(
    () =>
      [...pumpPoints]
        .filter((p) => Number.isFinite(p.q) && Number.isFinite(p.h) && p.q >= 0)
        .sort((a, b) => a.q - b.q),
    [pumpPoints]
  );

  const suctionBuilder = useMemo(
    () => sumBuilderK(suctionFittings, suctionCustomFittings),
    [suctionFittings, suctionCustomFittings]
  );
  const dischargeBuilder = useMemo(
    () => sumBuilderK(dischargeFittings, dischargeCustomFittings),
    [dischargeFittings, dischargeCustomFittings]
  );

  const suctionSumKStr = suctionManualK ? suctionManualKStr : suctionBuilder.kSum.toFixed(2);
  const dischargeSumKStr = dischargeManualK
    ? dischargeManualKStr
    : dischargeBuilder.kSum.toFixed(2);

  // Parsed numeric parameters
  const densityKgM3 = Math.max(0.1, parseFloat(densityStr) || 998.2);
  const viscosityMPas = Math.max(0.0001, parseFloat(viscosityStr) || 1.002);
  const pvKpa = Math.max(0, parseFloat(vaporPressKpaStr) || 0);
  const atmBar = Math.max(0.1, parseFloat(atmPressBarStr) || 1.01325);

  const source: BoundaryCondition = useMemo(
    () => ({
      gaugeBar: parseFloat(sourceGaugeBarStr) || 0,
      elevM: parseFloat(sourceElevMStr) || 0,
    }),
    [sourceGaugeBarStr, sourceElevMStr]
  );

  const dest: BoundaryCondition = useMemo(
    () => ({
      gaugeBar: parseFloat(destGaugeBarStr) || 0,
      elevM: parseFloat(destElevMStr) || 0,
    }),
    [destGaugeBarStr, destElevMStr]
  );

  const suctionLeg: PipeLegConfig = useMemo(
    () => ({
      lengthM: Math.max(0, parseFloat(suctionLenStr) || 0),
      innerDiaMm: Math.max(0.1, parseFloat(suctionDiaStr) || 1),
      roughnessMm: Math.max(0, parseFloat(suctionRoughStr) || 0),
      sumK: Math.max(0, parseFloat(suctionSumKStr) || 0),
    }),
    [suctionLenStr, suctionDiaStr, suctionRoughStr, suctionSumKStr]
  );

  const dischargeLeg: PipeLegConfig = useMemo(
    () => ({
      lengthM: Math.max(0, parseFloat(dischargeLenStr) || 0),
      innerDiaMm: Math.max(0.1, parseFloat(dischargeDiaStr) || 1),
      roughnessMm: Math.max(0, parseFloat(dischargeRoughStr) || 0),
      sumK: Math.max(0, parseFloat(dischargeSumKStr) || 0),
    }),
    [dischargeLenStr, dischargeDiaStr, dischargeRoughStr, dischargeSumKStr]
  );

  const valve: ControlValveConfig = useMemo(
    () => ({
      mode: valveMode,
      kv100: Math.max(0.1, parseFloat(valveKv100Str) || 60),
      openingPct: Math.max(1, Math.min(100, parseFloat(valveOpeningStr) || 1)),
      characteristic: valveChar,
      rangeability: 50,
    }),
    [valveMode, valveKv100Str, valveOpeningStr, valveChar]
  );

  // Compute Pump + Control Valve Duty Point so followDutyFlow can sync Q automatically
  const dutyIntersection = useMemo(
    () =>
      findPumpNetworkIntersection(
        sortedPumpPoints,
        suctionLeg,
        dischargeLeg,
        source,
        dest,
        densityKgM3,
        viscosityMPas,
        valve,
        pvKpa,
        atmBar
      ),
    [
      sortedPumpPoints,
      suctionLeg,
      dischargeLeg,
      source,
      dest,
      densityKgM3,
      viscosityMPas,
      valve,
      pvKpa,
      atmBar,
    ]
  );

  const manualFlowM3h = Math.max(0, parseFloat(flowRateStr) || 0);
  const effectiveFlowM3h =
    followDutyFlow && valveMode !== 'target_flow' && dutyIntersection.found
      ? dutyIntersection.qOp
      : manualFlowM3h;

  const systemResult = useMemo(
    () =>
      calcPumpSystem(
        effectiveFlowM3h,
        suctionLeg,
        dischargeLeg,
        source,
        dest,
        densityKgM3,
        viscosityMPas,
        valve,
        pvKpa,
        atmBar,
        sortedPumpPoints
      ),
    [
      effectiveFlowM3h,
      suctionLeg,
      dischargeLeg,
      source,
      dest,
      densityKgM3,
      viscosityMPas,
      valve,
      pvKpa,
      atmBar,
      sortedPumpPoints,
    ]
  );

  const suctionStandard = useMemo(
    () => PIPE_STANDARDS.find((s) => s.id === suctionStdId) || PIPE_STANDARDS[0],
    [suctionStdId]
  );
  const dischargeStandard = useMemo(
    () => PIPE_STANDARDS.find((s) => s.id === dischargeStdId) || PIPE_STANDARDS[0],
    [dischargeStdId]
  );

  const handleLegStandardChange = (line: 'suction' | 'discharge', nextStdId: string) => {
    const std = PIPE_STANDARDS.find((s) => s.id === nextStdId);
    if (!std) return;
    const matchRough = ROUGHNESS_PRESETS.find((r) => r.eps === std.defaultRoughness);

    if (line === 'suction') {
      setSuctionStdId(nextStdId);
      if (std.sizes.length > 0) {
        const nextIdx = Math.min(suctionSizeIdx, std.sizes.length - 1);
        setSuctionSizeIdx(nextIdx);
        const s = std.sizes[nextIdx];
        setSuctionDiaStr((s.od - 2 * s.wt).toFixed(2));
      }
      setSuctionRoughStr(String(std.defaultRoughness));
      if (matchRough) setSuctionRoughPresetId(matchRough.id);
    } else {
      setDischargeStdId(nextStdId);
      if (std.sizes.length > 0) {
        const nextIdx = Math.min(dischargeSizeIdx, std.sizes.length - 1);
        setDischargeSizeIdx(nextIdx);
        const s = std.sizes[nextIdx];
        setDischargeDiaStr((s.od - 2 * s.wt).toFixed(2));
      }
      setDischargeRoughStr(String(std.defaultRoughness));
      if (matchRough) setDischargeRoughPresetId(matchRough.id);
    }
  };

  const handleLegSizeChange = (line: 'suction' | 'discharge', nextIdx: number) => {
    if (line === 'suction') {
      setSuctionSizeIdx(nextIdx);
      const s = suctionStandard.sizes[nextIdx];
      if (s) setSuctionDiaStr((s.od - 2 * s.wt).toFixed(2));
    } else {
      setDischargeSizeIdx(nextIdx);
      const s = dischargeStandard.sizes[nextIdx];
      if (s) setDischargeDiaStr((s.od - 2 * s.wt).toFixed(2));
    }
  };

  const handleFluidPresetChange = (presetId: string) => {
    setFluidPresetId(presetId);
    const fl = FLUID_PRESETS.find((f) => f.id === presetId);
    if (fl && fl.rho !== null && fl.mu !== null) {
      setDensityStr(String(fl.rho));
      setViscosityStr(String(fl.mu));
      if (fl.pvKpa !== null) setVaporPressKpaStr(String(fl.pvKpa));
    }
  };

  const handleChangeFittingQty = (line: 'suction' | 'discharge', id: string, delta: number) => {
    const updater = (prev: Record<string, number>) => {
      const nextQty = Math.max(0, (prev[id] || 0) + delta);
      const updated = { ...prev };
      if (nextQty === 0) delete updated[id];
      else updated[id] = nextQty;
      return updated;
    };
    if (line === 'suction') {
      setSuctionManualK(false);
      setSuctionFittings(updater);
    } else {
      setDischargeManualK(false);
      setDischargeFittings(updater);
    }
  };

  const handleAddCustomFitting = (line: 'suction' | 'discharge', name: string, k: number) => {
    const item: CustomFitting = {
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      k,
      qty: 1,
    };
    if (line === 'suction') {
      setSuctionManualK(false);
      setSuctionCustomFittings((prev) => [...prev, item]);
    } else {
      setDischargeManualK(false);
      setDischargeCustomFittings((prev) => [...prev, item]);
    }
  };

  const handleRemoveCustomFitting = (line: 'suction' | 'discharge', id: string) => {
    if (line === 'suction') {
      setSuctionManualK(false);
      setSuctionCustomFittings((prev) => prev.filter((cf) => cf.id !== id));
    } else {
      setDischargeManualK(false);
      setDischargeCustomFittings((prev) => prev.filter((cf) => cf.id !== id));
    }
  };

  const handleClearLineFittings = (line: 'suction' | 'discharge') => {
    if (line === 'suction') {
      setSuctionManualK(false);
      setSuctionFittings({});
      setSuctionCustomFittings([]);
    } else {
      setDischargeManualK(false);
      setDischargeFittings({});
      setDischargeCustomFittings([]);
    }
  };

  const handleResetDefaults = () => {
    setFlowRateStr('25');
    setFollowDutyFlow(true);
    setFluidPresetId('water_20');
    setDensityStr('998.2');
    setViscosityStr('1.002');
    setVaporPressKpaStr('2.34');
    setAtmPressBarStr('1.01325');

    setSourceGaugeBarStr('0.00');
    setSourceElevMStr('2.0');
    setDestGaugeBarStr('1.00');
    setDestElevMStr('10.0');

    setSuctionStdId(DEFAULT_STANDARD_ID);
    setSuctionSizeIdx(DEFAULT_SUCTION_SIZE_IDX);
    setSuctionDiaStr(getPipeIdMm(DEFAULT_STANDARD_ID, DEFAULT_SUCTION_SIZE_IDX));
    setSuctionLenStr('8');
    setSuctionRoughStr('0.045');
    setSuctionRoughPresetId('cs_new');
    setSuctionFittings({ ...DEFAULT_SUCTION_FITTINGS });
    setSuctionCustomFittings([]);
    setSuctionManualK(false);

    setDischargeStdId(DEFAULT_STANDARD_ID);
    setDischargeSizeIdx(DEFAULT_DISCHARGE_SIZE_IDX);
    setDischargeDiaStr(getPipeIdMm(DEFAULT_STANDARD_ID, DEFAULT_DISCHARGE_SIZE_IDX));
    setDischargeLenStr('65');
    setDischargeRoughStr('0.045');
    setDischargeRoughPresetId('cs_new');
    setDischargeFittings({ ...DEFAULT_DISCHARGE_FITTINGS });
    setDischargeCustomFittings([]);
    setDischargeManualK(false);

    setValveMode('throttle_kv');
    setValveKv100Str('60');
    setValveOpeningStr('84');
    setValveChar('equal_pct');
    setPumpPoints(DEFAULT_PUMP_POINTS);
  };

  const handleExportCsv = () => {
    const rows: [string, string, string][] = [
      ['Parameter', 'Value', 'Unit'],
      ['Volumetric Flow (Q)', effectiveFlowM3h.toFixed(3), 'm3/h'],
      ['Fluid Density (rho)', densityKgM3.toFixed(2), 'kg/m3'],
      ['Dynamic Viscosity (mu)', viscosityMPas.toFixed(4), 'mPa.s'],
      ['Vapor Pressure (Pv)', pvKpa.toFixed(3), 'kPa(a)'],
      ['Source Gauge Pressure (Ps)', source.gaugeBar.toFixed(4), 'bar(g)'],
      ['Source Elevation rel. to Pump (z1)', source.elevM.toFixed(2), 'm'],
      ['Destination Gauge Pressure (Pd)', dest.gaugeBar.toFixed(4), 'bar(g)'],
      ['Destination Elevation rel. to Pump (z2)', dest.elevM.toFixed(2), 'm'],
      ['Static Elevation Difference (z2 - z1)', systemResult.staticElevHeadM.toFixed(3), 'm'],
      ['Static Pressure Head ((Pd - Ps)/gamma)', systemResult.staticPressHeadM.toFixed(3), 'm'],
      ['Total Static Head (H_static)', systemResult.staticTotalHeadM.toFixed(3), 'm'],
      ['Suction Pipe ID (Ds)', suctionLeg.innerDiaMm.toFixed(2), 'mm'],
      ['Suction Length (Ls)', suctionLeg.lengthM.toFixed(2), 'm'],
      ['Suction Velocity (vs)', systemResult.suction.v.toFixed(4), 'm/s'],
      ['Suction Reynolds (Re_s)', Math.round(systemResult.suction.Re).toString(), '-'],
      ['Suction Friction Factor (fs)', systemResult.suction.f.toFixed(6), '-'],
      ['Suction Head Loss (h_Ls)', systemResult.suctionLossM.toFixed(4), 'm'],
      ['Pump Suction Nozzle Pressure', systemResult.suctionFlangeGaugeBar.toFixed(4), 'bar(g)'],
      ['NPSH Available (NPSHa)', systemResult.npshaM.toFixed(3), 'm'],
      ['Discharge Pipe ID (Dd)', dischargeLeg.innerDiaMm.toFixed(2), 'mm'],
      ['Discharge Length (Ld)', dischargeLeg.lengthM.toFixed(2), 'm'],
      ['Discharge Velocity (vd)', systemResult.discharge.v.toFixed(4), 'm/s'],
      ['Discharge Reynolds (Re_d)', Math.round(systemResult.discharge.Re).toString(), '-'],
      ['Discharge Friction Factor (fd)', systemResult.discharge.f.toFixed(6), '-'],
      ['Discharge Pipe Head Loss (h_Ld)', systemResult.dischargeLossM.toFixed(4), 'm'],
      ['Control Valve Mode', valveMode, '-'],
      ['Control Valve Active Kv', Number.isFinite(systemResult.valveKvActive) ? systemResult.valveKvActive.toFixed(3) : 'Inf', 'm3/h'],
      ['Control Valve Pressure Drop (dP_cv)', systemResult.valveDpBar.toFixed(4), 'bar'],
      ['Control Valve Head Loss (dh_cv)', systemResult.valveLossM.toFixed(4), 'm'],
      ['Control Valve Authority', (systemResult.valveAuthority * 100).toFixed(1), '%'],
      ['Pump Discharge Nozzle Pressure', systemResult.dischargeFlangeGaugeBar.toFixed(4), 'bar(g)'],
      ['Total Pump Dynamic Head (TDH)', systemResult.totalPumpHeadM.toFixed(4), 'm'],
      ['Total Pump Differential Pressure', systemResult.totalPumpDpBar.toFixed(4), 'bar'],
      ['Hydraulic Power Required', systemResult.hydPowerKw.toFixed(4), 'kW'],
    ];

    const csvContent = rows
      .map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pump_hydraulics_${effectiveFlowM3h.toFixed(0)}m3h.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadHtml = async () => {
    if (isPackagingHtml) return;
    setIsPackagingHtml(true);
    try {
      let htmlBlob: Blob;

      if (window.location.protocol === 'file:') {
        const clone = document.documentElement.cloneNode(true) as HTMLElement;
        const rootEl = clone.querySelector('#root');
        if (rootEl) rootEl.innerHTML = '';
        htmlBlob = new Blob([`<!doctype html>\n${clone.outerHTML}`], {
          type: 'text/html;charset=utf-8',
        });
      } else {
        const res = await fetch('/hydraulics-calculator.html', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`Failed to package standalone HTML (${res.status})`);
        }
        const htmlText = await res.text();
        htmlBlob = new Blob([htmlText], { type: 'text/html;charset=utf-8' });
      }

      const url = URL.createObjectURL(htmlBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'pump-system-hydraulics-calculator.html';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Single-file HTML export failed:', err);
    } finally {
      setIsPackagingHtml(false);
    }
  };

  const sucVelStatus = getSuctionVelStatus(systemResult.suction.v);
  const disVelStatus = getDischargeVelStatus(systemResult.discharge.v);
  const npshaStatus = getNpshaStatus(systemResult.npshaM);
  const kinViscMm2s = ((viscosityMPas * 1e-3) / densityKgM3) * 1e6;

  const activeLegForBuilder = activeLineTab === 'suction' ? suctionLeg : dischargeLeg;
  const activeVelHeadForBuilder =
    activeLineTab === 'suction' ? systemResult.suction.velHead : systemResult.discharge.velHead;
  const activeStandardForSizing =
    activeLineTab === 'suction' ? suctionStandard : dischargeStandard;
  const activeSizeIdxForSizing = activeLineTab === 'suction' ? suctionSizeIdx : dischargeSizeIdx;

  return (
    <div className="min-h-screen bg-[#070B12] text-slate-100 flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-[#070B12]/95 backdrop-blur-sm border-b border-slate-800/90">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          <a
            href="#overview"
            className="text-base font-semibold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
          >
            Pump System Hydraulics
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
              System &amp; Moody
            </a>
            <a
              href="#pump-curve"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Pump &amp; Valve
            </a>
            <a
              href="#fittings"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Fittings
            </a>
            <a
              href="#sizing"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Pipe Sizing
            </a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadHtml}
              disabled={isPackagingHtml}
              title="Download standalone self-contained HTML file (works offline)"
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-slate-800/80 text-slate-200 border border-slate-700 rounded-md hover:bg-slate-800 hover:border-slate-600 disabled:opacity-60 disabled:cursor-wait transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5 text-cyan-300" />
              {isPackagingHtml ? 'Packaging…' : 'Download HTML'}
            </button>
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
          <aside className="w-full lg:w-[375px] shrink-0 flex flex-col gap-4">
            {/* Section 01: Flow & Fluid Properties */}
            <section className="bg-[#0E1520] border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
                  01. Flow &amp; Fluid Properties
                </h2>
                {valveMode !== 'target_flow' && (
                  <button
                    type="button"
                    onClick={() => setFollowDutyFlow((v) => !v)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono rounded border transition-colors cursor-pointer ${
                      followDutyFlow
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                        : 'bg-[#070B12] text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                    title="When locked, Flow Rate Q updates automatically from Pump + Control Valve intersection"
                  >
                    {followDutyFlow ? (
                      <>
                        <Lock className="w-3 h-3" /> Duty Lock
                      </>
                    ) : (
                      <>
                        <Unlock className="w-3 h-3" /> Manual Q
                      </>
                    )}
                  </button>
                )}
              </div>

              <div>
                <label
                  htmlFor="flowRate"
                  className="flex items-baseline justify-between text-xs text-slate-300 mb-1"
                >
                  <span>
                    {valveMode === 'target_flow'
                      ? 'Target Controlled Flow (Q)'
                      : followDutyFlow
                        ? 'Controlled Duty Flow (Q)'
                        : 'Evaluated Flow Rate (Q)'}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">m³/h</span>
                </label>
                <input
                  id="flowRate"
                  type="number"
                  min="0"
                  step="any"
                  value={
                    followDutyFlow && valveMode !== 'target_flow' && dutyIntersection.found
                      ? dutyIntersection.qOp.toFixed(2)
                      : flowRateStr
                  }
                  onChange={(e) => {
                    setFollowDutyFlow(false);
                    setFlowRateStr(e.target.value);
                  }}
                  className="w-full bg-[#070B12] border border-slate-800 rounded-md px-2.5 py-2 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400"
                />
                <p className="text-[11px] font-mono tabular-nums text-slate-400 mt-1">
                  {(effectiveFlowM3h / 3.6).toFixed(3)} L/s ·{' '}
                  {((effectiveFlowM3h * 1000) / 60).toFixed(1)} L/m
                  {followDutyFlow && valveMode !== 'target_flow' && ' · Driven by CV & Pump'}
                </p>
              </div>

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
                    className="w-full bg-[#070B12] border border-slate-800 rounded-md px-2.5 py-1.5 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400"
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
                    className="w-full bg-[#070B12] border border-slate-800 rounded-md px-2.5 py-1.5 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="vaporPress"
                    className="flex items-baseline justify-between text-xs text-slate-300 mb-1"
                  >
                    <span>Vapor P (P_v)</span>
                    <span className="font-mono text-[11px] text-slate-400">kPa(a)</span>
                  </label>
                  <input
                    id="vaporPress"
                    type="number"
                    min="0"
                    step="any"
                    value={vaporPressKpaStr}
                    onChange={(e) => {
                      setFluidPresetId('custom');
                      setVaporPressKpaStr(e.target.value);
                    }}
                    className="w-full bg-[#070B12] border border-slate-800 rounded-md px-2.5 py-1.5 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="atmPress"
                    className="flex items-baseline justify-between text-xs text-slate-300 mb-1"
                  >
                    <span>Atm P (P_atm)</span>
                    <span className="font-mono text-[11px] text-slate-400">bar(a)</span>
                  </label>
                  <input
                    id="atmPress"
                    type="number"
                    min="0.1"
                    step="0.01"
                    value={atmPressBarStr}
                    onChange={(e) => setAtmPressBarStr(e.target.value)}
                    className="w-full bg-[#070B12] border border-slate-800 rounded-md px-2.5 py-1.5 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <p className="text-[11px] font-mono tabular-nums text-slate-400">
                Kinematic viscosity ν = {kinViscMm2s.toFixed(3)} mm²/s (cSt)
              </p>
            </section>

            {/* Section 02: Source & Destination Boundary Conditions */}
            <section className="bg-[#0E1520] border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
                  02. Source &amp; Destination (rel. to Pump)
                </h2>
                <span className="text-[11px] font-mono text-slate-500">z_pump = 0 m</span>
              </div>

              {/* Source */}
              <div className="bg-[#070B12] border border-slate-800/80 rounded-md p-2.5 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                  Suction Source (Vessel / Sump)
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="sourceGauge"
                      className="flex items-baseline justify-between text-[11px] text-slate-300 mb-1"
                    >
                      <span>Gauge P (P_s)</span>
                      <span className="font-mono text-slate-400">bar(g)</span>
                    </label>
                    <input
                      id="sourceGauge"
                      type="number"
                      step="0.05"
                      value={sourceGaugeBarStr}
                      onChange={(e) => setSourceGaugeBarStr(e.target.value)}
                      className="w-full bg-[#0E1520] border border-slate-800 rounded px-2 py-1.5 text-xs font-mono tabular-nums text-slate-100 focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="sourceElev"
                      className="flex items-baseline justify-between text-[11px] text-slate-300 mb-1"
                    >
                      <span>Elev (z₁)</span>
                      <span className="font-mono text-slate-400">m</span>
                    </label>
                    <input
                      id="sourceElev"
                      type="number"
                      step="0.5"
                      value={sourceElevMStr}
                      onChange={(e) => setSourceElevMStr(e.target.value)}
                      className="w-full bg-[#0E1520] border border-slate-800 rounded px-2 py-1.5 text-xs font-mono tabular-nums text-slate-100 focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>
              </div>

              {/* Destination */}
              <div className="bg-[#070B12] border border-slate-800/80 rounded-md p-2.5 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
                  Discharge Destination (Header / Tank)
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="destGauge"
                      className="flex items-baseline justify-between text-[11px] text-slate-300 mb-1"
                    >
                      <span>Gauge P (P_d)</span>
                      <span className="font-mono text-slate-400">bar(g)</span>
                    </label>
                    <input
                      id="destGauge"
                      type="number"
                      step="0.05"
                      value={destGaugeBarStr}
                      onChange={(e) => setDestGaugeBarStr(e.target.value)}
                      className="w-full bg-[#0E1520] border border-slate-800 rounded px-2 py-1.5 text-xs font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="destElev"
                      className="flex items-baseline justify-between text-[11px] text-slate-300 mb-1"
                    >
                      <span>Elev (z₂)</span>
                      <span className="font-mono text-slate-400">m</span>
                    </label>
                    <input
                      id="destElev"
                      type="number"
                      step="0.5"
                      value={destElevMStr}
                      onChange={(e) => setDestElevMStr(e.target.value)}
                      className="w-full bg-[#0E1520] border border-slate-800 rounded px-2 py-1.5 text-xs font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>
              </div>

              <div className="text-[11px] font-mono tabular-nums text-slate-400 flex items-center justify-between pt-0.5">
                <span>Δz = {systemResult.staticElevHeadM.toFixed(2)} m</span>
                <span>ΔH_p = {systemResult.staticPressHeadM.toFixed(2)} m</span>
                <span className="text-slate-200 font-semibold">
                  H_stat = {systemResult.staticTotalHeadM.toFixed(2)} m
                </span>
              </div>
            </section>

            {/* Section 03: Suction Line */}
            <section className="bg-[#0E1520] border border-slate-800 rounded-lg p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  03. Suction Line (Source → Pump)
                </h2>
                <span className="text-[11px] font-mono text-slate-400">
                  v_s = {systemResult.suction.v.toFixed(2)} m/s
                </span>
              </div>

              <div>
                <select
                  aria-label="Suction pipe standard"
                  value={suctionStdId}
                  onChange={(e) => handleLegStandardChange('suction', e.target.value)}
                  className="w-full bg-[#070B12] border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-400"
                >
                  {PIPE_STANDARDS.map((std) => (
                    <option key={std.id} value={std.id}>
                      {std.name}
                    </option>
                  ))}
                </select>
              </div>

              {suctionStandard.id !== 'custom' && suctionStandard.sizes.length > 0 && (
                <div>
                  <select
                    aria-label="Suction nominal pipe size"
                    value={Math.min(suctionSizeIdx, suctionStandard.sizes.length - 1)}
                    onChange={(e) =>
                      handleLegSizeChange('suction', parseInt(e.target.value, 10))
                    }
                    className="w-full bg-[#070B12] border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-400"
                  >
                    {suctionStandard.sizes.map((s, idx) => {
                      const id = s.od - 2 * s.wt;
                      return (
                        <option key={s.label} value={idx}>
                          {s.label} — ID {id.toFixed(2)} mm
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="suctionDia"
                    className="flex items-baseline justify-between text-[11px] text-slate-300 mb-1"
                  >
                    <span>Suction ID</span>
                    <span className="font-mono text-slate-400">mm</span>
                  </label>
                  <input
                    id="suctionDia"
                    type="number"
                    min="0.1"
                    step="any"
                    disabled={suctionStandard.id !== 'custom'}
                    value={suctionDiaStr}
                    onChange={(e) => setSuctionDiaStr(e.target.value)}
                    className="w-full bg-[#070B12] border border-slate-800 rounded px-2 py-1.5 text-xs font-mono tabular-nums text-slate-100 disabled:opacity-60 focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="suctionLen"
                    className="flex items-baseline justify-between text-[11px] text-slate-300 mb-1"
                  >
                    <span>Length (L_s)</span>
                    <span className="font-mono text-slate-400">m</span>
                  </label>
                  <input
                    id="suctionLen"
                    type="number"
                    min="0"
                    step="any"
                    value={suctionLenStr}
                    onChange={(e) => setSuctionLenStr(e.target.value)}
                    className="w-full bg-[#070B12] border border-slate-800 rounded px-2 py-1.5 text-xs font-mono tabular-nums text-slate-100 focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="suctionRough"
                    className="flex items-baseline justify-between text-[11px] text-slate-300 mb-1"
                  >
                    <span>Roughness (ε_s)</span>
                    <span className="font-mono text-slate-400">mm</span>
                  </label>
                  <input
                    id="suctionRough"
                    type="number"
                    min="0"
                    step="0.001"
                    value={suctionRoughStr}
                    onChange={(e) => setSuctionRoughStr(e.target.value)}
                    className="w-full bg-[#070B12] border border-slate-800 rounded px-2 py-1.5 text-xs font-mono tabular-nums text-slate-100 focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="suctionK"
                    className="flex items-baseline justify-between text-[11px] text-slate-300 mb-1"
                  >
                    <span>Minor Loss (ΣK_s)</span>
                    <span className="font-mono text-slate-400">
                      {suctionManualK ? 'manual' : `${suctionBuilder.count} pcs`}
                    </span>
                  </label>
                  <input
                    id="suctionK"
                    type="number"
                    min="0"
                    step="0.05"
                    value={suctionSumKStr}
                    onChange={(e) => {
                      setSuctionManualK(true);
                      setSuctionManualKStr(e.target.value);
                    }}
                    className="w-full bg-[#070B12] border border-slate-800 rounded px-2 py-1.5 text-xs font-mono tabular-nums text-slate-100 focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              <select
                aria-label="Suction roughness preset"
                value={suctionRoughPresetId}
                onChange={(e) => {
                  setSuctionRoughPresetId(e.target.value);
                  const p = ROUGHNESS_PRESETS.find((r) => r.id === e.target.value);
                  if (p) setSuctionRoughStr(String(p.eps));
                }}
                className="w-full bg-[#070B12] border border-slate-800 rounded-md px-2.5 py-1.5 text-[11px] text-slate-300 focus:outline-none focus:border-emerald-400"
              >
                {ROUGHNESS_PRESETS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </section>

            {/* Section 04: Discharge Line & Control Valve */}
            <section className="bg-[#0E1520] border border-slate-800 rounded-lg p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
                  04. Discharge Line &amp; Control Valve
                </h2>
                <span className="text-[11px] font-mono text-slate-400">
                  v_d = {systemResult.discharge.v.toFixed(2)} m/s
                </span>
              </div>

              <div>
                <select
                  aria-label="Discharge pipe standard"
                  value={dischargeStdId}
                  onChange={(e) => handleLegStandardChange('discharge', e.target.value)}
                  className="w-full bg-[#070B12] border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                >
                  {PIPE_STANDARDS.map((std) => (
                    <option key={std.id} value={std.id}>
                      {std.name}
                    </option>
                  ))}
                </select>
              </div>

              {dischargeStandard.id !== 'custom' && dischargeStandard.sizes.length > 0 && (
                <div>
                  <select
                    aria-label="Discharge nominal pipe size"
                    value={Math.min(dischargeSizeIdx, dischargeStandard.sizes.length - 1)}
                    onChange={(e) =>
                      handleLegSizeChange('discharge', parseInt(e.target.value, 10))
                    }
                    className="w-full bg-[#070B12] border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                  >
                    {dischargeStandard.sizes.map((s, idx) => {
                      const id = s.od - 2 * s.wt;
                      return (
                        <option key={s.label} value={idx}>
                          {s.label} — ID {id.toFixed(2)} mm
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="dischargeDia"
                    className="flex items-baseline justify-between text-[11px] text-slate-300 mb-1"
                  >
                    <span>Discharge ID</span>
                    <span className="font-mono text-slate-400">mm</span>
                  </label>
                  <input
                    id="dischargeDia"
                    type="number"
                    min="0.1"
                    step="any"
                    disabled={dischargeStandard.id !== 'custom'}
                    value={dischargeDiaStr}
                    onChange={(e) => setDischargeDiaStr(e.target.value)}
                    className="w-full bg-[#070B12] border border-slate-800 rounded px-2 py-1.5 text-xs font-mono tabular-nums text-slate-100 disabled:opacity-60 focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="dischargeLen"
                    className="flex items-baseline justify-between text-[11px] text-slate-300 mb-1"
                  >
                    <span>Length (L_d)</span>
                    <span className="font-mono text-slate-400">m</span>
                  </label>
                  <input
                    id="dischargeLen"
                    type="number"
                    min="0"
                    step="any"
                    value={dischargeLenStr}
                    onChange={(e) => setDischargeLenStr(e.target.value)}
                    className="w-full bg-[#070B12] border border-slate-800 rounded px-2 py-1.5 text-xs font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="dischargeRough"
                    className="flex items-baseline justify-between text-[11px] text-slate-300 mb-1"
                  >
                    <span>Roughness (ε_d)</span>
                    <span className="font-mono text-slate-400">mm</span>
                  </label>
                  <input
                    id="dischargeRough"
                    type="number"
                    min="0"
                    step="0.001"
                    value={dischargeRoughStr}
                    onChange={(e) => setDischargeRoughStr(e.target.value)}
                    className="w-full bg-[#070B12] border border-slate-800 rounded px-2 py-1.5 text-xs font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="dischargeK"
                    className="flex items-baseline justify-between text-[11px] text-slate-300 mb-1"
                  >
                    <span>Minor Loss (ΣK_d)</span>
                    <span className="font-mono text-slate-400">
                      {dischargeManualK ? 'manual' : `${dischargeBuilder.count} pcs`}
                    </span>
                  </label>
                  <input
                    id="dischargeK"
                    type="number"
                    min="0"
                    step="0.05"
                    value={dischargeSumKStr}
                    onChange={(e) => {
                      setDischargeManualK(true);
                      setDischargeManualKStr(e.target.value);
                    }}
                    className="w-full bg-[#070B12] border border-slate-800 rounded px-2 py-1.5 text-xs font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <select
                aria-label="Discharge roughness preset"
                value={dischargeRoughPresetId}
                onChange={(e) => {
                  setDischargeRoughPresetId(e.target.value);
                  const p = ROUGHNESS_PRESETS.find((r) => r.id === e.target.value);
                  if (p) setDischargeRoughStr(String(p.eps));
                }}
                className="w-full bg-[#070B12] border border-slate-800 rounded-md px-2.5 py-1.5 text-[11px] text-slate-300 focus:outline-none focus:border-cyan-400"
              >
                {ROUGHNESS_PRESETS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>

              {/* Discharge Control Valve Sub-panel */}
              <div className="bg-[#070B12] border border-amber-500/30 rounded-md p-3 space-y-2.5 mt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                    Discharge Control Valve
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    ΔP_cv = {systemResult.valveDpBar.toFixed(3)} bar
                  </span>
                </div>

                <div>
                  <select
                    aria-label="Discharge control valve mode"
                    value={valveMode}
                    onChange={(e) => setValveMode(e.target.value as ControlValveMode)}
                    className="w-full bg-[#0E1520] border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
                  >
                    <option value="throttle_kv">Throttle Valve (Kv &amp; % Opening)</option>
                    <option value="target_flow">Size Valve for Target Flow Q</option>
                    <option value="bypass">Bypassed / No Control Valve</option>
                  </select>
                </div>

                {valveMode !== 'bypass' && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label
                        htmlFor="valveKv100"
                        className="flex items-baseline justify-between text-[11px] text-slate-300 mb-1"
                      >
                        <span>Rated Kv₁₀₀</span>
                        <span className="font-mono text-slate-400">m³/h</span>
                      </label>
                      <input
                        id="valveKv100"
                        type="number"
                        min="0.1"
                        step="1"
                        value={valveKv100Str}
                        onChange={(e) => setValveKv100Str(e.target.value)}
                        className="w-full bg-[#0E1520] border border-slate-800 rounded px-2 py-1.5 text-xs font-mono tabular-nums text-slate-100 focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="valveChar"
                        className="block text-[11px] text-slate-300 mb-1"
                      >
                        Characteristic
                      </label>
                      <select
                        id="valveChar"
                        value={valveChar}
                        onChange={(e) =>
                          setValveChar(e.target.value as ControlValveCharacteristic)
                        }
                        className="w-full bg-[#0E1520] border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
                      >
                        <option value="equal_pct">Equal % (R=50)</option>
                        <option value="linear">Linear</option>
                        <option value="quick_open">Quick Open</option>
                      </select>
                    </div>
                  </div>
                )}

                {valveMode === 'throttle_kv' && (
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1">
                      <span>Valve Opening</span>
                      <span className="font-mono text-amber-300 font-semibold">
                        {valve.openingPct.toFixed(0)}% · Kv = {systemResult.valveKvActive.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <input
                        type="range"
                        min="5"
                        max="100"
                        step="1"
                        aria-label="Control valve opening percentage"
                        value={valve.openingPct}
                        onChange={(e) => setValveOpeningStr(e.target.value)}
                        className="flex-1 accent-amber-400 cursor-pointer"
                      />
                      <input
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        aria-label="Control valve opening percent numeric"
                        value={valveOpeningStr}
                        onChange={(e) => setValveOpeningStr(e.target.value)}
                        className="w-14 bg-[#0E1520] border border-slate-800 rounded px-1.5 py-1 text-xs font-mono tabular-nums text-center text-slate-100 focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <p className="text-[11px] font-mono text-slate-400 mt-1">
                      Cv ≈ {(systemResult.valveKvActive * 1.156).toFixed(1)} · Authority{' '}
                      {(systemResult.valveAuthority * 100).toFixed(0)}%
                    </p>
                  </div>
                )}

                {valveMode === 'target_flow' && (
                  <div className="text-[11px] font-mono tabular-nums">
                    {systemResult.targetFlowFeasible ? (
                      <div className="text-emerald-300 space-y-0.5">
                        <div>
                          Req Kv ={' '}
                          {Number.isFinite(systemResult.valveKvActive)
                            ? systemResult.valveKvActive.toFixed(2)
                            : '∞'}{' '}
                          m³/h (Cv ≈{' '}
                          {Number.isFinite(systemResult.valveKvActive)
                            ? (systemResult.valveKvActive * 1.156).toFixed(1)
                            : '∞'}
                          )
                        </div>
                        <div className="text-slate-300">
                          Est. Opening ≈{' '}
                          {systemResult.valveOpeningEstPct !== null
                            ? `${systemResult.valveOpeningEstPct.toFixed(1)}%`
                            : '—'}{' '}
                          on Kv₁₀₀ = {valve.kv100}
                        </div>
                      </div>
                    ) : (
                      <div className="text-rose-400">
                        ✖ Pump head &lt; unthrottled system head at Q = {effectiveFlowM3h.toFixed(1)} m³/h
                      </div>
                    )}
                  </div>
                )}
              </div>
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
                  Required Pump TDH
                </div>
                <div className="mt-1.5 flex items-baseline">
                  <span className="text-2xl font-mono tabular-nums font-semibold text-cyan-300">
                    {systemResult.totalPumpHeadM.toFixed(2)}
                  </span>
                  <span className="text-xs font-mono text-slate-400 ml-1.5">m</span>
                </div>
                <div className="mt-1.5 text-xs font-mono tabular-nums text-slate-400">
                  ΔP {systemResult.totalPumpDpBar.toFixed(3)} bar · Stat{' '}
                  {systemResult.staticTotalHeadM.toFixed(1)} m
                </div>
              </div>

              <div className="bg-[#0E1520] border border-slate-800 rounded-lg p-4">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Line Velocities (Suc / Dis)
                </div>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-xl font-mono tabular-nums font-semibold text-emerald-300">
                    {systemResult.suction.v.toFixed(2)}
                  </span>
                  <span className="text-slate-500 text-sm">/</span>
                  <span className="text-xl font-mono tabular-nums font-semibold text-slate-100">
                    {systemResult.discharge.v.toFixed(2)}
                  </span>
                  <span className="text-xs font-mono text-slate-400">m/s</span>
                </div>
                <div className="mt-1.5 text-[11px] font-medium flex flex-wrap gap-x-2">
                  <span className={sucVelStatus.colorClass}>S: {sucVelStatus.label}</span>
                  <span className={disVelStatus.colorClass}>D: {disVelStatus.label}</span>
                </div>
              </div>

              <div className="bg-[#0E1520] border border-slate-800 rounded-lg p-4">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  NPSH Available (NPSHa)
                </div>
                <div className="mt-1.5 flex items-baseline">
                  <span className="text-2xl font-mono tabular-nums font-semibold text-slate-100">
                    {systemResult.npshaM.toFixed(2)}
                  </span>
                  <span className="text-xs font-mono text-slate-400 ml-1.5">m</span>
                </div>
                <div className={`mt-1.5 text-xs font-medium ${npshaStatus.colorClass}`}>
                  {npshaStatus.label}
                </div>
              </div>

              <div className="bg-[#0E1520] border border-slate-800 rounded-lg p-4">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Control Valve Drop (ΔP_cv)
                </div>
                <div className="mt-1.5 flex items-baseline">
                  <span className="text-2xl font-mono tabular-nums font-semibold text-amber-300">
                    {systemResult.valveDpBar.toFixed(3)}
                  </span>
                  <span className="text-xs font-mono text-slate-400 ml-1.5">bar</span>
                </div>
                <div className="mt-1.5 text-xs font-mono tabular-nums text-slate-400">
                  {systemResult.valveLossM.toFixed(2)} m · Authority{' '}
                  {(systemResult.valveAuthority * 100).toFixed(0)}%
                </div>
              </div>
            </section>

            {/* Nodal Elevation & Pressure Schematic Strip */}
            <SystemSchematicStrip
              flowRateM3h={effectiveFlowM3h}
              source={source}
              dest={dest}
              suctionLeg={suctionLeg}
              dischargeLeg={dischargeLeg}
              valve={valve}
              systemResult={systemResult}
            />

            {/* Dual Scientific Charts: System Curve + Moody Diagram */}
            <div id="curves" className="grid grid-cols-1 xl:grid-cols-2 gap-4 scroll-mt-16">
              <SystemCurveChart
                flowRateM3h={effectiveFlowM3h}
                suctionLeg={suctionLeg}
                dischargeLeg={dischargeLeg}
                source={source}
                dest={dest}
                densityKgM3={densityKgM3}
                viscosityMPas={viscosityMPas}
                valve={valve}
                pvKpa={pvKpa}
                atmBar={atmBar}
                currentResult={systemResult}
                sortedPumpPoints={sortedPumpPoints}
              />

              <MoodyDiagramChart
                dischargeRe={systemResult.discharge.Re}
                dischargeF={systemResult.discharge.f}
                dischargeRelRough={systemResult.discharge.relRough}
                suctionRe={systemResult.suction.Re}
                suctionF={systemResult.suction.f}
                suctionRelRough={systemResult.suction.relRough}
              />
            </div>

            {/* Hydraulic Breakdown & Energy Balance */}
            <section className="bg-[#0E1520] border border-slate-800 rounded-lg p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="text-sm font-semibold text-slate-100 tracking-tight">
                  Network Energy Balance &amp; Nozzle Pressures
                </h2>
                <span className="text-xs font-mono tabular-nums text-slate-300">
                  Hydraulic Power: {systemResult.hydPowerKw.toFixed(3)} kW · Valve Loss:{' '}
                  {systemResult.valvePowerLossKw.toFixed(3)} kW
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                <dl className="divide-y divide-slate-800/70 text-xs">
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-slate-400">Source Total Head (P_s/γ + z₁)</dt>
                    <dd className="font-mono tabular-nums text-slate-200">
                      {systemResult.sourceHeadM.toFixed(3)} m (z₁ = {source.elevM.toFixed(2)} m)
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-slate-400">Suction Line Loss (h_fs + h_ms)</dt>
                    <dd className="font-mono tabular-nums text-emerald-300">
                      {systemResult.suctionLossM.toFixed(3)} m (
                      {(systemResult.suction.dpDynPa / 1e5).toFixed(4)} bar)
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-slate-400">Pump Suction Flange Gauge P</dt>
                    <dd className="font-mono tabular-nums text-slate-200">
                      {systemResult.suctionFlangeGaugeBar.toFixed(4)} bar(g) (H_s{' '}
                      {systemResult.suctionFlangeTotalHeadM.toFixed(2)} m)
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-slate-400">Suction Re / Friction Factor f_s</dt>
                    <dd className="font-mono tabular-nums text-slate-200">
                      {Math.round(systemResult.suction.Re).toLocaleString()} /{' '}
                      {systemResult.suction.f > 0 ? systemResult.suction.f.toFixed(5) : '—'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-slate-400">NPSH Available (NPSHa)</dt>
                    <dd className="font-mono tabular-nums font-semibold text-emerald-300">
                      {systemResult.npshaM.toFixed(3)} m
                    </dd>
                  </div>
                </dl>

                <dl className="divide-y divide-slate-800/70 text-xs border-t md:border-t-0 border-slate-800/70">
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-slate-400">Destination Total Head (P_d/γ + z₂)</dt>
                    <dd className="font-mono tabular-nums text-slate-200">
                      {systemResult.destHeadM.toFixed(3)} m (z₂ = {dest.elevM.toFixed(2)} m)
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-slate-400">Discharge Pipe Loss (h_fd + h_md)</dt>
                    <dd className="font-mono tabular-nums text-slate-200">
                      {systemResult.dischargeLossM.toFixed(3)} m (
                      {(systemResult.discharge.dpDynPa / 1e5).toFixed(4)} bar)
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-slate-400">Discharge Control Valve Drop (Δh_cv)</dt>
                    <dd className="font-mono tabular-nums text-amber-300">
                      {systemResult.valveLossM.toFixed(3)} m ({systemResult.valveDpBar.toFixed(4)} bar)
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-slate-400">Pump Discharge Flange Gauge P</dt>
                    <dd className="font-mono tabular-nums text-slate-200">
                      {systemResult.dischargeFlangeGaugeBar.toFixed(4)} bar(g) (H_d{' '}
                      {systemResult.dischargeFlangeTotalHeadM.toFixed(2)} m)
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-slate-400">Total Pump Differential Head (TDH)</dt>
                    <dd className="font-mono tabular-nums font-semibold text-cyan-300">
                      {systemResult.totalPumpHeadM.toFixed(3)} m (
                      {systemResult.totalPumpDpBar.toFixed(4)} bar)
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-xs font-mono tabular-nums text-slate-400">
                Energy Balance: H_pump = (z₂ − z₁) + (P_d − P_s)/ρg + h_Ls + h_Ld + Δh_cv ={' '}
                {systemResult.staticElevHeadM.toFixed(2)} +{' '}
                {systemResult.staticPressHeadM.toFixed(2)} +{' '}
                {systemResult.suctionLossM.toFixed(2)} +{' '}
                {systemResult.dischargeLossM.toFixed(2)} +{' '}
                {systemResult.valveLossM.toFixed(2)} ={' '}
                <span className="text-cyan-300 font-semibold">
                  {systemResult.totalPumpHeadM.toFixed(2)} m
                </span>
              </div>
            </section>

            {/* Centrifugal Pump Curve, Control Valve Throttling & BEP */}
            <PumpCurveSection
              points={pumpPoints}
              onChangePoints={setPumpPoints}
              flowRateM3h={effectiveFlowM3h}
              suctionLeg={suctionLeg}
              dischargeLeg={dischargeLeg}
              source={source}
              dest={dest}
              densityKgM3={densityKgM3}
              viscosityMPas={viscosityMPas}
              valve={valve}
              pvKpa={pvKpa}
              atmBar={atmBar}
              currentSystemResult={systemResult}
              followDutyFlow={followDutyFlow}
              onToggleFollowDuty={() => setFollowDutyFlow((v) => !v)}
              onApplyDutyFlow={(q) => {
                setFollowDutyFlow(false);
                setFlowRateStr(String(q));
              }}
            />

            {/* Expanded Fittings & Minor Losses Builder (Suction & Discharge Tabs) */}
            <FittingsBuilder
              targetLine={activeLineTab}
              onSelectTargetLine={setActiveLineTab}
              suctionTotalK={suctionLeg.sumK}
              dischargeTotalK={dischargeLeg.sumK}
              fittingQuantities={activeLineTab === 'suction' ? suctionFittings : dischargeFittings}
              customFittings={
                activeLineTab === 'suction' ? suctionCustomFittings : dischargeCustomFittings
              }
              activeDiaMm={activeLegForBuilder.innerDiaMm}
              velHeadM={activeVelHeadForBuilder}
              densityKgM3={densityKgM3}
              manualKOverride={activeLineTab === 'suction' ? suctionManualK : dischargeManualK}
              onChangeQty={(id, delta) => handleChangeFittingQty(activeLineTab, id, delta)}
              onAddCustom={(name, k) => handleAddCustomFitting(activeLineTab, name, k)}
              onRemoveCustom={(id) => handleRemoveCustomFitting(activeLineTab, id)}
              onClearAll={() => handleClearLineFittings(activeLineTab)}
              onResyncFromBuilder={() => {
                if (activeLineTab === 'suction') setSuctionManualK(false);
                else setDischargeManualK(false);
              }}
            />

            {/* Pipe Sizing Comparison Table (Suction & Discharge Tabs) */}
            <PipeSizingTable
              targetLine={activeLineTab}
              onSelectTargetLine={setActiveLineTab}
              standard={activeStandardForSizing}
              selectedSizeIdx={activeSizeIdxForSizing}
              flowRateM3h={effectiveFlowM3h}
              pipeLengthM={activeLegForBuilder.lengthM}
              roughnessMm={activeLegForBuilder.roughnessMm}
              densityKgM3={densityKgM3}
              viscosityMPas={viscosityMPas}
              onSelectSize={(idx) => handleLegSizeChange(activeLineTab, idx)}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
