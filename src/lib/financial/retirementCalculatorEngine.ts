import {
  DEFAULT_PROFILE,
  FINANCIAL_CONSTANTS,
  LIFESTYLE_DEFINITIONS,
} from "./constants";
import type {
  AssetPoint,
  DrawdownPoint,
  LifestyleTier,
  ProjectionResult,
  PropertyPurchaseAssessment,
  UserProfile,
} from "./types";

type SimulationSnapshot = {
  age: number;
  year: number;
  superUser: number;
  superSpouse: number;
  stockPortfolio: number;
  cashOffset: number;
  propertyValue: number;
  homeLoanDebt: number;
  primaryPropertyValue: number;
  primaryHomeLoanDebt: number;
  investmentPropertyValue: number;
  investmentPropertyDebt: number;
  activeHousingPayment: number;
  replacementPropertyBought: boolean;
};

type PlannedPropertySaleResult = {
  saleApplied: boolean;
  saleYear: number | null;
  netProceeds: number;
};

const MONTHS_PER_YEAR = 12;

export function annualToMonthlyRate(annualRatePercent: number) {
  return Math.pow(1 + annualRatePercent / 100, 1 / MONTHS_PER_YEAR) - 1;
}

export function calculateInflatedTarget(
  currentTarget: number,
  annualInflationRate: number,
  years: number,
) {
  return currentTarget * Math.pow(1 + annualInflationRate / 100, years);
}

export function applyConcessionalContributionTax(monthlyContribution: number) {
  const monthlyCap =
    FINANCIAL_CONSTANTS.concessionalContributionCapAnnual / MONTHS_PER_YEAR;
  const taxedConcessional = Math.min(monthlyContribution, monthlyCap);
  const excessContribution = Math.max(0, monthlyContribution - monthlyCap);

  return (
    taxedConcessional *
      (1 - FINANCIAL_CONSTANTS.contributionsTaxRate / 100) +
    excessContribution
  );
}

export function projectStockPortfolio(
  startingBalance: number,
  monthlyInvestment: number,
  months: number,
) {
  const monthlyReturn = annualToMonthlyRate(
    FINANCIAL_CONSTANTS.stockNominalAnnualReturn,
  );

  if (monthlyReturn === 0) {
    return startingBalance + monthlyInvestment * months;
  }

  return (
    startingBalance * Math.pow(1 + monthlyReturn, months) +
    monthlyInvestment *
      ((Math.pow(1 + monthlyReturn, months) - 1) / monthlyReturn)
  );
}

export function calculateMortgagePayment(
  principal: number,
  annualInterestRate: number,
  termYears: number = FINANCIAL_CONSTANTS.mortgageTermYears,
) {
  if (principal <= 0) {
    return 0;
  }

  const monthlyRate = annualInterestRate / 100 / MONTHS_PER_YEAR;
  const payments = Math.max(1, Math.round(termYears * MONTHS_PER_YEAR));

  if (monthlyRate === 0) {
    return principal / payments;
  }

  return (
    (principal * monthlyRate * Math.pow(1 + monthlyRate, payments)) /
    (Math.pow(1 + monthlyRate, payments) - 1)
  );
}

export function calculateMonthlyMortgageInterest(
  homeLoanDebt: number,
  offsetAndSavingsBalance: number,
  annualInterestRate: number,
) {
  const effectiveDebt = Math.max(0, homeLoanDebt - offsetAndSavingsBalance);
  return effectiveDebt * (annualInterestRate / 100 / MONTHS_PER_YEAR);
}

function calculateScheduledDebtPayment(
  debt: number,
  enteredMonthlyPayment: number,
  annualInterestRate: number,
  termYears: number = FINANCIAL_CONSTANTS.mortgageTermYears,
) {
  if (debt <= 0) {
    return 0;
  }

  return Math.max(
    enteredMonthlyPayment,
    calculateMortgagePayment(debt, annualInterestRate, termYears),
  );
}

function calculateRemainingLoanTermYears(
  profile: UserProfile,
  currentCalendarYear: number,
) {
  const loanEndYear = profile.loanStartYear + profile.loanTermYears;

  return Math.max(1 / MONTHS_PER_YEAR, loanEndYear - currentCalendarYear);
}

