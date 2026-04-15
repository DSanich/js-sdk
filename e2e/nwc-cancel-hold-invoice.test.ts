import { createHash, randomBytes } from "crypto";
import { NWCClient } from "../src/nwc/NWCClient";
import { Nip47WalletError } from "../src/nwc/types";
import { createTestWallet } from "./helpers";

/**
 * E2E test for cancel_hold_invoice using the NWC faucet.
 * Requires network access.
 *
 * Another wallet must start paying the hold before cancel is valid (same idea
 * as settle_hold_invoice). After cancel, pay_invoice rejects — that rejection
 * must be observed synchronously on the promise, otherwise Node/Jest treat it
 * as an unhandled rejection before the next await runs.
 */
describe("NWC cancel_hold_invoice", () => {
  const AMOUNT_MSATS = 100_000; // 100 sats
  const BALANCE_SATS = 10_000;

  test(
    "cancels hold invoice when supported, otherwise NOT_IMPLEMENTED",
    async () => {
      const receiver = await createTestWallet(BALANCE_SATS);
      const sender = await createTestWallet(BALANCE_SATS);

      const receiverClient = new NWCClient({
        nostrWalletConnectUrl: receiver.nwcUrl,
      });
      const senderClient = new NWCClient({ nostrWalletConnectUrl: sender.nwcUrl });

      const preimageHex = randomBytes(32).toString("hex");
      const paymentHash = createHash("sha256")
        .update(Buffer.from(preimageHex, "hex"))
        .digest("hex");

      let payPromise: Promise<unknown> | undefined;
      let payRejectionDrained: Promise<unknown> | undefined;

      try {
        const infoResult = await receiverClient.getInfo();
        const hasHoldMethods =
          infoResult.methods.includes("make_hold_invoice") &&
          infoResult.methods.includes("cancel_hold_invoice");

        if (!hasHoldMethods) {
          await expect(
            receiverClient.cancelHoldInvoice({ payment_hash: paymentHash }),
          ).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
          return;
        }

        const holdInvoiceResult = await receiverClient.makeHoldInvoice({
          amount: AMOUNT_MSATS,
          payment_hash: paymentHash,
          description: "E2E cancel_hold_invoice test",
        });
        expect(holdInvoiceResult.invoice).toMatch(/^ln/);

        payPromise = senderClient.payInvoice({
          invoice: holdInvoiceResult.invoice,
        });
        // Register rejection handler synchronously so cancel does not surface as
        // an unhandled rejection before the next await runs.
        payRejectionDrained = payPromise.catch(() => {});

        await new Promise((resolve) => setTimeout(resolve, 1500));

        const cancelResult = await receiverClient.cancelHoldInvoice({
          payment_hash: paymentHash,
        });
        expect(cancelResult).toEqual({});

        const payOutcome = await payPromise.then(
          () => ({ settled: true as const }),
          (e) => ({ settled: false as const, e }),
        );
        if (payOutcome.settled) {
          throw new Error("Expected pay_invoice to fail after hold cancel");
        }
        if (!(payOutcome.e instanceof Nip47WalletError)) {
          throw payOutcome.e;
        }
        expect(payOutcome.e.message).toMatch(/hold|canceled|cancel/i);
      } finally {
        if (payPromise !== undefined) {
          await payPromise.catch(() => {});
        }
        if (payRejectionDrained !== undefined) {
          await payRejectionDrained;
        }
        receiverClient.close();
        senderClient.close();
      }
    },
    90_000,
  );
});
