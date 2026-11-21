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

export interface PipeLegConfig {
  lengthM: number;
  innerDiaMm: number;
  roughnessMm: number;
  sumK: number;
}

export interface BoundaryCondition {
  gaugeBar: number; // bar(g)
  elevM: number;    // m relative to pump centerline (z = 0)
}

export type ControlValveCharacteristic = 'equal_pct' | 'linear' | 'quick_open';
export type ControlValveMode = 'throttle_kv' | 'target_flow' | 'bypass';

export interface ControlValveConfig {
  mode: ControlValveMode;
  kv100: number;
  openingPct: number;
  characteristic: ControlValveCharacteristic;
  rangeability?: number;
}

export function calcControlValveKv(
  kv100: number,
  openingPct: number,
  characteristic: ControlValveCharacteristic,
  rangeability = 50
): number {
  const safeKv100 = Math.max(0.01, kv100);
  const u = Math.max(0.01, Math.min(1, openingPct / 100));
  const R = Math.max(2, rangeability);

  if (characteristic === 'linear') {
    return safeKv100 * u;
  }
  if (characteristic === 'quick_open') {
    return safeKv100 * Math.sqrt(u);
  }
  // Equal percentage: Kv(u) = Kv100 * R^(u - 1)
  return safeKv100 * Math.pow(R, u - 1);
}

export function calcControlValveOpeningFromKv(
  kvReq: number,
  kv100: number,
  characteristic: ControlValveCharacteristic,
  rangeability = 50
): number {
  const safeKv100 = Math.max(0.01, kv100);
  const ratio = Math.max(0, kvReq / safeKv100);
  if (ratio >= 1) return 100;
  if (ratio <= 0) return 0;

  if (characteristic === 'linear') {
    return ratio * 100;
  }
  if (characteristic === 'quick_open') {
    return ratio * ratio * 100;
  }
  const R = Math.max(2, rangeability);
  const u = 1 + Math.log(ratio) / Math.log(R);
  return Math.max(0, Math.min(100, u * 100));
}

export function calcControlValveDrop(
  Q_m3h: number,
  densityKgM3: number,
  kv: number
): { dpBar: number; dpPa: number; dHm: number } {
  const safeQ = Math.max(0, Q_m3h);
  const safeRho = Math.max(0.1, densityKgM3);
  if (!Number.isFinite(kv) || kv <= 0) {
    return { dpBar: 0, dpPa: 0, dHm: 0 };
  }
  const sg = safeRho / 1000;
  const dpBar = sg * Math.pow(safeQ / kv, 2);
  const dpPa = dpBar * 1e5;
  const dHm = dpPa / (safeRho * GRAVITY);
  return { dpBar, dpPa, dHm };
}

export interface PumpSystemResult {
  suction: HydraulicsResult;
  discharge: HydraulicsResult;
  sourceHeadM: number;
  destHeadM: number;
  staticElevHeadM: number;
  staticPressHeadM: number;
  staticTotalHeadM: number;
  suctionLossM: number;
  dischargeLossM: number;
  valveKvActive: number;
  valveOpeningEstPct: number | null;
  valveLossM: number;
  valveDpBar: number;
  valveAuthority: number;
  unthrottledHeadM: number;
  unthrottledDpBar: number;
  totalPumpHeadM: number;
  totalPumpDpBar: number;
  suctionFlangeTotalHeadM: number;
  suctionFlangeGaugeBar: number;
  dischargeFlangeTotalHeadM: number;
  dischargeFlangeGaugeBar: number;
  npshaM: number;
  hydPowerKw: number;
  valvePowerLossKw: number;
  targetFlowFeasible: boolean;
}

