import React from 'react';
import {
  BoundaryCondition,
  ControlValveConfig,
  PipeLegConfig,
  PumpSystemResult,
} from '../utils/hydraulicsSolver';

interface SystemSchematicStripProps {
  flowRateM3h: number;
  source: BoundaryCondition;
  dest: BoundaryCondition;
  suctionLeg: PipeLegConfig;
  dischargeLeg: PipeLegConfig;
  valve: ControlValveConfig;
  systemResult: PumpSystemResult;
}

export const SystemSchematicStrip: React.FC<SystemSchematicStripProps> = ({
  flowRateM3h,
  source,
  dest,
  suctionLeg,
  dischargeLeg,
  valve,
  systemResult,
}) => {
  const valveSummary =
    valve.mode === 'bypass'
      ? 'Bypassed (0 ΔP)'
      : valve.mode === 'target_flow'
        ? systemResult.targetFlowFeasible
          ? `Sized Kv ${Number.isFinite(systemResult.valveKvActive) ? systemResult.valveKvActive.toFixed(1) : '∞'} (${
              systemResult.valveOpeningEstPct !== null
                ? `${systemResult.valveOpeningEstPct.toFixed(0)}%`
                : '—'
            })`
          : 'Unfeasible @ Q'
        : `${valve.openingPct.toFixed(0)}% Open · Kv ${systemResult.valveKvActive.toFixed(1)}`;

  return (
    <section className="bg-[#0E1520] border border-slate-800 rounded-lg p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
            Pump &amp; Piping Network Elevation / Pressure Datum
          </h2>
          <span className="text-[11px] font-mono text-slate-400">
            (Datum: Pump Centerline z = 0.00 m)
          </span>
        </div>
        <div className="text-xs font-mono tabular-nums text-slate-300">
          Q = <span className="text-cyan-300 font-semibold">{flowRateM3h.toFixed(2)} m³/h</span>
          {' · '}H_static = {systemResult.staticTotalHeadM.toFixed(2)} m (Δz{' '}
          {systemResult.staticElevHeadM >= 0 ? '+' : ''}
          {systemResult.staticElevHeadM.toFixed(2)} m, ΔP_stat{' '}
          {(dest.gaugeBar - source.gaugeBar) >= 0 ? '+' : ''}
          {(dest.gaugeBar - source.gaugeBar).toFixed(3)} bar)
        </div>
      </div>

      {/* Horizontal 6-node Process Flow Schematic */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
        {/* 1. Source */}
        <div className="bg-[#070B12] border border-slate-800/90 rounded-md px-2.5 py-2">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">
            <span>1. Source</span>
            <span className="font-mono">z₁</span>
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-100">
            P_s: {source.gaugeBar >= 0 ? '+' : ''}
            {source.gaugeBar.toFixed(3)} bar(g)
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-400">
            Elev: {source.elevM >= 0 ? '+' : ''}
            {source.elevM.toFixed(2)} m
          </div>
        </div>

        {/* 2. Suction Line */}
        <div className="bg-[#070B12] border border-slate-800/90 rounded-md px-2.5 py-2">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-emerald-300 font-semibold">
            <span>2. Suction</span>
            <span className="font-mono">ID {suctionLeg.innerDiaMm.toFixed(1)}</span>
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-100">
            v_s: {systemResult.suction.v.toFixed(2)} m/s
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-400">
            L {suctionLeg.lengthM.toFixed(1)}m · h_Ls {systemResult.suctionLossM.toFixed(2)} m
          </div>
        </div>

        {/* 3. Centrifugal Pump */}
        <div className="bg-[#070B12] border border-cyan-500/35 rounded-md px-2.5 py-2">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-cyan-300 font-semibold">
            <span>3. Pump</span>
            <span className="font-mono">z = 0</span>
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-cyan-300 font-semibold">
            TDH: {systemResult.totalPumpHeadM.toFixed(2)} m
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-400">
            NPSHa {systemResult.npshaM.toFixed(2)} m · P_suc{' '}
            {systemResult.suctionFlangeGaugeBar.toFixed(2)} bar(g)
          </div>
        </div>

        {/* 4. Discharge Line */}
        <div className="bg-[#070B12] border border-slate-800/90 rounded-md px-2.5 py-2">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-sky-300 font-semibold">
            <span>4. Discharge</span>
            <span className="font-mono">ID {dischargeLeg.innerDiaMm.toFixed(1)}</span>
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-100">
            v_d: {systemResult.discharge.v.toFixed(2)} m/s
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-400">
            L {dischargeLeg.lengthM.toFixed(1)}m · h_Ld {systemResult.dischargeLossM.toFixed(2)} m
          </div>
        </div>

        {/* 5. Discharge Control Valve */}
        <div className="bg-[#070B12] border border-amber-500/35 rounded-md px-2.5 py-2">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-amber-300 font-semibold">
            <span>5. Ctrl Valve</span>
            <span className="font-mono">CV</span>
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-amber-200 truncate">
            {valveSummary}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-400">
            ΔP_cv {systemResult.valveDpBar.toFixed(3)} bar ({systemResult.valveLossM.toFixed(2)} m)
          </div>
        </div>

        {/* 6. Destination */}
        <div className="bg-[#070B12] border border-slate-800/90 rounded-md px-2.5 py-2">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-cyan-400 font-semibold">
            <span>6. Destination</span>
            <span className="font-mono">z₂</span>
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-100">
            P_d: {dest.gaugeBar >= 0 ? '+' : ''}
            {dest.gaugeBar.toFixed(3)} bar(g)
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-400">
            Elev: {dest.elevM >= 0 ? '+' : ''}
            {dest.elevM.toFixed(2)} m
          </div>
        </div>
      </div>
    </section>
  );
};
