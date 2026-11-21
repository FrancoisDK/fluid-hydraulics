import React, { useMemo, useState } from 'react';
import { Minus, Plus, Search, Trash2, X } from 'lucide-react';
import {
  FITTING_CATEGORIES,
  FITTINGS_CATALOG,
  FittingCategoryId,
} from '../data/hydraulicsData';
import { calcTransitionK, CustomFitting, GRAVITY } from '../utils/hydraulicsSolver';

interface FittingsBuilderProps {
  fittingQuantities: Record<string, number>;
  customFittings: CustomFitting[];
  activeDiaMm: number;
  velHeadM: number;
  densityKgM3: number;
  manualKOverride: boolean;
  onChangeQty: (id: string, delta: number) => void;
  onAddCustom: (name: string, k: number) => void;
  onRemoveCustom: (id: string) => void;
  onClearAll: () => void;
  onResyncFromBuilder: () => void;
}

export const FittingsBuilder: React.FC<FittingsBuilderProps> = ({
  fittingQuantities,
  customFittings,
  activeDiaMm,
  velHeadM,
  densityKgM3,
  manualKOverride,
  onChangeQty,
  onAddCustom,
  onRemoveCustom,
  onClearAll,
  onResyncFromBuilder,
}) => {
  const [activeCat, setActiveCat] = useState<FittingCategoryId>('all');
  const [search, setSearch] = useState('');
  const [transType, setTransType] = useState<'expansion_out' | 'contraction_in'>('expansion_out');
  const [adjDiaMm, setAdjDiaMm] = useState<string>('102.26');
  const [customName, setCustomName] = useState('');
  const [customK, setCustomK] = useState('1.0');

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return FITTINGS_CATALOG.filter((item) => {
      const catMatch = activeCat === 'all' || item.cat === activeCat;
      if (!catMatch) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.note.toLowerCase().includes(q)
      );
    });
  }, [activeCat, search]);

  const activeItems = useMemo(() => {
    const list: {
      kind: 'std' | 'custom';
      id: string;
      name: string;
      k: number;
      qty: number;
    }[] = [];

    FITTINGS_CATALOG.forEach((item) => {
      const qty = fittingQuantities[item.id] || 0;
      if (qty > 0) {
        list.push({ kind: 'std', id: item.id, name: item.name, k: item.k, qty });
      }
    });

    customFittings.forEach((cf) => {
      if (cf.qty > 0) {
        list.push({ kind: 'custom', id: cf.id, name: cf.name, k: cf.k, qty: cf.qty });
      }
    });

    return list;
  }, [fittingQuantities, customFittings]);

  const totalK = useMemo(
    () => activeItems.reduce((acc, it) => acc + it.k * it.qty, 0),
    [activeItems]
  );

  const builderHm = totalK * velHeadM;
  const builderDpBar = (densityKgM3 * GRAVITY * builderHm) / 1e5;

  const transPreview = useMemo(
    () => calcTransitionK(activeDiaMm, parseFloat(adjDiaMm) || 1, transType),
    [activeDiaMm, adjDiaMm, transType]
  );

  const handleAddTransition = () => {
    if (!transPreview.valid) return;
    onAddCustom(transPreview.desc, Number(transPreview.k.toFixed(3)));
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const label = customName.trim() || 'Custom Fitting / Component';
    const kVal = Math.max(0, parseFloat(customK) || 0);
    onAddCustom(label, Number(kVal.toFixed(3)));
    setCustomName('');
  };

  return (
    <section
      id="fittings"
      className="bg-[#0E1520] border border-slate-800 rounded-lg p-4 scroll-mt-16"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100 tracking-tight">
            Fitting, Entrance, Exit &amp; Valve Losses
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Assemble system ΣK from standard Crane/Idelchik K-factors, Borda–Carnot transitions, or custom entries
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {manualKOverride && (
            <button
              type="button"
              onClick={onResyncFromBuilder}
              className="px-2.5 py-1 text-xs font-medium text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded hover:bg-amber-500/20 transition-colors whitespace-nowrap cursor-pointer"
            >
              Sync ΣK ({totalK.toFixed(2)})
            </button>
          )}
          <span className="text-xs font-mono tabular-nums text-cyan-300 font-semibold">
            Builder ΣK = {totalK.toFixed(2)}
          </span>
          <button
            type="button"
            onClick={onClearAll}
            disabled={activeItems.length === 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 bg-[#070B12] border border-slate-800 rounded hover:border-rose-500/50 hover:text-rose-300 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear All
          </button>
        </div>
      </div>

      {/* Category tabs + search */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#070B12] border border-slate-800/80 rounded-md">
          {FITTING_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCat(cat.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeCat === cat.id
                  ? 'bg-cyan-500/15 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter fittings (e.g. exit, globe)..."
            className="w-full bg-[#070B12] border border-slate-800 rounded-md pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Catalog table */}
        <div className="xl:col-span-7 bg-[#070B12] border border-slate-800/90 rounded-md max-h-[340px] overflow-y-auto divide-y divide-slate-800/70">
          {filteredCatalog.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              No fittings match "{search}".
            </div>
          ) : (
            filteredCatalog.map((item) => {
              const qty = fittingQuantities[item.id] || 0;
              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-3 px-3 py-2 transition-colors ${
                    qty > 0 ? 'bg-cyan-500/[0.06]' : 'hover:bg-slate-800/30'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-100 truncate">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">{item.note}</div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-mono tabular-nums text-cyan-300 w-16 text-right">
                      K = {item.k.toFixed(2)}
                    </span>

                    <div className="inline-flex items-center border border-slate-800 rounded bg-[#0E1520]">
                      <button
                        type="button"
                        onClick={() => onChangeQty(item.id, -1)}
                        disabled={qty === 0}
                        aria-label={`Remove ${item.name}`}
                        className="w-7 h-7 grid place-items-center text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center text-xs font-mono tabular-nums font-semibold text-slate-100 border-x border-slate-800 leading-7">
                        {qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => onChangeQty(item.id, 1)}
                        aria-label={`Add ${item.name}`}
                        className="w-7 h-7 grid place-items-center text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/10 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right utilities column (flat hairline sections, no nested heavy cards) */}
        <div className="xl:col-span-5 flex flex-col gap-3">
          {/* Active fittings breakdown */}
          <div className="bg-[#070B12] border border-slate-800/90 rounded-md p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Active Losses Breakdown
              </h3>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                {activeItems.reduce((s, i) => s + i.qty, 0)} items
              </span>
            </div>

            <div className="max-h-36 overflow-y-auto divide-y divide-slate-800/60">
              {activeItems.length === 0 ? (
                <p className="text-xs text-slate-500 py-3">
                  No fittings selected. Add entrances, exits, valves, or bends from the catalog.
                </p>
              ) : (
                activeItems.map((it) => {
                  const kSub = it.k * it.qty;
                  const hmSub = kSub * velHeadM;
                  return (
                    <div
                      key={`${it.kind}-${it.id}`}
                      className="flex items-center justify-between gap-2 py-1.5 text-xs"
                    >
                      <span className="text-slate-200 truncate">
                        <span className="font-mono text-cyan-300 mr-1.5">{it.qty}×</span>
                        {it.name}
                      </span>
                      <span className="flex items-center gap-2 shrink-0 font-mono tabular-nums text-slate-300">
                        <span>K={kSub.toFixed(2)}</span>
                        <span className="text-slate-500">({hmSub.toFixed(3)} m)</span>
                        <button
                          type="button"
                          onClick={() =>
                            it.kind === 'std'
                              ? onChangeQty(it.id, -it.qty)
                              : onRemoveCustom(it.id)
                          }
                          aria-label={`Remove ${it.name}`}
                          className="text-slate-500 hover:text-rose-400 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-800 mt-2 pt-2 text-xs font-mono tabular-nums text-slate-300">
              <span>Minor Head: {builderHm.toFixed(3)} m</span>
              <span>{builderDpBar.toFixed(4)} bar</span>
            </div>
          </div>

          {/* Sudden Expansion / Contraction calculator */}
          <div className="bg-[#070B12] border border-slate-800/90 rounded-md p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Sudden Expansion / Contraction (Borda–Carnot)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_105px_auto] gap-2 items-end">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Transition Direction
                </label>
                <select
                  value={transType}
                  onChange={(e) =>
                    setTransType(e.target.value as 'expansion_out' | 'contraction_in')
                  }
                  className="w-full bg-[#0E1520] border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="expansion_out">Expansion (D → D_adj)</option>
                  <option value="contraction_in">Contraction (D_adj → D)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Adjacent ID (mm)
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  value={adjDiaMm}
                  onChange={(e) => setAdjDiaMm(e.target.value)}
                  className="w-full bg-[#0E1520] border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <button
                type="button"
                onClick={handleAddTransition}
                disabled={!transPreview.valid}
                className="px-3 py-1.5 text-xs font-medium bg-cyan-500/15 text-cyan-300 border border-cyan-500/35 rounded hover:bg-cyan-500/25 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap cursor-pointer"
              >
                + Add
              </button>
            </div>
            <p className="text-[11px] font-mono tabular-nums text-slate-400 mt-1.5">
              {transPreview.valid
                ? `K = ${transPreview.k.toFixed(3)} (referenced to active pipe velocity)`
                : transPreview.desc}
            </p>
          </div>

          {/* Custom fitting creator */}
          <form
            onSubmit={handleAddCustom}
            className="bg-[#070B12] border border-slate-800/90 rounded-md p-3"
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Custom Fitting / Equipment
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_90px_auto] gap-2 items-end">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Component Label</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Plate Heat Exchanger"
                  className="w-full bg-[#0E1520] border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">K-factor</label>
                <input
                  type="number"
                  min="0"
                  step="0.05"
                  value={customK}
                  onChange={(e) => setCustomK(e.target.value)}
                  className="w-full bg-[#0E1520] border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-medium bg-cyan-500/15 text-cyan-300 border border-cyan-500/35 rounded hover:bg-cyan-500/25 transition-colors whitespace-nowrap cursor-pointer"
              >
                + Add
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
};
