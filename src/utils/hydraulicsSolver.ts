export const GRAVITY = 9.80665;

export type FlowRegime = 'Zero Flow' | 'Laminar' | 'Transitional' | 'Turbulent';

export interface FrictionResult {
  f: number;
  regime: FlowRegime;
  iter: number;
  residual: number;
}

export interface HydraulicsResult {
  Q: number; // m3/s
  D: number; // m
  area: number; // m2
  v: number; // m/s
  Re: number;
  relRough: number;
  f: number;
  regime: FlowRegime;
  iter: number;
  residual: number;
  velHead: number; // m
  hf: number; // m
  hm: number; // m
  hDyn: number; // m
  hTot: number; // m
  dpFrictionPa: number; // Pa
  dpMinorPa: number; // Pa
  dpDynPa: number; // Pa
  dpTotPa: number; // Pa
  powerKw: number; // kW
}

export interface CustomFitting {
  id: string;
  name: string;
  k: number;
  qty: number;
}

/**
 * Solves Darcy friction factor f:
 * - Re < 2300: Hagen-Poiseuille (64 / Re)
 * - Re >= 2300: Implicit Colebrook-White via Newton-Raphson seeded with Haaland
 */
export function solveFrictionFactor(Re: number, relRough: number): FrictionResult {
  if (Re <= 0 || !Number.isFinite(Re)) {
    return { f: 0, regime: 'Zero Flow', iter: 0, residual: 0 };
  }
  if (Re < 2300) {
    return { f: 64 / Re, regime: 'Laminar', iter: 0, residual: 0 };
  }

  const safeRelRough = Math.max(0, relRough);
  const term = Math.pow(safeRelRough / 3.7, 1.11) + 6.9 / Re;
  let x = -1.8 * Math.log10(term);
  if (!Number.isFinite(x) || x <= 0) x = 5.0;

  const A = safeRelRough / 3.7;
  const B = 2.51 / Re;
  const ln10 = Math.LN10;

  let iter = 0;
  let residual = 0;
  for (let i = 1; i <= 25; i++) {
    iter = i;
    const arg = A + B * x;
    const gx = x + 2 * (Math.log(arg) / ln10);
    const dgx = 1 + (2 * B) / (ln10 * arg);
    const dx = gx / dgx;
    x -= dx;
    residual = Math.abs(gx);
    if (residual < 1e-12 && Math.abs(dx) < 1e-12) break;
  }

  const f = 1 / (x * x);
  const regime: FlowRegime = Re <= 4000 ? 'Transitional' : 'Turbulent';
  return { f, regime, iter, residual };
}

export function calcHydraulics(
  Q_m3h: number,
  L_m: number,
  ID_mm: number,
  eps_mm: number,
  rho: number,
  mu_mPas: number,
  sumK: number,
  elevZ: number
): HydraulicsResult {
  const safeQ = Math.max(0, Q_m3h);
  const safeL = Math.max(0, L_m);
  const safeID = Math.max(0.1, ID_mm);
  const safeEps = Math.max(0, eps_mm);
  const safeRho = Math.max(0.1, rho);
  const safeMu = Math.max(0.0001, mu_mPas);
  const safeK = Math.max(0, sumK);

  const Q = safeQ / 3600;
  const D = safeID / 1000;
  const eps = safeEps / 1000;
  const mu = safeMu * 1e-3;

  const area = Math.PI * D * D * 0.25;
  const v = area > 0 ? Q / area : 0;
  const Re = mu > 0 ? (safeRho * v * D) / mu : 0;
  const relRough = D > 0 ? eps / D : 0;

  const { f, regime, iter, residual } = solveFrictionFactor(Re, relRough);

  const velHead = (v * v) / (2 * GRAVITY);
  const hf = D > 0 ? f * (safeL / D) * velHead : 0;
  const hm = safeK * velHead;
  const hDyn = hf + hm;
  const hTot = hDyn + elevZ;

  const dpFrictionPa = safeRho * GRAVITY * hf;
  const dpMinorPa = safeRho * GRAVITY * hm;
  const dpDynPa = safeRho * GRAVITY * hDyn;
  const dpTotPa = safeRho * GRAVITY * hTot;
  const powerKw = (Q * dpDynPa) / 1000;

  return {
    Q,
    D,
    area,
    v,
    Re,
    relRough,
    f,
    regime,
    iter,
    residual,
    velHead,
    hf,
    hm,
    hDyn,
    hTot,
    dpFrictionPa,
    dpMinorPa,
    dpDynPa,
    dpTotPa,
    powerKw,
  };
}

