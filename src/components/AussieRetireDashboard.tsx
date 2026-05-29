"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DEFAULT_PROFILE,
  LIFESTYLE_DEFINITIONS,
} from "@/lib/financial/constants";
import {
  calculateMonthlyMortgageInterest,
  calculateRetirementProjection,
} from "@/lib/financial/retirementCalculatorEngine";
import type {
  LifestyleTier,
  ProjectionResult,
  UserProfile,
} from "@/lib/financial/types";
import {
  formatAUD,
  formatCompactAUD,
  formatPercent,
} from "@/lib/utils/format";

const STORAGE_KEY = "aussieretire-ai-profile";
const COMMENTS_STORAGE_KEY = "aussieretire-ai-comments";

type StepId =
  | "dashboard"
  | "target"
  | "super"
  | "cashflow"
  | "property"
  | "review"
  | "results";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const steps: { id: StepId; label: string; description: string }[] = [
  {
    id: "dashboard",
    label: "About You",
    description: "Household timing and income basics",
  },
  {
    id: "target",
    label: "Retirement Income Target",
    description: "Lifestyle tier and inflation assumptions",
  },
  {
    id: "super",
    label: "Superannuation",
    description: "User and spouse balances and contributions",
  },
  {
    id: "cashflow",
    label: "Cashflow & Expenses",
    description: "Monthly spending, investing, and surplus",
  },
  {
    id: "property",
    label: "Assets / Property",
    description: "Debt, offset, property, and purchase plan",
  },
  {
    id: "review",
    label: "Review",
    description: "Check inputs and add AI context",
  },
  {
    id: "results",
    label: "Plan Summary",
    description: "AI retirement plan, charts, and insights",
  },
];

const chartCurrencyFormatter = (value: number) => formatCompactAUD(value);

export function AussieRetireDashboard() {
  const [stepIndex, setStepIndex] = useState(0);
  const [highestStepIndex, setHighestStepIndex] = useState(0);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [additionalComments, setAdditionalComments] = useState("");
  const [retirementMarkdown, setRetirementMarkdown] = useState("");
  const [serviceabilityMarkdown, setServiceabilityMarkdown] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [loadingServiceability, setLoadingServiceability] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [aiError, setAiError] = useState("");
  const [serviceabilityError, setServiceabilityError] = useState("");
  const [chatError, setChatError] = useState("");
  const hasLoadedStoredProfile = useRef(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedProfile = window.localStorage.getItem(STORAGE_KEY);
    const savedComments = window.localStorage.getItem(COMMENTS_STORAGE_KEY);

    const timeoutId = window.setTimeout(() => {
      try {
        if (savedProfile) {
          setProfile(syncCombinedAfterTaxSuper({
            ...DEFAULT_PROFILE,
            ...JSON.parse(savedProfile),
          }));
        }

        if (savedComments) {
          setAdditionalComments(savedComments);
        }
      } finally {
        hasLoadedStoredProfile.current = true;
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!hasLoadedStoredProfile.current) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    window.localStorage.setItem(COMMENTS_STORAGE_KEY, additionalComments);
  }, [additionalComments]);

  const projection = useMemo(
    () => calculateRetirementProjection(profile),
    [profile],
  );
  const readinessTone = getReadinessTone(profile, projection);
  const currentStep = steps[stepIndex];

  function updateProfile<K extends keyof UserProfile>(
    key: K,
    value: UserProfile[K],
  ) {
    setProfile((current) =>
      syncCombinedAfterTaxSuper({ ...current, [key]: value }),
    );
  }

  function updateIndividualPostTaxContribution(
    key: "monthlyPostTaxContributionsUser" | "monthlyPostTaxContributionsSpouse",
    value: number,
  ) {
    setProfile((current) => {
      const next = { ...current, [key]: value };

      return {
        ...next,
        monthlyAfterTaxSuperInvestment: getCombinedAfterTaxSuper(next),
      };
    });
  }

  function goNext() {
    const next = Math.min(stepIndex + 1, steps.length - 1);
    setHighestStepIndex((highest) => Math.max(highest, next));
    setStepIndex(next);
  }

  function goBack() {
    setStepIndex((current) => Math.max(current - 1, 0));
  }

  async function generateRetirementPlan() {
    setLoadingPlan(true);
    setAiError("");

    try {
      const response = await fetch("/api/generate-retirement-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          projection,
          userComments: additionalComments,
          cashflowAndServiceability: buildCashflowServiceabilityContext(
            profile,
            projection,
          ),
        }),
      });
      const data = (await response.json()) as {
        markdown?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "The AI retirement plan failed.");
      }

      setRetirementMarkdown(data.markdown ?? "");
      const resultsIndex = steps.findIndex((step) => step.id === "results");
      setHighestStepIndex(resultsIndex);
      setStepIndex(resultsIndex);
    } catch (error) {
      setAiError(
        error instanceof Error
          ? error.message
          : "Unable to generate the retirement plan.",
      );
      const resultsIndex = steps.findIndex((step) => step.id === "results");
      setHighestStepIndex(resultsIndex);
      setStepIndex(resultsIndex);
    } finally {
      setLoadingPlan(false);
    }
  }

  async function generatePropertyServiceabilityRecommendation() {
    setLoadingServiceability(true);
    setServiceabilityError("");

    try {
      const response = await fetch("/api/generate-property-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          projection,
          userComments:
            "Focus on Step 5 property serviceability. Analyze the monthly serviceability shortfall, how the new property loan could be serviced at retirement, debt at retirement, and whether current/retained property sale proceeds should go to stock market investments or super. The property bought in the target new property year is intended as the home to live in and should not be treated as the property being sold.",
          cashflowAndServiceability: buildCashflowServiceabilityContext(
            profile,
            projection,
          ),
        }),
      });
      const data = (await response.json()) as {
        markdown?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error ?? "The AI serviceability recommendation failed.",
        );
      }

      setServiceabilityMarkdown(data.markdown ?? "");
    } catch (error) {
      setServiceabilityError(
        error instanceof Error
          ? error.message
          : "Unable to generate the AI serviceability recommendation.",
      );
    } finally {
      setLoadingServiceability(false);
    }
  }

  async function sendChatMessage(question: string) {
    const nextMessages: ChatMessage[] = [
      ...chatMessages,
      { role: "user", content: question },
    ];

    setChatMessages(nextMessages);
    setLoadingChat(true);
    setChatError("");

    try {
      const response = await fetch("/api/chat-retirement-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          projection,
          userComments: additionalComments,
          cashflowAndServiceability: buildCashflowServiceabilityContext(
            profile,
            projection,
          ),
          messages: nextMessages,
          retirementPlanMarkdown: retirementMarkdown,
          serviceabilityMarkdown,
        }),
      });
      const data = (await response.json()) as {
        markdown?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "The AI chatbot failed.");
      }

      setChatMessages([
        ...nextMessages,
        { role: "assistant", content: data.markdown ?? "" },
      ]);
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : "Unable to generate chatbot response.",
      );
    } finally {
      setLoadingChat(false);
    }
  }

  async function handleDownloadPdf() {
    setIsDownloadingPdf(true);

    try {
      await downloadPdfReport(reportRef.current);
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <TopDisclaimer />
        <Header projection={projection} readinessTone={readinessTone} />
        <StepProgress
          currentIndex={stepIndex}
          highestIndex={highestStepIndex}
          onStepSelect={setStepIndex}
        />

        <div
          ref={currentStep.id === "results" ? reportRef : undefined}
          className="grid gap-5"
        >
          <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <Card title={currentStep.label} eyebrow={currentStep.description}>
              {currentStep.id === "dashboard" && (
                <DashboardStep
                  profile={profile}
                  projection={projection}
                  updateProfile={updateProfile}
                />
              )}

              {currentStep.id === "target" && (
                <TargetStep
                  profile={profile}
                  projection={projection}
                  updateProfile={updateProfile}
                />
              )}

              {currentStep.id === "super" && (
                <SuperStep
                  profile={profile}
                  updateProfile={updateProfile}
                  updateIndividualPostTaxContribution={
                    updateIndividualPostTaxContribution
                  }
                />
              )}

              {currentStep.id === "cashflow" && (
                <CashflowStep
                  profile={profile}
                  updateProfile={updateProfile}
                />
              )}

              {currentStep.id === "property" && (
                <PropertyStep
                  profile={profile}
                  projection={projection}
                  updateProfile={updateProfile}
                  serviceabilityMarkdown={serviceabilityMarkdown}
                  isServiceabilityLoading={loadingServiceability}
                  serviceabilityError={serviceabilityError}
                  onGenerateServiceability={
                    generatePropertyServiceabilityRecommendation
                  }
                />
              )}

              {currentStep.id === "review" && (
                <ReviewStep
                  profile={profile}
                  projection={projection}
                  additionalComments={additionalComments}
                  setAdditionalComments={setAdditionalComments}
                  onGenerate={generateRetirementPlan}
                  isLoading={loadingPlan}
                  error={aiError}
                />
              )}

              {currentStep.id === "results" && (
                <ResultsStep
                  profile={profile}
                  projection={projection}
                  retirementMarkdown={retirementMarkdown}
                  isLoading={loadingPlan}
                  error={aiError}
                  isDownloadingPdf={isDownloadingPdf}
                  onDownloadPdf={handleDownloadPdf}
                  onRegenerate={generateRetirementPlan}
                />
              )}

              {currentStep.id !== "results" && (
                <WizardControls
                  stepIndex={stepIndex}
                  totalSteps={steps.length}
                  onBack={goBack}
                  onNext={goNext}
                  nextLabel={
                    currentStep.id === "review" ? "Skip AI for now" : "Next"
                  }
                />
              )}
            </Card>

            <SideSummary
              profile={profile}
              projection={projection}
              readinessTone={readinessTone}
            />
          </section>

          {currentStep.id === "property" && (
            <OffsetRepaymentChart profile={profile} />
          )}

          {currentStep.id === "review" && (
            <DeterministicPlanSummary
              profile={profile}
              projection={projection}
            />
          )}

          {currentStep.id === "results" && (
            <DeterministicPlanSummary
              profile={profile}
              projection={projection}
            />
          )}
          {currentStep.id === "results" && <Disclaimer />}
        </div>

        {currentStep.id !== "results" && <Disclaimer />}
      </div>
      <ChatbotPanel
        messages={chatMessages}
        isLoading={loadingChat}
        error={chatError}
        onSendMessage={sendChatMessage}
      />
    </main>
  );
}

