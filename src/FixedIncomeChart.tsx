import React, { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { Plus, X, TrendingUp, ChevronRight, Info, SlidersHorizontal, ArrowUp } from "lucide-react";

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

    const yieldMercado = sec.yieldInitial + (sec.cycleAmplitude / 2) * Math.cos(cyclePhase);

    // Ágio/Deságio uses simplified duration effect
    const remainingYears = Math.max(0.1, sec.maturityYear - 2026 - t);
    const yieldDelta = yieldMercado - sec.yieldInitial;
    const agioDesagio = parseFloat(
      Math.min(40, Math.max(-60, -yieldDelta * remainingYears * 0.65)).toFixed(2)
    );

    const cdiAcumulado = (Math.pow(1 + CDI_RATE, t) - 1) * 100;
    const curvaTeórica = (Math.pow(1 + theoreticalRate, t) - 1) * 100;

    // Net return with MtM effect
    let retLiquido: number;
    if (sec.irTreatment === "Isento") {
      const grossReturn = (Math.pow(1 + theoreticalRate, t) - 1) * 100;
      const agioDecay = agioDesagio * Math.max(0, 1 - i / (sec.breakEvenMonth * 1.5));
      retLiquido = grossReturn + agioDecay;
    } else {
      const irRate = getIRRate(i);
      const grossReturn = (Math.pow(1 + theoreticalRate, t) - 1) * 100;
      const netReturn = grossReturn * (1 - irRate);
      const agioDecay = agioDesagio * Math.max(0, 1 - i / (sec.breakEvenMonth * 1.5));
      retLiquido = netReturn + agioDecay;
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

// ─── Security Card ────────────────────────────────────────────────────────────

const SecurityCard: React.FC<{
  security: Security;
  horizon: string;
  zoomBreakEven: boolean;
  onHorizonChange: (v: string) => void;
  onZoomChange: (v: boolean) => void;
  onRemove: () => void;
}> = ({ security: sec, horizon, zoomBreakEven, onHorizonChange, onZoomChange, onRemove }) => {
  const horizonYears = parseInt(horizon, 10);
  const allData = useMemo(() => generateData(horizonYears, sec), [horizonYears, sec]);

  const chartData = useMemo(() => {
    if (!zoomBreakEven) return allData;
    const start = Math.max(0, sec.breakEvenMonth - 12);
    const end = Math.min(allData.length - 1, sec.breakEvenMonth + 18);
    return allData.slice(start, end + 1);
  }, [allData, zoomBreakEven, sec.breakEvenMonth]);

  const breakEvenDate = allData[sec.breakEvenMonth]?.date ?? "";
  const breakEvenVisible = chartData.length > 0 &&
    sec.breakEvenMonth >= chartData[0].month &&
    sec.breakEvenMonth <= chartData[chartData.length - 1].month;

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
            <p className="text-sm text-gray-400">
              Ciclo:{" "}
              <span className="text-gray-200 font-semibold">{CYCLE_LABELS[sec.cycleScenario]}</span>
              {" "}· Amplitude{" "}
              <span className="text-purple-400 font-semibold">±{(sec.cycleAmplitude / 2).toFixed(2)} pp</span>
              {" "}· Período{" "}
              <span className="text-purple-400 font-semibold">{sec.cyclePeriodYears} anos</span>
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
      <div className="px-2 pt-3 pb-0">
        <ResponsiveContainer width="100%" height={420}>
          <LineChart data={chartData} margin={{ top: 24, right: 70, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.45} />
            <XAxis dataKey="date" tick={{ fill: "#9CA3AF", fontSize: 11 }} tickLine={{ stroke: "#4B5563" }} axisLine={{ stroke: "#4B5563" }} interval={tickInterval} />
            <YAxis yAxisId="left" domain={[-65, yLeftMax]} tickFormatter={(v: number) => `${v}%`} tick={{ fill: "#9CA3AF", fontSize: 11 }} tickLine={{ stroke: "#4B5563" }} axisLine={{ stroke: "#4B5563" }} width={58} />
            <YAxis yAxisId="right" orientation="right" domain={[yRightMin, yRightMax]} tickFormatter={(v: number) => `${v}%`} tick={{ fill: "#9CA3AF", fontSize: 11 }} tickLine={{ stroke: "#4B5563" }} axisLine={{ stroke: "#4B5563" }} width={60} />
            <Tooltip content={<CustomTooltip />} />
            <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: "14px", fontSize: "11px", color: "#D1D5DB" }} />
            {breakEvenVisible && (
              <ReferenceLine x={breakEvenDate} yAxisId="left" stroke="#3B82F6" strokeDasharray="5 4" strokeWidth={1.5}
                label={{ value: `Break-even · Mês ${sec.breakEvenMonth}`, position: "insideTopRight", fill: "#3B82F6", fontSize: 10, fontWeight: 600, offset: 6 }}
              />
            )}
            <Line yAxisId="left"  type="monotone" dataKey="retLiquido"  name="Ret. Líquido (MtM)"        stroke="#22C55E" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
            <Line yAxisId="left"  type="monotone" dataKey="curvaTeórica" name="Curva Teórica (bruto)"    stroke="#F97316" strokeWidth={2} strokeDasharray="7 4" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
            <Line yAxisId="right" type="monotone" dataKey="yieldMercado" name="Yield de Mercado (% a.a.)"stroke="#C084FC" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
            <Line yAxisId="right" type="monotone" dataKey="agioDesagio"  name="Ágio / Deságio (%)"       stroke="#60A5FA" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
            <Line yAxisId="left"  type="monotone" dataKey="cdiAcumulado" name="CDI Acumulado"             stroke="#EF4444" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 space-y-2">
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
    yieldInitial: 13.5, cycleScenario: "pico", cycleAmplitude: 3.5, cyclePeriodYears: 4,
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