export function calcPumpSystem(
  Q_m3h: number,
  suctionLeg: PipeLegConfig,
  dischargeLeg: PipeLegConfig,
  source: BoundaryCondition,
  dest: BoundaryCondition,
  densityKgM3: number,
  viscosityMPas: number,
  valve: ControlValveConfig,
  pvKpa = 2.34,
  atmBar = 1.01325,
  sortedPumpPoints?: PumpCurvePoint[]
): PumpSystemResult {
  const safeRho = Math.max(0.1, densityKgM3);
  const gamma = safeRho * GRAVITY;

  const suction = calcHydraulics(
    Q_m3h,
    suctionLeg.lengthM,
    suctionLeg.innerDiaMm,
    suctionLeg.roughnessMm,
    safeRho,
    viscosityMPas,
    suctionLeg.sumK,
    0
  );

  const discharge = calcHydraulics(
    Q_m3h,
    dischargeLeg.lengthM,
    dischargeLeg.innerDiaMm,
    dischargeLeg.roughnessMm,
    safeRho,
    viscosityMPas,
    dischargeLeg.sumK,
    0
  );

  const sourceGaugePa = source.gaugeBar * 1e5;
  const destGaugePa = dest.gaugeBar * 1e5;

  const sourceHeadM = sourceGaugePa / gamma + source.elevM;
  const destHeadM = destGaugePa / gamma + dest.elevM;
  const staticElevHeadM = dest.elevM - source.elevM;
  const staticPressHeadM = (destGaugePa - sourceGaugePa) / gamma;
  const staticTotalHeadM = staticElevHeadM + staticPressHeadM;

  const suctionLossM = suction.hDyn;
  const dischargeLossM = discharge.hDyn;
  const unthrottledHeadM = staticTotalHeadM + suctionLossM + dischargeLossM;
  const unthrottledDpBar = (unthrottledHeadM * gamma) / 1e5;

  let valveKvActive = Infinity;
  let valveOpeningEstPct: number | null = null;
  let valveLossM = 0;
  let valveDpBar = 0;
  let targetFlowFeasible = true;

  if (valve.mode === 'throttle_kv') {
    valveKvActive = calcControlValveKv(
      valve.kv100,
      valve.openingPct,
      valve.characteristic,
      valve.rangeability ?? 50
    );
    const drop = calcControlValveDrop(Q_m3h, safeRho, valveKvActive);
    valveDpBar = drop.dpBar;
    valveLossM = drop.dHm;
    valveOpeningEstPct = valve.openingPct;
  } else if (valve.mode === 'target_flow' && sortedPumpPoints && sortedPumpPoints.length >= 2) {
    const xs = sortedPumpPoints.map((p) => p.q);
    const hs = sortedPumpPoints.map((p) => p.h);
    const pumpHeadAtQ = evaluateMonotoneCurve(xs, hs, Q_m3h);
    const reqDeltaH = pumpHeadAtQ - unthrottledHeadM;
    if (reqDeltaH >= 0 && Q_m3h >= xs[0] && Q_m3h <= xs[xs.length - 1]) {
      targetFlowFeasible = true;
      valveLossM = reqDeltaH;
      valveDpBar = (valveLossM * gamma) / 1e5;
      if (valveDpBar > 1e-9 && Q_m3h > 0) {
        valveKvActive = Q_m3h * Math.sqrt((safeRho / 1000) / valveDpBar);
        valveOpeningEstPct = calcControlValveOpeningFromKv(
          valveKvActive,
          valve.kv100,
          valve.characteristic,
          valve.rangeability ?? 50
        );
      } else {
        valveKvActive = Infinity;
        valveOpeningEstPct = 100;
      }
    } else {
      targetFlowFeasible = false;
      valveLossM = 0;
      valveDpBar = 0;
      valveKvActive = Infinity;
      valveOpeningEstPct = null;
    }
  }

  const totalPumpHeadM = unthrottledHeadM + valveLossM;
  const totalPumpDpBar = (totalPumpHeadM * gamma) / 1e5;

  const suctionFlangeTotalHeadM = sourceHeadM - suctionLossM;
  const suctionFlangeGaugeBar = ((suctionFlangeTotalHeadM - suction.velHead) * gamma) / 1e5;

  const dischargeFlangeTotalHeadM = destHeadM + dischargeLossM + valveLossM;
  const dischargeFlangeGaugeBar = ((dischargeFlangeTotalHeadM - discharge.velHead) * gamma) / 1e5;

  const npshaM =
    (atmBar * 1e5 + sourceGaugePa - pvKpa * 1e3) / gamma + source.elevM - suctionLossM;

  const dynPipeDpBar = ((suctionLossM + dischargeLossM) * gamma) / 1e5;
  const dynTotalDpBar = dynPipeDpBar + valveDpBar;
  const valveAuthority = dynTotalDpBar > 1e-9 ? valveDpBar / dynTotalDpBar : 0;

  const hydPowerKw = (suction.Q * gamma * totalPumpHeadM) / 1000;
  const valvePowerLossKw = (suction.Q * (valveDpBar * 1e5)) / 1000;

  return {
    suction,
    discharge,
    sourceHeadM,
    destHeadM,
    staticElevHeadM,
    staticPressHeadM,
    staticTotalHeadM,
    suctionLossM,
    dischargeLossM,
    valveKvActive,
    valveOpeningEstPct,
    valveLossM,
    valveDpBar,
    valveAuthority,
    unthrottledHeadM,
    unthrottledDpBar,
    totalPumpHeadM,
    totalPumpDpBar,
    suctionFlangeTotalHeadM,
    suctionFlangeGaugeBar,
    dischargeFlangeTotalHeadM,
    dischargeFlangeGaugeBar,
    npshaM,
    hydPowerKw,
    valvePowerLossKw,
    targetFlowFeasible,
  };
}

export function findPumpNetworkIntersection(
  sortedPoints: PumpCurvePoint[],
  suctionLeg: PipeLegConfig,
  dischargeLeg: PipeLegConfig,
  source: BoundaryCondition,
  dest: BoundaryCondition,
  densityKgM3: number,
  viscosityMPas: number,
  valve: ControlValveConfig,
  pvKpa = 2.34,
  atmBar = 1.01325
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

  // In target_flow mode, intersection is solved against unthrottled system or current fixed valve;
  // for throttle_kv and bypass modes we intersect directly with the controlled system curve.
  const effectiveValve: ControlValveConfig =
    valve.mode === 'target_flow' ? { ...valve, mode: 'bypass' } : valve;

  const diffAt = (q: number) => {
    const hPump = evaluateMonotoneCurve(xs, hs, q);
    const sys = calcPumpSystem(
      q,
      suctionLeg,
      dischargeLeg,
      source,
      dest,
      densityKgM3,
      viscosityMPas,
      effectiveValve,
      pvKpa,
      atmBar
    );
    return hPump - sys.totalPumpHeadM;
  };

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

