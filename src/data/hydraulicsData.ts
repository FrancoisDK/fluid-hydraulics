export interface PipeSize {
  label: string;
  od: number; // mm
  wt: number; // mm
}

export interface PipeStandard {
  id: string;
  name: string;
  defaultRoughness: number; // mm
  sizes: PipeSize[];
}

export interface RoughnessPreset {
  id: string;
  name: string;
  eps: number; // mm
}

export interface FluidPreset {
  id: string;
  name: string;
  rho: number | null; // kg/m3
  mu: number | null;  // mPa.s (cP)
  pvKpa: number | null; // vapor pressure in kPa(a)
}

export type FittingCategoryId =
  | 'all'
  | 'entrance_exit'
  | 'bends_tees'
  | 'valves'
  | 'strainers_meters';

export interface FittingItem {
  id: string;
  cat: Exclude<FittingCategoryId, 'all'>;
  name: string;
  note: string;
  k: number;
}

export const PIPE_STANDARDS: PipeStandard[] = [
  {
    id: 'asme_sch40',
    name: 'Carbon Steel — ASME B36.10 Sch 40',
    defaultRoughness: 0.045,
    sizes: [
      { label: 'DN 15 (1/2")', od: 21.3, wt: 2.77 },
      { label: 'DN 20 (3/4")', od: 26.7, wt: 2.87 },
      { label: 'DN 25 (1")', od: 33.4, wt: 3.38 },
      { label: 'DN 32 (1-1/4")', od: 42.2, wt: 3.56 },
      { label: 'DN 40 (1-1/2")', od: 48.3, wt: 3.68 },
      { label: 'DN 50 (2")', od: 60.3, wt: 3.91 },
      { label: 'DN 65 (2-1/2")', od: 73.0, wt: 5.16 },
      { label: 'DN 80 (3")', od: 88.9, wt: 5.49 },
      { label: 'DN 100 (4")', od: 114.3, wt: 6.02 },
      { label: 'DN 125 (5")', od: 141.3, wt: 6.55 },
      { label: 'DN 150 (6")', od: 168.3, wt: 7.11 },
      { label: 'DN 200 (8")', od: 219.1, wt: 8.18 },
      { label: 'DN 250 (10")', od: 273.1, wt: 9.27 },
      { label: 'DN 300 (12")', od: 323.9, wt: 10.31 },
      { label: 'DN 350 (14")', od: 355.6, wt: 11.13 },
      { label: 'DN 400 (16")', od: 406.4, wt: 12.70 },
      { label: 'DN 450 (18")', od: 457.0, wt: 14.27 },
      { label: 'DN 500 (20")', od: 508.0, wt: 15.09 },
      { label: 'DN 600 (24")', od: 610.0, wt: 17.48 },
    ],
  },
  {
    id: 'asme_sch80',
    name: 'Carbon Steel — ASME B36.10 Sch 80',
    defaultRoughness: 0.045,
    sizes: [
      { label: 'DN 15 (1/2")', od: 21.3, wt: 3.73 },
      { label: 'DN 20 (3/4")', od: 26.7, wt: 3.91 },
      { label: 'DN 25 (1")', od: 33.4, wt: 4.55 },
      { label: 'DN 32 (1-1/4")', od: 42.2, wt: 4.85 },
      { label: 'DN 40 (1-1/2")', od: 48.3, wt: 5.08 },
      { label: 'DN 50 (2")', od: 60.3, wt: 5.54 },
      { label: 'DN 65 (2-1/2")', od: 73.0, wt: 7.01 },
      { label: 'DN 80 (3")', od: 88.9, wt: 7.62 },
      { label: 'DN 100 (4")', od: 114.3, wt: 8.56 },
      { label: 'DN 125 (5")', od: 141.3, wt: 9.53 },
      { label: 'DN 150 (6")', od: 168.3, wt: 10.97 },
      { label: 'DN 200 (8")', od: 219.1, wt: 12.70 },
      { label: 'DN 250 (10")', od: 273.1, wt: 15.09 },
      { label: 'DN 300 (12")', od: 323.9, wt: 17.48 },
      { label: 'DN 350 (14")', od: 355.6, wt: 19.05 },
      { label: 'DN 400 (16")', od: 406.4, wt: 21.44 },
      { label: 'DN 450 (18")', od: 457.0, wt: 23.83 },
      { label: 'DN 500 (20")', od: 508.0, wt: 26.19 },
      { label: 'DN 600 (24")', od: 610.0, wt: 30.96 },
    ],
  },
  {
    id: 'ss_sch10s',
    name: 'Stainless Steel — ASME B36.19 Sch 10S',
    defaultRoughness: 0.015,
    sizes: [
      { label: 'DN 15 (1/2")', od: 21.3, wt: 2.11 },
      { label: 'DN 20 (3/4")', od: 26.7, wt: 2.11 },
      { label: 'DN 25 (1")', od: 33.4, wt: 2.77 },
      { label: 'DN 32 (1-1/4")', od: 42.2, wt: 2.77 },
      { label: 'DN 40 (1-1/2")', od: 48.3, wt: 2.77 },
      { label: 'DN 50 (2")', od: 60.3, wt: 2.77 },
      { label: 'DN 65 (2-1/2")', od: 73.0, wt: 3.05 },
      { label: 'DN 80 (3")', od: 88.9, wt: 3.05 },
      { label: 'DN 100 (4")', od: 114.3, wt: 3.05 },
      { label: 'DN 125 (5")', od: 141.3, wt: 3.40 },
      { label: 'DN 150 (6")', od: 168.3, wt: 3.40 },
      { label: 'DN 200 (8")', od: 219.1, wt: 3.76 },
      { label: 'DN 250 (10")', od: 273.1, wt: 4.19 },
      { label: 'DN 300 (12")', od: 323.9, wt: 4.57 },
      { label: 'DN 350 (14")', od: 355.6, wt: 4.78 },
      { label: 'DN 400 (16")', od: 406.4, wt: 4.78 },
      { label: 'DN 450 (18")', od: 457.0, wt: 4.78 },
      { label: 'DN 500 (20")', od: 508.0, wt: 5.54 },
      { label: 'DN 600 (24")', od: 610.0, wt: 6.35 },
    ],
  },
  {
    id: 'hdpe_sdr11',
    name: 'HDPE PE100 — ISO 4427 SDR 11 (PN16)',
    defaultRoughness: 0.007,
    sizes: [
      { label: 'OD 20 mm', od: 20, wt: 2.3 },
      { label: 'OD 25 mm', od: 25, wt: 2.3 },
      { label: 'OD 32 mm', od: 32, wt: 2.9 },
      { label: 'OD 40 mm', od: 40, wt: 3.7 },
      { label: 'OD 50 mm', od: 50, wt: 4.6 },
      { label: 'OD 63 mm', od: 63, wt: 5.8 },
      { label: 'OD 75 mm', od: 75, wt: 6.8 },
      { label: 'OD 90 mm', od: 90, wt: 8.2 },
      { label: 'OD 110 mm', od: 110, wt: 10.0 },
      { label: 'OD 125 mm', od: 125, wt: 11.4 },
      { label: 'OD 140 mm', od: 140, wt: 12.7 },
      { label: 'OD 160 mm', od: 160, wt: 14.6 },
      { label: 'OD 180 mm', od: 180, wt: 16.4 },
      { label: 'OD 200 mm', od: 200, wt: 18.2 },
      { label: 'OD 225 mm', od: 225, wt: 20.5 },
      { label: 'OD 250 mm', od: 250, wt: 22.7 },
      { label: 'OD 280 mm', od: 280, wt: 25.4 },
      { label: 'OD 315 mm', od: 315, wt: 28.6 },
      { label: 'OD 355 mm', od: 355, wt: 32.2 },
      { label: 'OD 400 mm', od: 400, wt: 36.3 },
      { label: 'OD 450 mm', od: 450, wt: 40.9 },
      { label: 'OD 500 mm', od: 500, wt: 45.4 },
      { label: 'OD 560 mm', od: 560, wt: 50.8 },
      { label: 'OD 630 mm', od: 630, wt: 57.2 },
    ],
  },
  {
    id: 'hdpe_sdr17',
    name: 'HDPE PE100 — ISO 4427 SDR 17 (PN10)',
    defaultRoughness: 0.007,
    sizes: [
      { label: 'OD 32 mm', od: 32, wt: 2.3 },
      { label: 'OD 40 mm', od: 40, wt: 2.4 },
      { label: 'OD 50 mm', od: 50, wt: 3.0 },
      { label: 'OD 63 mm', od: 63, wt: 3.8 },
      { label: 'OD 75 mm', od: 75, wt: 4.5 },
      { label: 'OD 90 mm', od: 90, wt: 5.4 },
      { label: 'OD 110 mm', od: 110, wt: 6.6 },
      { label: 'OD 125 mm', od: 125, wt: 7.4 },
      { label: 'OD 140 mm', od: 140, wt: 8.3 },
      { label: 'OD 160 mm', od: 160, wt: 9.5 },
      { label: 'OD 180 mm', od: 180, wt: 10.7 },
      { label: 'OD 200 mm', od: 200, wt: 11.9 },
      { label: 'OD 225 mm', od: 225, wt: 13.4 },
      { label: 'OD 250 mm', od: 250, wt: 14.8 },
      { label: 'OD 280 mm', od: 280, wt: 16.6 },
      { label: 'OD 315 mm', od: 315, wt: 18.7 },
      { label: 'OD 355 mm', od: 355, wt: 21.1 },
      { label: 'OD 400 mm', od: 400, wt: 23.7 },
      { label: 'OD 450 mm', od: 450, wt: 26.7 },
      { label: 'OD 500 mm', od: 500, wt: 29.7 },
      { label: 'OD 560 mm', od: 560, wt: 33.2 },
      { label: 'OD 630 mm', od: 630, wt: 37.4 },
    ],
  },
  {
    id: 'pvcu_pn16',
    name: 'PVC-U — ISO 1452 PN16 (Metric)',
    defaultRoughness: 0.005,
    sizes: [
      { label: 'DN 15 (20 mm)', od: 20, wt: 1.5 },
      { label: 'DN 20 (25 mm)', od: 25, wt: 1.9 },
      { label: 'DN 25 (32 mm)', od: 32, wt: 2.4 },
      { label: 'DN 32 (40 mm)', od: 40, wt: 3.0 },
      { label: 'DN 40 (50 mm)', od: 50, wt: 3.7 },
      { label: 'DN 50 (63 mm)', od: 63, wt: 4.7 },
      { label: 'DN 65 (75 mm)', od: 75, wt: 5.6 },
      { label: 'DN 80 (90 mm)', od: 90, wt: 6.7 },
      { label: 'DN 100 (110 mm)', od: 110, wt: 8.1 },
      { label: 'DN 125 (140 mm)', od: 140, wt: 10.3 },
      { label: 'DN 150 (160 mm)', od: 160, wt: 11.8 },
      { label: 'DN 200 (225 mm)', od: 225, wt: 16.6 },
      { label: 'DN 250 (250 mm)', od: 250, wt: 18.4 },
      { label: 'DN 300 (315 mm)', od: 315, wt: 23.2 },
    ],
  },
  {
    id: 'copper_en1057',
    name: 'Copper Tube — EN 1057',
    defaultRoughness: 0.0015,
    sizes: [
      { label: '15 x 1.0 mm', od: 15, wt: 1.0 },
      { label: '18 x 1.0 mm', od: 18, wt: 1.0 },
      { label: '22 x 1.0 mm', od: 22, wt: 1.0 },
      { label: '28 x 1.5 mm', od: 28, wt: 1.5 },
      { label: '35 x 1.5 mm', od: 35, wt: 1.5 },
      { label: '42 x 1.5 mm', od: 42, wt: 1.5 },
      { label: '54 x 2.0 mm', od: 54, wt: 2.0 },
      { label: '64 x 2.0 mm', od: 64, wt: 2.0 },
      { label: '76.1 x 2.0 mm', od: 76.1, wt: 2.0 },
      { label: '88.9 x 2.0 mm', od: 88.9, wt: 2.0 },
      { label: '108 x 2.5 mm', od: 108, wt: 2.5 },
    ],
  },
  {
    id: 'custom',
    name: 'Custom Inner Diameter (Manual)',
    defaultRoughness: 0.045,
    sizes: [],
  },
];