export function calcTransitionK(
  activeDiaMm: number,
  adjDiaMm: number,
  type: 'expansion_out' | 'contraction_in'
): { k: number; desc: string; valid: boolean } {
  const D = Math.max(0.1, activeDiaMm);
  const Dadj = Math.max(0.1, adjDiaMm);

  if (type === 'expansion_out') {
    if (Dadj >= D) {
      const beta2 = Math.pow(D / Dadj, 2);
      return {
        k: Math.pow(1 - beta2, 2),
        desc: `Sudden Expansion (${D.toFixed(1)} → ${Dadj.toFixed(1)} mm)`,
        valid: true,
      };
    }
    return { k: 0, desc: 'Set Adjacent ID ≥ Active ID for expansion', valid: false };
  }

  if (Dadj >= D) {
    const beta2 = Math.pow(D / Dadj, 2);
    return {
      k: 0.5 * (1 - beta2),
      desc: `Sudden Contraction (${Dadj.toFixed(1)} → ${D.toFixed(1)} mm)`,
      valid: true,
    };
  }
  return { k: 0, desc: 'Set Adjacent ID ≥ Active ID for contraction', valid: false };
}

function niceNumber(range: number, round: boolean): number {
  if (range <= 0) return 1;
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / Math.pow(10, exponent);
  let niceFraction: number;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * Math.pow(10, exponent);
}

export function computeNiceScale(minVal: number, maxVal: number, maxTicks = 5) {
  let safeMax = maxVal;
  if (safeMax <= minVal) safeMax = minVal + 1;
  const range = niceNumber(safeMax - minVal, false);
  const step = niceNumber(range / Math.max(2, maxTicks - 1), true);
  const niceMin = Math.floor(minVal / step) * step;
  const niceMax = Math.ceil(safeMax / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) {
    ticks.push(Number(v.toPrecision(7)));
  }
  return { niceMin, niceMax, step, ticks };
}

export function formatAxisTick(val: number, step: number): string {
  if (Math.abs(val) < 1e-12) return '0';
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return val.toFixed(Math.min(4, decimals));
}

export interface PumpCurvePoint {
  id: string;
  q: number;   // m3/h
  h: number;   // m
  eff: number; // % (0 - 100)
}

/**
 * Evaluates y(x) using Fritsch-Carlson monotone piecewise cubic Hermite interpolation (PCHIP).
 * Falls back to piecewise linear if fewer than 3 strictly monotonic x points exist.
 */
export function evaluateMonotoneCurve(
  sortedXs: number[],
  ys: number[],
  xQuery: number
): number {
  const n = sortedXs.length;
  if (n === 0) return 0;
  if (n === 1) return ys[0];

  if (xQuery <= sortedXs[0]) return ys[0];
  if (xQuery >= sortedXs[n - 1]) return ys[n - 1];

  // Find segment index i where sortedXs[i] <= xQuery <= sortedXs[i+1]
  let idx = 0;
  for (let i = 0; i < n - 1; i++) {
    if (xQuery >= sortedXs[i] && xQuery <= sortedXs[i + 1]) {
      idx = i;
      break;
    }
  }

  const hSeg = sortedXs[idx + 1] - sortedXs[idx];
  if (hSeg <= 1e-12) return ys[idx];

  // Check if all intervals are strictly increasing for PCHIP
  const hasDuplicates = sortedXs.some((val, i) => i > 0 && val <= sortedXs[i - 1] + 1e-9);
  if (n < 3 || hasDuplicates) {
    const t = (xQuery - sortedXs[idx]) / hSeg;
    return ys[idx] + t * (ys[idx + 1] - ys[idx]);
  }

  const h: number[] = [];
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const hi = sortedXs[i + 1] - sortedXs[i];
    h.push(hi);
    delta.push((ys[i + 1] - ys[i]) / hi);
  }

  const d = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] * delta[i] > 0) {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      d[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
    } else {
      d[i] = 0;
    }
  }

  // Endpoint slopes
  const d0 = ((2 * h[0] + h[1]) * delta[0] - h[0] * delta[1]) / (h[0] + h[1]);
  if (d0 * delta[0] <= 0) d[0] = 0;
  else if (Math.abs(d0) > 3 * Math.abs(delta[0])) d[0] = 3 * delta[0];
  else d[0] = d0;

  const dn =
    ((2 * h[n - 2] + h[n - 3]) * delta[n - 2] - h[n - 2] * delta[n - 3]) /
    (h[n - 2] + h[n - 3]);
  if (dn * delta[n - 2] <= 0) d[n - 1] = 0;
  else if (Math.abs(dn) > 3 * Math.abs(delta[n - 2])) d[n - 1] = 3 * delta[n - 2];
  else d[n - 1] = dn;

  const t = (xQuery - sortedXs[idx]) / hSeg;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  return h00 * ys[idx] + h10 * hSeg * d[idx] + h01 * ys[idx + 1] + h11 * hSeg * d[idx + 1];
}