function Header({
  projection,
  readinessTone,
}: {
  projection: ProjectionResult;
  readinessTone: string;
}) {
  return (
    <section className="relative min-h-[390px] overflow-hidden rounded-[2rem] border border-white/70 bg-slate-950 text-white shadow-2xl shadow-emerald-950/20">
      <Image
        src="/aussie-retire-hero.png"
        alt="Australian coastal landscape at sunrise"
        fill
        priority
        sizes="(min-width: 1280px) 1280px, 100vw"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/58 to-emerald-950/20" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.28),transparent_24rem)]" />
      <div className="relative grid min-h-[390px] gap-6 p-6 sm:p-8 lg:grid-cols-[1.25fr_1fr] lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-300">
            AussieRetire AI
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Build your retirement plan step by step.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
            Enter your household inputs, review the deterministic projection,
            then generate an AI-backed retirement plan with charts, metrics,
            and recommended actions.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <MetricCard
            label="Liquid assets at retirement"
            value={formatAUD(projection.liquidAssetsAtRetirement)}
            variant="dark"
          />
          <MetricCard
            label="Required annual income"
            value={formatAUD(projection.annualRequiredIncomeAtRetirement)}
            variant="dark"
          />
          <MetricCard
            label="Readiness"
            value={
              projection.selectedLifestyleSurvivesToAge90
                ? "On track to age 90"
                : `Runs dry at ${projection.selectedLifestyleDryAge?.toFixed(1)}`
            }
            tone={readinessTone}
            variant="dark"
          />
        </div>
      </div>
    </section>
  );
}

function TopDisclaimer() {
  return (
    <aside className="rounded-[1.75rem] border border-white/80 bg-white/80 px-5 py-4 shadow-lg shadow-emerald-950/10 backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-sm font-extrabold text-emerald-800">
          i
        </div>
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-emerald-800">
            General Information Only
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            We are not financial advisors. All content and tools in this app are
            for educational and general informational purposes only. Consider
            seeking independent professional advice before making any financial
            decisions.
          </p>
        </div>
      </div>
    </aside>
  );
}

