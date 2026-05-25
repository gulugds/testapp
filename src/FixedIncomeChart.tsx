import React, { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { Plus, X, TrendingUp, ChevronRight, Info, SlidersHorizontal, ArrowUp, BarChart2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type SecurityType = "CRA" | "CRI" | "Debênture" | "LCI" | "LCA" | "CDB" | "CDCA" | "NTN-B" | "NTN-F" | "LTN" | "LFT";
type Indexer = "IPCA+" | "CDI+" | "%CDI" | "Prefixado" | "SELIC";
type CreditType = "Privado" | "Público";
type IrTreatment = "Isento" | "IR Regressivo";
type CycleScenario = "pico" | "vale" | "neutro" | "alta_queda" | "queda_alta";

interface Security {
  id: string;
  name: string;
  type: SecurityType;
  creditType: CreditType;
  indexer: Indexer;
  spread: number;
  yieldInitial: number;
  cycleScenario: CycleScenario;
  cycleAmplitude: number;
  cyclePeriodYears: number;
  irTreatment: IrTreatment;
  maturityYear: number;
  breakEvenMonth: number;
  purchaseYear: number;
  purchaseMonth: number; // 0-indexed (0 = janeiro)
  shortLabel: string;
}

interface DataPoint {
  date: string;
  month: number;
  retLiquido: number;
  curvaTeórica: number;
  yieldMercado: number;
  agioDesagio: number;
  cdiAcumulado: number;
}

// ─── Security metadata ────────────────────────────────────────────────────────

const SECURITY_META: Record<SecurityType, {
  credit: CreditType; defaultIndexer: Indexer; irTreatment: IrTreatment;
  defaultSpread: number; defaultYield: number; defaultMaturity: number; description: string;
}> = {
  CRA:       { credit: "Privado", defaultIndexer: "IPCA+",     irTreatment: "Isento",        defaultSpread: 7.42,  defaultYield: 13.5,  defaultMaturity: 2055, description: "Certificado de Recebíveis do Agronegócio" },
  CRI:       { credit: "Privado", defaultIndexer: "IPCA+",     irTreatment: "Isento",        defaultSpread: 7.0,   defaultYield: 13.2,  defaultMaturity: 2040, description: "Certificado de Recebíveis Imobiliários" },
  Debênture: { credit: "Privado", defaultIndexer: "IPCA+",     irTreatment: "IR Regressivo", defaultSpread: 6.5,   defaultYield: 12.8,  defaultMaturity: 2035, description: "Debênture Corporativa" },
  LCI:       { credit: "Privado", defaultIndexer: "CDI+",      irTreatment: "Isento",        defaultSpread: 0.0,   defaultYield: 10.5,  defaultMaturity: 2028, description: "Letra de Crédito Imobiliário" },
  LCA:       { credit: "Privado", defaultIndexer: "CDI+",      irTreatment: "Isento",        defaultSpread: 0.0,   defaultYield: 10.5,  defaultMaturity: 2028, description: "Letra de Crédito do Agronegócio" },
  CDB:       { credit: "Privado", defaultIndexer: "%CDI",      irTreatment: "IR Regressivo", defaultSpread: 110.0, defaultYield: 10.5,  defaultMaturity: 2030, description: "Certificado de Depósito Bancário" },
  CDCA:      { credit: "Privado", defaultIndexer: "Prefixado", irTreatment: "Isento",        defaultSpread: 12.0,  defaultYield: 12.0,  defaultMaturity: 2034, description: "Certificado de Direitos Creditórios do Agronegócio" },
  "NTN-B":   { credit: "Público", defaultIndexer: "IPCA+",     irTreatment: "IR Regressivo", defaultSpread: 6.5,   defaultYield: 13.0,  defaultMaturity: 2045, description: "Tesouro IPCA+" },
  "NTN-F":   { credit: "Público", defaultIndexer: "Prefixado", irTreatment: "IR Regressivo", defaultSpread: 13.5,  defaultYield: 13.5,  defaultMaturity: 2033, description: "Tesouro Prefixado c/ Juros Semestrais" },
  LTN:       { credit: "Público", defaultIndexer: "Prefixado", irTreatment: "IR Regressivo", defaultSpread: 13.0,  defaultYield: 13.0,  defaultMaturity: 2029, description: "Tesouro Prefixado" },
  LFT:       { credit: "Público", defaultIndexer: "SELIC",     irTreatment: "IR Regressivo", defaultSpread: 0.12,  defaultYield: 13.75, defaultMaturity: 2029, description: "Tesouro Selic" },
};

const CYCLE_LABELS: Record<CycleScenario, string> = {
  pico:      "Partindo do Pico — Queda de Juros",
  vale:      "Partindo do Vale — Alta de Juros",
  neutro:    "Neutro — Estabilidade de Juros",
  alta_queda:"Alta seguida de Queda",
  queda_alta:"Queda seguida de Alta",
};

const CYCLE_PRESETS: { label: string; scenario: CycleScenario; amplitude: number; period: number }[] = [
  { label: "Ciclo Brasil 2026 (base)", scenario: "pico",      amplitude: 3.5, period: 4 },
  { label: "Otimista – Queda rápida", scenario: "pico",      amplitude: 5.0, period: 3 },
  { label: "Pessimista – Alta longa", scenario: "vale",       amplitude: 4.0, period: 5 },
  { label: "Alta + Queda (2 ciclos)", scenario: "alta_queda", amplitude: 3.0, period: 4 },
  { label: "Estabilidade",           scenario: "neutro",     amplitude: 1.0, period: 4 },
];

const SECURITY_TYPES: SecurityType[] = ["CRA", "CRI", "Debênture", "LCI", "LCA", "CDB", "CDCA", "NTN-B", "NTN-F", "LTN", "LFT"];
const INDEXER_OPTIONS: Indexer[] = ["IPCA+", "CDI+", "%CDI", "Prefixado", "SELIC"];
const HORIZON_OPTIONS = [
  { value: "1", label: "1 Ano" }, { value: "2", label: "2 Anos" },
  { value: "5", label: "5 Anos" }, { value: "10", label: "10 Anos" },
  { value: "20", label: "20 Anos" },
];

// ─── Data generator ───────────────────────────────────────────────────────────

const IR_BRACKETS = [
  { months: 6,  rate: 0.225 },
  { months: 12, rate: 0.200 },
  { months: 24, rate: 0.175 },
  { months: Infinity, rate: 0.150 },
];

function getIRRate(months: number): number {
  return IR_BRACKETS.find((b) => months <= b.months)!.rate;
}

function getCyclePhaseOffset(scenario: CycleScenario): number {
  switch (scenario) {
    case "pico":       return 0;
    case "vale":       return Math.PI;
    case "neutro":     return Math.PI / 2;
    case "alta_queda": return Math.PI;
    case "queda_alta": return 0;
  }
}

function generateData(horizonYears: number, sec: Security): DataPoint[] {
  const CDI_RATE = 0.1375;
  const IPCA = 0.045;

  let theoreticalRate: number;
  switch (sec.indexer) {
    case "IPCA+":     theoreticalRate = IPCA + sec.spread / 100; break;
    case "CDI+":      theoreticalRate = CDI_RATE + sec.spread / 100; break;
    case "%CDI":      theoreticalRate = CDI_RATE * (sec.spread / 100); break;
    case "Prefixado": theoreticalRate = sec.spread / 100; break;
    case "SELIC":     theoreticalRate = CDI_RATE + sec.spread / 100; break;
  }

  const startDate = new Date(sec.purchaseYear, sec.purchaseMonth, 1);
  const maturityMonths = (sec.maturityYear - sec.purchaseYear) * 12 - sec.purchaseMonth;
  const maxMonths = Math.min(horizonYears * 12, Math.max(maturityMonths, 12));
  const phaseOffset = getCyclePhaseOffset(sec.cycleScenario);

  return Array.from({ length: maxMonths + 1 }, (_, i) => {
    const date = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
    const t = i / 12;
    const cyclePhase = (2 * Math.PI * t) / sec.cyclePeriodYears + phaseOffset;

    // Fix 1: yield starts exactly at yieldInitial at t=0 by subtracting the initial offset
    const yieldMercado = sec.yieldInitial +
      (sec.cycleAmplitude / 2) * (Math.cos(cyclePhase) - Math.cos(phaseOffset));

    // Fix 2: remaining years from purchase date, not hardcoded 2026
    const remainingYears = Math.max(0.1, sec.maturityYear - sec.purchaseYear - sec.purchaseMonth / 12 - t);
    const yieldDelta = yieldMercado - sec.yieldInitial;
    const agioDesagio = parseFloat(
      Math.min(40, Math.max(-60, -yieldDelta * remainingYears * 0.65)).toFixed(2)
    );

    const cdiAcumulado = (Math.pow(1 + CDI_RATE, t) - 1) * 100;
    const curvaTeórica = (Math.pow(1 + theoreticalRate, t) - 1) * 100;

    // Fix 3: use agioDesagio directly — no artificial decay hack
    let retLiquido: number;
    if (sec.irTreatment === "Isento") {
      const grossReturn = (Math.pow(1 + theoreticalRate, t) - 1) * 100;
      retLiquido = grossReturn + agioDesagio;
    } else {
      const irRate = getIRRate(i);
      const grossReturn = (Math.pow(1 + theoreticalRate, t) - 1) * 100;
      retLiquido = grossReturn * (1 - irRate) + agioDesagio;
    }

    return {
      date: date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      month: i,
      retLiquido: parseFloat(retLiquido.toFixed(2)),
      curvaTeórica: parseFloat(curvaTeórica.toFixed(2)),
      yieldMercado: parseFloat(yieldMercado.toFixed(2)),
      agioDesagio,
      cdiAcumulado: parseFloat(cdiAcumulado.toFixed(2)),
    };
  });
}

// ─── Selic histórica + projeção ───────────────────────────────────────────────
//
// Índice 0 = Janeiro 2023
// Índice 40 = Maio 2026 (hoje – último ponto histórico)
// Índice 41–95 = Junho 2026 – Dezembro 2030 (projeção)
//
// Fontes: BACEN (histórico) / modelo próprio (projeção)

const SELIC_HIST: number[] = [
  // 2023: Jan–Jul (hold 13,75%), Ago–Dez (cortes)
  13.75, 13.75, 13.75, 13.75, 13.75, 13.75, 13.75,
  13.25, 12.75, 12.25, 11.75, 11.75,
  // 2024: Jan–Ago (cortes → vale 10,50%), Set–Dez (alta)
  11.25, 11.25, 10.75, 10.75, 10.50, 10.50, 10.50, 10.50,
  10.75, 11.25, 11.75, 12.25,
  // 2025: Jan–Set (alta → pico 15,25%), Out–Dez (recuo)
  13.25, 13.25, 13.75, 14.25, 14.75, 15.00, 15.25, 15.25, 15.25,
  15.00, 14.75, 14.75,
  // 2026: Jan–Mai (cortes → 13,75%)
  14.50, 14.25, 14.00, 13.75, 13.75,
]; // 41 valores (idx 0..40)

const SELIC_PROJ: number[] = [
  // Jun–Dez 2026
  13.50, 13.25, 13.00, 12.75, 12.50, 12.25, 12.00,
  // 2027: cortes graduais → vale estrutural
  11.75, 11.50, 11.25, 11.00, 10.75, 10.75, 10.50, 10.50, 10.50, 10.50, 10.50, 10.50,
  // 2028–2030: estabilidade em 10,50%
  ...Array(12 * 3).fill(10.50),
]; // 55 valores (idx 41..95)

// Hoje = índice 40 (Maio/2026)
const TODAY_IDX = 40;

interface CycleChartPoint {
  label: string;
  idx: number;
  selic: number | null;
  selicProj: number | null;
  yieldSec: number | null;
}

function buildCycleChartData(sec: Security): CycleChartPoint[] {
  const purchaseIdx = (sec.purchaseYear - 2023) * 12 + sec.purchaseMonth;
  const phaseOffset = getCyclePhaseOffset(sec.cycleScenario);

  return Array.from({ length: 96 }, (_, idx) => {
    const date = new Date(2023, idx, 1); // JS handles month overflow
    const label = date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

    const selic     = idx <= TODAY_IDX ? SELIC_HIST[idx] : null;
    const selicProj = idx >= TODAY_IDX
      ? (idx === TODAY_IDX ? SELIC_HIST[TODAY_IDX] : SELIC_PROJ[idx - TODAY_IDX - 1])
      : null;

    let yieldSec: number | null = null;
    if (idx >= purchaseIdx) {
      const t = (idx - purchaseIdx) / 12;
      const phase = (2 * Math.PI * t) / sec.cyclePeriodYears + phaseOffset;
      yieldSec = parseFloat((sec.yieldInitial + (sec.cycleAmplitude / 2) * Math.cos(phase)).toFixed(2));
    }

    return { label, idx, selic, selicProj, yieldSec };
  });
}

// ─── Cycle Chart Modal ────────────────────────────────────────────────────────

const CYCLE_CONTEXT: Record<CycleScenario, string> = {
  pico:       "Taxa estava no pico — simulação começa em queda de juros.",
  vale:       "Taxa estava no vale — simulação começa em alta de juros.",
  neutro:     "Taxa estável — pequenas oscilações sem tendência definida.",
  alta_queda: "Taxa ainda subia na compra — sobe mais antes de cair.",
  queda_alta: "Taxa ainda caía na compra — cai mais antes de subir.",
};

const CycleChartModal: React.FC<{ sec: Security; onClose: () => void }> = ({ sec, onClose }) => {
  const data = useMemo(() => buildCycleChartData(sec), [sec]);

  const purchaseIdx = (sec.purchaseYear - 2023) * 12 + sec.purchaseMonth;
  const purchaseLabel = data[Math.max(0, purchaseIdx)]?.label ?? "";
  const todayLabel    = data[TODAY_IDX].label;

  // Show X tick every 6 months
  const tickData = data.filter((_, i) => i % 6 === 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-800">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <BarChart2 size={16} className="text-blue-400" />
              Gráfico do Ciclo de Juros
            </h2>
            <p className="text-xs text-gray-400 mt-1">{sec.name}</p>
            <p className="text-xs text-blue-300 mt-0.5 font-semibold">
              {CYCLE_LABELS[sec.cycleScenario]} — {CYCLE_CONTEXT[sec.cycleScenario]}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors mt-0.5">
            <X size={20} />
          </button>
        </div>

        {/* Chart */}
        <div className="px-2 pt-4 pb-2">
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={data} margin={{ top: 16, right: 48, left: 4, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.4} />

              <XAxis
                dataKey="label"
                tick={{ fill: "#9CA3AF", fontSize: 10 }}
                tickLine={{ stroke: "#4B5563" }}
                axisLine={{ stroke: "#4B5563" }}
                interval={5}
              />
              <YAxis
                domain={[8, 17]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fill: "#9CA3AF", fontSize: 10 }}
                tickLine={{ stroke: "#4B5563" }}
                axisLine={{ stroke: "#4B5563" }}
                width={46}
              />

              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-xs shadow-xl min-w-[180px]">
                      <p className="text-gray-400 mb-1.5 font-semibold border-b border-gray-700 pb-1">{label}</p>
                      {payload.filter((e) => e.value !== null).map((e) => (
                        <div key={e.dataKey as string} className="flex justify-between gap-3 py-0.5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-0" style={{ border: `2px ${(e.strokeDasharray as string) ? "dashed" : "solid"} ${e.color}` }} />
                            <span className="text-gray-300">{e.name}</span>
                          </div>
                          <span style={{ color: e.color as string }} className="font-bold">{(e.value as number).toFixed(2)}%</span>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />

              <Legend
                verticalAlign="top"
                wrapperStyle={{ paddingBottom: "12px", fontSize: "11px", color: "#D1D5DB" }}
              />

              {/* Today reference */}
              <ReferenceLine x={todayLabel} stroke="#FFFFFF" strokeDasharray="4 3" strokeWidth={1}
                label={{ value: "Hoje", position: "insideTopLeft", fill: "#FFFFFF", fontSize: 9, fontWeight: 700 }}
              />

              {/* Purchase date reference */}
              {purchaseIdx >= 0 && purchaseIdx < 96 && (
                <ReferenceLine x={purchaseLabel} stroke="#F97316" strokeDasharray="4 3" strokeWidth={1.5}
                  label={{ value: "Compra", position: "insideTopRight", fill: "#F97316", fontSize: 9, fontWeight: 700 }}
                />
              )}

              {/* Lines */}
              <Line dataKey="selic"     name="Selic (histórico)"  stroke="#60A5FA" strokeWidth={2.5} dot={false} connectNulls={false} activeDot={{ r: 4 }} />
              <Line dataKey="selicProj" name="Selic (projeção)"   stroke="#93C5FD" strokeWidth={2}   dot={false} connectNulls={false} strokeDasharray="6 3" activeDot={{ r: 4 }} />
              <Line dataKey="yieldSec"  name="Yield simulado"     stroke="#22C55E" strokeWidth={2}   dot={false} connectNulls={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Explanation */}
        <div className="px-6 py-4 border-t border-gray-800 space-y-1">
          <p className="text-[11px] text-gray-400 leading-relaxed">
            <span className="text-blue-300 font-semibold">Selic histórico</span> (BACEN, jan/2023–mai/2026) ·{" "}
            <span className="text-blue-200 font-semibold">Projeção</span> (modelo simplificado — queda gradual para taxa neutra ~10,5%) ·{" "}
            <span className="text-green-400 font-semibold">Yield simulado</span> (ciclo configurado: {CYCLE_LABELS[sec.cycleScenario]}, ±{(sec.cycleAmplitude / 2).toFixed(2)} pp, {sec.cyclePeriodYears} anos).
          </p>
          <p className="text-[11px] text-gray-500">
            Pico da Selic: jul–set/2025 em 15,25% · Vale: mai–ago/2024 em 10,50% · Taxa neutra projetada: 10,50% a.a.
          </p>
        </div>
      </div>
    </div>
  );
};

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

interface TooltipEntry { dataKey: string; name: string; value: number; color: string; strokeDasharray?: string }

const CustomTooltip: React.FC<{ active?: boolean; payload?: TooltipEntry[]; label?: string }> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 shadow-2xl text-xs min-w-[210px]">
      <p className="text-gray-400 mb-2 font-semibold border-b border-gray-700 pb-1">{label}</p>
      {payload.map((e) => (
        <div key={e.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-0" style={{ border: `2px ${e.strokeDasharray ? "dashed" : "solid"} ${e.color}` }} />
            <span className="text-gray-300">{e.name}</span>
          </div>
          <span style={{ color: e.color }} className="font-bold tabular-nums">{e.value.toFixed(2)}%</span>
        </div>
      ))}
    </div>
  );
};

// ─── Add Security Modal ───────────────────────────────────────────────────────

const AddSecurityModal: React.FC<{ onAdd: (sec: Security) => void; onClose: () => void }> = ({ onAdd, onClose }) => {
  const [type, setType] = useState<SecurityType>("CRA");
  const [name, setName] = useState("");
  const [indexer, setIndexer] = useState<Indexer>("IPCA+");
  const [spread, setSpread] = useState(7.42);
  const [yieldInitial, setYieldInitial] = useState(13.5);
  const [cycleScenario, setCycleScenario] = useState<CycleScenario>("pico");
  const [cycleAmplitude, setCycleAmplitude] = useState(3.5);
  const [cyclePeriod, setCyclePeriod] = useState(4);
  const [maturityYear, setMaturityYear] = useState(2045);
  const [breakEvenMonth, setBreakEvenMonth] = useState(32);
  const today = new Date();
  const [purchaseValue, setPurchaseValue] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`
  );

  const meta = SECURITY_META[type];

  const handleTypeChange = (t: SecurityType) => {
    const m = SECURITY_META[t];
    setType(t);
    setIndexer(m.defaultIndexer);
    setSpread(m.defaultSpread);
    setYieldInitial(m.defaultYield);
    setMaturityYear(m.defaultMaturity);
  };

  const applyPreset = (p: typeof CYCLE_PRESETS[0]) => {
    setCycleScenario(p.scenario);
    setCycleAmplitude(p.amplitude);
    setCyclePeriod(p.period);
  };

  const handleSubmit = () => {
    const [pyStr, pmStr] = purchaseValue.split("-");
    const purchaseYear = parseInt(pyStr, 10);
    const purchaseMonth = parseInt(pmStr, 10) - 1; // 0-indexed
    const label = name.trim() || `${type} ${indexer} ${spread}% ${maturityYear}`;
    onAdd({
      id: String(Date.now()), name: label, shortLabel: `${type} ${maturityYear}`, type,
      creditType: meta.credit, indexer, spread, yieldInitial,
      cycleScenario, cycleAmplitude, cyclePeriodYears: cyclePeriod,
      irTreatment: meta.irTreatment, maturityYear, breakEvenMonth,
      purchaseYear, purchaseMonth,
    });
    onClose();
  };

  const spreadLabel = indexer === "%CDI" ? "% do CDI" : indexer === "Prefixado" || indexer === "SELIC" ? "Taxa % a.a." : "Spread % a.a.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-y-auto max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-800">
          <h2 className="text-lg font-bold text-white">Cadastrar Título de Renda Fixa</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors"><X size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Type grid */}
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Tipo de Título</label>
            <div className="grid grid-cols-5 gap-2">
              {SECURITY_TYPES.map((t) => {
                const m = SECURITY_META[t];
                return (
                  <button key={t} onClick={() => handleTypeChange(t)}
                    className={`py-2 px-1 rounded-lg text-xs font-bold border transition-all ${
                      type === t ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/40"
                                 : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"
                    }`}
                  >
                    <div>{t}</div>
                    <div className={`text-[10px] mt-0.5 font-normal ${m.credit === "Público" ? "text-yellow-400" : "text-emerald-400"} ${type === t ? "" : "opacity-60"}`}>
                      {m.credit}
                    </div>
                  </button>
                );
              })}
            </div>
            {/* Description */}
            <p className="text-[11px] text-gray-500 mt-1.5 flex items-center gap-1">
              <Info size={11} />
              {meta.description} · {meta.irTreatment}
            </p>
          </div>

          {/* Name + Purchase date row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Nome / Descrição (opcional)</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder={`Ex: ${type} Empresa ABC – ${indexer} ${spread}% – venc. ${maturityYear}`}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Data de Compra</label>
              <input type="month" value={purchaseValue} onChange={(e) => setPurchaseValue(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Indexer + Spread */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Indexador</label>
              <select value={indexer} onChange={(e) => setIndexer(e.target.value as Indexer)}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {INDEXER_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">{spreadLabel}</label>
              <input type="number" value={spread} step={0.01} onChange={(e) => setSpread(parseFloat(e.target.value) || 0)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Yield + Maturity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Yield de Mercado Inicial (% a.a.)</label>
              <input type="number" value={yieldInitial} step={0.1} onChange={(e) => setYieldInitial(parseFloat(e.target.value) || 0)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Ano de Vencimento</label>
              <input type="number" value={maturityYear} step={1} min={2026} max={2065} onChange={(e) => setMaturityYear(parseInt(e.target.value) || 2035)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Interest Rate Cycle */}
          <div className="border border-gray-700/60 rounded-xl p-4 bg-gray-800/30">
            <h3 className="text-xs font-bold text-gray-300 mb-3 uppercase tracking-wider">Ciclo de Juros Previsto</h3>

            {/* Presets */}
            <div className="flex flex-wrap gap-2 mb-3">
              {CYCLE_PRESETS.map((p) => (
                <button key={p.label} onClick={() => applyPreset(p)}
                  className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${
                    cycleScenario === p.scenario && cycleAmplitude === p.amplitude && cyclePeriod === p.period
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Cenário</label>
                <select value={cycleScenario} onChange={(e) => setCycleScenario(e.target.value as CycleScenario)}
                  className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(CYCLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Amplitude do Ciclo (pp)</label>
                  <input type="number" value={cycleAmplitude} step={0.25} min={0} max={12} onChange={(e) => setCycleAmplitude(parseFloat(e.target.value) || 0)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Período do Ciclo (anos)</label>
                  <input type="number" value={cyclePeriod} step={0.5} min={1} max={10} onChange={(e) => setCyclePeriod(parseFloat(e.target.value) || 4)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Break-even */}
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">
              Break-even Estimado (mês · ≈ dia {breakEvenMonth * 30})
            </label>
            <input type="number" value={breakEvenMonth} step={1} min={1} max={600} onChange={(e) => setBreakEvenMonth(parseInt(e.target.value) || 1)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[11px] text-gray-500 mt-1">Mês em que o retorno líquido MtM cruza zero (início de ágio)</p>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
              meta.credit === "Público"
                ? "bg-yellow-900/40 text-yellow-400 border-yellow-800"
                : "bg-emerald-900/40 text-emerald-400 border-emerald-800"
            }`}>
              {meta.credit === "Público" ? "Crédito Público" : "Crédito Privado"}
            </span>
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
              meta.irTreatment === "Isento"
                ? "bg-green-900/40 text-green-400 border-green-800"
                : "bg-orange-900/40 text-orange-400 border-orange-800"
            }`}>
              {meta.irTreatment}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
          <button onClick={handleSubmit}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-blue-900/30"
          >
            <ChevronRight size={14} />
            Gerar Gráfico
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Rationale por título (exibido no rodapé do card) ────────────────────────

const RATIONALE: Record<string, string> = {
  "2": "NTN-B 2035 oferece duration intermediária (~7 anos) com taxa real de 6,80% a.a. acima da inflação — patamar historicamente elevado. Em ciclo de queda de juros, o ágio esperado pode superar 15% em 24 meses, além do carrego pelo IPCA+. Indicado para investidores que buscam proteção inflacionária com potencial de ganho de capital no médio prazo.",
  "3": "LTN 2029 trava a taxa nominal de 13,5% a.a. no patamar mais alto dos últimos anos. Com Selic prevista para cair, o preço do papel sobe e o investidor captura tanto o carrego quanto o ágio. Duration mais curta (~3 anos) reduz a volatilidade — boa porta de entrada para quem quer prefixado sem excesso de risco.",
  "4": "NTN-B 2055 é a aposta de maior convicção em queda estrutural de juros reais. Taxa real de 7,20% a.a. com duration longa (~20 anos): cada 1 pp de queda no yield gera ~20% de valorização do PU. Adequado para perfil arrojado com horizonte de 5+ anos e crença no ciclo de afrouxamento monetário.",
};

// ─── Line config (toggle) ────────────────────────────────────────────────────

type LineKey = "retLiquido" | "curvaTeórica" | "yieldMercado" | "agioDesagio" | "cdiAcumulado";

const LINE_CONFIG: {
  key: LineKey; name: string; color: string; yAxisId: "left" | "right"; dasharray?: string;
}[] = [
  { key: "retLiquido",   name: "Ret. Líquido (MtM)",  color: "#22C55E", yAxisId: "left" },
  { key: "curvaTeórica", name: "Curva Teórica",        color: "#F97316", yAxisId: "left",  dasharray: "7 4" },
  { key: "yieldMercado", name: "Yield de Mercado",     color: "#C084FC", yAxisId: "right" },
  { key: "agioDesagio",  name: "Ágio / Deságio",       color: "#60A5FA", yAxisId: "right" },
  { key: "cdiAcumulado", name: "CDI Acumulado",        color: "#EF4444", yAxisId: "left" },
];

// ─── Security Card ────────────────────────────────────────────────────────────

const SecurityCard: React.FC<{
  security: Security;
  horizon: string;
  zoomBreakEven: boolean;
  onHorizonChange: (v: string) => void;
  onZoomChange: (v: boolean) => void;
  onRemove: () => void;
}> = ({ security: sec, horizon, zoomBreakEven, onHorizonChange, onZoomChange, onRemove }) => {
  const [showCycleChart, setShowCycleChart] = useState(false);
  const [activeLines, setActiveLines] = useState<Record<LineKey, boolean>>({
    retLiquido: true, "curvaTeórica": true, yieldMercado: true, agioDesagio: true, cdiAcumulado: true,
  });
  const toggleLine = (key: LineKey) => setActiveLines((p) => ({ ...p, [key]: !p[key] }));

  const horizonYears = parseInt(horizon, 10);
  const allData = useMemo(() => generateData(horizonYears, sec), [horizonYears, sec]);

  const chartData = useMemo(() => {
    if (!zoomBreakEven) return allData;
    const start = Math.max(0, sec.breakEvenMonth - 12);
    const end = Math.min(allData.length - 1, sec.breakEvenMonth + 18);
    return allData.slice(start, end + 1);
  }, [allData, zoomBreakEven, sec.breakEvenMonth]);

  // ── Ideal sell analysis ──────────────────────────────────────────────────
  // Fix 4: only search FUTURE months (from today = May/2026 = purchaseMonth offset)
  const TODAY_YEAR = 2026;
  const TODAY_MONTH = 4; // 0-indexed → May
  const monthsToToday = Math.max(0, (TODAY_YEAR - sec.purchaseYear) * 12 + (TODAY_MONTH - sec.purchaseMonth));

  const sellAnalysis = useMemo(() => {
    const isCDILinked = sec.indexer === "CDI+" || sec.indexer === "%CDI" || sec.indexer === "SELIC";
    if (isCDILinked) return { type: "cdi" as const };

    const totalMonths = allData.length;
    if (totalMonths < 18) return { type: "short" as const };

    // Fix 4: only look at data points in the future (today onwards)
    const futureData = allData.filter(d => d.month >= monthsToToday);
    if (futureData.length === 0) return { type: "short" as const };

    const peakPt = futureData.reduce((best, d) => (d.agioDesagio > best.agioDesagio ? d : best), futureData[0]);
    if (peakPt.agioDesagio < 1.0) return { type: "no_agio" as const };

    const m = peakPt.month; // months since purchase
    const fromNow = m - monthsToToday; // months from today
    const fYrs = Math.floor(fromNow / 12);
    const fMos = fromNow % 12;
    const timeStr = fromNow === 0
      ? "hoje"
      : fYrs > 0
        ? `${fYrs} ano${fYrs > 1 ? "s" : ""}${fMos > 0 ? ` e ${fMos} meses` : ""} a partir de hoje`
        : `${fMos} meses a partir de hoje`;

    // Approximate remaining duration at peak
    const purchaseDecimal = sec.purchaseYear + sec.purchaseMonth / 12;
    const peakDecimal = purchaseDecimal + m / 12;
    const remainingYearsAtSell = Math.max(0, sec.maturityYear - peakDecimal);
    const sensitPerPP = (remainingYearsAtSell * 0.65).toFixed(1);

    return {
      type: "sell" as const,
      date: peakPt.date,
      month: m,
      agio: peakPt.agioDesagio,
      yieldAtPeak: peakPt.yieldMercado,
      retLiquido: peakPt.retLiquido,
      timeStr,
      remainingYearsAtSell: remainingYearsAtSell.toFixed(0),
      sensitPerPP,
      nearHorizonEdge: m >= allData.length - 3,
    };
  }, [allData, sec, monthsToToday]);

  const sellDateLabel = sellAnalysis.type === "sell" ? sellAnalysis.date : "";
  const sellVisible = sellAnalysis.type === "sell" &&
    chartData.length > 0 &&
    sellAnalysis.month >= chartData[0].month &&
    sellAnalysis.month <= chartData[chartData.length - 1].month;

  // ─────────────────────────────────────────────────────────────────────────
  const breakEvenDate = allData[sec.breakEvenMonth]?.date ?? "";
  const breakEvenVisible = chartData.length > 0 &&
    sec.breakEvenMonth >= chartData[0].month &&
    sec.breakEvenMonth <= chartData[chartData.length - 1].month;

  // "Hoje" marker — where May/2026 falls in the chart
  const todayDate = allData[monthsToToday]?.date ?? "";
  const todayVisible = monthsToToday > 0 &&
    chartData.length > 0 &&
    monthsToToday >= chartData[0].month &&
    monthsToToday <= chartData[chartData.length - 1].month;

  const tickInterval = Math.max(0, Math.floor(chartData.length / 10) - 1);

  const yLeftMax = Math.max(50, ...allData.map((d) => Math.ceil(Math.max(d.retLiquido, d.curvaTeórica, d.cdiAcumulado) / 10) * 10));
  const yRightMin = Math.min(-20, ...allData.map((d) => Math.floor(d.agioDesagio / 10) * 10));
  const yRightMax = Math.max(20, ...allData.map((d) => Math.ceil(d.yieldMercado / 5) * 5));

  const isPublic = sec.creditType === "Público";
  const isExempt = sec.irTreatment === "Isento";

  const indexerDisplay = sec.indexer === "%CDI"
    ? `${sec.spread}% do CDI`
    : `${sec.indexer} ${sec.spread}%`;

  return (
    <div id={`card-${sec.id}`} className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="px-6 pt-5 pb-0">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <h2 className="text-base font-bold text-white leading-tight">{sec.name}</h2>
              <span className="text-xs bg-gray-700 text-gray-300 px-2.5 py-1 rounded-md font-mono whitespace-nowrap">{indexerDisplay}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${isPublic ? "bg-yellow-900/50 text-yellow-400" : "bg-emerald-900/50 text-emerald-400"}`}>
                {isPublic ? "Público" : "Privado"}
              </span>
              <span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${isExempt ? "bg-green-900/50 text-green-400" : "bg-orange-900/50 text-orange-400"}`}>
                {isExempt ? "Isento IR" : "IR Regressivo"}
              </span>
            </div>
            <p className="text-sm text-gray-400 mb-0.5">
              {SECURITY_META[sec.type].description} · Comprado em{" "}
              <span className="text-gray-200 font-semibold">
                {new Date(sec.purchaseYear, sec.purchaseMonth).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}
              </span>
              {" "}· Venc.{" "}
              <span className="text-gray-200 font-semibold">{sec.maturityYear}</span>
            </p>
            <p className="text-sm text-gray-400 flex items-center gap-2 flex-wrap">
              <span>Ciclo:</span>
              <button
                onClick={() => setShowCycleChart(true)}
                className="text-gray-200 font-semibold hover:text-blue-400 transition-colors underline decoration-dotted underline-offset-2 inline-flex items-center gap-1"
                title="Ver gráfico do ciclo de juros"
              >
                {CYCLE_LABELS[sec.cycleScenario]}
                <BarChart2 size={12} className="text-blue-500 shrink-0" />
              </button>
              <span>·</span>
              <span>Amplitude <span className="text-purple-400 font-semibold">±{(sec.cycleAmplitude / 2).toFixed(2)} pp</span></span>
              <span>·</span>
              <span>Período <span className="text-purple-400 font-semibold">{sec.cyclePeriodYears} anos</span></span>
            </p>
            <p className="text-sm font-semibold text-blue-400 mt-1">
              Break-even MtM: Mês {sec.breakEvenMonth} (≈ Dia {sec.breakEvenMonth * 30})
            </p>
          </div>

          <div className="flex items-start gap-5 flex-shrink-0 pt-0.5">
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-300 whitespace-nowrap mt-1">
              <input type="checkbox" checked={zoomBreakEven} onChange={(e) => onZoomChange(e.target.checked)}
                className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
              />
              Zoom no Break-even
            </label>
            <div className="flex flex-col items-end gap-1.5">
              <button onClick={onRemove} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors">
                <X size={12} /> Remover
              </button>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400 whitespace-nowrap">Horizonte:</span>
                <select value={horizon} onChange={(e) => onHorizonChange(e.target.value)}
                  className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  {HORIZON_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="px-2 pt-2 pb-0">

        {/* Line toggles */}
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {LINE_CONFIG.map(({ key, name, color, dasharray }) => {
            const on = activeLines[key];
            return (
              <button key={key} onClick={() => toggleLine(key)} title={on ? "Ocultar" : "Exibir"}
                className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border font-medium transition-all select-none"
                style={{
                  borderColor: on ? color : "#374151",
                  color:       on ? color : "#6B7280",
                  background:  on ? `${color}1A` : "transparent",
                  textDecoration: on ? "none" : "line-through",
                  opacity: on ? 1 : 0.5,
                }}
              >
                {/* Mini line preview */}
                <svg width="18" height="8" style={{ display: "inline", verticalAlign: "middle", flexShrink: 0 }}>
                  {dasharray
                    ? <line x1="0" y1="4" x2="18" y2="4" stroke={on ? color : "#6B7280"} strokeWidth="2" strokeDasharray="4 2" />
                    : <line x1="0" y1="4" x2="18" y2="4" stroke={on ? color : "#6B7280"} strokeWidth="2" />}
                </svg>
                {name}
              </button>
            );
          })}
          <button
            onClick={() => {
              const allOn = LINE_CONFIG.every(l => activeLines[l.key]);
              const next = allOn
                ? Object.fromEntries(LINE_CONFIG.map(l => [l.key, false])) as Record<LineKey, boolean>
                : Object.fromEntries(LINE_CONFIG.map(l => [l.key, true])) as Record<LineKey, boolean>;
              setActiveLines(next);
            }}
            className="text-[11px] px-2.5 py-1 rounded-full border border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-all"
          >
            {LINE_CONFIG.every(l => activeLines[l.key]) ? "Ocultar todas" : "Exibir todas"}
          </button>
        </div>

        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData} margin={{ top: 8, right: 70, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.45} />
            <XAxis dataKey="date" tick={{ fill: "#9CA3AF", fontSize: 11 }} tickLine={{ stroke: "#4B5563" }} axisLine={{ stroke: "#4B5563" }} interval={tickInterval} />
            <YAxis yAxisId="left" domain={[-65, yLeftMax]} tickFormatter={(v: number) => `${v}%`} tick={{ fill: "#9CA3AF", fontSize: 11 }} tickLine={{ stroke: "#4B5563" }} axisLine={{ stroke: "#4B5563" }} width={58} />
            <YAxis yAxisId="right" orientation="right" domain={[yRightMin, yRightMax]} tickFormatter={(v: number) => `${v}%`} tick={{ fill: "#9CA3AF", fontSize: 11 }} tickLine={{ stroke: "#4B5563" }} axisLine={{ stroke: "#4B5563" }} width={60} />
            <Tooltip content={<CustomTooltip />} />

            {/* Hoje */}
            {todayVisible && (
              <ReferenceLine x={todayDate} yAxisId="left" stroke="#34D399" strokeDasharray="4 3" strokeWidth={1.5}
                label={{ value: "Hoje", position: "insideTopLeft", fill: "#34D399", fontSize: 10, fontWeight: 700, offset: 6 }}
              />
            )}
            {/* Break-even */}
            {breakEvenVisible && (
              <ReferenceLine x={breakEvenDate} yAxisId="left" stroke="#3B82F6" strokeDasharray="5 4" strokeWidth={1.5}
                label={{ value: `Break-even · Mês ${sec.breakEvenMonth}`, position: "insideTopRight", fill: "#3B82F6", fontSize: 10, fontWeight: 600, offset: 6 }}
              />
            )}
            {/* Ideal sell */}
            {sellVisible && (
              <ReferenceLine x={sellDateLabel} yAxisId="right" stroke="#FBBF24" strokeDasharray="5 3" strokeWidth={1.5}
                label={{ value: `Venda ideal · Ágio máx.`, position: "insideTopLeft", fill: "#FBBF24", fontSize: 10, fontWeight: 600, offset: 6 }}
              />
            )}

            {LINE_CONFIG.map(({ key, color, yAxisId, dasharray }) => (
              <Line
                key={key}
                yAxisId={yAxisId}
                type="monotone"
                dataKey={key}
                stroke={color}
                strokeWidth={2}
                strokeDasharray={dasharray}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                hide={!activeLines[key]}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {showCycleChart && (
        <CycleChartModal sec={sec} onClose={() => setShowCycleChart(false)} />
      )}

      {/* Footer */}
      <div className="px-6 py-3 space-y-2">

        {/* Ideal sell analysis */}
        <div className={`rounded-lg px-4 py-2.5 border ${
          sellAnalysis.type === "sell"
            ? "bg-amber-950/30 border-amber-800/50"
            : "bg-gray-800/40 border-gray-700/40"
        }`}>
          <p className="text-[11px] font-bold mb-0.5 uppercase tracking-wide flex items-center gap-1.5"
            style={{ color: sellAnalysis.type === "sell" ? "#FBBF24" : "#9CA3AF" }}>
            <TrendingUp size={11} />
            Momento Ideal para Venda
          </p>
          <p className="text-[11px] text-gray-300 leading-relaxed">
            {sellAnalysis.type === "cdi" &&
              "Título pós-fixado (CDI/SELIC): duration próxima de zero — o PU oscila minimamente em relação ao par. Não há janela de ágio por ciclo de juros. A decisão de venda deve ser baseada em oportunidade de realocação, mudança de crédito do emissor ou necessidade de liquidez."
            }
            {sellAnalysis.type === "short" &&
              "Prazo até o vencimento é reduzido — o impacto de duration é limitado. A diferença entre vender agora e carregar até o vencimento tende a ser pequena; avalie custo de transação e a alternativa disponível antes de decidir."
            }
            {sellAnalysis.type === "no_agio" &&
              "No cenário de ciclo simulado, o título não apresenta ágio positivo relevante no horizonte analisado. Tente estender o horizonte ou ajustar o cenário de juros para um ciclo de queda mais acentuado."
            }
            {sellAnalysis.type === "sell" && (() => {
              const s = sellAnalysis;
              return (
                <>
                  <span className="text-amber-300 font-semibold">Ponto ótimo estimado: {s.date}</span>
                  {" "}({s.timeStr}). Nessa data o yield de mercado simulado atinge{" "}
                  <span className="text-purple-300 font-semibold">{s.yieldAtPeak.toFixed(2)}% a.a.</span>
                  {" "}(mínimo do ciclo), gerando{" "}
                  <span className="text-blue-300 font-semibold">Ágio de {s.agio.toFixed(1)}%</span>
                  {" "}e Retorno Líquido MtM de{" "}
                  <span className="text-green-400 font-semibold">{s.retLiquido.toFixed(1)}%</span>.
                  {" "}Com ~{s.remainingYearsAtSell} anos restantes até o vencimento, a sensibilidade é de{" "}
                  <span className="text-gray-200 font-semibold">~{s.sensitPerPP}% por 1 pp</span>
                  {" "}de variação adicional na taxa.
                  {s.nearHorizonEdge
                    ? " ⚠ O pico está próximo ao limite do horizonte — aumente o horizonte de análise para confirmar se o ágio ainda cresce."
                    : " Após esse pico, o ágio recua conforme as taxas sobem novamente e/ou a duration se reduz com a proximidade do vencimento."}
                </>
              );
            })()}
          </p>
        </div>

        {RATIONALE[sec.id] && (
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg px-4 py-2.5">
            <p className="text-[11px] text-yellow-400 font-bold mb-0.5 uppercase tracking-wide">Por que comprar agora?</p>
            <p className="text-[11px] text-gray-300 leading-relaxed">{RATIONALE[sec.id]}</p>
          </div>
        )}
        <p className="text-[11px] text-gray-500 leading-relaxed">
          * Ret. Líquido considera {isExempt ? "isenção de IR (PF)" : "IR regressivo (22,5% → 15%)"}.
          Ágio/Deságio estimado por duração simplificada (±{sec.cycleAmplitude / 2} pp · ciclo {sec.cyclePeriodYears} anos).
          CDI base: Selic 13,75% a.a. · IPCA base: 4,5% a.a.
        </p>
      </div>
    </div>
  );
};

// ─── Navigation Panel ────────────────────────────────────────────────────────

const NavigationPanel: React.FC<{
  securities: Security[];
  visible: Record<string, boolean>;
  onToggle: (id: string) => void;
  onGroup: (group: "all" | "private" | "public" | "none") => void;
}> = ({ securities, visible, onToggle, onGroup }) => {
  const privateSecs = securities.filter((s) => s.creditType === "Privado");
  const publicSecs  = securities.filter((s) => s.creditType === "Público");
  const allVisible  = securities.every((s) => visible[s.id]);
  const noneVisible = securities.every((s) => !visible[s.id]);
  const onlyPrivate = !allVisible && !noneVisible && privateSecs.every((s) => visible[s.id]) && publicSecs.every((s) => !visible[s.id]);
  const onlyPublic  = !allVisible && !noneVisible && publicSecs.every((s) => visible[s.id])  && privateSecs.every((s) => !visible[s.id]);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const handleChip = (sec: Security) => {
    const wasHidden = !visible[sec.id];
    onToggle(sec.id);
    if (wasHidden) {
      setTimeout(() => {
        document.getElementById(`card-${sec.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    }
  };

  const GROUP_BTNS = [
    { key: "all"     as const, label: "Todos",      active: allVisible },
    { key: "private" as const, label: "Portfólio",  active: onlyPrivate },
    { key: "public"  as const, label: "Tesouro",    active: onlyPublic },
    { key: "none"    as const, label: "Nenhum",     active: noneVisible },
  ];

  return (
    <div className="sticky top-0 z-40 bg-gray-950/96 backdrop-blur-md border border-gray-800 rounded-xl shadow-2xl">
      {/* Top row: group filters */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800/70">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={13} className="text-gray-500" />
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Navegação rápida</span>
        </div>
        <div className="flex items-center gap-1.5">
          {GROUP_BTNS.map(({ key, label, active }) => (
            <button key={key} onClick={() => onGroup(key)}
              className={`text-[11px] px-2.5 py-1 rounded-md font-semibold transition-colors ${
                active ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
          <button onClick={scrollToTop}
            className="ml-1 flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md font-semibold
                       bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
          >
            <ArrowUp size={11} /> Topo
          </button>
        </div>
      </div>

      {/* Chip rows */}
      <div className="px-4 py-2.5 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider whitespace-nowrap w-16 shrink-0">Portfólio</span>
          {privateSecs.map((sec) => (
            <button key={sec.id} onClick={() => handleChip(sec)} title={sec.name}
              className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full font-medium border transition-all ${
                visible[sec.id]
                  ? "bg-emerald-900/40 border-emerald-700/70 text-emerald-300 hover:bg-emerald-900/60"
                  : "bg-gray-800/50 border-gray-700/50 text-gray-500 hover:text-gray-400 line-through"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${visible[sec.id] ? "bg-emerald-400" : "bg-gray-600"}`} />
              {sec.shortLabel}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-wider whitespace-nowrap w-16 shrink-0">Tesouro</span>
          {publicSecs.map((sec) => (
            <button key={sec.id} onClick={() => handleChip(sec)} title={sec.name}
              className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full font-medium border transition-all ${
                visible[sec.id]
                  ? "bg-yellow-900/40 border-yellow-700/70 text-yellow-300 hover:bg-yellow-900/60"
                  : "bg-gray-800/50 border-gray-700/50 text-gray-500 hover:text-gray-400 line-through"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${visible[sec.id] ? "bg-yellow-400" : "bg-gray-600"}`} />
              {sec.shortLabel}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── App ──────────────────────────────────────────────────────────────────────

const DEFAULT_SECURITIES: Security[] = [
  // ── Portfólio – Crédito Privado ──────────────────────────────────────────
  {
    id: "1",  shortLabel: "CRA Seara",
    name: "CRA SEARA IPCA+ 7,42% – venc. 2055",
    type: "CRA", creditType: "Privado", indexer: "IPCA+", spread: 7.42,
    yieldInitial: 13.5, cycleScenario: "alta_queda", cycleAmplitude: 3.5, cyclePeriodYears: 4,
    irTreatment: "Isento", maturityYear: 2055, breakEvenMonth: 32,
    purchaseYear: 2025, purchaseMonth: 1,
  },
  {
    id: "10", shortLabel: "CRA Marfrig",
    name: "CRA MARFRIG PRE 11,71% – venc. 2031",
    type: "CRA", creditType: "Privado", indexer: "Prefixado", spread: 11.71,
    yieldInitial: 11.71, cycleScenario: "queda_alta", cycleAmplitude: 2.5, cyclePeriodYears: 4,
    irTreatment: "Isento", maturityYear: 2031, breakEvenMonth: 18,
    purchaseYear: 2024, purchaseMonth: 2,
  },
  {
    id: "11", shortLabel: "DEB CTEEP",
    name: "DEB ISA CTEEP IPCA+ 5,86% – venc. 2039",
    type: "Debênture", creditType: "Privado", indexer: "IPCA+", spread: 5.86,
    yieldInitial: 10.5, cycleScenario: "pico", cycleAmplitude: 3.5, cyclePeriodYears: 4,
    irTreatment: "Isento", maturityYear: 2039, breakEvenMonth: 12,
    purchaseYear: 2023, purchaseMonth: 7,
  },
  {
    id: "12", shortLabel: "CRI Terracap",
    name: "CRI TERRACAP CDI+ 1,75% – venc. 2031",
    type: "CRI", creditType: "Privado", indexer: "CDI+", spread: 1.75,
    yieldInitial: 12.25, cycleScenario: "vale", cycleAmplitude: 1.5, cyclePeriodYears: 4,
    irTreatment: "Isento", maturityYear: 2031, breakEvenMonth: 6,
    purchaseYear: 2024, purchaseMonth: 4,
  },
  {
    id: "13", shortLabel: "CRA SLC",
    name: "CRA SLC AGRÍCOLA IPCA+ 6,74% – venc. 2031",
    type: "CRA", creditType: "Privado", indexer: "IPCA+", spread: 6.74,
    yieldInitial: 11.24, cycleScenario: "vale", cycleAmplitude: 3.5, cyclePeriodYears: 4,
    irTreatment: "Isento", maturityYear: 2031, breakEvenMonth: 22,
    purchaseYear: 2024, purchaseMonth: 6,
  },
  {
    id: "14", shortLabel: "CDCA BTG",
    name: "CDCA BTG PACTUAL PRE 12,03% – venc. 2034",
    type: "CDCA", creditType: "Privado", indexer: "Prefixado", spread: 12.03,
    yieldInitial: 12.03, cycleScenario: "vale", cycleAmplitude: 2.5, cyclePeriodYears: 4,
    irTreatment: "Isento", maturityYear: 2034, breakEvenMonth: 24,
    purchaseYear: 2024, purchaseMonth: 7,
  },
  {
    id: "15", shortLabel: "CRI Mateus",
    name: "CRI MATEUS SUPERMERCADOS IPCA+ 6,9% – venc. 2039",
    type: "CRI", creditType: "Privado", indexer: "IPCA+", spread: 6.9,
    yieldInitial: 11.4, cycleScenario: "alta_queda", cycleAmplitude: 3.5, cyclePeriodYears: 4,
    irTreatment: "Isento", maturityYear: 2039, breakEvenMonth: 36,
    purchaseYear: 2024, purchaseMonth: 10,
  },
  {
    id: "16", shortLabel: "LCA ABC Brasil",
    name: "LCA ABCBRASILBM IPCA+ 7,76% – venc. 2026",
    type: "LCA", creditType: "Privado", indexer: "IPCA+", spread: 7.76,
    yieldInitial: 13.26, cycleScenario: "pico", cycleAmplitude: 1.0, cyclePeriodYears: 4,
    irTreatment: "Isento", maturityYear: 2026, breakEvenMonth: 3,
    purchaseYear: 2025, purchaseMonth: 8,
  },
  // ── Sugestões – Crédito Público (Tesouro Direto) ─────────────────────────
  {
    id: "2",  shortLabel: "NTN-B 2035",
    name: "Tesouro IPCA+ 2035 (NTN-B)",
    type: "NTN-B", creditType: "Público", indexer: "IPCA+", spread: 6.80,
    yieldInitial: 13.30, cycleScenario: "pico", cycleAmplitude: 3.5, cyclePeriodYears: 4,
    irTreatment: "IR Regressivo", maturityYear: 2035, breakEvenMonth: 20,
    purchaseYear: 2026, purchaseMonth: 4,
  },
  {
    id: "3",  shortLabel: "LTN 2029",
    name: "Tesouro Prefixado 2029 (LTN)",
    type: "LTN", creditType: "Público", indexer: "Prefixado", spread: 13.50,
    yieldInitial: 13.50, cycleScenario: "pico", cycleAmplitude: 2.5, cyclePeriodYears: 4,
    irTreatment: "IR Regressivo", maturityYear: 2029, breakEvenMonth: 8,
    purchaseYear: 2026, purchaseMonth: 4,
  },
  {
    id: "4",  shortLabel: "NTN-B 2055",
    name: "Tesouro IPCA+ 2055 (NTN-B Longo)",
    type: "NTN-B", creditType: "Público", indexer: "IPCA+", spread: 7.20,
    yieldInitial: 13.70, cycleScenario: "pico", cycleAmplitude: 3.5, cyclePeriodYears: 4,
    irTreatment: "IR Regressivo", maturityYear: 2055, breakEvenMonth: 42,
    purchaseYear: 2026, purchaseMonth: 4,
  },
];

const DEFAULT_HORIZONS: Record<string, string> = {
  "1": "10", "10": "10", "11": "10", "12": "10",
  "13": "10", "14": "10", "15": "10", "16": "2",
  "2": "10", "3": "5", "4": "20",
};
const DEFAULT_ZOOMS: Record<string, boolean> = Object.fromEntries(
  DEFAULT_SECURITIES.map((s) => [s.id, false])
);

const FixedIncomeApp: React.FC = () => {
  const [securities, setSecurities] = useState<Security[]>(DEFAULT_SECURITIES);
  const [horizons,   setHorizons]   = useState<Record<string, string>>(DEFAULT_HORIZONS);
  const [zooms,      setZooms]      = useState<Record<string, boolean>>(DEFAULT_ZOOMS);
  const [visible,    setVisible]    = useState<Record<string, boolean>>(
    Object.fromEntries(DEFAULT_SECURITIES.map((s) => [s.id, true]))
  );
  const [showModal, setShowModal] = useState(false);

  const handleAdd = (sec: Security) => {
    setSecurities((prev) => [...prev, sec]);
    setHorizons((prev)   => ({ ...prev, [sec.id]: "10" }));
    setZooms((prev)      => ({ ...prev, [sec.id]: false }));
    setVisible((prev)    => ({ ...prev, [sec.id]: true }));
  };

  const handleRemove = (id: string) => {
    setSecurities((prev) => prev.filter((s) => s.id !== id));
    setHorizons((prev)   => { const n = { ...prev }; delete n[id]; return n; });
    setZooms((prev)      => { const n = { ...prev }; delete n[id]; return n; });
    setVisible((prev)    => { const n = { ...prev }; delete n[id]; return n; });
  };

  const handleToggle = (id: string) =>
    setVisible((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleGroup = (group: "all" | "private" | "public" | "none") =>
    setVisible(Object.fromEntries(
      securities.map((s) => [s.id,
        group === "all"     ? true :
        group === "none"    ? false :
        group === "private" ? s.creditType === "Privado" :
                              s.creditType === "Público",
      ])
    ));

  // Only render visible cards; track credit-type changes for separator
  const visibleSecurities = securities.filter((s) => visible[s.id]);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-4">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Simulador de Renda Fixa</h1>
            <p className="text-sm text-gray-500 mt-0.5">Crédito Privado e Público · Ciclo de Juros · MtM</p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold py-3 px-5 rounded-xl
                       flex items-center gap-2.5 transition-colors shadow-lg shadow-blue-900/40 select-none"
          >
            <Plus size={18} strokeWidth={2.5} />
            Adicionar Título
          </button>
        </div>

        {/* Navigation panel */}
        <NavigationPanel
          securities={securities}
          visible={visible}
          onToggle={handleToggle}
          onGroup={handleGroup}
        />

        {/* Cards */}
        {(() => {
          let lastCreditType: string | null = null;
          return visibleSecurities.map((sec) => {
            const showDivider = lastCreditType !== null && lastCreditType !== sec.creditType;
            lastCreditType = sec.creditType;
            return (
              <React.Fragment key={sec.id}>
                {showDivider && (
                  <div className="flex items-center gap-4 py-1">
                    <div className="flex-1 h-px bg-gray-800" />
                    <span className="text-xs font-bold text-yellow-500 uppercase tracking-widest flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
                      Sugestões — Crédito Público (Tesouro Direto)
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
                    </span>
                    <div className="flex-1 h-px bg-gray-800" />
                  </div>
                )}
                <SecurityCard
                  security={sec}
                  horizon={horizons[sec.id] ?? "10"}
                  zoomBreakEven={zooms[sec.id] ?? false}
                  onHorizonChange={(v) => setHorizons((prev) => ({ ...prev, [sec.id]: v }))}
                  onZoomChange={(v)    => setZooms((prev)    => ({ ...prev, [sec.id]: v }))}
                  onRemove={() => handleRemove(sec.id)}
                />
              </React.Fragment>
            );
          });
        })()}

        {/* All hidden state */}
        {visibleSecurities.length === 0 && securities.length > 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-600">
            <TrendingUp size={48} className="mb-4 opacity-20" />
            <p className="text-base font-medium">Todos os gráficos estão ocultos.</p>
            <p className="text-sm mt-1 text-gray-700">Use o painel acima para selecionar quais exibir.</p>
          </div>
        )}

        {/* Empty state */}
        {securities.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-600">
            <TrendingUp size={48} className="mb-4 opacity-20" />
            <p className="text-base font-medium">Nenhum título adicionado.</p>
            <p className="text-sm mt-1 text-gray-700">Clique em "Adicionar Título" para começar.</p>
          </div>
        )}
      </div>

      {showModal && <AddSecurityModal onAdd={handleAdd} onClose={() => setShowModal(false)} />}
    </div>
  );
};

export default FixedIncomeApp;