export function calculateMonthlyUnallocatedSurplus(
  profile: UserProfile,
  activeLoanPayment: number,
) {
  return Math.max(
    0,
    profile.netTakeHomePayMonthly -
      profile.fixedLivingCosts -
      profile.monthlyLivingDiscretionary -
      profile.rentMortgageMonthlyCost -
      activeLoanPayment -
      profile.monthlyInvestmentPropertyPayment -
      profile.monthlyStockInvestment -
      profile.monthlyAfterTaxSuperInvestment +
      profile.monthlyInvestmentPropertyRentalIncome,
  );
}

export function allocateDownsizerSale(realEstateSaleNetProceeds: number) {
  const downsizerContributionAmount = Math.min(
    FINANCIAL_CONSTANTS.downsizerContributionCapCombined,
    Math.max(0, realEstateSaleNetProceeds),
  );

  return {
    downsizerContributionAmount,
    saleExcessToStockPortfolio: Math.max(
      0,
      realEstateSaleNetProceeds - downsizerContributionAmount,
    ),
  };
}

export function getLifestyleTarget(profile: UserProfile, tier = profile.lifestyleTier) {
  if (tier === "custom") {
    return profile.customAnnualLifestyleTarget;
  }

  return LIFESTYLE_DEFINITIONS[tier].annualTarget;
}

export function assessReplacementPropertyPurchase(
  profile: UserProfile,
  propertyValueAtPurchase: number,
  debtAtPurchase: number,
  cashAtPurchase: number,
  purchaseYear = profile.targetNewPropertyYear,
): PropertyPurchaseAssessment {
  if (!profile.planToBuyNewProperty) {
    return {
      willPurchase: false,
      purchaseYear,
      requiredDeposit: 0,
      purchaseCosts: 0,
      requiredCashForPurchase: 0,
      availableCashAndEquity: cashAtPurchase,
      newDebt: debtAtPurchase,
      requiredMonthlyPaymentAfterPurchase: 0,
      availableMonthlyCashFlowForNewLoan: 0,
      monthlyServiceabilityShortfall: 0,
      isLoanServiceable: true,
      affordableReplacementPropertyValue: 0,
      requiredPriceReduction: 0,
    };
  }

  const targetValue = profile.targetNewPropertyValue;
  const requiredDeposit =
    targetValue * (FINANCIAL_CONSTANTS.depositRequirementRate / 100);
  const purchaseCosts =
    targetValue * (FINANCIAL_CONSTANTS.purchaseCostRate / 100);
  const requiredCashForPurchase = requiredDeposit + purchaseCosts;
  const availableCashAndEquity = cashAtPurchase;
  const shortfallForCashRequirement = Math.max(
    0,
    requiredCashForPurchase - availableCashAndEquity,
  );
  const newDebt =
    targetValue * (1 - FINANCIAL_CONSTANTS.depositRequirementRate / 100) +
    shortfallForCashRequirement;
  const requiredMonthlyPaymentAfterPurchase = calculateMortgagePayment(
    newDebt,
    profile.mortgageInterestRate,
    profile.loanTermYears,
  );
  const availableMonthlyCashFlowForNewLoan = Math.max(
    0,
    profile.netTakeHomePayMonthly -
      profile.rentMortgageMonthlyCost -
      profile.fixedLivingCosts -
      profile.monthlyLivingDiscretionary -
      profile.monthlyHomeLoanPayment -
      profile.monthlyInvestmentPropertyPayment -
      profile.monthlyStockInvestment -
      profile.monthlyAfterTaxSuperInvestment +
      profile.monthlyInvestmentPropertyRentalIncome,
  );
  const monthlyServiceabilityShortfall = Math.max(
    0,
    requiredMonthlyPaymentAfterPurchase - availableMonthlyCashFlowForNewLoan,
  );
  const affordableReplacementPropertyValue = solveAffordablePropertyValue(
    profile,
    availableCashAndEquity,
    availableMonthlyCashFlowForNewLoan,
  );

  return {
    willPurchase: true,
    purchaseYear,
    requiredDeposit,
    purchaseCosts,
    requiredCashForPurchase,
    availableCashAndEquity,
    newDebt,
    requiredMonthlyPaymentAfterPurchase,
    availableMonthlyCashFlowForNewLoan,
    monthlyServiceabilityShortfall,
    isLoanServiceable: monthlyServiceabilityShortfall === 0,
    affordableReplacementPropertyValue,
    requiredPriceReduction: Math.max(
      0,
      targetValue - affordableReplacementPropertyValue,
    ),
  };
}

