import React from 'react';
import { PipeStandard } from '../data/hydraulicsData';
import { calcHydraulics } from '../utils/hydraulicsSolver';

interface PipeSizingTableProps {
  standard: PipeStandard;
  selectedSizeIdx: number;
  flowRateM3h: number;
  pipeLengthM: number;
  roughnessMm: number;
  densityKgM3: number;
  viscosityMPas: number;
  onSelectSize: (index: number) => void;
}

function getVelocityAssessment(v: number): { label: string; toneClass: string } {
  if (v === 0) return { label: '— No Flow', toneClass: 'text-slate-400' };
  if (v < 0.5) return { label: '▲ Low v', toneClass: 'text-amber-400' };
  if (v <= 2.5) return { label: '● Optimal', toneClass: 'text-emerald-400' };
  if (v <= 4.0) return { label: '▲ High v', toneClass: 'text-amber-400' };
  return { label: '✖ Excessive', toneClass: 'text-rose-400' };
}

export const PipeSizingTable: React.FC<PipeSizingTableProps> = ({
  standard,
  selectedSizeIdx,
  flowRateM3h,
  pipeLengthM,
  roughnessMm,
  densityKgM3,
  viscosityMPas,
  onSelectSize,
}) => {
  const isCustom = standard.id === 'custom' || standard.sizes.length === 0;

  return (
    <section
      id="sizing"
      className="bg-[#0E1520] border border-slate-800 rounded-lg p-4 scroll-mt-16"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100 tracking-tight">
            Pipe Sizing Comparison — {standard.name}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Straight-pipe friction evaluation across all nominal sizes for Q = {flowRateM3h.toFixed(1)} m³/h · L = {pipeLengthM.toFixed(1)} m
          </p>
        </div>
        <span className="text-xs text-slate-400">Click any row to select diameter</span>
      </div>

      {isCustom ? (
        <div className="bg-[#070B12] border border-slate-800/80 rounded-md py-8 text-center text-xs text-slate-400">
          Select a metric or ASME pipe standard in the Pipe Database panel to compare nominal sizes.
        </div>
      ) : (
        <div className="bg-[#070B12] border border-slate-800/90 rounded-md overflow-x-auto max-h-[340px] overflow-y-auto">
          <table className="w-full border-collapse text-xs font-mono tabular-nums">
            <thead className="sticky top-0 bg-[#0B111C] border-b border-slate-800 z-10">
              <tr className="text-slate-400 font-sans">
                <th className="text-left font-semibold py-2.5 px-3 whitespace-nowrap">Nominal Size</th>
                <th className="text-right font-semibold py-2.5 px-3 whitespace-nowrap">ID (mm)</th>
                <th className="text-right font-semibold py-2.5 px-3 whitespace-nowrap">Velocity (m/s)</th>
                <th className="text-right font-semibold py-2.5 px-3 whitespace-nowrap">Re</th>
                <th className="text-right font-semibold py-2.5 px-3 whitespace-nowrap">f</th>
                <th className="text-right font-semibold py-2.5 px-3 whitespace-nowrap">h_f (m)</th>
                <th className="text-right font-semibold py-2.5 px-3 whitespace-nowrap">ΔP_f (bar)</th>
                <th className="text-right font-semibold py-2.5 px-3 whitespace-nowrap">ΔP_f (kPa/m)</th>
                <th className="text-right font-semibold py-2.5 px-3 whitespace-nowrap">Assessment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {standard.sizes.map((s, idx) => {
                const idMm = s.od - 2 * s.wt;
                const r = calcHydraulics(
                  flowRateM3h,
                  pipeLengthM,
                  idMm,
                  roughnessMm,
                  densityKgM3,
                  viscosityMPas,
                  0,
                  0
                );
                const dpBar = r.dpFrictionPa / 1e5;
                const dpKpaPerM = pipeLengthM > 0 ? r.dpFrictionPa / 1000 / pipeLengthM : 0;
                const status = getVelocityAssessment(r.v);
                const isSelected = idx === selectedSizeIdx;

                return (
                  <tr
                    key={s.label}
                    onClick={() => onSelectSize(idx)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-cyan-500/15 text-slate-100'
                        : 'text-slate-300 hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-2 px-3 text-left font-sans font-medium text-slate-100 whitespace-nowrap">
                      {s.label}
                    </td>
                    <td className="py-2 px-3 text-right">{idMm.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right">{r.v.toFixed(3)}</td>
                    <td className="py-2 px-3 text-right">
                      {r.Re > 0 ? Math.round(r.Re).toLocaleString() : '0'}
                    </td>
                    <td className="py-2 px-3 text-right">{r.f > 0 ? r.f.toFixed(5) : '—'}</td>
                    <td className="py-2 px-3 text-right">{r.hf.toFixed(3)}</td>
                    <td className="py-2 px-3 text-right">{dpBar.toFixed(4)}</td>
                    <td className="py-2 px-3 text-right">{dpKpaPerM.toFixed(3)}</td>
                    <td className={`py-2 px-3 text-right font-sans font-medium whitespace-nowrap ${status.toneClass}`}>
                      {status.label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
