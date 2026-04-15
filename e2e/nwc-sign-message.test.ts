import { NWCClient } from "../src/nwc/NWCClient";
import { Nip47WalletError } from "../src/nwc/types";
import { createTestWallet } from "./helpers";

/**
 * E2E test for sign_message using the NWC faucet.
 * Requires network access.
 *
 * Faucet connections may list the method but lack the scope; wallets then
 * return RESTRICTED rather than NOT_IMPLEMENTED.
 */
describe("NWC sign_message", () => {
  const BALANCE_SATS = 10_000;

  test(
    "returns a signature when allowed, otherwise RESTRICTED or NOT_IMPLEMENTED",
    async () => {
      const { nwcUrl } = await createTestWallet(BALANCE_SATS);
      const nwc = new NWCClient({ nostrWalletConnectUrl: nwcUrl });

      try {
        const message = "e2e sign_message";
        try {
          const result = await nwc.signMessage({ message });
          expect(result.message).toBe(message);
          expect(result.signature).toBeDefined();
          expect(typeof result.signature).toBe("string");
          expect(result.signature.length).toBeGreaterThan(0);
        } catch (error) {
          if (
            error instanceof Nip47WalletError &&
            (error.code === "NOT_IMPLEMENTED" || error.code === "RESTRICTED")
          ) {
            return;
          }
          throw error;
        }
      } finally {
        nwc.close();
      }
    },
    60_000,
  );
});