export function calculateRetirementProjection(
  inputProfile: UserProfile = DEFAULT_PROFILE,
  currentCalendarYear = new Date().getFullYear(),
): ProjectionResult {
  const profile = normalizeProfile(inputProfile, currentCalendarYear);
  const yearsUntilRetirement = Math.max(
    0,
    profile.targetRetirementAge - profile.currentAge,
  );
  const currentAnnualLifestyleTarget = getLifestyleTarget(profile);
  const annualRequiredIncomeAtRetirement = calculateInflatedTarget(
    currentAnnualLifestyleTarget,
    profile.annualInflationRate,
    yearsUntilRetirement,
  );

  const simulation = simulateAccumulation(profile, currentCalendarYear);
  const retirementSnapshot =
    simulation.retirementSnapshot ?? simulation.snapshots.at(-1)!;
  const totalSuperAtRetirement =
    retirementSnapshot.superUser + retirementSnapshot.superSpouse;
  const liquidAssetsAtRetirement =
    totalSuperAtRetirement +
    retirementSnapshot.stockPortfolio +
    retirementSnapshot.cashOffset;
  const totalLiquidAssetsSuperAndStockAtRetirement =
    totalSuperAtRetirement + retirementSnapshot.stockPortfolio;
  const propertyEquityAtRetirement = Math.max(
    0,
    retirementSnapshot.propertyValue - retirementSnapshot.homeLoanDebt,
  );
  const requiredLiquidCapitalForLifestyle = calculateRequiredLiquidCapital(
    annualRequiredIncomeAtRetirement,
    profile.annualInflationRate,
    profile.targetRetirementAge,
  );

  const preliminaryDrawdown = simulateDrawdown({
    profile,
    retirementSnapshot,
    annualSpendAtRetirement: annualRequiredIncomeAtRetirement,
    tier: profile.lifestyleTier,
    currentCalendarYear,
    saleAge: null,
  });
  const preliminaryDryPoint = preliminaryDrawdown.points.find(
    (point) => point.liquidAssets <= 0,
  );
  const recommendedRealEstateSaleAge = preliminaryDryPoint
    ? Math.max(profile.targetRetirementAge, preliminaryDryPoint.age - 5)
    : 85;
  const salePlan = calculateDownsizerSale(
    profile,
    retirementSnapshot,
    recommendedRealEstateSaleAge,
  );
  const selectedDrawdown = simulateDrawdown({
    profile,
    retirementSnapshot,
    annualSpendAtRetirement: annualRequiredIncomeAtRetirement,
    tier: profile.lifestyleTier,
    currentCalendarYear,
    saleAge: recommendedRealEstateSaleAge,
    salePlan,
  });
  const selectedDryPoint = selectedDrawdown.points.find(
    (point) => point.liquidAssets <= 0,
  );
  const lifestyleScenarioDrawdownPoints = buildLifestyleScenarios(
    profile,
    retirementSnapshot,
    currentCalendarYear,
  );

  const activeDebtNow = Math.max(
    0,
    profile.homeLoanDebt - profile.offsetAndSavingsBalance,
  );
  const projectedMonthlyMortgageInterestNow =
    activeDebtNow * (profile.mortgageInterestRate / 100 / MONTHS_PER_YEAR);
  const offsetInterestSavedMonthly =
    Math.min(profile.homeLoanDebt, profile.offsetAndSavingsBalance) *
    (profile.mortgageInterestRate / 100 / MONTHS_PER_YEAR);

  return {
    currentAnnualLifestyleTarget,
    annualRequiredIncomeAtRetirement,
    yearsUntilRetirement,
    totalSuperAtRetirement,
    stockPortfolioAtRetirement: retirementSnapshot.stockPortfolio,
    liquidAssetsAtRetirement,
    totalLiquidAssetsSuperAndStockAtRetirement,
    propertyEquityAtRetirement,
    debtAtRetirement: retirementSnapshot.homeLoanDebt,
    totalAssetsAtRetirement:
      liquidAssetsAtRetirement + propertyEquityAtRetirement,
    selectedLifestyleDryAge: selectedDryPoint?.age ?? null,
    selectedLifestyleDryCalendarYear: selectedDryPoint?.year ?? null,
    selectedLifestyleSurvivesToAge90: !selectedDryPoint,
    requiredLiquidCapitalForLifestyle,
    explicitSuperSavingsGap: Math.max(
      0,
      requiredLiquidCapitalForLifestyle - totalSuperAtRetirement,
    ),
    offsetInterestSavedMonthly,
    projectedMonthlyMortgageInterestNow,
    recommendedRealEstateSaleAge,
    recommendedRealEstateSaleCalendarYear:
      currentCalendarYear + (recommendedRealEstateSaleAge - profile.currentAge),
    realEstateSaleNetProceeds: salePlan.realEstateSaleNetProceeds,
    downsizerContributionAmount: salePlan.downsizerContributionAmount,
    saleExcessToStockPortfolio: salePlan.saleExcessToStockPortfolio,
    downsizerSaleAssetDescription: simulation.replacementPropertyBought
      ? "newly purchased replacement home"
      : "current primary residence",
    plannedPropertySaleNetProceeds: simulation.plannedPropertySale.netProceeds,
    plannedPropertySaleCalendarYear: simulation.plannedPropertySale.saleYear,
    plannedPropertySaleInvestmentDestination:
      profile.propertySaleInvestmentDestination,
    propertyPurchaseAssessment: simulation.propertyPurchaseAssessment,
    yearlyAssetPoints: simulation.yearlyAssetPoints,
    assetChartEntries: simulation.yearlyAssetPoints.filter(
      (point) => point.age <= profile.targetRetirementAge,
    ),
    selectedDrawdownPoints: selectedDrawdown.points,
    lifestyleScenarioDrawdownPoints,
  };
}

