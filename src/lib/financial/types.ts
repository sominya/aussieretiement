export type LifestyleTier = "modest" | "comfortable" | "luxury" | "custom";
export type PropertySaleInvestmentDestination = "stock" | "super";
export type HousingSituation = "rentingOutside" | "livingInOwnProperty";

export type UserProfile = {
  currentAge: number;
  targetRetirementAge: number;
  netTakeHomePayMonthly: number;
  rentMortgageMonthlyCost: number;
  fixedLivingCosts: number;
  monthlyLivingDiscretionary: number;
  annualInflationRate: number;
  monthlyStockInvestment: number;
  currentStockPortfolioBalance: number;
  monthlyInvestmentPropertyPayment: number;
  monthlyInvestmentPropertyRentalIncome: number;
  currentSuperBalanceUser: number;
  currentSuperBalanceSpouse: number;
  monthlyPreTaxContributionsUser: number;
  monthlyPreTaxContributionsSpouse: number;
  monthlyPostTaxContributionsUser: number;
  monthlyPostTaxContributionsSpouse: number;
  monthlyAfterTaxSuperInvestment: number;
  ownsProperty: boolean;
  housingSituation: HousingSituation;
  currentPropertyAssetValue: number;
  propertyGrowthRate: number;
  homeLoanDebt: number;
  monthlyHomeLoanPayment: number;
  offsetAndSavingsBalance: number;
  mortgageInterestRate: number;
  loanStartYear: number;
  loanTermYears: number;
  planToBuyNewProperty: boolean;
  targetNewPropertyYear: number;
  targetNewPropertyValue: number;
  planToSellPropertyInFuture: boolean;
  targetPropertySaleYear: number;
  propertySaleInvestmentDestination: PropertySaleInvestmentDestination;
  lifestyleTier: LifestyleTier;
  customAnnualLifestyleTarget: number;
};

export type LifestyleDefinition = {
  tier: LifestyleTier;
  label: string;
  annualTarget: number;
  description: string;
};

export type AssetPoint = {
  age: number;
  year: number;
  superBalance: number;
  stockPortfolio: number;
  propertyEquity: number;
  cashOffset: number;
  totalLiquidAssets: number;
  totalAssets: number;
  homeLoanDebt: number;
};

export type DrawdownPoint = {
  age: number;
  year: number;
  liquidAssets: number;
  superBalance: number;
  stockPortfolio: number;
  cashOffset: number;
  annualSpend: number;
  lifestyleTier: LifestyleTier;
};

export type PropertyPurchaseAssessment = {
  willPurchase: boolean;
  purchaseYear: number;
  requiredDeposit: number;
  purchaseCosts: number;
  requiredCashForPurchase: number;
  availableCashAndEquity: number;
  newDebt: number;
  requiredMonthlyPaymentAfterPurchase: number;
  availableMonthlyCashFlowForNewLoan: number;
  monthlyServiceabilityShortfall: number;
  isLoanServiceable: boolean;
  affordableReplacementPropertyValue: number;
  requiredPriceReduction: number;
};

export type ProjectionResult = {
  currentAnnualLifestyleTarget: number;
  annualRequiredIncomeAtRetirement: number;
  yearsUntilRetirement: number;
  totalSuperAtRetirement: number;
  stockPortfolioAtRetirement: number;
  liquidAssetsAtRetirement: number;
  totalLiquidAssetsSuperAndStockAtRetirement: number;
  propertyEquityAtRetirement: number;
  debtAtRetirement: number;
  totalAssetsAtRetirement: number;
  selectedLifestyleDryAge: number | null;
  selectedLifestyleDryCalendarYear: number | null;
  selectedLifestyleSurvivesToAge90: boolean;
  requiredLiquidCapitalForLifestyle: number;
  explicitSuperSavingsGap: number;
  offsetInterestSavedMonthly: number;
  projectedMonthlyMortgageInterestNow: number;
  recommendedRealEstateSaleAge: number;
  recommendedRealEstateSaleCalendarYear: number;
  realEstateSaleNetProceeds: number;
  downsizerContributionAmount: number;
  saleExcessToStockPortfolio: number;
  downsizerSaleAssetDescription: string;
  plannedPropertySaleNetProceeds: number;
  plannedPropertySaleCalendarYear: number | null;
  plannedPropertySaleInvestmentDestination: PropertySaleInvestmentDestination;
  propertyPurchaseAssessment: PropertyPurchaseAssessment;
  yearlyAssetPoints: AssetPoint[];
  assetChartEntries: AssetPoint[];
  selectedDrawdownPoints: DrawdownPoint[];
  lifestyleScenarioDrawdownPoints: Record<LifestyleTier, DrawdownPoint[]>;
};
