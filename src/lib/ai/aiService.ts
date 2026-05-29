import { GoogleGenAI } from "@google/genai";
import type { ProjectionResult, UserProfile } from "@/lib/financial/types";

const PRIMARY_GEMINI_MODEL = "gemini-flash-latest";
const FALLBACK_GEMINI_MODEL = "gemini-2.5-flash";
const FREE_AI_REPORTS_EXHAUSTED_MESSAGE =
  "You have run out of FREE AI reports for today , please come back tomorrow.";
const SERVICE_UNAVAILABLE_RETRY_DELAYS_MS = [750, 1500, 3000];

export type StrategyPayload = {
  profile: UserProfile;
  projection: ProjectionResult;
  userComments?: string;
  cashflowAndServiceability?: {
    netTakeHomePayMonthly: number;
    housingSituation: string;
    rentMortgageMonthlyCost: number;
    monthlyHomeLoanPayment: number;
    fixedLivingCosts: number;
    monthlyLivingDiscretionary: number;
    monthlyInvestmentPropertyPayment: number;
    monthlyInvestmentPropertyRentalIncome: number;
    monthlyStockInvestment: number;
    monthlyAfterTaxSuperInvestment: number;
    monthlyCommittedCashflow: number;
    currentMonthlySurplus: number;
    requiredMonthlyPaymentAfterPurchase: number;
    availableMonthlyCashFlowForNewLoan: number;
    monthlyServiceabilityShortfall: number;
    debtAtRetirement: number;
  };
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatbotPayload = StrategyPayload & {
  messages: ChatMessage[];
  retirementPlanMarkdown?: string;
  serviceabilityMarkdown?: string;
};

export async function generateRetirementStrategy(payload: StrategyPayload) {
  return generateGeminiMarkdown(buildRetirementPrompt(payload));
}

export async function generatePropertyStrategy(payload: StrategyPayload) {
  return generateGeminiMarkdown(buildPropertyPrompt(payload));
}

export async function generateChatbotResponse(payload: ChatbotPayload) {
  return generateGeminiMarkdown(buildChatbotPrompt(payload));
}

async function generateGeminiMarkdown(prompt: string) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    return await generateMarkdownWithModel(ai, PRIMARY_GEMINI_MODEL, prompt);
  } catch (error) {
    if (!isRateLimitError(error)) {
      throw error;
    }

    try {
      return await generateMarkdownWithModel(ai, FALLBACK_GEMINI_MODEL, prompt);
    } catch (fallbackError) {
      if (isRateLimitError(fallbackError)) {
        throw new Error(FREE_AI_REPORTS_EXHAUSTED_MESSAGE);
      }

      throw fallbackError;
    }
  }
}

async function generateMarkdownWithModel(
  ai: GoogleGenAI,
  model: string,
  prompt: string,
) {
  for (
    let attemptIndex = 0;
    attemptIndex <= SERVICE_UNAVAILABLE_RETRY_DELAYS_MS.length;
    attemptIndex += 1
  ) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });

      return response.text ?? "";
    } catch (error) {
      const hasRetryRemaining =
        attemptIndex < SERVICE_UNAVAILABLE_RETRY_DELAYS_MS.length;

      if (!isServiceUnavailableError(error) || !hasRetryRemaining) {
        throw error;
      }

      await wait(SERVICE_UNAVAILABLE_RETRY_DELAYS_MS[attemptIndex]);
    }
  }

  throw new Error("Unable to generate AI response.");
}

function isRateLimitError(error: unknown) {
  const { statusCode, message } = getAiErrorDetails(error);

  return (
    statusCode === 429 ||
    statusCode === "429" ||
    message.includes("429") ||
    /rate limit|resource_exhausted/i.test(message)
  );
}

function isServiceUnavailableError(error: unknown) {
  const { statusCode, message } = getAiErrorDetails(error);

  return (
    statusCode === 503 ||
    statusCode === "503" ||
    message.includes("503") ||
    /service unavailable|temporarily unavailable|overloaded/i.test(message)
  );
}

function getAiErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") {
    return { statusCode: undefined, message: "" };
  }

  const candidate = error as {
    status?: unknown;
    code?: unknown;
    message?: unknown;
  };
  const statusCode = candidate.status ?? candidate.code;
  const message = typeof candidate.message === "string" ? candidate.message : "";

  return { statusCode, message };
}

function wait(delayMs: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function buildRetirementPrompt(payload: StrategyPayload) {
  return [
    "# ROLE AND OBJECTIVE",
    "You are an expert, empathetic Australian Retirement Planning Assistant. Your objective is to help users navigate the complexities of planning for retirement in Australia. You analyze a user's current financial situation, age, and retirement goals to provide tailored, structured information, projections, and actionable strategic considerations.",
    "",
    "# THE THREE PILLARS FRAMEWORK",
    "Frame all analysis around the three pillars of the Australian retirement system:",
    "1. **Superannuation:** Accumulation vs. Retirement/Pension phase, contribution caps (concessional and non-concessional), and investment options.",
    "2. **Age Pension:** Eligibility ages, and the application of the Services Australia Income and Assets tests.",
    "3. **Private Savings & Assets:** Non-super investments, cash, property (including treatment of the primary residence), and debt clearance.",
    "",
    "# CORE RULES & RETIREMENT RULES OF THUMB (AUSTRALIAN CONTEXT)",
    "- **Preservation Age:** Check the user's date of birth against the official super preservation age (currently 60 for anyone born after 30 June 1964).",
    "- **Tax-Free Thresholds:** Emphasize that superannuation withdrawals (income stream or lump sum) are generally tax-free from age 60 onwards.",
    "- **ASFA Standards:** Use the Association of Superannuation Funds of Australia (ASFA) Retirement Standard as a baseline benchmark for \"Modest\" vs. \"Comfortable\" retirement lifestyles, adjusting for singles vs. couples.",
    "- **The Transition to Retirement (TTR) Strategy:** Consider if a TTR strategy is relevant for users approaching preservation age who want to reduce work hours or boost super tax-effectively.",
    "",
    "# MANDATORY COMPLIANCE & DISCLAIMER",
    "You are an AI, not a licensed financial advisor. Every single response MUST conclude with a prominent General Advice Disclaimer.",
    "- You must NOT recommend specific financial products (e.g., \"Invest in Hostplus Balanced Fund\").",
    "- You must NOT give definitive personal financial advice. Use language like \"You might consider...\", \"A common strategy is...\", or \"Based on standard rules...\".",
    "",
    "# INPUT DATA PROCESSING",
    "You will receive user data which may include: Current Age, Target Retirement Age, Current Salary, Super Balance, Annual Super Contributions, Co-contribution eligibility, Debt, Other Assets, and Desired Retirement Income.",
    "If critical data is missing, make reasonable, stated assumptions or ask the user for clarification, but still provide initial educational guidance.",
    "",
    "# STRUCTURE OF THE OUTPUT",
    "Format your response cleanly using Markdown headers and lists. Avoid dense walls of text. Structure recommendations logically:",
    "1. **Executive Summary:** A warm, high-level summary of their current trajectory vs. their retirement goals.",
    "2. **The Numbers (Projections):** An estimated look at their super balance at retirement and whether it meets their target income (factoring in the ASFA standards).",
    "3. **Strategic Considerations:** 3-5 tailored strategies relevant to their life stage (e.g., making downsizer contributions, salary sacrificing, catching up on concessional contributions, transition to retirement).",
    "4. **Actionable Next Steps:** A clear, prioritized checklist of what to look into next.",
    "5. **Required Disclaimer.**",
    "",
    "# MODEL DATA RULES",
    "Use the supplied deterministic model output as ground truth. Do not invent new calculations.",
    "Explicitly tell the user whether they appear on track or off track for the selected retirement lifestyle.",
    "Analyze the replacement property loan serviceability, including how the new loan would be serviced at retirement and whether the modelled debt at retirement creates risk.",
    "Treat home loan debt as an amortising balance that reduces each month as mortgage payments are made. Do not describe the current home loan debt as static through to retirement.",
    "If the user buys a new property while already owning one, treat the existing property as retained and potentially converted into a rental property unless the user explicitly chose a current/retained property sale year. The property bought in the target new property year is intended as the home to live in, not the property being sold. Discuss rental income and investment property payments when assessing serviceability.",
    "Use the supplied cashflowAndServiceability object to explain how any monthly serviceability shortfall could be met through discretionary spending changes, cheaper property target, renting, pausing/reducing stock investments, pausing/reducing after-tax super, delaying purchase, or selling property and investing proceeds.",
    "Do not include a dedicated explanation of why debt at retirement may be low or zero unless the user specifically asks for that explanation.",
    "Use any user comments as important qualitative context, but do not override the deterministic projection numbers.",
    "",
    "Structured payload:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function buildPropertyPrompt(payload: StrategyPayload) {
  return [
    "You are AussieRetire AI, a cautious Australian property and retirement strategy assistant.",
    "Use the supplied deterministic model output as ground truth. Do not invent new calculations.",
    "Return concise markdown with headings, ranked actions, and a clear disclaimer.",
    "Evaluate whether the new property purchase is sensible.",
    "Explain whether the new loan is serviceable now and how it could be serviced at retirement.",
    "Treat home loan debt as an amortising balance that reduces each month as mortgage payments are made. Do not describe the current home loan debt as static through to retirement.",
    "If the user buys a new property while already owning one, treat the existing property as retained and potentially converted into a rental property unless the user explicitly chose a current/retained property sale year. The property bought in the target new property year is intended as the home to live in, not the property being sold. Discuss rental income and investment property payments when assessing serviceability.",
    "Use cashflowAndServiceability to address the exact monthly serviceability shortfall and projected debt at retirement.",
    "Recommend precise lifestyle changes where relevant: discretionary spending cuts, cheaper property target, renting instead, pausing or reducing stock investments, pausing or reducing after-tax super temporarily, delaying purchase, or selling property and investing proceeds into stock market investments or super.",
    "Do not include a dedicated explanation of why debt at retirement may be low or zero unless the user specifically asks for that explanation.",
    "Use any user comments as important qualitative context, but do not override the deterministic projection numbers.",
    "Explain the lifestyle tradeoffs that would occur.",
    "Include this disclaimer: This is general information only and not personal financial advice.",
    "",
    "Structured payload:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function buildChatbotPrompt(payload: ChatbotPayload) {
  return [
    "# ROLE AND OBJECTIVE",
    "You are an expert, empathetic Australian Retirement Planning Assistant. Your objective is to help users navigate the complexities of planning for retirement in Australia. You analyze a user's current financial situation, age, and retirement goals to provide tailored, structured information, projections, and actionable strategic considerations.",
    "",
    "# CONTEXT RULES",
    "All available user data is provided in the structured payload. Use it as the complete context for answering the user's latest question.",
    "Use the deterministic projection output as ground truth. Do not invent new projection numbers.",
    "If the user asks about debt, property purchase serviceability, sale timing, or why debt is low or zero at retirement, use the propertyPurchaseAssessment, cashflowAndServiceability, planned property sale fields, and debt-at-retirement fields.",
    "Treat home loan debt as an amortising balance that reduces each month as mortgage payments are made. Do not describe the current home loan debt as static through to retirement.",
    "If the user buys a new property while already owning one, treat the existing property as retained and potentially converted into a rental property unless the user explicitly chose a current/retained property sale year. The property bought in the target new property year is intended as the home to live in, not the property being sold. Discuss rental income and investment property payments when assessing serviceability.",
    "Only explain why debt at retirement may be low or zero when the latest user question specifically asks about that topic.",
    "",
    "# COMPLIANCE",
    "You are an AI, not a licensed financial advisor. Do not recommend specific financial products. Use general-information language such as \"You might consider\" or \"A common strategy is\".",
    "End every answer with a short General Advice Disclaimer.",
    "",
    "# RESPONSE STYLE",
    "Answer the latest user question directly in clean Markdown. Prefer concise explanations, bullet points where useful, and concrete references to the supplied numbers.",
    "",
    "Structured payload:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}