function normalizeProfile(
  profile: UserProfile,
  currentCalendarYear = new Date().getFullYear(),
): UserProfile {
  const monthlyAfterTaxSuperInvestment =
    profile.monthlyPostTaxContributionsUser +
    profile.monthlyPostTaxContributionsSpouse;

  return {
    ...profile,
    annualInflationRate: profile.annualInflationRate ?? 2.5,
    propertyGrowthRate: profile.propertyGrowthRate ?? 5,
    monthlyAfterTaxSuperInvestment,
    monthlyInvestmentPropertyRentalIncome:
      profile.monthlyInvestmentPropertyRentalIncome ?? 0,
    housingSituation: profile.housingSituation ?? "livingInOwnProperty",
    monthlyHomeLoanPayment:
      profile.monthlyHomeLoanPayment ?? profile.rentMortgageMonthlyCost,
    loanStartYear: profile.loanStartYear ?? currentCalendarYear - 5,
    loanTermYears:
      profile.loanTermYears ?? FINANCIAL_CONSTANTS.mortgageTermYears,
    planToSellPropertyInFuture: profile.planToSellPropertyInFuture ?? false,
    targetPropertySaleYear:
      profile.targetPropertySaleYear ??
      new Date().getFullYear() +
        Math.max(0, profile.targetRetirementAge - profile.currentAge),
    propertySaleInvestmentDestination:
      profile.propertySaleInvestmentDestination ?? "stock",
  };
}