export const ROUGHNESS_PRESETS: RoughnessPreset[] = [
  { id: 'copper', name: 'Drawn Copper / Glass / Brass (0.0015 mm)', eps: 0.0015 },
  { id: 'pvcu', name: 'PVC-U / Smooth Extruded Plastic (0.005 mm)', eps: 0.005 },
  { id: 'hdpe', name: 'HDPE / PEX / Polypropylene (0.007 mm)', eps: 0.007 },
  { id: 'ss', name: 'Stainless Steel — Seamless/Welded (0.015 mm)', eps: 0.015 },
  { id: 'cs_new', name: 'Commercial Carbon Steel — New (0.045 mm)', eps: 0.045 },
  { id: 'galv', name: 'Galvanized / Lightly Corroded Steel (0.15 mm)', eps: 0.15 },
  { id: 'cast_iron', name: 'Cast Iron — New / Asphalt Coated (0.26 mm)', eps: 0.26 },
  { id: 'concrete', name: 'Concrete — Smooth Centrifuged (0.30 mm)', eps: 0.30 },
  { id: 'aged', name: 'Aged / Tuberculated Steel Pipe (1.00 mm)', eps: 1.00 },
];

export const FLUID_PRESETS: FluidPreset[] = [
  { id: 'water_10', name: 'Water at 10°C', rho: 999.7, mu: 1.307, pvKpa: 1.23 },
  { id: 'water_20', name: 'Water at 20°C (Standard)', rho: 998.2, mu: 1.002, pvKpa: 2.34 },
  { id: 'water_40', name: 'Water at 40°C', rho: 992.2, mu: 0.653, pvKpa: 7.38 },
  { id: 'water_60', name: 'Water at 60°C', rho: 983.2, mu: 0.467, pvKpa: 19.94 },
  { id: 'water_80', name: 'Water at 80°C', rho: 971.8, mu: 0.355, pvKpa: 47.39 },
  { id: 'glycol_30', name: 'Ethylene Glycol 30% (20°C)', rho: 1043.0, mu: 2.40, pvKpa: 2.00 },
  { id: 'glycol_50', name: 'Ethylene Glycol 50% (20°C)', rho: 1072.0, mu: 4.20, pvKpa: 1.60 },
  { id: 'diesel', name: 'Diesel Fuel (20°C)', rho: 840.0, mu: 3.00, pvKpa: 0.50 },
  { id: 'iso_vg32', name: 'Hydraulic Oil ISO VG 32 (40°C)', rho: 860.0, mu: 27.5, pvKpa: 0.01 },
  { id: 'custom', name: 'Custom Fluid', rho: null, mu: null, pvKpa: null },
];