function StepProgress({
  currentIndex,
  highestIndex,
  onStepSelect,
}: {
  currentIndex: number;
  highestIndex: number;
  onStepSelect: (index: number) => void;
}) {
  const reviewIndex = steps.findIndex((step) => step.id === "review");

  return (
    <nav className="rounded-3xl border border-white/70 bg-white/75 p-3 shadow-xl shadow-emerald-950/10 backdrop-blur">
      <div className="grid gap-2 md:grid-cols-7">
        {steps.map((step, index) => {
          let isLocked = index > highestIndex;

          if (step.id === "results" && highestIndex >= reviewIndex) {
            isLocked = false;
          }
          const isActive = index === currentIndex;

          return (
            <button
              key={step.id}
              type="button"
              disabled={isLocked}
              onClick={() => onStepSelect(index)}
              className={`rounded-2xl px-3 py-3 text-left text-xs font-bold transition ${
                isActive
                  ? "bg-slate-950 text-white shadow-lg"
                  : "bg-white/50 text-slate-600 hover:bg-white"
              } disabled:cursor-not-allowed disabled:opacity-45`}
            >
              <span className="block text-[0.65rem] uppercase tracking-[0.18em] opacity-70">
                Step {index + 1}
              </span>
              {step.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function DashboardStep({
  profile,
  projection,
  updateProfile,
}: {
  profile: UserProfile;
  projection: ProjectionResult;
  updateProfile: <K extends keyof UserProfile>(
    key: K,
    value: UserProfile[K],
  ) => void;
}) {
  return (
    <div className="grid gap-5">
      <p className="text-sm leading-6 text-slate-600">
        Start with the household basics. These values set the modelling horizon
        and give the AI enough context to understand timing.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberInput
          label="Current age"
          value={profile.currentAge}
          min={18}
          max={89}
          onChange={(value) => updateProfile("currentAge", value)}
        />
        <NumberInput
          label="Target retirement age"
          value={profile.targetRetirementAge}
          min={45}
          max={89}
          onChange={(value) => updateProfile("targetRetirementAge", value)}
        />
      </div>
      <SummaryStrip
        items={[
          ["Years until retirement", projection.yearsUntilRetirement],
        ]}
      />
    </div>
  );
}

function TargetStep({
  profile,
  projection,
  updateProfile,
}: {
  profile: UserProfile;
  projection: ProjectionResult;
  updateProfile: <K extends keyof UserProfile>(
    key: K,
    value: UserProfile[K],
  ) => void;
}) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(LIFESTYLE_DEFINITIONS) as LifestyleTier[]).map((tier) => (
          <button
            key={tier}
            type="button"
            onClick={() => updateProfile("lifestyleTier", tier)}
            className={`rounded-2xl border p-4 text-left transition ${
              profile.lifestyleTier === tier
                ? "border-emerald-500 bg-emerald-50 shadow-lg shadow-emerald-950/10"
                : "border-slate-200 bg-white hover:border-emerald-300"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-bold">
                {LIFESTYLE_DEFINITIONS[tier].label}
              </span>
              <span className="text-sm font-semibold text-emerald-700">
                {formatAUD(
                  tier === "custom"
                    ? profile.customAnnualLifestyleTarget
                    : LIFESTYLE_DEFINITIONS[tier].annualTarget,
                )}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {LIFESTYLE_DEFINITIONS[tier].description}
            </p>
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberInput
          label="Annual inflation rate"
          value={profile.annualInflationRate}
          suffix="%"
          step={0.1}
          onChange={(value) => updateProfile("annualInflationRate", value)}
        />
        <NumberInput
          label="Custom annual target"
          value={profile.customAnnualLifestyleTarget}
          prefix="$"
          step={1000}
          disabled={profile.lifestyleTier !== "custom"}
          onChange={(value) =>
            updateProfile("customAnnualLifestyleTarget", value)
          }
        />
      </div>
      {profile.lifestyleTier !== "custom" && (
        <p className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Custom annual target is only editable when Custom is selected as the
          lifestyle tier.
        </p>
      )}
      <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        A current {formatAUD(projection.currentAnnualLifestyleTarget)} target
        becomes {formatAUD(projection.annualRequiredIncomeAtRetirement)} in{" "}
        {projection.yearsUntilRetirement} years at{" "}
        {formatPercent(profile.annualInflationRate)} inflation.
      </p>
    </div>
  );
}

function SuperStep({
  profile,
  updateProfile,
  updateIndividualPostTaxContribution,
}: {
  profile: UserProfile;
  updateProfile: <K extends keyof UserProfile>(
    key: K,
    value: UserProfile[K],
  ) => void;
  updateIndividualPostTaxContribution: (
    key: "monthlyPostTaxContributionsUser" | "monthlyPostTaxContributionsSpouse",
    value: number,
  ) => void;
}) {
  const combinedAfterTaxSuper = getCombinedAfterTaxSuper(profile);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <NumberInput
        label="Current super balance user"
        value={profile.currentSuperBalanceUser}
        prefix="$"
        step={1000}
        onChange={(value) => updateProfile("currentSuperBalanceUser", value)}
      />
      <NumberInput
        label="Current super balance spouse"
        value={profile.currentSuperBalanceSpouse}
        prefix="$"
        step={1000}
        onChange={(value) => updateProfile("currentSuperBalanceSpouse", value)}
      />
      <NumberInput
        label="Pre-tax contributions user"
        value={profile.monthlyPreTaxContributionsUser}
        prefix="$"
        step={100}
        onChange={(value) =>
          updateProfile("monthlyPreTaxContributionsUser", value)
        }
      />
      <NumberInput
        label="Pre-tax contributions spouse"
        value={profile.monthlyPreTaxContributionsSpouse}
        prefix="$"
        step={100}
        onChange={(value) =>
          updateProfile("monthlyPreTaxContributionsSpouse", value)
        }
      />
      <NumberInput
        label="Post-tax contribution user"
        value={profile.monthlyPostTaxContributionsUser}
        prefix="$"
        step={100}
        onChange={(value) =>
          updateIndividualPostTaxContribution(
            "monthlyPostTaxContributionsUser",
            value,
          )
        }
      />
      <NumberInput
        label="Post-tax contribution spouse"
        value={profile.monthlyPostTaxContributionsSpouse}
        prefix="$"
        step={100}
        onChange={(value) =>
          updateIndividualPostTaxContribution(
            "monthlyPostTaxContributionsSpouse",
            value,
          )
        }
      />
      <div className="sm:col-span-2">
        <NumberInput
          label="Combined after-tax super investment"
          value={combinedAfterTaxSuper}
          prefix="$"
          step={100}
          disabled
          onChange={() => undefined}
        />
      </div>
      <div className="sm:col-span-2">
        <NumberInput
          label="Current stock portfolio balance"
          value={profile.currentStockPortfolioBalance}
          prefix="$"
          step={1000}
          onChange={(value) =>
            updateProfile("currentStockPortfolioBalance", value)
          }
        />
      </div>
    </div>
  );
}

function CashflowStep({
  profile,
  updateProfile,
}: {
  profile: UserProfile;
  updateProfile: <K extends keyof UserProfile>(
    key: K,
    value: UserProfile[K],
  ) => void;
}) {
  const combinedAfterTaxSuper = getCombinedAfterTaxSuper(profile);
  const monthlyCommitted =
    profile.fixedLivingCosts +
    profile.monthlyLivingDiscretionary +
    profile.rentMortgageMonthlyCost +
    profile.monthlyHomeLoanPayment +
    profile.monthlyInvestmentPropertyPayment +
    profile.monthlyStockInvestment +
    combinedAfterTaxSuper;
  const monthlySurplus = Math.max(
    0,
    profile.netTakeHomePayMonthly +
      profile.monthlyInvestmentPropertyRentalIncome -
      monthlyCommitted,
  );

  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberInput
          label="Net take-home pay monthly"
          value={profile.netTakeHomePayMonthly}
          prefix="$"
          step={100}
          onChange={(value) => updateProfile("netTakeHomePayMonthly", value)}
        />
        <NumberInput
          label="Rent / mortgage"
          value={profile.rentMortgageMonthlyCost}
          prefix="$"
          step={100}
          onChange={(value) => updateProfile("rentMortgageMonthlyCost", value)}
        />
        <NumberInput
          label="Fixed living costs"
          value={profile.fixedLivingCosts}
          prefix="$"
          step={100}
          onChange={(value) => updateProfile("fixedLivingCosts", value)}
        />
        <NumberInput
          label="Discretionary spending"
          value={profile.monthlyLivingDiscretionary}
          prefix="$"
          step={100}
          onChange={(value) =>
            updateProfile("monthlyLivingDiscretionary", value)
          }
        />
        <NumberInput
          label="Monthly stock investment"
          value={profile.monthlyStockInvestment}
          prefix="$"
          step={100}
          onChange={(value) => updateProfile("monthlyStockInvestment", value)}
        />
        <NumberInput
          label="Investment property payment"
          value={profile.monthlyInvestmentPropertyPayment}
          prefix="$"
          step={100}
          onChange={(value) =>
            updateProfile("monthlyInvestmentPropertyPayment", value)
          }
        />
        <NumberInput
          label="Investment property rental income"
          value={profile.monthlyInvestmentPropertyRentalIncome}
          prefix="$"
          step={100}
          onChange={(value) =>
            updateProfile("monthlyInvestmentPropertyRentalIncome", value)
          }
        />
        <NumberInput
          label="Combined after-tax super investment"
          value={combinedAfterTaxSuper}
          prefix="$"
          step={100}
          disabled
          onChange={() => undefined}
        />
      </div>
      <SummaryStrip
        items={[
          ["Monthly committed cashflow", formatAUD(monthlyCommitted)],
          [
            "Monthly rental income",
            formatAUD(profile.monthlyInvestmentPropertyRentalIncome),
          ],
          ["Current monthly surplus auto-invested to stocks", formatAUD(monthlySurplus)],
        ]}
      />
    </div>
  );
}

function PropertyStep({
  profile,
  projection,
  updateProfile,
  serviceabilityMarkdown,
  isServiceabilityLoading,
  serviceabilityError,
  onGenerateServiceability,
}: {
  profile: UserProfile;
  projection: ProjectionResult;
  updateProfile: <K extends keyof UserProfile>(
    key: K,
    value: UserProfile[K],
  ) => void;
  serviceabilityMarkdown: string;
  isServiceabilityLoading: boolean;
  serviceabilityError: string;
  onGenerateServiceability: () => void;
}) {
  const assessment = projection.propertyPurchaseAssessment;
  const currentEquity = Math.max(
    0,
    profile.currentPropertyAssetValue - profile.homeLoanDebt,
  );
  const newLoanPaymentLabel = assessment.willPurchase
    ? `New loan payment (from ${assessment.purchaseYear})`
    : "New loan payment";

  return (
    <div className="grid gap-5">
      <div className="grid gap-4">
        <SummarySection title="Current Property">
          <div className="grid gap-4 sm:grid-cols-2">
            <ToggleInput
              label="Owns property"
              value={profile.ownsProperty}
              onChange={(value) => updateProfile("ownsProperty", value)}
            />
            <NumberInput
              label="Current property value"
              value={profile.currentPropertyAssetValue}
              prefix="$"
              step={10_000}
              disabled={!profile.ownsProperty}
              onChange={(value) =>
                updateProfile("currentPropertyAssetValue", value)
              }
            />
            <NumberInput
              label="Property growth rate"
              value={profile.propertyGrowthRate}
              suffix="%"
              step={0.1}
              disabled={!profile.ownsProperty}
              onChange={(value) => updateProfile("propertyGrowthRate", value)}
            />
            <NumberInput
              label="Home loan debt"
              value={profile.homeLoanDebt}
              prefix="$"
              step={1000}
              disabled={!profile.ownsProperty}
              onChange={(value) => updateProfile("homeLoanDebt", value)}
            />
            <NumberInput
              label="Monthly loan payment"
              value={profile.monthlyHomeLoanPayment}
              prefix="$"
              step={100}
              disabled={!profile.ownsProperty}
              onChange={(value) => updateProfile("monthlyHomeLoanPayment", value)}
            />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-700">
              Current housing situation
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[
                {
                  id: "livingInOwnProperty" as const,
                  label: "Living in own property",
                  detail:
                    "If you buy a new home later, the existing home is retained as a rental property.",
                },
                {
                  id: "rentingOutside" as const,
                  label: "Renting outside",
                  detail:
                    "You currently rent elsewhere. Any owned property is treated as an investment property.",
                },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  disabled={!profile.ownsProperty}
                  onClick={() => updateProfile("housingSituation", option.id)}
                  className={`rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    profile.housingSituation === option.id
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <span className="block text-sm font-bold text-slate-950">
                    {option.label}
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-slate-600">
                    {option.detail}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </SummarySection>

        <SummarySection title="Loan And Offset">
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberInput
              label="Offset and savings balance"
              value={profile.offsetAndSavingsBalance}
              prefix="$"
              step={1000}
              onChange={(value) =>
                updateProfile("offsetAndSavingsBalance", value)
              }
            />
            <NumberInput
              label="Mortgage interest rate"
              value={profile.mortgageInterestRate}
              suffix="%"
              step={0.1}
              onChange={(value) => updateProfile("mortgageInterestRate", value)}
            />
            <NumberInput
              label="Loan start year"
              value={profile.loanStartYear}
              step={1}
              disabled={!profile.ownsProperty}
              onChange={(value) => updateProfile("loanStartYear", value)}
            />
            <NumberInput
              label="Loan term"
              value={profile.loanTermYears}
              suffix="years"
              min={1}
              max={40}
              step={1}
              onChange={(value) => updateProfile("loanTermYears", value)}
            />
          </div>
        </SummarySection>

        <SummarySection title="New Property Purchase">
          <div className="grid gap-4 sm:grid-cols-2">
            <ToggleInput
              label="Plan to buy new property"
              value={profile.planToBuyNewProperty}
              onChange={(value) => updateProfile("planToBuyNewProperty", value)}
            />
            <NumberInput
              label="Target new property year"
              value={profile.targetNewPropertyYear}
              step={1}
              disabled={!profile.planToBuyNewProperty}
              onChange={(value) => updateProfile("targetNewPropertyYear", value)}
            />
            <NumberInput
              label="Target new property value"
              value={profile.targetNewPropertyValue}
              prefix="$"
              step={10_000}
              disabled={!profile.planToBuyNewProperty}
              onChange={(value) => updateProfile("targetNewPropertyValue", value)}
            />
          </div>
          {!profile.planToBuyNewProperty && (
            <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              Turn on the new property purchase plan to edit the target year and
              target value.
            </p>
          )}
        </SummarySection>

        <SummarySection title="Current Property Sale">
          <div className="grid gap-4 sm:grid-cols-2">
            <ToggleInput
              label="Sell current property later"
              value={profile.planToSellPropertyInFuture}
              onChange={(value) =>
                updateProfile("planToSellPropertyInFuture", value)
              }
            />
            <NumberInput
              label="Current property sale year"
              value={profile.targetPropertySaleYear}
              step={1}
              disabled={!profile.planToSellPropertyInFuture}
              onChange={(value) => updateProfile("targetPropertySaleYear", value)}
            />
          </div>
          <div
            className={`rounded-2xl border border-slate-200 bg-white p-4 ${
              profile.planToSellPropertyInFuture ? "" : "opacity-55"
            }`}
          >
            <p className="text-sm font-semibold text-slate-700">
              Invest current property sale proceeds into
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[
                {
                  id: "stock" as const,
                  label: "Stock market portfolio",
                  detail: "Uses the 10% stock return assumption.",
                },
                {
                  id: "super" as const,
                  label: "Superannuation",
                  detail: "Uses the 8% after-fee super return assumption.",
                },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  disabled={!profile.planToSellPropertyInFuture}
                  onClick={() =>
                    updateProfile("propertySaleInvestmentDestination", option.id)
                  }
                  className={`rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed ${
                    profile.propertySaleInvestmentDestination === option.id
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <span className="block text-sm font-bold text-slate-950">
                    {option.label}
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-slate-600">
                    {option.detail}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </SummarySection>
      </div>
      <SummaryStrip
        items={[
          ["Current property equity", formatAUD(currentEquity)],
          [
            "Rental income retained",
            `${formatAUD(profile.monthlyInvestmentPropertyRentalIncome)} / mo`,
          ],
          [
            "Offset interest saved monthly",
            `${formatAUD(projection.offsetInterestSavedMonthly)} / mo`,
          ],
          [
            newLoanPaymentLabel,
            `${formatAUD(assessment.requiredMonthlyPaymentAfterPurchase)} / mo`,
          ],
          [
            assessment.isLoanServiceable
              ? "Monthly serviceability buffer"
              : "Monthly serviceability shortfall",
            `${formatAUD(
              assessment.isLoanServiceable
                ? Math.max(
                    0,
                    assessment.availableMonthlyCashFlowForNewLoan -
                      assessment.requiredMonthlyPaymentAfterPurchase,
                  )
                : assessment.monthlyServiceabilityShortfall,
            )} / mo`,
          ],
          ["Debt at retirement", formatAUD(projection.debtAtRetirement)],
          [
            "Current property sale proceeds",
            formatAUD(projection.plannedPropertySaleNetProceeds),
          ],
        ]}
      />
      <AiPanel
        title="AI Serviceability Recommendation"
        buttonLabel="Generate AI Recommendation"
        markdown={serviceabilityMarkdown}
        isLoading={isServiceabilityLoading}
        error={serviceabilityError}
        onGenerate={onGenerateServiceability}
      />
    </div>
  );
}

type OffsetRepaymentEntry = {
  month: number;
  dateLabel: string;
  payment: number;
  principal: number;
  interest: number;
  cumulativePaid: number;
  cumulativePrincipal: number;
  cumulativeInterest: number;
  remainingDebt: number;
};

function OffsetRepaymentChart({ profile }: { profile: UserProfile }) {
  const repaymentData = useMemo(
    () => buildOffsetRepaymentSchedule(profile),
    [profile],
  );
  const firstMonth = repaymentData[0];
  const finalMonth = repaymentData.at(-1);
  const payoffLabel =
    finalMonth && finalMonth.remainingDebt <= 0
      ? `${finalMonth.dateLabel} (${finalMonth.month} months)`
      : "Not paid off in term";

  return (
    <Card
      title="Offset Impact On Home Loan Repayments"
      eyebrow="Cumulative loan paydown"
    >
      {repaymentData.length === 0 ? (
        <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          Add a current property loan balance to see how your offset balance
          changes the split between interest and principal each month.
        </p>
      ) : (
        <div className="grid gap-5">
          <p className="text-sm leading-6 text-slate-600">
            The model applies the offset balance before calculating monthly
            interest. Lower interest means more of the same home loan payment
            goes to principal, so the remaining loan balance falls faster. The
            chart uses cumulative totals so you can see the loan being removed
            over time.
          </p>
          <SummaryStrip
            items={[
              ["Monthly loan payment", formatAUD(firstMonth?.payment ?? 0)],
              [
                "Total principal paid",
                formatAUD(finalMonth?.cumulativePrincipal ?? 0),
              ],
              [
                "Total interest paid",
                formatAUD(finalMonth?.cumulativeInterest ?? 0),
              ],
              ["Projected payoff", payoffLabel],
            ]}
          />
          <div className="h-[340px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={repaymentData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d9e7df" />
                <XAxis
                  dataKey="dateLabel"
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis tickFormatter={chartCurrencyFormatter} width={80} />
                <Tooltip
                  formatter={(value) => formatAUD(Number(value))}
                  labelFormatter={(label) => `End of month: ${label}`}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="remainingDebt"
                  name="Remaining loan balance"
                  stroke="#0f172a"
                  strokeWidth={3}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="cumulativePrincipal"
                  name="Cumulative principal paid"
                  stroke="#059669"
                  strokeWidth={3}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="cumulativeInterest"
                  name="Cumulative interest paid"
                  stroke="#dc2626"
                  strokeWidth={3}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="cumulativePaid"
                  name="Cumulative paid out"
                  stroke="#2563eb"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Card>
  );
}

function buildOffsetRepaymentSchedule(profile: UserProfile): OffsetRepaymentEntry[] {
  if (!profile.ownsProperty || profile.homeLoanDebt <= 0) {
    return [];
  }

  const currentYear = new Date().getFullYear();
  const remainingLoanTermYears = Math.max(
    1 / 12,
    profile.loanStartYear + profile.loanTermYears - currentYear,
  );
  const monthlyLoanPayment = profile.monthlyHomeLoanPayment;

  if (monthlyLoanPayment <= 0) {
    return [];
  }

  const maxMonths = Math.max(1, Math.ceil(remainingLoanTermYears * 12) + 120);
  const schedule: OffsetRepaymentEntry[] = [];
  let remainingDebt = profile.homeLoanDebt;
  let cumulativePaid = 0;
  let cumulativePrincipal = 0;
  let cumulativeInterest = 0;

  for (let month = 1; month <= maxMonths && remainingDebt > 0; month += 1) {
    const interest = calculateMonthlyMortgageInterest(
      remainingDebt,
      profile.offsetAndSavingsBalance,
      profile.mortgageInterestRate,
    );
    const payment = Math.min(monthlyLoanPayment, remainingDebt + interest);
    const principal = Math.max(0, payment - interest);

    remainingDebt = Math.max(0, remainingDebt - principal);
    cumulativePaid += payment;
    cumulativePrincipal += principal;
    cumulativeInterest += interest;
    schedule.push({
      month,
      dateLabel: formatEndOfMonthLabel(month - 1),
      payment,
      principal,
      interest,
      cumulativePaid,
      cumulativePrincipal,
      cumulativeInterest,
      remainingDebt,
    });
  }

  return schedule;
}

function formatEndOfMonthLabel(monthOffset: number) {
  const endOfMonth = new Date();

  endOfMonth.setMonth(endOfMonth.getMonth() + monthOffset + 1, 0);

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(endOfMonth);
}

function ReviewStep({
  profile,
  projection,
  additionalComments,
  setAdditionalComments,
  onGenerate,
  isLoading,
  error,
}: {
  profile: UserProfile;
  projection: ProjectionResult;
  additionalComments: string;
  setAdditionalComments: (value: string) => void;
  onGenerate: () => void;
  isLoading: boolean;
  error: string;
}) {
  return (
    <div className="grid gap-5">
      <p className="text-sm leading-6 text-slate-600">
        Review the inputs below, then add any extra context you want the AI to
        consider before generating the retirement plan.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <InlineStat label="Current age" value={String(profile.currentAge)} />
        <InlineStat
          label="Retirement age"
          value={String(profile.targetRetirementAge)}
        />
        <InlineStat
          label="Lifestyle target today"
          value={formatAUD(projection.currentAnnualLifestyleTarget)}
        />
        <InlineStat
          label="Inflated retirement target"
          value={formatAUD(projection.annualRequiredIncomeAtRetirement)}
        />
        <InlineStat
          label="Total super at retirement"
          value={formatAUD(projection.totalSuperAtRetirement)}
        />
        <InlineStat
          label="Liquid assets at retirement"
          value={formatAUD(projection.liquidAssetsAtRetirement)}
        />
      </div>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">
          Additional comments for the AI
        </span>
        <textarea
          value={additionalComments}
          onChange={(event) => setAdditionalComments(event.target.value)}
          rows={7}
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
          placeholder="Example: We want to help children with a property deposit, prefer not to sell the family home before 80, and can reduce travel spend if needed."
        />
      </label>
      {error && (
        <p className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onGenerate}
        disabled={isLoading}
        className="rounded-2xl bg-emerald-600 px-6 py-4 text-base font-bold text-white shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading
          ? "Generating Retirement Plan..."
          : "Generate Retirement Plan (AI Generated)"}
      </button>
    </div>
  );
}

function ResultsStep({
  profile,
  projection,
  retirementMarkdown,
  isLoading,
  error,
  isDownloadingPdf,
  onDownloadPdf,
  onRegenerate,
}: {
  profile: UserProfile;
  projection: ProjectionResult;
  retirementMarkdown: string;
  isLoading: boolean;
  error: string;
  isDownloadingPdf: boolean;
  onDownloadPdf: () => void;
  onRegenerate: () => void;
}) {
  return (
    <div className="grid gap-5">
      <div
        className="flex flex-wrap justify-end gap-3"
        data-html2canvas-ignore="true"
      >
        <button
          type="button"
          onClick={onDownloadPdf}
          disabled={isDownloadingPdf}
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100"
        >
          {isDownloadingPdf ? "Preparing PDF..." : "Download PDF Report"}
        </button>
      </div>
      <DeterministicReport profile={profile} projection={projection} />
      <InsightCards projection={projection} />
      <AiPanel
        title="AI Retirement Plan"
        buttonLabel="Regenerate Retirement Plan (AI Generated)"
        markdown={retirementMarkdown}
        isLoading={isLoading}
        error={error}
        onGenerate={onRegenerate}
      />
    </div>
  );
}

function SideSummary({
  profile,
  projection,
  readinessTone,
}: {
  profile: UserProfile;
  projection: ProjectionResult;
  readinessTone: string;
}) {
  const assessment = projection.propertyPurchaseAssessment;

  return (
    <aside className="grid gap-5 self-start">
      <Card title="Live Summary" eyebrow="Updates as you type">
        <div className="grid gap-4 sm:grid-cols-2">
          <SummarySection title="Retirement Target">
            <InlineStat
              label="Selected lifestyle"
              value={LIFESTYLE_DEFINITIONS[profile.lifestyleTier].label}
            />
            <InlineStat
              label="Annual target at retirement"
              value={formatAUD(projection.annualRequiredIncomeAtRetirement)}
            />
          </SummarySection>

          <SummarySection title="Liquid Assets">
            <InlineStat
              label="Super"
              value={formatAUD(projection.totalSuperAtRetirement)}
            />
            <InlineStat
              label="Stocks"
              value={formatAUD(projection.stockPortfolioAtRetirement)}
            />
          </SummarySection>

          <SummarySection title="Property And Debt">
            <InlineStat
              label="Home equity"
              value={formatAUD(projection.propertyEquityAtRetirement)}
            />
            <InlineStat
              label="Debt at retirement"
              value={formatAUD(projection.debtAtRetirement)}
            />
            <InlineStat
              label="New property serviceability"
              value={
                assessment.willPurchase
                  ? assessment.isLoanServiceable
                    ? "Serviceable"
                    : "Shortfall"
                  : "Not Applicable"
              }
            />
          </SummarySection>

          <SummarySection title="Overall Position">
            <InlineStat
              label="Total assets at retirement"
              value={formatAUD(projection.totalAssetsAtRetirement)}
            />
          </SummarySection>
        </div>
        <div className={`mt-4 rounded-2xl p-4 text-sm font-bold ${readinessTone}`}>
          {projection.selectedLifestyleSurvivesToAge90
            ? "The deterministic model indicates the selected lifestyle survives to age 90."
            : `The deterministic model runs out of liquid assets around age ${projection.selectedLifestyleDryAge?.toFixed(
                1,
              )}.`}
        </div>
      </Card>
      <Card title="Plan Output" eyebrow="What happens after review">
        <p className="text-sm leading-6 text-slate-600">
          The final button sends your full profile, projection output, property
          assessment, charts data, and extra comments to the AI. The returned
          plan renders as markdown and is paired with deterministic metric cards
          and charts.
        </p>
      </Card>
    </aside>
  );
}

function ChatbotPanel({
  messages,
  isLoading,
  error,
  onSendMessage,
}: {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string;
  onSendMessage: (question: string) => void;
}) {
  const [draftQuestion, setDraftQuestion] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  function submitQuestion() {
    const trimmedQuestion = draftQuestion.trim();

    if (!trimmedQuestion || isLoading) {
      return;
    }

    onSendMessage(trimmedQuestion);
    setDraftQuestion("");
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 sm:right-6 sm:bottom-6">
      {isOpen && (
        <div className="mb-4 w-[calc(100vw-2rem)] max-w-md overflow-hidden rounded-3xl border border-white/80 bg-white shadow-2xl shadow-slate-950/20">
          <div className="flex items-center justify-between gap-3 bg-slate-950 px-5 py-4 text-white">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-300">
                Context-aware chatbot
              </p>
              <h2 className="text-lg font-bold">Ask AussieRetire AI</h2>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold transition hover:bg-white/20"
              aria-label="Close chatbot"
            >
              Close
            </button>
          </div>
          <div className="max-h-[420px] space-y-3 overflow-auto bg-slate-50 p-4">
            {messages.length === 0 ? (
              <p className="text-sm leading-6 text-slate-500">
                Ask a question about your retirement projection, property plan,
                serviceability shortfall, super, stocks, cashflow, or why debt
                at retirement may be low or zero.
              </p>
            ) : (
              messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`rounded-2xl p-3 text-sm leading-6 ${
                    message.role === "user"
                      ? "ml-6 bg-slate-950 text-white"
                      : "mr-6 border border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => (
                          <p className="mb-2 last:mb-0">{children}</p>
                        ),
                        ul: ({ children }) => (
                          <ul className="mb-2 list-disc space-y-1 pl-5">
                            {children}
                          </ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="mb-2 list-decimal space-y-1 pl-5">
                            {children}
                          </ol>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-bold text-slate-950">
                            {children}
                          </strong>
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  ) : (
                    message.content
                  )}
                </div>
              ))
            )}
            {isLoading && (
              <p className="rounded-2xl border border-emerald-100 bg-white p-3 text-sm font-semibold text-emerald-800">
                AussieRetire AI is thinking...
              </p>
            )}
          </div>
          <div className="border-t border-slate-100 bg-white p-4">
            {error && (
              <p className="mb-3 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">
                {error}
              </p>
            )}
            <div className="grid gap-3">
              <textarea
                value={draftQuestion}
                onChange={(event) => setDraftQuestion(event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm leading-6 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                placeholder="Ask: Can I afford the new property at retirement?"
              />
              <button
                type="button"
                onClick={submitQuestion}
                disabled={isLoading || !draftQuestion.trim()}
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Send question
              </button>
            </div>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="ml-auto flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-4 text-base font-bold text-white shadow-2xl shadow-emerald-950/30 transition hover:bg-emerald-700"
        aria-expanded={isOpen}
      >
        Ask AI
        {messages.length > 0 && (
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-emerald-700">
            {messages.length}
          </span>
        )}
      </button>
    </div>
  );
}

function DeterministicReport({
  profile,
  projection,
}: {
  profile: UserProfile;
  projection: ProjectionResult;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-5">
      <p className="text-lg leading-8 text-slate-700">
        To maintain your preferred{" "}
        {LIFESTYLE_DEFINITIONS[profile.lifestyleTier].label.toLowerCase()}{" "}
        lifestyle, your current{" "}
        <strong>{formatAUD(projection.currentAnnualLifestyleTarget)}</strong>{" "}
        target today will require an inflation-adjusted{" "}
        <strong>{formatAUD(projection.annualRequiredIncomeAtRetirement)}</strong>{" "}
        annual income in <strong>{projection.yearsUntilRetirement}</strong>{" "}
        years. Recommendation: sell the{" "}
        <strong>{projection.downsizerSaleAssetDescription}</strong> at age{" "}
        <strong>{projection.recommendedRealEstateSaleAge}</strong> to inject
        downsizer capital into super and liquid investments.
      </p>
    </div>
  );
}

function InsightCards({ projection }: { projection: ProjectionResult }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <MetricCard
        label="Retirement readiness"
        value={
          projection.selectedLifestyleSurvivesToAge90
            ? "On track"
            : "Off track"
        }
        tone={
          projection.selectedLifestyleSurvivesToAge90
            ? "bg-emerald-100 text-emerald-800"
            : "bg-red-100 text-red-800"
        }
      />
      <MetricCard
        label="Required liquid capital"
        value={formatAUD(projection.requiredLiquidCapitalForLifestyle)}
      />
      <MetricCard
        label="Liquid assets at retirement"
        value={formatAUD(projection.liquidAssetsAtRetirement)}
      />
      <MetricCard
        label="Total super at retirement"
        value={formatAUD(projection.totalSuperAtRetirement)}
      />
      <MetricCard
        label="Stock portfolio at retirement"
        value={formatAUD(projection.stockPortfolioAtRetirement)}
      />
      <MetricCard
        label="Property equity at retirement"
        value={formatAUD(projection.propertyEquityAtRetirement)}
      />
    </div>
  );
}

function DeterministicPlanSummary({
  profile,
  projection,
}: {
  profile: UserProfile;
  projection: ProjectionResult;
}) {
  return (
    <>
      <ProjectionCharts
        projection={projection}
        selectedTier={profile.lifestyleTier}
      />
      <PropertyInsights profile={profile} projection={projection} />
    </>
  );
}

function ProjectionCharts({
  projection,
  selectedTier,
}: {
  projection: ProjectionResult;
  selectedTier: LifestyleTier;
}) {
  const drawdownChartData = useMemo(() => {
    const years = new Set<number>();

    Object.values(projection.lifestyleScenarioDrawdownPoints).forEach((points) =>
      points.forEach((point) => years.add(point.year)),
    );

    return Array.from(years)
      .sort()
      .map((year) => {
        const row: Record<string, number> = { year };

        (Object.keys(LIFESTYLE_DEFINITIONS) as LifestyleTier[]).forEach(
          (tier) => {
            const point =
              projection.lifestyleScenarioDrawdownPoints[tier].find(
                (entry) => entry.year === year,
              ) ??
              projection.lifestyleScenarioDrawdownPoints[tier].at(-1);
            row[LIFESTYLE_DEFINITIONS[tier].label] =
              point?.liquidAssets ?? 0;
          },
        );

        return row;
      });
  }, [projection.lifestyleScenarioDrawdownPoints]);

  return (
    <section className="grid gap-5">
      <Card title="Chart A: Assets Up To Retirement" eyebrow="Accumulation">
        <div className="h-[360px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={projection.assetChartEntries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d9e7df" />
              <XAxis dataKey="year" tickLine={false} />
              <YAxis tickFormatter={chartCurrencyFormatter} width={80} />
              <Tooltip formatter={(value) => formatAUD(Number(value))} />
              <Legend />
              <Area
                dataKey="superBalance"
                name="Super"
                stroke="#059669"
                fill="#10b981"
                fillOpacity={0.22}
              />
              <Area
                dataKey="stockPortfolio"
                name="Stock Investment Portfolio"
                stroke="#2563eb"
                fill="#3b82f6"
                fillOpacity={0.18}
              />
              <Area
                dataKey="propertyEquity"
                name="Net Property Equity"
                stroke="#f97316"
                fill="#fb923c"
                fillOpacity={0.18}
              />
              <Area
                dataKey="cashOffset"
                name="Cash + Offset"
                stroke="#64748b"
                fill="#94a3b8"
                fillOpacity={0.18}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Chart B: Retirement Drawdown" eyebrow="Lifestyle scenarios">
        <div className="h-[360px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={drawdownChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d9e7df" />
              <XAxis dataKey="year" tickLine={false} />
              <YAxis tickFormatter={chartCurrencyFormatter} width={80} />
              <Tooltip formatter={(value) => formatAUD(Number(value))} />
              <Legend />
              {[
                { tier: "modest" as const, color: "#16a34a" },
                { tier: "comfortable" as const, color: "#2563eb" },
                { tier: "luxury" as const, color: "#dc2626" },
                { tier: "custom" as const, color: "#7c3aed" },
              ].map(({ tier, color }) => (
                <Line
                  key={tier}
                  type="monotone"
                  dataKey={LIFESTYLE_DEFINITIONS[tier].label}
                  stroke={color}
                  strokeWidth={selectedTier === tier ? 4 : 2}
                  strokeOpacity={selectedTier === tier ? 1 : 0.55}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </section>
  );
}

function PropertyInsights({
  profile,
  projection,
}: {
  profile: UserProfile;
  projection: ProjectionResult;
}) {
  const assessment = projection.propertyPurchaseAssessment;
  const currentEquity = Math.max(
    0,
    profile.currentPropertyAssetValue - profile.homeLoanDebt,
  );

  return (
    <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <Card title="Property Strategy Insights" eyebrow="Serviceability">
        <div className="grid gap-3">
          <InlineStat label="Current equity" value={formatAUD(currentEquity)} />
          <InlineStat
            label="Required deposit"
            value={formatAUD(assessment.requiredDeposit)}
          />
          <InlineStat
            label="Stamp duty / purchase costs"
            value={formatAUD(assessment.purchaseCosts)}
          />
          <InlineStat
            label="New loan payment"
            value={`${formatAUD(
              assessment.requiredMonthlyPaymentAfterPurchase,
            )} / mo`}
          />
          <InlineStat
            label="Cheaper purchase target"
            value={formatAUD(assessment.affordableReplacementPropertyValue)}
          />
        </div>
      </Card>
      <Card title="Debt vs Property Growth" eyebrow="Primary residence">
        <div className="h-[330px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={projection.yearlyAssetPoints}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d9e7df" />
              <XAxis dataKey="year" tickLine={false} />
              <YAxis tickFormatter={chartCurrencyFormatter} width={80} />
              <Tooltip formatter={(value) => formatAUD(Number(value))} />
              <Legend />
              <Line
                type="monotone"
                dataKey="propertyEquity"
                name="Net property equity"
                stroke="#16a34a"
                strokeWidth={3}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="homeLoanDebt"
                name="Home loan debt"
                stroke="#dc2626"
                strokeWidth={3}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </section>
  );
}

function AiPanel({
  title,
  buttonLabel,
  markdown,
  isLoading,
  error,
  onGenerate,
}: {
  title: string;
  buttonLabel: string;
  markdown: string;
  isLoading: boolean;
  error: string;
  onGenerate: () => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-bold text-slate-950">{title}</h3>
        <button
          type="button"
          onClick={onGenerate}
          disabled={isLoading}
          data-html2canvas-ignore="true"
          className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Generating..." : buttonLabel}
        </button>
      </div>
      {error && (
        <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      <div
        className="mt-4 max-h-[520px] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-5"
        data-pdf-expand="true"
      >
        {markdown ? (
          <ReactMarkdown
            components={{
              h1: ({ children }) => (
                <h1 className="mb-3 text-2xl font-bold">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="mb-3 mt-4 text-xl font-bold">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="mb-2 mt-4 text-lg font-bold">{children}</h3>
              ),
              p: ({ children }) => (
                <p className="mb-3 leading-7 text-slate-700">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="mb-3 list-disc space-y-2 pl-5 text-slate-700">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="mb-3 list-decimal space-y-2 pl-5 text-slate-700">
                  {children}
                </ol>
              ),
              strong: ({ children }) => (
                <strong className="font-bold text-slate-950">{children}</strong>
              ),
            }}
          >
            {markdown}
          </ReactMarkdown>
        ) : (
          <p className="text-sm leading-6 text-slate-500">
            Generate the retirement plan to see AI recommendations rendered
            as markdown.
          </p>
        )}
      </div>
    </div>
  );
}

function WizardControls({
  stepIndex,
  totalSteps,
  onBack,
  onNext,
  nextLabel,
}: {
  stepIndex: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
      <button
        type="button"
        onClick={onBack}
        disabled={stepIndex === 0}
        className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Back
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={stepIndex >= totalSteps - 1}
        className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800 disabled:hidden"
      >
        {nextLabel}
      </button>
    </div>
  );
}

function Card({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <article className="min-w-0 rounded-3xl border border-white/80 bg-white/85 p-5 shadow-xl shadow-emerald-950/10 backdrop-blur sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-700">
        {eyebrow}
      </p>
      <h2 className="mt-2 mb-5 text-2xl font-bold tracking-tight text-slate-950">
        {title}
      </h2>
      {children}
    </article>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  prefix,
  suffix,
  min,
  max,
  step = 1,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState("");
  const displayedValue = isEditing ? draftValue : String(value || 0);

  function handleChange(nextValue: string) {
    if (!/^\d*\.?\d*$/.test(nextValue)) {
      return;
    }

    setDraftValue(nextValue);

    if (nextValue === "") {
      return;
    }

    const parsedValue = Number(nextValue);

    if (Number.isFinite(parsedValue)) {
      onChange(parsedValue);
    }
  }

  function handleBlur() {
    if (draftValue === "") {
      onChange(0);
    }

    setIsEditing(false);
  }

  return (
    <label className={`block ${disabled ? "opacity-55" : ""}`}>
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <div
        className={`mt-2 flex items-center rounded-2xl border border-slate-200 px-3 py-2 shadow-sm ${
          disabled ? "bg-slate-100" : "bg-white"
        }`}
      >
        {prefix && <span className="mr-2 text-slate-400">{prefix}</span>}
        <input
          className="w-full bg-transparent py-1 text-base font-semibold outline-none disabled:cursor-not-allowed"
          type="text"
          inputMode="decimal"
          value={displayedValue}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onFocus={() => {
            setIsEditing(true);
            setDraftValue(value === 0 ? "" : String(value));
          }}
          onBlur={handleBlur}
          onChange={(event) => handleChange(event.target.value)}
        />
        {suffix && <span className="ml-2 text-slate-400">{suffix}</span>}
      </div>
    </label>
  );
}

function ToggleInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-[74px] items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative h-8 w-14 rounded-full transition ${
          value ? "bg-emerald-500" : "bg-slate-300"
        }`}
        aria-pressed={value}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${
            value ? "left-7" : "left-1"
          }`}
        />
      </button>
    </label>
  );
}

function MetricCard({
  label,
  value,
  tone,
  variant = "light",
}: {
  label: string;
  value: string;
  tone?: string;
  variant?: "light" | "dark";
}) {
  const isDark = variant === "dark";

  return (
    <div
      className={`rounded-2xl border p-4 ${
        isDark
          ? "border-white/20 bg-white/10"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <p
        className={`text-xs font-semibold uppercase tracking-[0.18em] ${
          isDark ? "text-slate-300" : "text-slate-500"
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-2 inline-flex rounded-xl text-2xl font-bold ${
          tone
            ? `${tone} px-3 py-1 text-base`
            : isDark
              ? "text-white"
              : "text-slate-950"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      <span className="text-right text-base font-bold text-slate-950">
        {value}
      </span>
    </div>
  );
}

function SummarySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-3">
      <h3 className="px-1 pb-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
        {title}
      </h3>
      <div className="grid gap-2">{children}</div>
    </section>
  );
}

function SummaryStrip({ items }: { items: [string, string | number][] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <InlineStat key={label} label={label} value={String(value)} />
      ))}
    </div>
  );
}

function Disclaimer() {
  return (
    <footer className="border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">
      <p className="font-semibold text-slate-600">
        © {new Date().getFullYear()} Aussie Retire AI
      </p>
      <p className="mt-2">
        Disclaimer: This tool provides general educational modeling only and is
        not personal financial advice. Assumptions may be inaccurate. Consider
        consulting a licensed Australian financial adviser before making
        financial decisions.
      </p>
    </footer>
  );
}

function getReadinessTone(profile: UserProfile, projection: ProjectionResult) {
  if (projection.selectedLifestyleSurvivesToAge90) {
    return "bg-emerald-100 text-emerald-800";
  }

  if (
    projection.selectedLifestyleDryAge &&
    projection.selectedLifestyleDryAge >= profile.targetRetirementAge + 10
  ) {
    return "bg-amber-100 text-amber-800";
  }

  return "bg-red-100 text-red-800";
}

function buildCashflowServiceabilityContext(
  profile: UserProfile,
  projection: ProjectionResult,
) {
  const combinedAfterTaxSuper = getCombinedAfterTaxSuper(profile);
  const monthlyCommittedCashflow =
    profile.fixedLivingCosts +
    profile.monthlyLivingDiscretionary +
    profile.rentMortgageMonthlyCost +
    profile.monthlyHomeLoanPayment +
    profile.monthlyInvestmentPropertyPayment +
    profile.monthlyStockInvestment +
    combinedAfterTaxSuper;
  const assessment = projection.propertyPurchaseAssessment;

  return {
    netTakeHomePayMonthly: profile.netTakeHomePayMonthly,
    housingSituation: profile.housingSituation,
    rentMortgageMonthlyCost: profile.rentMortgageMonthlyCost,
    monthlyHomeLoanPayment: profile.monthlyHomeLoanPayment,
    fixedLivingCosts: profile.fixedLivingCosts,
    monthlyLivingDiscretionary: profile.monthlyLivingDiscretionary,
    monthlyInvestmentPropertyPayment: profile.monthlyInvestmentPropertyPayment,
    monthlyInvestmentPropertyRentalIncome:
      profile.monthlyInvestmentPropertyRentalIncome,
    monthlyStockInvestment: profile.monthlyStockInvestment,
    monthlyAfterTaxSuperInvestment: combinedAfterTaxSuper,
    monthlyCommittedCashflow,
    currentMonthlySurplus: Math.max(
      0,
      profile.netTakeHomePayMonthly +
        profile.monthlyInvestmentPropertyRentalIncome -
        monthlyCommittedCashflow,
    ),
    requiredMonthlyPaymentAfterPurchase:
      assessment.requiredMonthlyPaymentAfterPurchase,
    availableMonthlyCashFlowForNewLoan:
      assessment.availableMonthlyCashFlowForNewLoan,
    monthlyServiceabilityShortfall: assessment.monthlyServiceabilityShortfall,
    debtAtRetirement: projection.debtAtRetirement,
  };
}

function syncCombinedAfterTaxSuper(profile: UserProfile) {
  return {
    ...profile,
    monthlyAfterTaxSuperInvestment: getCombinedAfterTaxSuper(profile),
  };
}

function getCombinedAfterTaxSuper(profile: UserProfile) {
  return (
    profile.monthlyPostTaxContributionsUser +
    profile.monthlyPostTaxContributionsSpouse
  );
}

async function downloadPdfReport(reportElement: HTMLElement | null) {
  if (!reportElement) {
    return;
  }

  const canvas = await html2canvas(reportElement, {
    backgroundColor: "#eef6f2",
    scale: 2,
    useCORS: true,
    onclone: (clonedDocument) => {
      preparePdfCloneForHtml2Canvas(clonedDocument);
      clonedDocument.querySelectorAll<HTMLElement>("[data-pdf-expand]").forEach(
        (element) => {
          element.style.maxHeight = "none";
          element.style.overflow = "visible";
          element.style.height = "auto";
        },
      );
    },
  });
  const imageData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imageHeight = (canvas.height * pageWidth) / canvas.width;
  let remainingHeight = imageHeight;
  let position = 0;

  pdf.addImage(imageData, "PNG", 0, position, pageWidth, imageHeight);
  remainingHeight -= pageHeight;

  while (remainingHeight > 0) {
    position = remainingHeight - imageHeight;
    pdf.addPage();
    pdf.addImage(imageData, "PNG", 0, position, pageWidth, imageHeight);
    remainingHeight -= pageHeight;
  }

  pdf.save("aussieretire-ai-retirement-plan.pdf");
}

function preparePdfCloneForHtml2Canvas(clonedDocument: Document) {
  const style = clonedDocument.createElement("style");

  style.textContent = `
    html,
    body {
      background: rgb(238, 246, 242) !important;
      color: rgb(15, 23, 42) !important;
    }

    *,
    *::before,
    *::after {
      background: transparent !important;
      border-color: rgb(226, 232, 240) !important;
      color: inherit !important;
      fill: currentColor !important;
      outline-color: transparent !important;
      stroke: currentColor !important;
      text-decoration-color: currentColor !important;
      box-shadow: none !important;
      text-shadow: none !important;
    }

    [class*="bg-white"] { background-color: rgb(255, 255, 255) !important; }
    [class*="bg-slate-50"] { background-color: rgb(248, 250, 252) !important; }
    [class*="bg-slate-100"] { background-color: rgb(241, 245, 249) !important; }
    [class*="bg-slate-800"] { background-color: rgb(30, 41, 59) !important; }
    [class*="bg-slate-950"] { background-color: rgb(2, 6, 23) !important; color: rgb(255, 255, 255) !important; }
    [class*="bg-emerald-50"] { background-color: rgb(236, 253, 245) !important; }
    [class*="bg-emerald-100"] { background-color: rgb(209, 250, 229) !important; }
    [class*="bg-emerald-600"] { background-color: rgb(5, 150, 105) !important; }
    [class*="bg-red-50"] { background-color: rgb(254, 242, 242) !important; }
    [class*="bg-red-100"] { background-color: rgb(254, 226, 226) !important; }
    [class*="bg-amber-100"] { background-color: rgb(254, 243, 199) !important; }

    [class*="text-white"] { color: rgb(255, 255, 255) !important; }
    [class*="text-slate-500"] { color: rgb(100, 116, 139) !important; }
    [class*="text-slate-600"] { color: rgb(71, 85, 105) !important; }
    [class*="text-slate-700"] { color: rgb(51, 65, 85) !important; }
    [class*="text-slate-800"] { color: rgb(30, 41, 59) !important; }
    [class*="text-slate-950"] { color: rgb(2, 6, 23) !important; }
    [class*="text-emerald-300"] { color: rgb(110, 231, 183) !important; }
    [class*="text-emerald-700"] { color: rgb(4, 120, 87) !important; }
    [class*="text-emerald-800"] { color: rgb(6, 95, 70) !important; }
    [class*="text-red-700"] { color: rgb(185, 28, 28) !important; }
    [class*="text-red-800"] { color: rgb(153, 27, 27) !important; }
    [class*="text-amber-800"] { color: rgb(146, 64, 14) !important; }
  `;
  clonedDocument.head.appendChild(style);

  const clonedWindow = clonedDocument.defaultView;

  if (!clonedWindow) {
    return;
  }

  clonedDocument.querySelectorAll<HTMLElement>("*").forEach((element) => {
    const computedStyle = clonedWindow.getComputedStyle(element);

    sanitizeUnsupportedColorProperties(element, computedStyle);
  });
}

function sanitizeUnsupportedColorProperties(
  element: HTMLElement,
  computedStyle: CSSStyleDeclaration,
) {
  for (let index = 0; index < computedStyle.length; index += 1) {
    const property = computedStyle.item(index);
    const value = computedStyle.getPropertyValue(property);

    if (!hasUnsupportedColorFunction(value)) {
      continue;
    }

    element.style.setProperty(
      property,
      getPdfSafeFallbackForProperty(property),
      "important",
    );
  }

  element.style.setProperty("box-shadow", "none", "important");
  element.style.setProperty("text-shadow", "none", "important");
}

function hasUnsupportedColorFunction(value: string) {
  return /(?:oklch|oklab|lab|lch|color-mix)\(/i.test(value);
}

function getPdfSafeFallbackForProperty(property: string) {
  if (property.includes("shadow")) {
    return "none";
  }

  if (property.includes("background-image") || property === "background") {
    return "none";
  }

  if (property.includes("background")) {
    return "transparent";
  }

  if (property.includes("border") || property.includes("outline")) {
    return "rgb(226, 232, 240)";
  }

  if (property === "fill" || property === "stroke") {
    return "currentColor";
  }

  if (property.includes("color") || property === "caret-color") {
    return "rgb(15, 23, 42)";
  }

  return "initial";
}