function simulateAccumulation(profile: UserProfile, currentCalendarYear: number) {
  const superMonthlyReturn = annualToMonthlyRate(
    FINANCIAL_CONSTANTS.superNetAnnualReturn,
  );
  const stockMonthlyReturn = annualToMonthlyRate(
    FINANCIAL_CONSTANTS.stockNominalAnnualReturn,
  );
  const propertyMonthlyGrowth = annualToMonthlyRate(profile.propertyGrowthRate);
  const terminalMonths =
    (FINANCIAL_CONSTANTS.terminalAge - profile.currentAge) * MONTHS_PER_YEAR;
  const retirementMonth =
    Math.max(0, profile.targetRetirementAge - profile.currentAge) *
    MONTHS_PER_YEAR;
  const remainingExistingLoanTermYears = calculateRemainingLoanTermYears(
    profile,
    currentCalendarYear,
  );

  let superUser = profile.currentSuperBalanceUser;
  let superSpouse = profile.currentSuperBalanceSpouse;
  let stockPortfolio = profile.currentStockPortfolioBalance;
  let cashOffset = profile.offsetAndSavingsBalance;
  let primaryPropertyValue =
    profile.ownsProperty && profile.housingSituation === "livingInOwnProperty"
      ? profile.currentPropertyAssetValue
      : 0;
  let primaryHomeLoanDebt =
    profile.ownsProperty && profile.housingSituation === "livingInOwnProperty"
      ? profile.homeLoanDebt
      : 0;
  let investmentPropertyValue =
    profile.ownsProperty && profile.housingSituation === "rentingOutside"
      ? profile.currentPropertyAssetValue
      : 0;
  let investmentPropertyDebt =
    profile.ownsProperty && profile.housingSituation === "rentingOutside"
      ? profile.homeLoanDebt
      : 0;
  let propertyValue = primaryPropertyValue + investmentPropertyValue;
  let homeLoanDebt = primaryHomeLoanDebt + investmentPropertyDebt;
  let activeHousingPayment =
    primaryHomeLoanDebt > 0
      ? calculateScheduledDebtPayment(
          primaryHomeLoanDebt,
          profile.monthlyHomeLoanPayment,
          profile.mortgageInterestRate,
          remainingExistingLoanTermYears,
        )
      : 0;
  let investmentDebtPayment = calculateScheduledDebtPayment(
    investmentPropertyDebt,
    investmentPropertyValue > 0
      ? profile.monthlyInvestmentPropertyPayment +
          profile.monthlyInvestmentPropertyRentalIncome
      : 0,
    profile.mortgageInterestRate,
    remainingExistingLoanTermYears,
  );
  let replacementPropertyBought = false;
  let plannedPropertySale: PlannedPropertySaleResult = {
    saleApplied: false,
    saleYear: null,
    netProceeds: 0,
  };
  let retirementSnapshot: SimulationSnapshot | null = null;
  let propertyPurchaseAssessment = assessReplacementPropertyPurchase(
    profile,
    propertyValue,
    homeLoanDebt,
    cashOffset,
  );
  const yearlyAssetPoints: AssetPoint[] = [];
  const snapshots: SimulationSnapshot[] = [];

  for (let month = 0; month <= terminalMonths; month += 1) {
    const age = profile.currentAge + month / MONTHS_PER_YEAR;
    const year = currentCalendarYear + Math.floor(month / MONTHS_PER_YEAR);

    if (month % MONTHS_PER_YEAR === 0) {
      yearlyAssetPoints.push(
        buildAssetPoint({
          age,
          year,
          superUser,
          superSpouse,
          stockPortfolio,
          cashOffset,
          propertyValue,
          homeLoanDebt,
          primaryPropertyValue,
          primaryHomeLoanDebt,
          investmentPropertyValue,
          investmentPropertyDebt,
          activeHousingPayment,
          replacementPropertyBought,
        }),
      );
    }

    if (month === retirementMonth) {
      retirementSnapshot = {
        age,
        year,
        superUser,
        superSpouse,
        stockPortfolio,
        cashOffset,
        propertyValue,
        homeLoanDebt,
        primaryPropertyValue,
        primaryHomeLoanDebt,
        investmentPropertyValue,
        investmentPropertyDebt,
        activeHousingPayment,
        replacementPropertyBought,
      };
    }

    snapshots.push({
      age,
      year,
      superUser,
      superSpouse,
      stockPortfolio,
      cashOffset,
      propertyValue,
      homeLoanDebt,
      primaryPropertyValue,
      primaryHomeLoanDebt,
      investmentPropertyValue,
      investmentPropertyDebt,
      activeHousingPayment,
      replacementPropertyBought,
    });

    if (month === terminalMonths) {
      break;
    }

    if (
      profile.planToBuyNewProperty &&
      !replacementPropertyBought &&
      month % MONTHS_PER_YEAR === 0 &&
      year === profile.targetNewPropertyYear
    ) {
      propertyPurchaseAssessment = assessReplacementPropertyPurchase(
        profile,
        propertyValue,
        homeLoanDebt,
        cashOffset,
        year,
      );

      const cashAfterPurchase = Math.max(
        0,
        propertyPurchaseAssessment.availableCashAndEquity -
          propertyPurchaseAssessment.requiredCashForPurchase,
      );
      cashOffset = cashAfterPurchase;
      if (primaryPropertyValue > 0) {
        investmentPropertyValue += primaryPropertyValue;
        investmentPropertyDebt += primaryHomeLoanDebt;
      }
      investmentDebtPayment = calculateScheduledDebtPayment(
        investmentPropertyDebt,
        profile.monthlyInvestmentPropertyPayment +
          profile.monthlyInvestmentPropertyRentalIncome,
        profile.mortgageInterestRate,
        remainingExistingLoanTermYears,
      );
      primaryPropertyValue = profile.targetNewPropertyValue;
      primaryHomeLoanDebt = propertyPurchaseAssessment.newDebt;
      propertyValue = primaryPropertyValue + investmentPropertyValue;
      homeLoanDebt = primaryHomeLoanDebt + investmentPropertyDebt;
      activeHousingPayment =
        propertyPurchaseAssessment.requiredMonthlyPaymentAfterPurchase;
      replacementPropertyBought = true;
    }

    if (
      profile.planToSellPropertyInFuture &&
      !plannedPropertySale.saleApplied &&
      month % MONTHS_PER_YEAR === 0 &&
      year === profile.targetPropertySaleYear &&
      investmentPropertyValue > 0
    ) {
      const netProceeds = Math.max(
        0,
        investmentPropertyValue *
          (1 - FINANCIAL_CONSTANTS.sellingFeeRate / 100) -
          investmentPropertyDebt,
      );

      if (profile.propertySaleInvestmentDestination === "super") {
        superUser += netProceeds / 2;
        superSpouse += netProceeds / 2;
      } else {
        stockPortfolio += netProceeds;
      }

      investmentPropertyValue = 0;
      investmentPropertyDebt = 0;
      investmentDebtPayment = 0;
      propertyValue = primaryPropertyValue;
      homeLoanDebt = primaryHomeLoanDebt;
      plannedPropertySale = {
        saleApplied: true,
        saleYear: year,
        netProceeds,
      };
    }

    const monthlyMortgageInterest = calculateMonthlyMortgageInterest(
      primaryHomeLoanDebt,
      cashOffset,
      profile.mortgageInterestRate,
    );
    const principalPayment =
      primaryPropertyValue > 0
        ? Math.max(0, activeHousingPayment - monthlyMortgageInterest)
        : 0;
    primaryHomeLoanDebt = Math.max(0, primaryHomeLoanDebt - principalPayment);

    const investmentMonthlyInterest =
      investmentPropertyDebt * (profile.mortgageInterestRate / 100 / MONTHS_PER_YEAR);
    const investmentPrincipalPayment =
      investmentPropertyValue > 0
        ? Math.max(0, investmentDebtPayment - investmentMonthlyInterest)
        : 0;
    investmentPropertyDebt = Math.max(
      0,
      investmentPropertyDebt - investmentPrincipalPayment,
    );

    primaryPropertyValue *= 1 + propertyMonthlyGrowth;
    investmentPropertyValue *= 1 + propertyMonthlyGrowth;
    propertyValue = primaryPropertyValue + investmentPropertyValue;
    homeLoanDebt = primaryHomeLoanDebt + investmentPropertyDebt;
    superUser =
      superUser * (1 + superMonthlyReturn) +
      applyConcessionalContributionTax(profile.monthlyPreTaxContributionsUser) +
      profile.monthlyPostTaxContributionsUser;
    superSpouse =
      superSpouse * (1 + superMonthlyReturn) +
      applyConcessionalContributionTax(
        profile.monthlyPreTaxContributionsSpouse,
      ) +
      profile.monthlyPostTaxContributionsSpouse;
    const monthlyUnallocatedSurplus = calculateMonthlyUnallocatedSurplus(
      profile,
      activeHousingPayment,
    );
    stockPortfolio =
      stockPortfolio * (1 + stockMonthlyReturn) +
      profile.monthlyStockInvestment +
      monthlyUnallocatedSurplus;
  }

  return {
    yearlyAssetPoints,
    snapshots,
    retirementSnapshot,
    replacementPropertyBought,
    propertyPurchaseAssessment,
    plannedPropertySale,
  };
}

