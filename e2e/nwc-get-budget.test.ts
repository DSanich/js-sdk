import { NWCClient } from "../src/nwc/NWCClient";
import { createTestWallet } from "./helpers";

/**
 * E2E test for get_budget using the NWC faucet.
 * Requires network access.
 */
describe("NWC get_budget", () => {
  const BALANCE_SATS = 10_000;

  test(
    "returns budget details",
    async () => {
      const { nwcUrl } = await createTestWallet(BALANCE_SATS);
      const nwc = new NWCClient({ nostrWalletConnectUrl: nwcUrl });

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
