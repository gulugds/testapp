# Renda Fixa – Análise de Break-even (CRA / CRI / Debêntures)

Dashboard SPA em React + TypeScript para analisar rentabilidade e break-even
de títulos de Renda Fixa privados.

---

## Pré-requisitos

| Ferramenta | Versão mínima | Verificar |
|---|---|---|
| Node.js | 18+ | `node -v` |
| npm | 9+ | `npm -v` |

Instale o Node.js em https://nodejs.org (escolha a versão LTS).

---

## Instalação e execução

```bash
# 1. Entre na pasta do projeto
cd fixed-income-app

# 2. Instale as dependências (apenas na primeira vez)
npm install

# 3. Inicie o servidor de desenvolvimento
npm run dev
```

Abra o navegador em **http://localhost:5173**

---

## Build para produção

```bash
npm run build        # gera a pasta dist/
npm run preview      # pré-visualiza o build local
```

Os arquivos estáticos prontos ficam em `dist/` — basta hospedar em qualquer
servidor (Nginx, Apache, Vercel, Netlify, GitHub Pages, S3, etc.).

---

## Estrutura do projeto

```
fixed-income-app/
├── index.html                  # Ponto de entrada HTML
├── package.json                # Dependências e scripts
├── tsconfig.json               # Configuração TypeScript
├── vite.config.ts              # Configuração Vite
├── tailwind.config.js          # Configuração TailwindCSS
├── postcss.config.js           # PostCSS (necessário para Tailwind)
└── src/
    ├── main.tsx                # Bootstrap React
    ├── index.css               # Estilos globais + Tailwind directives
    └── FixedIncomeChart.tsx    # ★ Componente principal (toda a lógica)
```

---

## Dependências instaladas

| Pacote | Função |
|---|---|
| `react` + `react-dom` | Framework UI |
| `recharts` | Gráficos (LineChart, dual Y-axis, ReferenceLine) |
| `lucide-react` | Ícones (Plus, X, TrendingUp) |
| `tailwindcss` | Estilização utilitária |
| `typescript` | Tipagem estática |
| `vite` | Bundler / dev server rápido |

---

## Funcionalidades

- **+ Adicionar e Gerar Gráfico** — adiciona novos cards de títulos
- **Horizonte** — seleciona 1 / 2 / 5 / **10** / 20 anos de projeção
- **Zoom no Break-even** — centraliza o gráfico no ponto de break-even (Dia 957)
- **X Remover** — remove o card
- **Tooltip interativo** — mostra todos os valores ao passar o mouse
- **Eixo Y duplo** — esq. (−65% a 195%) para retornos acumulados; dir. (−45% a +15%) para ágio/yield
- **Linha de break-even** — tracejada azul marcando o Dia 957
- **Estado vazio** — tela de boas-vindas quando todos os cards são removidos

---

## Personalização rápida

Abra `src/FixedIncomeChart.tsx` e edite o objeto `DEFAULT_SECURITY`:

```typescript
const DEFAULT_SECURITY: Security = {
  id: "1",
  name: "CRA SEARA IPCA 7.42% 15/02/2055",  // nome exibido
  ticker: "CRA - IPCA + 7.42%",              // tag cinza
  scenario: "Ciclo partindo do pico",         // cenário
  breakEvenDay: 957,                          // dia do break-even
  breakEvenMonth: 32,                         // mês correspondente (~dia/30)
};
```

Para ajustar as taxas da simulação, edite as constantes dentro de
`generateMockData()`:

```typescript
const CDI_RATE        = 0.105;   // CDI anual (10,5%)
const THEORETICAL_RATE = 0.113;  // taxa teórica bruta do papel (~11,3%)
const YIELD_BASE      = 11.5;    // yield base de mercado (%)
const YIELD_AMP       = 3.5;     // amplitude do ciclo de juros (±3,5 pp)
const CYCLE_YEARS     = 4;       // período do ciclo de juros (4 anos)
```

---

## Suporte

Node.js: https://nodejs.org
Recharts docs: https://recharts.org
TailwindCSS docs: https://tailwindcss.com