function simulateDrawdown({
  profile,
  retirementSnapshot,
  annualSpendAtRetirement,
  tier,
  currentCalendarYear,
  saleAge,
  salePlan,
}: {
  profile: UserProfile;
  retirementSnapshot: SimulationSnapshot;
  annualSpendAtRetirement: number;
  tier: LifestyleTier;
  currentCalendarYear: number;
  saleAge: number | null;
  salePlan?: ReturnType<typeof calculateDownsizerSale>;
}) {
  const drawdownMonthlyReturn = annualToMonthlyRate(
    FINANCIAL_CONSTANTS.pensionPhaseAnnualReturn,
  );
  const monthlyInflation = annualToMonthlyRate(profile.annualInflationRate);
  let superBalance =
    retirementSnapshot.superUser + retirementSnapshot.superSpouse;
  let stockPortfolio = retirementSnapshot.stockPortfolio;
  let cashOffset = retirementSnapshot.cashOffset;
  let monthlySpend = annualSpendAtRetirement / MONTHS_PER_YEAR;
  let outstandingDebt = retirementSnapshot.homeLoanDebt;
  let activeHousingPayment = retirementSnapshot.activeHousingPayment;
  let saleApplied = false;
  const points: DrawdownPoint[] = [];
  const startMonth =
    Math.max(0, profile.targetRetirementAge - profile.currentAge) *
    MONTHS_PER_YEAR;
  const terminalMonth =
    (FINANCIAL_CONSTANTS.terminalAge - profile.currentAge) * MONTHS_PER_YEAR;

  for (let month = startMonth; month <= terminalMonth; month += 1) {
    const age = profile.currentAge + month / MONTHS_PER_YEAR;
    const year = currentCalendarYear + Math.floor(month / MONTHS_PER_YEAR);

    if (
      saleAge !== null &&
      !saleApplied &&
      age >= saleAge &&
      salePlan &&
      salePlan.realEstateSaleNetProceeds > 0
    ) {
      superBalance += salePlan.downsizerContributionAmount;
      stockPortfolio += salePlan.saleExcessToStockPortfolio;
      outstandingDebt = 0;
      activeHousingPayment = 0;
      saleApplied = true;
    }

    const monthlyDebtInterest =
      outstandingDebt * (profile.mortgageInterestRate / 100 / MONTHS_PER_YEAR);
    const monthlyDebtPayment =
      outstandingDebt > 0
        ? Math.min(activeHousingPayment, outstandingDebt + monthlyDebtInterest)
        : 0;
    const principalPayment = Math.max(0, monthlyDebtPayment - monthlyDebtInterest);
    outstandingDebt = Math.max(0, outstandingDebt - principalPayment);

    const rentalIncomeOffset = profile.monthlyInvestmentPropertyRentalIncome;
    const totalMonthlyDrawdown = Math.max(
      0,
      monthlySpend + monthlyDebtPayment - rentalIncomeOffset,
    );

    let remainingSpend = totalMonthlyDrawdown;
    const fromCash = Math.min(cashOffset, remainingSpend);
    cashOffset -= fromCash;
    remainingSpend -= fromCash;

    const fromStocks = Math.min(stockPortfolio, remainingSpend);
    stockPortfolio -= fromStocks;
    remainingSpend -= fromStocks;

    const fromSuper = Math.min(superBalance, remainingSpend);
    superBalance -= fromSuper;

    superBalance *= 1 + drawdownMonthlyReturn;
    stockPortfolio *= 1 + drawdownMonthlyReturn;
    cashOffset *= 1 + drawdownMonthlyReturn;

    const liquidAssets = Math.max(0, superBalance + stockPortfolio + cashOffset);

    if ((month - startMonth) % MONTHS_PER_YEAR === 0 || liquidAssets <= 0) {
      points.push({
        age,
        year,
        liquidAssets,
        superBalance,
        stockPortfolio,
        cashOffset,
        annualSpend: totalMonthlyDrawdown * MONTHS_PER_YEAR,
        lifestyleTier: tier,
      });
    }

    if (liquidAssets <= 0) {
      break;
    }

    monthlySpend *= 1 + monthlyInflation;
  }

  return { points };
}

