import React, { useMemo, useState } from 'react';
import { solveFrictionFactor } from '../utils/hydraulicsSolver';

interface MoodyDiagramChartProps {
  dischargeRe: number;
  dischargeF: number;
  dischargeRelRough: number;
  suctionRe: number;
  suctionF: number;
  suctionRelRough: number;
}

const REL_ROUGH_CURVES = [0, 0.0002, 0.001, 0.005, 0.02, 0.05];
const RE_TICKS = [1e3, 1e4, 1e5, 1e6, 1e7, 1e8];
const F_TICKS = [0.01, 0.015, 0.02, 0.03, 0.04, 0.06, 0.08, 0.1];

export const MoodyDiagramChart: React.FC<MoodyDiagramChartProps> = ({
  dischargeRe,
  dischargeF,
  dischargeRelRough,
  suctionRe,
  suctionF,
  suctionRelRough,
}) => {
  const [probe, setProbe] = useState<{ re: number; f: number; x: number; y: number } | null>(null);

  const W = 560;
  const H = 272;
  const pad = { l: 50, r: 16, t: 16, b: 38 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;

  const minLogRe = Math.log10(600);
  const maxLogRe = Math.log10(1e8);
  const minLogF = Math.log10(0.008);
  const maxLogF = Math.log10(0.10);

  const mapX = (re: number) =>
    pad.l + ((Math.log10(re) - minLogRe) / (maxLogRe - minLogRe)) * pw;
  const mapY = (f: number) =>
    pad.t + ph - ((Math.log10(f) - minLogF) / (maxLogF - minLogF)) * ph;

  const curves = useMemo(() => {
    const lamPts: string[] = [];
    for (let re = 640; re <= 2300; re += 150) {
      const f = 64 / re;
      if (f <= 0.1 && f >= 0.008) {
        lamPts.push(`${mapX(re).toFixed(1)},${mapY(f).toFixed(1)}`);
      }
    }

    const turbCurves = REL_ROUGH_CURVES.map((ed) => {
      const pts: string[] = [];
      for (let logR = Math.log10(4000); logR <= 8.0; logR += 0.12) {
        const re = Math.pow(10, logR);
        const { f } = solveFrictionFactor(re, ed);
        if (f >= 0.008 && f <= 0.1) {
          pts.push(`${mapX(re).toFixed(1)},${mapY(f).toFixed(1)}`);
        }
      }
      const { f: fEnd } = solveFrictionFactor(1e8, ed);
      return { ed, pts: pts.join(' '), fEnd };
    });

    return { lamPts: lamPts.join(' '), turbCurves };
  }, []);

  const dischargeRoughnessCurve = useMemo(() => {
    if (dischargeRelRough <= 0) return '';
    const pts: string[] = [];
    for (let logR = Math.log10(4000); logR <= 8.0; logR += 0.14) {
      const re = Math.pow(10, logR);
      const { f } = solveFrictionFactor(re, dischargeRelRough);
      if (f >= 0.008 && f <= 0.1) {
        pts.push(`${mapX(re).toFixed(1)},${mapY(f).toFixed(1)}`);
      }
    }
    return pts.join(' ');
  }, [dischargeRelRough]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const my = ((e.clientY - rect.top) / rect.height) * H;
    if (mx < pad.l || mx > pad.l + pw || my < pad.t || my > pad.t + ph) {
      setProbe(null);
      return;
    }
    const logRe = minLogRe + ((mx - pad.l) / pw) * (maxLogRe - minLogRe);
    const re = Math.pow(10, logRe);
    const { f } = solveFrictionFactor(re, dischargeRelRough);
    if (f >= 0.008 && f <= 0.1) {
      setProbe({ re, f, x: mapX(re), y: mapY(f) });
    } else {
      setProbe(null);
    }
  };

  const isVisible = (re: number, f: number) =>
    re >= 600 && re <= 1e8 && f >= 0.008 && f <= 0.1;

  const dischVisible = isVisible(dischargeRe, dischargeF);
  const suctVisible = isVisible(suctionRe, suctionF);

  return (
    <section className="bg-[#0E1520] border border-slate-800 rounded-lg p-4 flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100 tracking-tight">
            Moody Diagram (Suction &amp; Discharge)
          </h2>
          <p className="text-xs text-slate-400 font-mono tabular-nums mt-0.5">
            Colebrook-White (ε/D = 0 to 0.05) · Dashed: Laminar 64/Re
          </p>
        </div>
        <div className="text-[11px] font-mono tabular-nums text-right">
          <div className="text-emerald-300">
            Suc: Re {suctionRe > 0 ? suctionRe.toExponential(2) : '—'} · f{' '}
            {suctionF > 0 ? suctionF.toFixed(4) : '—'}
          </div>
          <div className="text-cyan-300">
            Dis: Re {dischargeRe > 0 ? dischargeRe.toExponential(2) : '—'} · f{' '}
            {dischargeF > 0 ? dischargeF.toFixed(4) : '—'}
          </div>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-[265px] bg-[#070B12] border border-slate-800/80 rounded-md cursor-crosshair select-none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setProbe(null)}
        role="img"
        aria-label="Moody diagram showing Reynolds number versus Darcy friction factor for suction and discharge pipes"
      >
        {RE_TICKS.map((re) => {
          const x = mapX(re);
          const exp = Math.round(Math.log10(re));
          return (
            <g key={`re-${re}`}>
              <line x1={x} y1={pad.t} x2={x} y2={pad.t + ph} stroke="#162032" strokeWidth="1" />
              <text
                x={x}
                y={H - 20}
                fill="#94A3B8"
                fontSize="10"
                fontFamily="IBM Plex Mono, monospace"
                textAnchor="middle"
              >
                10^{exp}
              </text>
            </g>
          );
        })}

        {F_TICKS.map((fv) => {
          const y = mapY(fv);
          return (
            <g key={`f-${fv}`}>
              <line x1={pad.l} y1={y} x2={pad.l + pw} y2={y} stroke="#162032" strokeWidth="1" />
              <text
                x={pad.l - 6}
                y={y + 3}
                fill="#94A3B8"
                fontSize="10"
                fontFamily="IBM Plex Mono, monospace"
                textAnchor="end"
              >
                {fv}
              </text>
            </g>
          );
        })}

        {/* Transition zone band */}
        <rect
          x={mapX(2300)}
          y={pad.t}
          width={mapX(4000) - mapX(2300)}
          height={ph}
          fill="rgba(245, 158, 11, 0.08)"
        />

        <polyline
          points={curves.lamPts}
          fill="none"
          stroke="#64748B"
          strokeWidth="1.6"
          strokeDasharray="4,3"
        />

        {curves.turbCurves.map((c) => (
          <g key={`ed-${c.ed}`}>
            <polyline points={c.pts} fill="none" stroke="#283548" strokeWidth="1.2" />
            {c.fEnd >= 0.008 && c.fEnd <= 0.1 && (
              <text
                x={pad.l + pw - 3}
                y={mapY(c.fEnd) - 3}
                fill="#64748B"
                fontSize="9"
                fontFamily="IBM Plex Mono, monospace"
                textAnchor="end"
              >
                {c.ed === 0 ? 'Smooth' : c.ed}
              </text>
            )}
          </g>
        ))}

        {dischargeRoughnessCurve && (
          <polyline
            points={dischargeRoughnessCurve}
            fill="none"
            stroke="rgba(34, 211, 238, 0.45)"
            strokeWidth="1.6"
          />
        )}

        {/* Suction operating point (emerald) */}
        {suctVisible && (
          <g>
            <circle
              cx={mapX(suctionRe)}
              cy={mapY(suctionF)}
              r="5"
              fill="#34D399"
              stroke="#070B12"
              strokeWidth="2"
            />
          </g>
        )}

        {/* Discharge operating point (cyan) */}
        {dischVisible && (
          <g>
            <line
              x1={mapX(dischargeRe)}
              y1={pad.t}
              x2={mapX(dischargeRe)}
              y2={pad.t + ph}
              stroke="rgba(34, 211, 238, 0.4)"
              strokeDasharray="3,3"
            />
            <line
              x1={pad.l}
              y1={mapY(dischargeF)}
              x2={pad.l + pw}
              y2={mapY(dischargeF)}
              stroke="rgba(34, 211, 238, 0.4)"
              strokeDasharray="3,3"
            />
            <circle
              cx={mapX(dischargeRe)}
              cy={mapY(dischargeF)}
              r="5"
              fill="#22D3EE"
              stroke="#070B12"
              strokeWidth="2"
            />
          </g>
        )}

        {probe && (
          <g>
            <line
              x1={probe.x}
              y1={pad.t}
              x2={probe.x}
              y2={pad.t + ph}
              stroke="#F59E0B"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
            <circle
              cx={probe.x}
              cy={probe.y}
              r="4"
              fill="#F59E0B"
              stroke="#070B12"
              strokeWidth="1.5"
            />
            {(() => {
              const txt = `Re=${probe.re.toExponential(2)} · f=${probe.f.toFixed(4)}`;
              const boxW = txt.length * 6.3 + 14;
              const boxH = 22;
              let bx = probe.x + 10;
              if (bx + boxW > pad.l + pw) bx = probe.x - boxW - 10;
              let by = probe.y - 26;
              if (by < pad.t + 2) by = probe.y + 10;
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

        <text
          x={pad.l + pw / 2}
          y={H - 5}
          fill="#94A3B8"
          fontSize="10.5"
          fontFamily="IBM Plex Sans, sans-serif"
          textAnchor="middle"
        >
          Reynolds Number Re
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
          Darcy Friction Factor f
        </text>
      </svg>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums text-slate-400 mt-2">
        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-emerald-300">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
            Suction ε/D {suctionRelRough.toExponential(1)}
          </span>
          <span className="inline-flex items-center gap-1.5 text-cyan-300">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" />
            Discharge ε/D {dischargeRelRough.toExponential(1)}
          </span>
        </span>
        <span className="text-slate-500">Transition: 2300–4000</span>
      </div>
    </section>
  );
};
