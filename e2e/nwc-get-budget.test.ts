import { NWCClient } from "../src/nwc/NWCClient";
import { Nip47WalletError } from "../src/nwc/types";
import { createTestWallet } from "./helpers";

/**
 * E2E test for get_budget using the NWC faucet.
 * Requires network access.
 */
describe("NWC get_budget", () => {
  const BALANCE_SATS = 10_000;

  test(
    "returns budget details, empty object, or NOT_IMPLEMENTED",
    async () => {
      const { nwcUrl } = await createTestWallet(BALANCE_SATS);
      const nwc = new NWCClient({ nostrWalletConnectUrl: nwcUrl });

      try {
        const budgetResult = await nwc.getBudget();
        const hasBudgetFields =
          "used_budget" in budgetResult &&
          "total_budget" in budgetResult &&
          "renewal_period" in budgetResult;

        if (hasBudgetFields) {
          expect(typeof budgetResult.used_budget).toBe("number");
          expect(typeof budgetResult.total_budget).toBe("number");
          expect(typeof budgetResult.renewal_period).toBe("string");
          return;
        }

        expect(budgetResult).toEqual({});
      } catch (error) {
        if (error instanceof Nip47WalletError && error.code === "NOT_IMPLEMENTED") {
          return;
        }
        throw error;
      } finally {
        nwc.close();
      }
    },
    60_000,
  );
});