function buildLifestyleScenarios(
  profile: UserProfile,
  retirementSnapshot: SimulationSnapshot,
  currentCalendarYear: number,
) {
  return (Object.keys(LIFESTYLE_DEFINITIONS) as LifestyleTier[]).reduce(
    (scenarios, tier) => {
      const target = calculateInflatedTarget(
        tier === "custom"
          ? profile.customAnnualLifestyleTarget
          : LIFESTYLE_DEFINITIONS[tier].annualTarget,
        profile.annualInflationRate,
        Math.max(0, profile.targetRetirementAge - profile.currentAge),
      );

      scenarios[tier] = simulateDrawdown({
        profile,
        retirementSnapshot,
        annualSpendAtRetirement: target,
        tier,
        currentCalendarYear,
        saleAge: null,
      }).points;

      return scenarios;
    },
    {} as Record<LifestyleTier, DrawdownPoint[]>,
  );
}

function calculateRequiredLiquidCapital(
  annualSpendAtRetirement: number,
  annualInflationRate: number,
  retirementAge: number,
) {
  const monthlyDiscountRate = annualToMonthlyRate(
    FINANCIAL_CONSTANTS.pensionPhaseAnnualReturn,
  );
  const monthlyInflationRate = annualToMonthlyRate(annualInflationRate);
  const months = Math.max(
    0,
    FINANCIAL_CONSTANTS.terminalAge - retirementAge,
  ) * MONTHS_PER_YEAR;
  let requiredCapital = 0;
  let monthlySpend = annualSpendAtRetirement / MONTHS_PER_YEAR;

  for (let month = 1; month <= months; month += 1) {
    requiredCapital += monthlySpend / Math.pow(1 + monthlyDiscountRate, month);
    monthlySpend *= 1 + monthlyInflationRate;
  }

  return requiredCapital;
}

