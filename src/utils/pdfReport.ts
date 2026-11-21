import { jsPDF } from 'jspdf';
import {
  BoundaryCondition,
  calcPumpSystem,
  computeNiceScale,
  ControlValveConfig,
  CustomFitting,
  DutyPointResult,
  evaluateMonotoneCurve,
  findPumpNetworkIntersection,
  formatAxisTick,
  PipeLegConfig,
  PumpCurvePoint,
  PumpSystemResult,
} from './hydraulicsSolver';
import { FITTINGS_CATALOG } from '../data/hydraulicsData';

export interface PdfReportInput {
  flowRateM3h: number;
  fluidName: string;
  densityKgM3: number;
  viscosityMPas: number;
  pvKpa: number;
  atmBar: number;
  source: BoundaryCondition;
  dest: BoundaryCondition;
  suctionStandardName: string;
  suctionSizeLabel: string;
  suctionLeg: PipeLegConfig;
  dischargeStandardName: string;
  dischargeSizeLabel: string;
  dischargeLeg: PipeLegConfig;
  valve: ControlValveConfig;
  systemResult: PumpSystemResult;
  sortedPumpPoints: PumpCurvePoint[];
  dutyIntersection: DutyPointResult;
  suctionFittings: Record<string, number>;
  suctionCustomFittings: CustomFitting[];
  dischargeFittings: Record<string, number>;
  dischargeCustomFittings: CustomFitting[];
}

function collectFittingRows(
  quantities: Record<string, number>,
  customList: CustomFitting[],
  velHeadM: number
): { name: string; qty: number; kSub: number; hm: number }[] {
  const rows: { name: string; qty: number; kSub: number; hm: number }[] = [];
  FITTINGS_CATALOG.forEach((item) => {
    const qty = quantities[item.id] || 0;
    if (qty > 0) {
      const kSub = item.k * qty;
      rows.push({ name: item.name, qty, kSub, hm: kSub * velHeadM });
    }
  });
  customList.forEach((cf) => {
    if (cf.qty > 0) {
      const kSub = cf.k * cf.qty;
      rows.push({ name: cf.name, qty: cf.qty, kSub, hm: kSub * velHeadM });
    }
  });
  return rows;
}

