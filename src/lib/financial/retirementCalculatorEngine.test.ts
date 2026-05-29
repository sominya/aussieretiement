import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE } from "./constants";
import {
  allocateDownsizerSale,
  annualToMonthlyRate,
  applyConcessionalContributionTax,
  assessReplacementPropertyPurchase,
  calculateInflatedTarget,
  calculateRetirementProjection,
  projectStockPortfolio,
} from "./retirementCalculatorEngine";

describe("retirementCalculatorEngine", () => {
  it("inflates today's lifestyle target to retirement dollars", () => {
    const futureTarget = calculateInflatedTarget(200_000, 2.5, 20);

    expect(futureTarget).toBeGreaterThan(327_000);
    expect(futureTarget).toBeCloseTo(327_723, 0);
  });

  it("applies contribution tax to concessional super contributions up to the cap", () => {
    expect(applyConcessionalContributionTax(2_500)).toBe(2_125);
    expect(applyConcessionalContributionTax(3_000)).toBe(2_625);
  });

  it("projects stock balances with monthly compounding and monthly investments", () => {
    const months = 24;
    const monthlyReturn = annualToMonthlyRate(10);
    const expected =
      50_000 * Math.pow(1 + monthlyReturn, months) +
      1_000 * ((Math.pow(1 + monthlyReturn, months) - 1) / monthlyReturn);

    expect(projectStockPortfolio(50_000, 1_000, months)).toBeCloseTo(expected);
  });

  it("assesses replacement property serviceability and purchase shortfall", () => {
    const profile = {
      ...DEFAULT_PROFILE,
      netTakeHomePayMonthly: 14_000,
      targetNewPropertyValue: 1_400_000,
      mortgageInterestRate: 6,
      monthlyStockInvestment: 1_000,
      monthlyAfterTaxSuperInvestment: 1_000,
    };

    const assessment = assessReplacementPropertyPurchase(
      profile,
      1_100_000,
      450_000,
      120_000,
      profile.targetNewPropertyYear,
    );

    expect(assessment.requiredCashForPurchase).toBe(350_000);
    expect(assessment.requiredMonthlyPaymentAfterPurchase).toBeGreaterThan(0);
    expect(assessment.availableMonthlyCashFlowForNewLoan).toBeGreaterThan(0);
    expect(assessment.monthlyServiceabilityShortfall).toBeGreaterThanOrEqual(0);
  });

  it("allocates downsizer sale proceeds to super first and excess to stocks", () => {
    const allocation = allocateDownsizerSale(925_000);

    expect(allocation.downsizerContributionAmount).toBe(600_000);
    expect(allocation.saleExcessToStockPortfolio).toBe(325_000);
  });

  it("returns a drawdown depletion age and calendar year when liquid assets run dry", () => {
    const projection = calculateRetirementProjection(
      {
        ...DEFAULT_PROFILE,
        currentAge: 64,
        targetRetirementAge: 65,
        netTakeHomePayMonthly: 0,
        currentSuperBalanceUser: 40_000,
        currentSuperBalanceSpouse: 0,
        currentStockPortfolioBalance: 20_000,
        offsetAndSavingsBalance: 5_000,
        monthlyPreTaxContributionsUser: 0,
        monthlyPreTaxContributionsSpouse: 0,
        monthlyPostTaxContributionsUser: 0,
        monthlyPostTaxContributionsSpouse: 0,
        monthlyAfterTaxSuperInvestment: 0,
        monthlyStockInvestment: 0,
        ownsProperty: false,
        currentPropertyAssetValue: 0,
        homeLoanDebt: 0,
        planToBuyNewProperty: false,
        lifestyleTier: "luxury",
      },
      2026,
    );

    expect(projection.selectedLifestyleDryAge).not.toBeNull();
    expect(projection.selectedLifestyleDryCalendarYear).not.toBeNull();
    expect(projection.selectedLifestyleSurvivesToAge90).toBe(false);
  });

  it("models retirement drawdown monthly with mortgage payments reducing liquid assets", () => {
    const projection = calculateRetirementProjection(
      {
        ...DEFAULT_PROFILE,
        currentAge: 64,
        targetRetirementAge: 65,
        currentSuperBalanceUser: 120_000,
        currentSuperBalanceSpouse: 0,
        currentStockPortfolioBalance: 0,
        offsetAndSavingsBalance: 0,
        monthlyPreTaxContributionsUser: 0,
        monthlyPreTaxContributionsSpouse: 0,
        monthlyPostTaxContributionsUser: 0,
        monthlyPostTaxContributionsSpouse: 0,
        monthlyAfterTaxSuperInvestment: 0,
        monthlyStockInvestment: 0,
        ownsProperty: true,
        housingSituation: "livingInOwnProperty",
        currentPropertyAssetValue: 700_000,
        homeLoanDebt: 450_000,
        monthlyHomeLoanPayment: 4_000,
        planToBuyNewProperty: false,
        planToSellPropertyInFuture: false,
        lifestyleTier: "modest",
      },
      2026,
    );
    const firstPoint = projection.selectedDrawdownPoints[0];
    const secondPoint = projection.selectedDrawdownPoints[1];

    expect(secondPoint.liquidAssets).toBeLessThan(firstPoint.liquidAssets);
    expect(secondPoint.annualSpend).toBeGreaterThan(firstPoint.annualSpend);
  });

  it("amortises home loan debt before retirement even when the entered payment is too low", () => {
    const projection = calculateRetirementProjection(
      {
        ...DEFAULT_PROFILE,
        currentAge: 45,
        targetRetirementAge: 65,
        homeLoanDebt: 450_000,
        offsetAndSavingsBalance: 0,
        monthlyHomeLoanPayment: 0,
        planToBuyNewProperty: false,
        planToSellPropertyInFuture: false,
      },
      2026,
    );

    expect(projection.debtAtRetirement).toBeLessThan(450_000);
  });

  it("automatically invests unallocated monthly surplus into stocks", () => {
    const projection = calculateRetirementProjection(
      {
        ...DEFAULT_PROFILE,
        currentAge: 64,
        targetRetirementAge: 65,
        netTakeHomePayMonthly: 1_000,
        fixedLivingCosts: 0,
        monthlyLivingDiscretionary: 0,
        rentMortgageMonthlyCost: 0,
        monthlyInvestmentPropertyPayment: 0,
        monthlyInvestmentPropertyRentalIncome: 0,
        monthlyStockInvestment: 0,
        currentStockPortfolioBalance: 0,
        offsetAndSavingsBalance: 0,
        monthlyPreTaxContributionsUser: 0,
        monthlyPreTaxContributionsSpouse: 0,
        monthlyPostTaxContributionsUser: 0,
        monthlyPostTaxContributionsSpouse: 0,
        monthlyAfterTaxSuperInvestment: 0,
        ownsProperty: false,
        currentPropertyAssetValue: 0,
        homeLoanDebt: 0,
        planToBuyNewProperty: false,
        planToSellPropertyInFuture: false,
      },
      2026,
    );

    expect(projection.stockPortfolioAtRetirement).toBeGreaterThan(12_000);
  });

  it("moves offset cash into stocks after the home loan is paid off", () => {
    const projection = calculateRetirementProjection(
      {
        ...DEFAULT_PROFILE,
        currentAge: 64,
        targetRetirementAge: 65,
        currentStockPortfolioBalance: 0,
        offsetAndSavingsBalance: 50_000,
        homeLoanDebt: 10_000,
        monthlyHomeLoanPayment: 10_000,
        netTakeHomePayMonthly: 0,
        fixedLivingCosts: 0,
        monthlyLivingDiscretionary: 0,
        rentMortgageMonthlyCost: 0,
        monthlyInvestmentPropertyPayment: 0,
        monthlyInvestmentPropertyRentalIncome: 0,
        monthlyStockInvestment: 0,
        monthlyPreTaxContributionsUser: 0,
        monthlyPreTaxContributionsSpouse: 0,
        monthlyPostTaxContributionsUser: 0,
        monthlyPostTaxContributionsSpouse: 0,
        monthlyAfterTaxSuperInvestment: 0,
        planToBuyNewProperty: false,
        planToSellPropertyInFuture: false,
      },
      2026,
    );

    expect(projection.debtAtRetirement).toBe(0);
    expect(projection.stockPortfolioAtRetirement).toBeGreaterThan(50_000);
  });

  it("keeps offset cash out of stocks until all property debt is paid off", () => {
    const projection = calculateRetirementProjection(
      {
        ...DEFAULT_PROFILE,
        currentAge: 64,
        targetRetirementAge: 65,
        currentStockPortfolioBalance: 0,
        offsetAndSavingsBalance: 50_000,
        ownsProperty: true,
        housingSituation: "rentingOutside",
        currentPropertyAssetValue: 700_000,
        homeLoanDebt: 300_000,
        monthlyHomeLoanPayment: 0,
        monthlyInvestmentPropertyPayment: 1_000,
        monthlyInvestmentPropertyRentalIncome: 0,
        netTakeHomePayMonthly: 0,
        fixedLivingCosts: 0,
        monthlyLivingDiscretionary: 0,
        rentMortgageMonthlyCost: 0,
        monthlyStockInvestment: 0,
        monthlyPreTaxContributionsUser: 0,
        monthlyPreTaxContributionsSpouse: 0,
        monthlyPostTaxContributionsUser: 0,
        monthlyPostTaxContributionsSpouse: 0,
        monthlyAfterTaxSuperInvestment: 0,
        planToBuyNewProperty: false,
        planToSellPropertyInFuture: false,
      },
      2026,
    );

    expect(projection.debtAtRetirement).toBeGreaterThan(0);
    expect(projection.stockPortfolioAtRetirement).toBe(0);
    expect(projection.assetChartEntries.at(-1)?.cashOffset).toBe(50_000);
  });
});
