# AussieRetire AI

AussieRetire AI is a responsive Next.js retirement modelling dashboard for Australian singles and couples. It projects superannuation, stock portfolio growth, cash and offset balances, property equity, replacement property serviceability, retirement drawdown, downsizer sale strategy, and AI-powered retirement/property recommendations.

## Tech Stack

- Next.js, React, TypeScript
- Tailwind CSS
- Recharts for dashboard charts
- `react-markdown` for AI report rendering
- AI generation through secure server API routes
- Vitest for deterministic financial engine tests

## Getting Started

Install dependencies:

```bash
npm install
```

Create `.env.local`:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm test
```

## Project Structure

- `app/page.tsx` renders the main application.
- `src/components/AussieRetireDashboard.tsx` contains the responsive dashboard UI, charts, forms, markdown AI panels, and localStorage persistence.
- `src/lib/financial/retirementCalculatorEngine.ts` contains pure deterministic retirement, superannuation, stock, mortgage, property, drawdown, and downsizer calculations.
- `src/lib/financial/types.ts` contains the strongly typed profile and projection result models.
- `src/lib/ai/aiService.ts` builds structured AI prompts and calls the model from the server only.
- `app/api/generate-retirement-strategy/route.ts` and `app/api/generate-property-strategy/route.ts` expose browser-safe AI endpoints.

## Financial Assumptions

The core assumptions are centralized in `src/lib/financial/constants.ts`:

- Super net annual return: 8.0% after fees over 20 years
- Stock portfolio nominal annual return: 10.0%, based on the S&P 500's long-run annualized return assumption
- Pension phase / drawdown annual return: 7.5%
- Concessional contribution cap: $30,000 per year
- Contributions tax: 15%
- Transfer balance cap awareness: $2,000,000
- Selling fee: 2%
- Stamp duty and purchase costs: 5%
- Deposit requirement: 20%
- Mortgage term: 30 years
- Terminal age: 90
- Downsizer contribution cap: $300,000 per individual, $600,000 combined

## Disclaimer

This tool provides general educational modeling only and is not personal financial advice. Assumptions may be inaccurate. Consider consulting a licensed Australian financial adviser before making financial decisions.