export function exportHydraulicsPdf(input: PdfReportInput): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const pageH = 297;
  const margin = 14;
  const contentW = pageW - margin * 2;

  const {
    flowRateM3h,
    fluidName,
    densityKgM3,
    viscosityMPas,
    pvKpa,
    atmBar,
    source,
    dest,
    suctionStandardName,
    suctionSizeLabel,
    suctionLeg,
    dischargeStandardName,
    dischargeSizeLabel,
    dischargeLeg,
    valve,
    systemResult,
    sortedPumpPoints,
    dutyIntersection,
  } = input;

  const kinViscMm2s = ((viscosityMPas * 1e-3) / densityKgM3) * 1e6;
  const timestamp = new Date().toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Helper drawing functions
  const drawHeader = (pageNum: number, totalPages: number) => {
    doc.setFillColor(15, 23, 42); // Slate-900
    doc.rect(0, 0, pageW, 20, 'F');
    doc.setFillColor(6, 182, 212); // Cyan-500 accent bar
    doc.rect(0, 20, pageW, 1.2, 'F');

    doc.setTextColor(248, 250, 252);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Pump System Hydraulics — Calculation Report', margin, 9.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Colebrook–White & Darcy–Weisbach SI Solver  |  Generated: ${timestamp}`,
      margin,
      15.5
    );

    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${pageNum} of ${totalPages}`, pageW - margin, 15.5, { align: 'right' });
  };

  const drawSectionTitle = (title: string, y: number): number => {
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentW, 6.5, 'F');
    doc.setDrawColor(6, 182, 212);
    doc.setLineWidth(0.8);
    doc.line(margin, y, margin, y + 6.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(title, margin + 3, y + 4.5);
    return y + 9;
  };

  const drawKvRow = (
    x: number,
    y: number,
    w: number,
    label: string,
    val: string,
    shade = false
  ): number => {
    if (shade) {
      doc.setFillColor(248, 250, 252);
      doc.rect(x, y - 3.6, w, 5.2, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(71, 85, 105);
    doc.text(label, x + 1.5, y);
    doc.setFont('courier', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(val, x + w - 1.5, y, { align: 'right' });
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(x, y + 1.5, x + w, y + 1.5);
    return y + 5.2;
  };

  // ================= PAGE 1 =================
  drawHeader(1, 2);
  let y = 26;

  // Top KPI Strip (5 boxes)
  const kpiW = (contentW - 8) / 5;
  const kpis = [
    { label: 'FLOW RATE (Q)', val: `${flowRateM3h.toFixed(2)} m3/h`, sub: `${(flowRateM3h / 3.6).toFixed(2)} L/s` },
    { label: 'PUMP TDH', val: `${systemResult.totalPumpHeadM.toFixed(2)} m`, sub: `${systemResult.totalPumpDpBar.toFixed(3)} bar` },
    { label: 'NPSH AVAILABLE', val: `${systemResult.npshaM.toFixed(2)} m`, sub: systemResult.npshaM < 2 ? 'Check Margin' : 'Adequate' },
    { label: 'CTRL VALVE DROP', val: `${systemResult.valveDpBar.toFixed(3)} bar`, sub: `${systemResult.valveLossM.toFixed(2)} m` },
    { label: 'HYD. POWER', val: `${systemResult.hydPowerKw.toFixed(2)} kW`, sub: `Valve ${(systemResult.valveAuthority * 100).toFixed(0)}% Auth` },
  ];
  kpis.forEach((k, idx) => {
    const bx = margin + idx * (kpiW + 2);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(bx, y, kpiW, 15, 1.2, 1.2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(100, 116, 139);
    doc.text(k.label, bx + 2.2, y + 4.2);

    doc.setFont('courier', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(k.val, bx + 2.2, y + 9.5);

    doc.setFont('courier', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(71, 85, 105);
    doc.text(k.sub, bx + 2.2, y + 13.3);
  });
  y += 19;

  // 6-Node Network Strip
  const nodeGap = 2.5;
  const nodeW = (contentW - nodeGap * 5) / 6;
  const nodes = [
    { t: '1. SOURCE', l1: `Ps ${source.gaugeBar.toFixed(2)} bar(g)`, l2: `z1 ${source.elevM >= 0 ? '+' : ''}${source.elevM.toFixed(1)} m` },
    { t: '2. SUCTION', l1: `ID ${suctionLeg.innerDiaMm.toFixed(1)} mm`, l2: `vs ${systemResult.suction.v.toFixed(2)} m/s` },
    { t: '3. PUMP (z=0)', l1: `H ${systemResult.totalPumpHeadM.toFixed(1)} m`, l2: `NPSHa ${systemResult.npshaM.toFixed(1)} m` },
    { t: '4. DISCHARGE', l1: `ID ${dischargeLeg.innerDiaMm.toFixed(1)} mm`, l2: `vd ${systemResult.discharge.v.toFixed(2)} m/s` },
    { t: '5. CTRL VALVE', l1: valve.mode === 'bypass' ? 'Bypassed' : `Kv ${Number.isFinite(systemResult.valveKvActive) ? systemResult.valveKvActive.toFixed(1) : 'Inf'}`, l2: `dP ${systemResult.valveDpBar.toFixed(2)} bar` },
    { t: '6. DEST', l1: `Pd ${dest.gaugeBar.toFixed(2)} bar(g)`, l2: `z2 ${dest.elevM >= 0 ? '+' : ''}${dest.elevM.toFixed(1)} m` },
  ];
  nodes.forEach((n, idx) => {
    const nx = margin + idx * (nodeW + nodeGap);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.3);
    doc.roundedRect(nx, y, nodeW, 13.5, 1, 1, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(14, 116, 144);
    doc.text(n.t, nx + 1.8, y + 3.8);

    doc.setFont('courier', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(15, 23, 42);
    doc.text(n.l1, nx + 1.8, y + 8.0);

    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(n.l2, nx + 1.8, y + 11.7);

    if (idx < 5) {
      const ax1 = nx + nodeW + 0.3;
      const ax2 = nx + nodeW + nodeGap - 0.3;
      const ay = y + 6.75;
      doc.setDrawColor(100, 116, 139);
      doc.line(ax1, ay, ax2, ay);
    }
  });
  y += 18;

  // Section 1: Fluid & Boundary Conditions (2 columns)
  y = drawSectionTitle('1. Process Fluid & Boundary Conditions (Datum: Pump Centerline z = 0 m)', y);
  const halfW = (contentW - 6) / 2;
  let yL = y + 2;
  let yR = y + 2;

  yL = drawKvRow(margin, yL, halfW, 'Fluid', fluidName, false);
  yL = drawKvRow(margin, yL, halfW, 'Density (rho)', `${densityKgM3.toFixed(2)} kg/m3`, true);
  yL = drawKvRow(margin, yL, halfW, 'Dynamic Viscosity (mu)', `${viscosityMPas.toFixed(3)} mPa.s`, false);
  yL = drawKvRow(margin, yL, halfW, 'Kinematic Viscosity (nu)', `${kinViscMm2s.toFixed(3)} mm2/s`, true);
  yL = drawKvRow(margin, yL, halfW, 'Vapor Pressure (Pv)', `${pvKpa.toFixed(2)} kPa(a)`, false);
  yL = drawKvRow(margin, yL, halfW, 'Atmospheric Pressure', `${atmBar.toFixed(4)} bar(a)`, true);

  const rightX = margin + halfW + 6;
  yR = drawKvRow(rightX, yR, halfW, 'Source Gauge P (Ps)', `${source.gaugeBar.toFixed(3)} bar(g)`, false);
  yR = drawKvRow(rightX, yR, halfW, 'Source Elevation (z1)', `${source.elevM.toFixed(2)} m`, true);
  yR = drawKvRow(rightX, yR, halfW, 'Destination Gauge P (Pd)', `${dest.gaugeBar.toFixed(3)} bar(g)`, false);
  yR = drawKvRow(rightX, yR, halfW, 'Destination Elevation (z2)', `${dest.elevM.toFixed(2)} m`, true);
  yR = drawKvRow(rightX, yR, halfW, 'Static Elev. Diff (z2 - z1)', `${systemResult.staticElevHeadM.toFixed(2)} m`, false);
  yR = drawKvRow(rightX, yR, halfW, 'Total Static Head (H_stat)', `${systemResult.staticTotalHeadM.toFixed(2)} m`, true);

  y = Math.max(yL, yR) + 4;

  // Section 2: Suction & Discharge Piping Comparison Table
  y = drawSectionTitle('2. Suction & Discharge Piping Hydraulics', y);
  const col1 = margin;
  const col2 = margin + 68;
  const col3 = margin + 125;

  doc.setFillColor(226, 232, 240);
  doc.rect(margin, y, contentW, 5.8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('Parameter', col1 + 2, y + 4);
  doc.text('Suction Line', col2 + 2, y + 4);
  doc.text('Discharge Line', col3 + 2, y + 4);
  y += 8.2;

  const pipeRows: [string, string, string][] = [
    ['Pipe Standard', suctionStandardName.slice(0, 30), dischargeStandardName.slice(0, 30)],
    ['Nominal Size', suctionSizeLabel, dischargeSizeLabel],
    ['Inner Diameter (D)', `${suctionLeg.innerDiaMm.toFixed(2)} mm`, `${dischargeLeg.innerDiaMm.toFixed(2)} mm`],
    ['Pipe Length (L)', `${suctionLeg.lengthM.toFixed(2)} m`, `${dischargeLeg.lengthM.toFixed(2)} m`],
    ['Wall Roughness (eps)', `${suctionLeg.roughnessMm} mm`, `${dischargeLeg.roughnessMm} mm`],
    ['Minor Loss Sum (Sigma K)', `${suctionLeg.sumK.toFixed(2)}`, `${dischargeLeg.sumK.toFixed(2)}`],
    ['Flow Velocity (v)', `${systemResult.suction.v.toFixed(3)} m/s`, `${systemResult.discharge.v.toFixed(3)} m/s`],
    ['Reynolds Number (Re)', `${Math.round(systemResult.suction.Re).toLocaleString()} (${systemResult.suction.regime})`, `${Math.round(systemResult.discharge.Re).toLocaleString()} (${systemResult.discharge.regime})`],
    ['Darcy Friction Factor (f)', systemResult.suction.f > 0 ? systemResult.suction.f.toFixed(5) : '—', systemResult.discharge.f > 0 ? systemResult.discharge.f.toFixed(5) : '—'],
    ['Friction Head Loss (hf)', `${systemResult.suction.hf.toFixed(3)} m`, `${systemResult.discharge.hf.toFixed(3)} m`],
    ['Minor Head Loss (hm)', `${systemResult.suction.hm.toFixed(3)} m`, `${systemResult.discharge.hm.toFixed(3)} m`],
    ['Total Leg Loss (hL / dP)', `${systemResult.suctionLossM.toFixed(3)} m (${(systemResult.suction.dpDynPa / 1e5).toFixed(4)} bar)`, `${systemResult.dischargeLossM.toFixed(3)} m (${(systemResult.discharge.dpDynPa / 1e5).toFixed(4)} bar)`],
  ];

  pipeRows.forEach((row, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y - 3.6, contentW, 5.2, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(row[0], col1 + 2, y);

    doc.setFont('courier', idx >= 9 ? 'bold' : 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(row[1], col2 + 2, y);
    doc.text(row[2], col3 + 2, y);

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(margin, y + 1.4, margin + contentW, y + 1.4);
    y += 5.2;
  });

  y += 4;

  // Section 3: Pump Duty, Nozzle Pressures & Discharge Control Valve
  y = drawSectionTitle('3. Pump Duty, Nozzle Pressures & Discharge Control Valve', y);
  let yP1 = y + 2;
  let yP2 = y + 2;

  yP1 = drawKvRow(margin, yP1, halfW, 'Suction Nozzle Gauge P', `${systemResult.suctionFlangeGaugeBar.toFixed(4)} bar(g)`, false);
  yP1 = drawKvRow(margin, yP1, halfW, 'Discharge Nozzle Gauge P', `${systemResult.dischargeFlangeGaugeBar.toFixed(4)} bar(g)`, true);
  yP1 = drawKvRow(margin, yP1, halfW, 'Total Pump Head (TDH)', `${systemResult.totalPumpHeadM.toFixed(3)} m`, false);
  yP1 = drawKvRow(margin, yP1, halfW, 'Total Pump Diff. Press.', `${systemResult.totalPumpDpBar.toFixed(4)} bar`, true);
  yP1 = drawKvRow(margin, yP1, halfW, 'NPSH Available (NPSHa)', `${systemResult.npshaM.toFixed(3)} m`, false);
  yP1 = drawKvRow(margin, yP1, halfW, 'Hydraulic Power Required', `${systemResult.hydPowerKw.toFixed(3)} kW`, true);

  const valveModeLabel =
    valve.mode === 'throttle_kv'
      ? `Throttle (${valve.openingPct.toFixed(0)}% Open)`
      : valve.mode === 'target_flow'
        ? 'Target Flow Sizing'
        : 'Bypassed';

  yP2 = drawKvRow(rightX, yP2, halfW, 'Control Valve Mode', valveModeLabel, false);
  yP2 = drawKvRow(rightX, yP2, halfW, 'Rated Kv100 / Char.', `${valve.kv100} m3/h (${valve.characteristic})`, true);
  yP2 = drawKvRow(
    rightX,
    yP2,
    halfW,
    'Active Kv (Cv)',
    Number.isFinite(systemResult.valveKvActive)
      ? `${systemResult.valveKvActive.toFixed(2)} (${(systemResult.valveKvActive * 1.156).toFixed(1)})`
      : 'Inf',
    false
  );
  yP2 = drawKvRow(rightX, yP2, halfW, 'Valve Drop (dP_cv / dh_cv)', `${systemResult.valveDpBar.toFixed(3)} bar (${systemResult.valveLossM.toFixed(2)} m)`, true);
  yP2 = drawKvRow(rightX, yP2, halfW, 'Valve Authority', `${(systemResult.valveAuthority * 100).toFixed(1)}%`, false);
  yP2 = drawKvRow(
    rightX,
    yP2,
    halfW,
    'Pump Curve Duty Point',
    dutyIntersection.found
      ? `${dutyIntersection.qOp.toFixed(2)} m3/h @ ${dutyIntersection.hOp.toFixed(1)} m (${dutyIntersection.effOp.toFixed(0)}%)`
      : 'No Intersection',
    true
  );

  // ================= PAGE 2 =================
  doc.addPage();
  drawHeader(2, 2);
  let y2 = 26;

  // Section 4: Vector Pump H-Q vs System Curve Chart (HTML-parity detail)
  y2 = drawSectionTitle(
    '4. Centrifugal Pump Curve, Control Valve Throttling & Best Efficiency Point (BEP)',
    y2
  );

  // Compute BEP & Unthrottled intersection
  const effs = sortedPumpPoints.map((p) => p.eff);
  const hasEff = sortedPumpPoints.length >= 2 && effs.some((e) => e > 0);
  const xs = sortedPumpPoints.map((p) => p.q);
  const hs = sortedPumpPoints.map((p) => p.h);

  let bepInfo: {
    q: number;
    h: number;
    eff: number;
    porMin: number;
    porMax: number;
  } | null = null;

  if (hasEff) {
    const qMinB = xs[0];
    const qMaxB = xs[xs.length - 1];
    let bestQ = qMinB;
    let bestEff = -1;
    for (let i = 0; i <= 120; i++) {
      const q = qMinB + ((qMaxB - qMinB) * i) / 120;
      const e = evaluateMonotoneCurve(xs, effs, q);
      if (e > bestEff) {
        bestEff = e;
        bestQ = q;
      }
    }
    const bestH = evaluateMonotoneCurve(xs, hs, bestQ);
    bepInfo = {
      q: bestQ,
      h: bestH,
      eff: Math.min(100, bestEff),
      porMin: bestQ * 0.7,
      porMax: bestQ * 1.2,
    };
  }

  const unthrottledDuty = findPumpNetworkIntersection(
    sortedPumpPoints,
    suctionLeg,
    dischargeLeg,
    source,
    dest,
    densityKgM3,
    viscosityMPas,
    { ...valve, mode: 'bypass' },
    pvKpa,
    atmBar
  );

  // 4-Metric Operating & BEP Strip above chart
  const stripW = (contentW - 6) / 4;
  const stripH = 13.5;
  let bepRatioStr = '—';
  let bepStatusStr = 'Enter eff %';
  if (dutyIntersection.found && bepInfo && bepInfo.q > 0) {
    const ratio = (dutyIntersection.qOp / bepInfo.q) * 100;
    bepRatioStr = `${ratio.toFixed(1)}%`;
    bepStatusStr =
      ratio < 70
        ? 'Below POR (<70%)'
        : ratio <= 120
          ? 'Within POR (70-120%)'
          : 'Above POR (>120%)';
  }

  const pumpStrip = [
    {
      t: 'CONTROLLED DUTY',
      v: dutyIntersection.found
        ? `${dutyIntersection.qOp.toFixed(2)} m3/h @ ${dutyIntersection.hOp.toFixed(1)}m`
        : 'No Intersection',
      s:
        unthrottledDuty.found && valve.mode !== 'bypass'
          ? `Unthrottled ${unthrottledDuty.qOp.toFixed(1)} m3/h`
          : dutyIntersection.found
            ? `${dutyIntersection.dpOpBar.toFixed(3)} bar`
            : '—',
    },
    {
      t: 'BEST EFF. POINT (BEP)',
      v: bepInfo ? `${bepInfo.q.toFixed(1)} m3/h @ ${bepInfo.h.toFixed(1)}m` : '—',
      s: bepInfo ? `Peak Eff: ${bepInfo.eff.toFixed(1)}%` : 'No Eff data',
    },
    {
      t: 'OPERATING RATIO',
      v: bepRatioStr,
      s: bepStatusStr,
    },
    {
      t: 'DUTY POWER (HYD / SHAFT)',
      v: dutyIntersection.found
        ? `${dutyIntersection.hydPowerKw.toFixed(2)} / ${
            dutyIntersection.shaftPowerKw !== null
              ? `${dutyIntersection.shaftPowerKw.toFixed(2)} kW`
              : '—'
          }`
        : '—',
      s: dutyIntersection.found ? `Eff @ Duty: ${dutyIntersection.effOp.toFixed(1)}%` : '—',
    },
  ];

  pumpStrip.forEach((item, idx) => {
    const sx = margin + idx * (stripW + 2);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.roundedRect(sx, y2, stripW, stripH, 1, 1, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(100, 116, 139);
    doc.text(item.t, sx + 2, y2 + 3.8);

    doc.setFont('courier', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(15, 23, 42);
    doc.text(item.v, sx + 2, y2 + 8.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(71, 85, 105);
    doc.text(item.s, sx + 2, y2 + 11.8);
  });

  y2 += stripH + 4;

  // Chart Geometry (with space for Left Head axis + Right Efficiency axis)
  const chartX = margin + 12;
  const chartY = y2;
  const chartW = contentW - 26;
  const chartH = 78;

  const maxPumpQ = xs.length > 0 ? xs[xs.length - 1] : 40;
  const xScale = computeNiceScale(0, Math.max(maxPumpQ, flowRateM3h * 1.15, 10), 7);
  const qMax = xScale.niceMax;

  const effectiveCurveValve: ControlValveConfig =
    valve.mode === 'target_flow' &&
    systemResult.targetFlowFeasible &&
    Number.isFinite(systemResult.valveKvActive)
      ? {
          mode: 'throttle_kv',
          kv100: systemResult.valveKvActive,
          openingPct: 100,
          characteristic: 'linear',
        }
      : valve.mode === 'target_flow'
        ? { ...valve, mode: 'bypass' }
        : valve;

  const samples = 110;
  const series: {
    q: number;
    hSys: number;
    hUnth: number;
    hPump: number | null;
    eff: number | null;
  }[] = [];
  let minH = Math.min(0, systemResult.staticTotalHeadM);
  let maxH = Math.max(10, systemResult.totalPumpHeadM * 1.1);
  if (hs.length > 0) {
    maxH = Math.max(maxH, ...hs);
    minH = Math.min(minH, ...hs);
  }

  for (let i = 0; i <= samples; i++) {
    const q = (qMax * i) / samples;
    const sys = calcPumpSystem(
      q,
      suctionLeg,
      dischargeLeg,
      source,
      dest,
      densityKgM3,
      viscosityMPas,
      effectiveCurveValve,
      pvKpa,
      atmBar
    );
    const inRange = xs.length >= 2 && q >= xs[0] - 1e-6 && q <= xs[xs.length - 1] + 1e-6;
    const hPump = inRange ? evaluateMonotoneCurve(xs, hs, q) : null;
    const eff = inRange
      ? Math.max(0, Math.min(100, evaluateMonotoneCurve(xs, effs, q)))
      : null;

    series.push({
      q,
      hSys: sys.totalPumpHeadM,
      hUnth: sys.unthrottledHeadM,
      hPump,
      eff,
    });
    if (q <= (xs.length >= 2 ? xs[xs.length - 1] * 1.08 : qMax)) {
      maxH = Math.max(maxH, Math.min(sys.totalPumpHeadM, (hs[0] ?? 40) * 1.6));
    }
    if (hPump !== null) {
      maxH = Math.max(maxH, hPump);
      minH = Math.min(minH, hPump);
    }
  }

  const yScale = computeNiceScale(Math.min(0, minH), maxH * 1.08, 6);
  const yMin = yScale.niceMin;
  const yMax = yScale.niceMax;

  const mapCX = (q: number) => chartX + (q / qMax) * chartW;
  const mapCY = (h: number) => chartY + chartH - ((h - yMin) / (yMax - yMin)) * chartH;
  const mapEffCY = (eff: number) =>
    chartY + chartH - (Math.max(0, Math.min(100, eff)) / 100) * chartH;

  // Helper to draw a clipped polyline strictly inside [chartY, chartY + chartH]
  const drawClippedCurve = (pts: [number, number][]) => {
    if (pts.length < 2) return;
    const yTop = chartY;
    const yBot = chartY + chartH;
    let run: [number, number][] = [];

    const flushRun = () => {
      if (run.length >= 2) {
        const deltas: [number, number][] = [];
        for (let i = 1; i < run.length; i++) {
          deltas.push([run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]]);
        }
        doc.lines(deltas, run[0][0], run[0][1], [1, 1], 'S', false);
      }
      run = [];
    };

    for (let i = 0; i < pts.length - 1; i++) {
      let [x1, y1] = pts[i];
      let [x2, y2p] = pts[i + 1];
      // Clip segment vertically against [yTop, yBot]
      if ((y1 < yTop && y2p < yTop) || (y1 > yBot && y2p > yBot)) {
        flushRun();
        continue;
      }
      const dy = y2p - y1;
      if (Math.abs(dy) > 1e-9) {
        if (y1 < yTop) {
          x1 = x1 + ((yTop - y1) / dy) * (x2 - x1);
          y1 = yTop;
        } else if (y1 > yBot) {
          x1 = x1 + ((yBot - y1) / dy) * (x2 - x1);
          y1 = yBot;
        }
        const dy2 = y2p - y1;
        if (Math.abs(dy2) > 1e-9) {
          if (y2p < yTop) {
            x2 = x1 + ((yTop - y1) / dy2) * (x2 - x1);
            y2p = yTop;
          } else if (y2p > yBot) {
            x2 = x1 + ((yBot - y1) / dy2) * (x2 - x1);
            y2p = yBot;
          }
        }
      }
      if (run.length === 0) {
        run.push([x1, y1], [x2, y2p]);
      } else {
        const last = run[run.length - 1];
        if (Math.hypot(last[0] - x1, last[1] - y1) > 0.05) {
          flushRun();
          run.push([x1, y1], [x2, y2p]);
        } else {
          run.push([x2, y2p]);
        }
      }
    }
    flushRun();
  };

  // White plot background
  doc.setFillColor(255, 255, 255);
  doc.rect(chartX, chartY, chartW, chartH, 'F');

  // Preferred Operating Region (POR 70% - 120% BEP) warm amber band
  if (bepInfo) {
    const porX1 = Math.max(chartX, mapCX(bepInfo.porMin));
    const porX2 = Math.min(chartX + chartW, mapCX(bepInfo.porMax));
    if (porX2 > porX1) {
      doc.setFillColor(254, 243, 199); // Amber-100 subtle shading
      doc.rect(porX1, chartY, porX2 - porX1, chartH, 'F');
    }
  }

  // Grid lines & X ticks
  xScale.ticks.forEach((qv) => {
    const gx = mapCX(qv);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(gx, chartY, gx, chartY + chartH);
    doc.setFont('courier', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(71, 85, 105);
    doc.text(formatAxisTick(qv, xScale.step), gx, chartY + chartH + 3.8, { align: 'center' });
  });

  // Left Y Grid & Head ticks
  yScale.ticks.forEach((hv) => {
    const gy = mapCY(hv);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(chartX, gy, chartX + chartW, gy);
    doc.setFont('courier', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(71, 85, 105);
    doc.text(formatAxisTick(hv, yScale.step), chartX - 1.8, gy + 0.9, { align: 'right' });
  });

  // Right Y Efficiency ticks (0 - 100%)
  if (hasEff) {
    [0, 25, 50, 75, 100].forEach((ev) => {
      const ey = mapEffCY(ev);
      doc.setFont('courier', 'normal');
      doc.setFontSize(7.0);
      doc.setTextColor(180, 83, 9); // Amber-700
      doc.text(`${ev}%`, chartX + chartW + 1.8, ey + 0.9, { align: 'left' });
    });
  }

  // Outer chart border
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.35);
  doc.rect(chartX, chartY, chartW, chartH, 'S');

  // Axis labels
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(51, 65, 85);
  doc.text('Volumetric Flow Rate Q (m3/h)', chartX + chartW / 2, chartY + chartH + 8.5, {
    align: 'center',
  });
  doc.text('Total Head H (m)', margin + 2.5, chartY + chartH / 2 + 9, { angle: 90 });

  if (hasEff) {
    doc.setTextColor(180, 83, 9);
    doc.text('Efficiency (%)', pageW - margin - 2, chartY + chartH / 2 - 9, { angle: -90 });
  }

  // 1. Efficiency Curve (dashed amber)
  if (hasEff) {
    const effPts: [number, number][] = series
      .filter((pt) => pt.eff !== null)
      .map((pt) => [mapCX(pt.q), mapEffCY(pt.eff!)]);
    doc.setDrawColor(217, 119, 6); // Amber-600
    doc.setLineWidth(0.55);
    doc.setLineDashPattern([1.8, 1.3], 0);
    drawClippedCurve(effPts);
    doc.setLineDashPattern([], 0);
  }

  // 2. Unthrottled System Curve (dashed slate)
  const showUnthrottled = valve.mode !== 'bypass' && systemResult.valveDpBar > 1e-5;
  if (showUnthrottled) {
    const unthPts: [number, number][] = series.map((pt) => [mapCX(pt.q), mapCY(pt.hUnth)]);
    doc.setDrawColor(100, 116, 139); // Slate-500
    doc.setLineWidth(0.55);
    doc.setLineDashPattern([2.0, 1.5], 0);
    drawClippedCurve(unthPts);
    doc.setLineDashPattern([], 0);
  }

  // 3. Controlled System Curve (solid cyan-600)
  const sysPts: [number, number][] = series.map((pt) => [mapCX(pt.q), mapCY(pt.hSys)]);
  doc.setDrawColor(8, 145, 178); // Cyan-600
  doc.setLineWidth(0.85);
  drawClippedCurve(sysPts);

  // 4. Pump H-Q Curve (solid emerald-600)
  const pumpPts: [number, number][] = series
    .filter((pt) => pt.hPump !== null)
    .map((pt) => [mapCX(pt.q), mapCY(pt.hPump!)]);
  doc.setDrawColor(5, 150, 105); // Emerald-600
  doc.setLineWidth(0.95);
  drawClippedCurve(pumpPts);

  // 5. Hollow-centered Pump Datasheet Points
  sortedPumpPoints.forEach((pt) => {
    const px = mapCX(pt.q);
    const py = mapCY(pt.h);
    if (px >= chartX && px <= chartX + chartW && py >= chartY && py <= chartY + chartH) {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(5, 150, 105);
      doc.setLineWidth(0.55);
      doc.circle(px, py, 1.15, 'FD');
    }
  });

  // 6. BEP Vertical Guide, Diamond Marker & Efficiency Dot
  if (bepInfo) {
    const bx = mapCX(bepInfo.q);
    const by = mapCY(bepInfo.h);
    const bey = mapEffCY(bepInfo.eff);

    if (bx >= chartX && bx <= chartX + chartW) {
      doc.setDrawColor(217, 119, 6);
      doc.setLineWidth(0.4);
      doc.setLineDashPattern([1.4, 1.4], 0);
      doc.line(bx, chartY, bx, chartY + chartH);
      doc.setLineDashPattern([], 0);

      // Efficiency curve peak dot
      if (hasEff) {
        doc.setFillColor(245, 158, 11);
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.35);
        doc.circle(bx, bey, 1.25, 'FD');
      }

      // Diamond marker on Pump H-Q curve at BEP
      if (by >= chartY && by <= chartY + chartH) {
        const dR = 2.0;
        doc.setFillColor(245, 158, 11);
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.35);
        doc.triangle(bx, by - dR, bx + dR, by, bx - dR, by, 'F');
        doc.triangle(bx, by + dR, bx + dR, by, bx - dR, by, 'F');
        doc.line(bx, by - dR, bx + dR, by);
        doc.line(bx + dR, by, bx, by + dR);
        doc.line(bx, by + dR, bx - dR, by);
        doc.line(bx - dR, by, bx, by - dR);

        doc.setFont('courier', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(180, 83, 9);
        const labelX = Math.min(chartX + chartW - 18, bx + 2.8);
        const labelY = Math.max(chartY + 4, by - 2.5);
        doc.text(`BEP (${bepInfo.eff.toFixed(0)}%)`, labelX, labelY);
      }
    }
  }

  // 7. Unthrottled Duty Point Marker
  if (showUnthrottled && unthrottledDuty.found) {
    const ux = mapCX(unthrottledDuty.qOp);
    const uy = mapCY(unthrottledDuty.hOp);
    if (ux >= chartX && ux <= chartX + chartW && uy >= chartY && uy <= chartY + chartH) {
      doc.setFillColor(100, 116, 139);
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.45);
      doc.circle(ux, uy, 1.4, 'FD');
    }
  }

  // 8. Controlled Duty Point Double-Ringed Marker
  if (dutyIntersection.found) {
    const dx = mapCX(dutyIntersection.qOp);
    const dy = mapCY(dutyIntersection.hOp);
    if (dx >= chartX && dx <= chartX + chartW && dy >= chartY && dy <= chartY + chartH) {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.45);
      doc.circle(dx, dy, 2.0, 'FD');
      doc.setFillColor(8, 145, 178);
      doc.circle(dx, dy, 0.95, 'F');
    }
  }

  // 9. Complete 5-item Legend below chart
  const legY = chartY + chartH + 13;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);

  // Pump Curve
  doc.setDrawColor(5, 150, 105);
  doc.setLineWidth(0.95);
  doc.line(chartX, legY - 1, chartX + 6, legY - 1);
  doc.setTextColor(15, 23, 42);
  doc.text('Pump Curve (H-Q)', chartX + 7.5, legY);

  // Throttled System
  doc.setDrawColor(8, 145, 178);
  doc.setLineWidth(0.85);
  doc.line(chartX + 36, legY - 1, chartX + 42, legY - 1);
  doc.text('Throttled System (w/ CV)', chartX + 43.5, legY);

  // Unthrottled System
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.55);
  doc.setLineDashPattern([1.6, 1.2], 0);
  doc.line(chartX + 80, legY - 1, chartX + 86, legY - 1);
  doc.setLineDashPattern([], 0);
  doc.text('Unthrottled System', chartX + 87.5, legY);

  // Efficiency
  if (hasEff) {
    doc.setDrawColor(217, 119, 6);
    doc.setLineWidth(0.55);
    doc.setLineDashPattern([1.5, 1.1], 0);
    doc.line(chartX + 117, legY - 1, chartX + 123, legY - 1);
    doc.setLineDashPattern([], 0);
    doc.text('Efficiency (%)', chartX + 124.5, legY);
  }

  // BEP & POR band
  if (bepInfo) {
    const legY2 = legY + 4.8;
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(217, 119, 6);
    doc.setLineWidth(0.25);
    doc.rect(chartX, legY2 - 2.6, 5.5, 3, 'FD');
    doc.setTextColor(180, 83, 9);
    doc.text('BEP & POR Band (70-120% BEP)  |  Double-ring: Controlled Duty Point', chartX + 7.5, legY2);
    y2 = legY2 + 6;
  } else {
    y2 = legY + 6;
  }

  // Section 5: Active Fittings Schedule
  y2 = drawSectionTitle('5. Minor Loss Fittings Schedule (Suction & Discharge)', y2);
  const sucRows = collectFittingRows(
    input.suctionFittings,
    input.suctionCustomFittings,
    systemResult.suction.velHead
  );
  const disRows = collectFittingRows(
    input.dischargeFittings,
    input.dischargeCustomFittings,
    systemResult.discharge.velHead
  );

  let yF1 = y2 + 2;
  let yF2 = y2 + 2;
  const maxFittingRows = 12;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(5, 150, 105);
  doc.text(`Suction Fittings (Sigma Ks = ${suctionLeg.sumK.toFixed(2)})`, margin, yF1);
  yF1 += 4.5;

  if (sucRows.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.8);
    doc.setTextColor(100, 116, 139);
    doc.text('No fittings / manual Sigma K override', margin, yF1);
    yF1 += 5;
  } else {
    sucRows.slice(0, maxFittingRows).forEach((r, idx) => {
      yF1 = drawKvRow(
        margin,
        yF1,
        halfW,
        `${r.qty}x ${r.name.slice(0, 28)}`,
        `K=${r.kSub.toFixed(2)} (${r.hm.toFixed(2)}m)`,
        idx % 2 === 1
      );
    });
    if (sucRows.length > maxFittingRows) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.2);
      doc.setTextColor(100, 116, 139);
      doc.text(`+ ${sucRows.length - maxFittingRows} more suction items`, margin, yF1);
      yF1 += 4.5;
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(8, 145, 178);
  doc.text(`Discharge Fittings (Sigma Kd = ${dischargeLeg.sumK.toFixed(2)})`, rightX, yF2);
  yF2 += 4.5;

  if (disRows.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.8);
    doc.setTextColor(100, 116, 139);
    doc.text('No fittings / manual Sigma K override', rightX, yF2);
    yF2 += 5;
  } else {
    disRows.slice(0, maxFittingRows).forEach((r, idx) => {
      yF2 = drawKvRow(
        rightX,
        yF2,
        halfW,
        `${r.qty}x ${r.name.slice(0, 28)}`,
        `K=${r.kSub.toFixed(2)} (${r.hm.toFixed(2)}m)`,
        idx % 2 === 1
      );
    });
    if (disRows.length > maxFittingRows) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.2);
      doc.setTextColor(100, 116, 139);
      doc.text(`+ ${disRows.length - maxFittingRows} more discharge items`, rightX, yF2);
      yF2 += 4.5;
    }
  }

  // Footer Energy Balance Summary
  const formulaLine =
    'Energy Balance: H_pump = (z2 - z1) + (Pd - Ps)/(rho*g) + h_Ls + h_Ld + dh_cv';
  const valuesText = `= ${systemResult.staticElevHeadM.toFixed(2)} + ${systemResult.staticPressHeadM.toFixed(2)} + ${systemResult.suctionLossM.toFixed(2)} + ${systemResult.dischargeLossM.toFixed(2)} + ${systemResult.valveLossM.toFixed(2)} = ${systemResult.totalPumpHeadM.toFixed(2)} m`;

  doc.setFont('courier', 'bold');
  doc.setFontSize(8.2);
  const wrappedValues: string[] = doc.splitTextToSize(valuesText, contentW - 6);
  const boxH = 10.5 + wrappedValues.length * 4.2;
  const footY = Math.min(pageH - boxH - 8, Math.max(yF1, yF2) + 8);

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, footY, contentW, boxH, 1.2, 1.2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(formulaLine, margin + 3, footY + 5);

  doc.setFont('courier', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(15, 23, 42);
  wrappedValues.forEach((line, idx) => {
    doc.text(line, margin + 3, footY + 9.8 + idx * 4.2);
  });

  doc.save(`pump-system-hydraulics-${flowRateM3h.toFixed(0)}m3h.pdf`);
}