export const FITTING_CATEGORIES: { id: FittingCategoryId; label: string }[] = [
  { id: 'all', label: 'All Fittings' },
  { id: 'entrance_exit', label: 'Entrances & Exits' },
  { id: 'bends_tees', label: 'Elbows, Bends & Tees' },
  { id: 'valves', label: 'Valves' },
  { id: 'strainers_meters', label: 'Strainers & Meters' },
];

export const FITTINGS_CATALOG: FittingItem[] = [
  { id: 'ent_sharp', cat: 'entrance_exit', name: 'Pipe Entrance — Sharp-Edged (Flush)', note: 'Square 90° tank/vessel inlet', k: 0.50 },
  { id: 'ent_inward', cat: 'entrance_exit', name: 'Pipe Entrance — Inward Projecting (Borda)', note: 'Pipe protrudes into tank/reservoir', k: 0.80 },
  { id: 'ent_slight', cat: 'entrance_exit', name: 'Pipe Entrance — Slightly Rounded', note: 'Chamfered or small radius (r/D ≈ 0.05)', k: 0.25 },
  { id: 'ent_bell', cat: 'entrance_exit', name: 'Pipe Entrance — Bellmouth (Well-Rounded)', note: 'Smooth flared suction (r/D ≥ 0.15)', k: 0.05 },
  { id: 'exit_tank', cat: 'entrance_exit', name: 'Pipe Exit — Tank / Submerged / Free Discharge', note: 'All kinetic energy v²/2g dissipated', k: 1.00 },

  { id: 'elb_90_std', cat: 'bends_tees', name: '90° Elbow — Standard Radius', note: 'Standard threaded or r/D ≈ 1.0', k: 0.90 },
  { id: 'elb_90_lr', cat: 'bends_tees', name: '90° Elbow — Long Radius (r/D = 1.5)', note: 'Butt-weld / flanged long radius', k: 0.60 },
  { id: 'bend_90_swp', cat: 'bends_tees', name: '90° Smooth Sweep Bend (r/D = 4)', note: 'Large-radius bent pipe', k: 0.20 },
  { id: 'bend_90_mit', cat: 'bends_tees', name: '90° Miter Bend (Single Weld)', note: 'Fabricated sharp mitered turn', k: 1.10 },
  { id: 'elb_45', cat: 'bends_tees', name: '45° Elbow — Standard', note: 'Standard 45° change in direction', k: 0.40 },
  { id: 'bend_180', cat: 'bends_tees', name: '180° Return Bend (Close Pattern)', note: 'U-bend / coil return', k: 1.50 },
  { id: 'tee_run', cat: 'bends_tees', name: 'Tee — Flow Through Run (Inline)', note: 'Straight flow past branch port', k: 0.60 },
  { id: 'tee_branch', cat: 'bends_tees', name: 'Tee — Flow Through Branch (90°)', note: 'Dividing or combining branch flow', k: 1.80 },
  { id: 'wye_45', cat: 'bends_tees', name: '45° Wye (Lateral) — Branch Flow', note: 'Swept 45° branch connection', k: 0.50 },
  { id: 'coupling', cat: 'bends_tees', name: 'Coupling / Union', note: 'Inline pipe joint', k: 0.08 },

  { id: 'val_gate_open', cat: 'valves', name: 'Gate Valve — Fully Open', note: 'Low resistance isolation valve', k: 0.20 },
  { id: 'val_gate_half', cat: 'valves', name: 'Gate Valve — 1/2 Open', note: 'Throttled gate valve', k: 5.60 },
  { id: 'val_ball_full', cat: 'valves', name: 'Ball Valve — Full Bore (Open)', note: 'Straight-through full port', k: 0.05 },
  { id: 'val_ball_red', cat: 'valves', name: 'Ball Valve — Reduced Bore (Open)', note: 'Standard reduced port', k: 0.30 },
  { id: 'val_bfly', cat: 'valves', name: 'Butterfly Valve — Fully Open', note: 'Typical disc-in-stream (DN 50–350)', k: 0.60 },
  { id: 'val_globe', cat: 'valves', name: 'Globe Valve — Fully Open', note: 'High pressure drop throttling body', k: 10.00 },
  { id: 'val_angle', cat: 'valves', name: 'Angle Valve — Fully Open', note: '90° globe pattern valve', k: 5.00 },
  { id: 'val_diaph', cat: 'valves', name: 'Diaphragm Valve — Weir Type (Open)', note: 'Sanitary / chemical weir body', k: 2.30 },
  { id: 'val_chk_swing', cat: 'valves', name: 'Swing Check Valve', note: 'Hinged disc non-return valve', k: 2.00 },
  { id: 'val_chk_lift', cat: 'valves', name: 'Lift / Spring Check Valve', note: 'Guided poppet non-return valve', k: 10.00 },
  { id: 'val_foot', cat: 'valves', name: 'Foot Valve with Strainer', note: 'Pump suction inlet check + screen', k: 4.50 },

  { id: 'str_y', cat: 'strainers_meters', name: 'Y-Strainer (Clean Mesh)', note: 'Double K when partially fouled', k: 2.00 },
  { id: 'str_basket', cat: 'strainers_meters', name: 'Basket Strainer (Clean)', note: 'Simplex / duplex strainer pot', k: 1.50 },
  { id: 'mtr_water', cat: 'strainers_meters', name: 'Mechanical / Turbine Flow Meter', note: 'Typical inline rotary meter', k: 7.00 },
  { id: 'orifice_gen', cat: 'strainers_meters', name: 'Inline Orifice / Flow Restrictor', note: 'General placeholder (verify β ratio)', k: 2.50 },
];
