import { NWCClient } from "../src/nwc/NWCClient";

/**
 * E2E test for get_budget using a pre-configured NWC connection.
 * Set E2E_NWC_BUDGET_URL to an NWC URL with an explicit budget configured.
 * Requires network access.
 */
describe("NWC get_budget", () => {
  const budgetNwcUrl = process.env.E2E_NWC_BUDGET_URL;
  const runBudgetTest = budgetNwcUrl ? test : test.skip;

  runBudgetTest(
    "returns budget details",
    async () => {
      const nwc = new NWCClient({ nostrWalletConnectUrl: budgetNwcUrl! });

      try {
        const budgetResult = await nwc.getBudget();
        if (
          !(
            "used_budget" in budgetResult &&
            "total_budget" in budgetResult &&
            "renewal_period" in budgetResult
          )
        ) {
          throw new Error("Expected get_budget to return budget details");
        }

        expect(typeof budgetResult.used_budget).toBe("number");
        expect(typeof budgetResult.total_budget).toBe("number");
        expect(typeof budgetResult.renewal_period).toBe("string");
      } finally {
        nwc.close();
      }
    },
    60_000,
  );
});