export interface DutyPointResult {
  found: boolean;
  qOp: number;      // m3/h
  hOp: number;      // m
  dpOpBar: number;  // bar
  effOp: number;    // %
  hydPowerKw: number;
  shaftPowerKw: number | null;
}

export function findPumpSystemIntersection(
  sortedPoints: PumpCurvePoint[],
  pipeLengthM: number,
  innerDiaMm: number,
  roughnessMm: number,
  densityKgM3: number,
  viscosityMPas: number,
  sumK: number,
  elevZM: number
): DutyPointResult {
  if (sortedPoints.length < 2) {
    return { found: false, qOp: 0, hOp: 0, dpOpBar: 0, effOp: 0, hydPowerKw: 0, shaftPowerKw: null };
  }

  const xs = sortedPoints.map((p) => p.q);
  const hs = sortedPoints.map((p) => p.h);
  const effs = sortedPoints.map((p) => p.eff);

  const qMin = xs[0];
  const qMax = xs[xs.length - 1];
  if (qMax <= qMin) {
    return { found: false, qOp: 0, hOp: 0, dpOpBar: 0, effOp: 0, hydPowerKw: 0, shaftPowerKw: null };
  }

  const diffAt = (q: number) => {
    const hPump = evaluateMonotoneCurve(xs, hs, q);
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
    return hPump - sys.hTot;
  };

  // Scan 100 intervals to locate sign change
  const steps = 100;
  let bracketLow: number | null = null;
  let bracketHigh: number | null = null;
  let prevQ = qMin;
  let prevDiff = diffAt(prevQ);

  for (let i = 1; i <= steps; i++) {
    const q = qMin + ((qMax - qMin) * i) / steps;
    const d = diffAt(q);
    if (Math.abs(d) < 1e-6) {
      bracketLow = q;
      bracketHigh = q;
      break;
    }
    if (prevDiff * d <= 0) {
      bracketLow = prevQ;
      bracketHigh = q;
      break;
    }
    prevQ = q;
    prevDiff = d;
  }

  if (bracketLow === null || bracketHigh === null) {
    return { found: false, qOp: 0, hOp: 0, dpOpBar: 0, effOp: 0, hydPowerKw: 0, shaftPowerKw: null };
  }

  let lo = bracketLow;
  let hi = bracketHigh;
  let fLo = diffAt(lo);
  for (let iter = 0; iter < 40; iter++) {
    const mid = 0.5 * (lo + hi);
    const fMid = diffAt(mid);
    if (Math.abs(fMid) < 1e-6 || hi - lo < 1e-5) {
      lo = mid;
      hi = mid;
      break;
    }
    if (fLo * fMid <= 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }

  const qOp = 0.5 * (lo + hi);
  const hOp = evaluateMonotoneCurve(xs, hs, qOp);
  const effOp = Math.max(0, Math.min(100, evaluateMonotoneCurve(xs, effs, qOp)));
  const dpOpBar = (densityKgM3 * GRAVITY * hOp) / 1e5;
  const qM3s = qOp / 3600;
  const hydPowerKw = (qM3s * densityKgM3 * GRAVITY * hOp) / 1000;
  const shaftPowerKw = effOp > 1 ? hydPowerKw / (effOp / 100) : null;

  return { found: true, qOp, hOp, dpOpBar, effOp, hydPowerKw, shaftPowerKw };
}

