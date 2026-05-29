import type { LifestyleDefinition, LifestyleTier, UserProfile } from "./types";

export const FINANCIAL_CONSTANTS = {
  superNetAnnualReturn: 8,
  stockNominalAnnualReturn: 10,
  pensionPhaseAnnualReturn: 7.5,
  concessionalContributionCapAnnual: 30_000,
  contributionsTaxRate: 15,
  transferBalanceCap: 2_000_000,
  sellingFeeRate: 2,
  purchaseCostRate: 5,
  depositRequirementRate: 20,
  mortgageTermYears: 30,
  terminalAge: 90,
  downsizerContributionCapPerIndividual: 300_000,
  downsizerContributionCapCombined: 600_000,
} as const;

export const LIFESTYLE_DEFINITIONS: Record<LifestyleTier, LifestyleDefinition> = {
  modest: {
    tier: "modest",
    label: "Modest",
    annualTarget: 120_000,
    description:
      "Base essential living expenses covering utilities, healthcare, and local necessities without long-distance domestic or international travel.",
  },
  comfortable: {
    tier: "comfortable",
    label: "Comfortable",
    annualTarget: 150_000,
    description:
      "Robust private health insurance, vehicle updates every 5-7 years, regular dining out, and up to 2 premium domestic or budget international holidays annually.",
  },
  luxury: {
    tier: "luxury",
    label: "Luxury",
    annualTarget: 200_000,
    description:
      "High-end premium lifestyle with luxury vehicle upgrades, top-tier leisure memberships, premium private health structures, and 3+ business-class international long-haul vacations per year.",
  },
  custom: {
    tier: "custom",
    label: "Custom",
    annualTarget: 175_000,
    description: "A user-specified annual after-tax retirement income target.",
  },
};

export const DEFAULT_PROFILE: UserProfile = {
  currentAge: 45,
  targetRetirementAge: 65,
  netTakeHomePayMonthly: 16_500,
  rentMortgageMonthlyCost: 0,
  fixedLivingCosts: 4_500,
  monthlyLivingDiscretionary: 2_500,
  annualInflationRate: 2.5,
  monthlyStockInvestment: 1_500,
  currentStockPortfolioBalance: 120_000,
  monthlyInvestmentPropertyPayment: 0,
  monthlyInvestmentPropertyRentalIncome: 0,
  currentSuperBalanceUser: 280_000,
  currentSuperBalanceSpouse: 240_000,
  monthlyPreTaxContributionsUser: 1_800,
  monthlyPreTaxContributionsSpouse: 1_500,
  monthlyPostTaxContributionsUser: 500,
  monthlyPostTaxContributionsSpouse: 500,
  monthlyAfterTaxSuperInvestment: 1_000,
  ownsProperty: true,
  housingSituation: "livingInOwnProperty",
  currentPropertyAssetValue: 1_100_000,
  propertyGrowthRate: 5,
  homeLoanDebt: 520_000,
  monthlyHomeLoanPayment: 3_800,
  offsetAndSavingsBalance: 120_000,
  mortgageInterestRate: 6.1,
  loanStartYear: new Date().getFullYear() - 5,
  loanTermYears: FINANCIAL_CONSTANTS.mortgageTermYears,
  planToBuyNewProperty: true,
  targetNewPropertyYear: new Date().getFullYear() + 5,
  targetNewPropertyValue: 1_450_000,
  planToSellPropertyInFuture: false,
  targetPropertySaleYear: new Date().getFullYear() + 20,
  propertySaleInvestmentDestination: "stock",
  lifestyleTier: "comfortable",
  customAnnualLifestyleTarget: 175_000,
};