function calculateDownsizerSale(
  profile: UserProfile,
  retirementSnapshot: SimulationSnapshot,
  saleAge: number,
) {
  const salePropertyValue =
    retirementSnapshot.primaryPropertyValue || retirementSnapshot.propertyValue;
  const salePropertyDebt =
    retirementSnapshot.primaryHomeLoanDebt || retirementSnapshot.homeLoanDebt;

  if (salePropertyValue <= 0) {
    return {
      realEstateSaleNetProceeds: 0,
      downsizerContributionAmount: 0,
      saleExcessToStockPortfolio: 0,
    };
  }

  const yearsAfterRetirement = Math.max(0, saleAge - retirementSnapshot.age);
  const propertyValueAtSale =
    salePropertyValue *
    Math.pow(1 + profile.propertyGrowthRate / 100, yearsAfterRetirement);
  const estimatedDebtAtSale = Math.max(
    0,
    salePropertyDebt -
      retirementSnapshot.activeHousingPayment * MONTHS_PER_YEAR * yearsAfterRetirement,
  );
  const realEstateSaleNetProceeds = Math.max(
    0,
    propertyValueAtSale * (1 - FINANCIAL_CONSTANTS.sellingFeeRate / 100) -
      estimatedDebtAtSale,
  );
  const saleAllocation = allocateDownsizerSale(realEstateSaleNetProceeds);

  return {
    realEstateSaleNetProceeds,
    ...saleAllocation,
  };
}

function buildAssetPoint(snapshot: SimulationSnapshot): AssetPoint {
  const superBalance = snapshot.superUser + snapshot.superSpouse;
  const propertyEquity = Math.max(
    0,
    snapshot.propertyValue - snapshot.homeLoanDebt,
  );
  const totalLiquidAssets =
    superBalance + snapshot.stockPortfolio + snapshot.cashOffset;

  return {
    age: Number(snapshot.age.toFixed(2)),
    year: snapshot.year,
    superBalance,
    stockPortfolio: snapshot.stockPortfolio,
    propertyEquity,
    cashOffset: snapshot.cashOffset,
    totalLiquidAssets,
    totalAssets: totalLiquidAssets + propertyEquity,
    homeLoanDebt: snapshot.homeLoanDebt,
  };
}

function solveAffordablePropertyValue(
  profile: UserProfile,
  availableCashAndEquity: number,
  monthlyCapacity: number,
) {
  let low = 0;
  let high = Math.max(profile.targetNewPropertyValue, availableCashAndEquity * 5);

  for (let iteration = 0; iteration < 60; iteration += 1) {
    const candidate = (low + high) / 2;
    const requiredCashForPurchase =
      candidate *
      ((FINANCIAL_CONSTANTS.depositRequirementRate +
        FINANCIAL_CONSTANTS.purchaseCostRate) /
        100);
    const shortfall = Math.max(
      0,
      requiredCashForPurchase - availableCashAndEquity,
    );
    const candidateDebt =
      candidate * (1 - FINANCIAL_CONSTANTS.depositRequirementRate / 100) +
      shortfall;
    const payment = calculateMortgagePayment(
      candidateDebt,
      profile.mortgageInterestRate,
      profile.loanTermYears,
    );

    if (payment <= monthlyCapacity) {
      low = candidate;
    } else {
      high = candidate;
    }
  }

  return Math.round(low);
}
