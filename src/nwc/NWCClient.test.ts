import "websocket-polyfill";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { bytesToHex } from "@noble/hashes/utils";
import { NWCClient } from "./NWCClient";

/** Synthetic keys for unit tests only (not real wallet credentials). */
const walletSecretKey = generateSecretKey();
const walletPubkeyHex = getPublicKey(walletSecretKey);
const nwcSharedSecretHex = bytesToHex(generateSecretKey());

const TEST_RELAY_PRIMARY = "wss://relay.example.invalid/v1";
const TEST_RELAY_SECONDARY = "wss://relay2.example.invalid/v1";

function nwcTestUri(config: {
  scheme?: "nostr+walletconnect://" | "nostr+walletconnect:" | "nostrwalletconnect:";
  host?: string;
  relays?: "default" | "none" | "empty" | string[];
  secret?: "default" | "omit" | "invalid" | string;
  lud16?: string | "omit";
}): string {
  const scheme = config.scheme ?? "nostr+walletconnect://";
  const host = config.host ?? walletPubkeyHex;
  const params: string[] = [];

  const relayMode = config.relays ?? "default";
  if (relayMode === "none") {
    // intentionally omit relay params
  } else if (relayMode === "empty") {
    params.push("relay=", "relay=%20");
  } else if (relayMode === "default") {
    params.push(
      `relay=${encodeURIComponent(TEST_RELAY_PRIMARY)}`,
      `relay=${encodeURIComponent(TEST_RELAY_SECONDARY)}`,
    );
  } else {
    for (const r of relayMode) {
      params.push(`relay=${encodeURIComponent(r)}`);
    }
  }

  const secretMode = config.secret ?? "default";
  if (secretMode === "omit") {
    // omit secret param
  } else if (secretMode === "invalid") {
    params.push("secret=not_hex");
  } else if (secretMode === "default") {
    params.push(`secret=${nwcSharedSecretHex}`);
  } else {
    params.push(`secret=${encodeURIComponent(secretMode)}`);
  }

  if (config.lud16 !== "omit") {
    params.push(
      `lud16=${encodeURIComponent(config.lud16 ?? "payee@example.invalid")}`,
    );
  }

  const qs = params.length > 0 ? `?${params.join("&")}` : "";
  return `${scheme}${host}${qs}`;
}

const exampleNwcUrl = nwcTestUri({});

describe("parseWalletConnectUrl", () => {
  test("standard protocol", () => {
    const parsed = NWCClient.parseWalletConnectUrl(exampleNwcUrl);
    expect(parsed.walletPubkey).toBe(walletPubkeyHex);
    expect(parsed.secret).toBe(nwcSharedSecretHex);
    expect(parsed.relayUrls).toEqual([
      TEST_RELAY_PRIMARY,
      TEST_RELAY_SECONDARY,
    ]);
    expect(parsed.lud16).toBe("payee@example.invalid");
  });
  test("protocol without double slash", () => {
    const parsed = NWCClient.parseWalletConnectUrl(
      nwcTestUri({ scheme: "nostr+walletconnect:" }),
    );
    expect(parsed.walletPubkey).toBe(walletPubkeyHex);
    expect(parsed.secret).toBe(nwcSharedSecretHex);
    expect(parsed.relayUrls).toEqual([
      TEST_RELAY_PRIMARY,
      TEST_RELAY_SECONDARY,
    ]);
  });
  test("legacy protocol without double slash", () => {
    const parsed = NWCClient.parseWalletConnectUrl(
      nwcTestUri({ scheme: "nostrwalletconnect:" }),
    );
    expect(parsed.walletPubkey).toBe(walletPubkeyHex);
    expect(parsed.secret).toBe(nwcSharedSecretHex);
    expect(parsed.relayUrls).toEqual([
      TEST_RELAY_PRIMARY,
      TEST_RELAY_SECONDARY,
    ]);
  });

  test("rejects npub in host (NIP-47 requires hex pubkey)", () => {
    const url = nwcTestUri({ host: nip19.npubEncode(walletPubkeyHex) });
    expect(() => NWCClient.parseWalletConnectUrl(url)).toThrow(
      "Invalid wallet pubkey in connection string",
    );
  });

  test("rejects nsec in connection string (NIP-47 requires hex secret)", () => {
    const sk = generateSecretKey();
    const nsec = nip19.nsecEncode(sk);
    const url = nwcTestUri({ secret: nsec });
    expect(() => NWCClient.parseWalletConnectUrl(url)).toThrow(
      "Invalid secret in connection string",
    );
  });

  test("constructor accepts nsec as explicit secret option (normalized to hex)", () => {
    const sk = generateSecretKey();
    const nsec = nip19.nsecEncode(sk);
    const hexSecret = bytesToHex(sk);
    const client = new NWCClient({
      nostrWalletConnectUrl: nwcTestUri({ secret: "omit", lud16: "omit" }),
      parseWalletConnectUrlOptions: { requireSecret: false },
      secret: nsec,
    });
    expect(client.secret).toBe(hexSecret);
    expect(client.publicKey).toBe(getPublicKey(sk));
  });

  test("rejects connection string with no relay", () => {
    expect(() =>
      NWCClient.parseWalletConnectUrl(nwcTestUri({ relays: "none" })),
    ).toThrow("No relay URL found in connection string");
  });

  test("rejects connection string with only empty relay params", () => {
    expect(() =>
      NWCClient.parseWalletConnectUrl(nwcTestUri({ relays: "empty" })),
    ).toThrow("No relay URL found in connection string");
  });

  test("rejects invalid relay URL", () => {
    expect(() =>
      NWCClient.parseWalletConnectUrl(
        nwcTestUri({ relays: ["not-a-valid-url"] }),
      ),
    ).toThrow("Invalid relay URL in connection string");
  });

  test("rejects relay URL with unsupported protocol", () => {
    expect(() =>
      NWCClient.parseWalletConnectUrl(
        nwcTestUri({ relays: ["ftp://relay.example.com"] }),
      ),
    ).toThrow("Invalid relay URL in connection string");
  });

  test("rejects relay URL with http or https (NIP-47 uses WebSocket relays)", () => {
    expect(() =>
      NWCClient.parseWalletConnectUrl(
        nwcTestUri({ relays: ["http://relay.example.invalid/v1"] }),
      ),
    ).toThrow("Invalid relay URL in connection string");
    expect(() =>
      NWCClient.parseWalletConnectUrl(
        nwcTestUri({ relays: ["https://relay.example.invalid/v1"] }),
      ),
    ).toThrow("Invalid relay URL in connection string");
  });

  test("rejects invalid wallet pubkey", () => {
    expect(() =>
      NWCClient.parseWalletConnectUrl(nwcTestUri({ host: "not64hex" })),
    ).toThrow("Invalid wallet pubkey in connection string");
  });

  test("rejects wrong-length hex wallet pubkey", () => {
    expect(() =>
      NWCClient.parseWalletConnectUrl(
        nwcTestUri({ host: walletPubkeyHex.slice(0, 62) }),
      ),
    ).toThrow("Invalid wallet pubkey in connection string");
  });

  test("rejects missing secret by default", () => {
    expect(() =>
      NWCClient.parseWalletConnectUrl(
        nwcTestUri({ secret: "omit", lud16: "omit" }),
      ),
    ).toThrow("No secret found in connection string");
  });

  test("allows missing secret when requireSecret is false", () => {
    const parsed = NWCClient.parseWalletConnectUrl(
      nwcTestUri({ secret: "omit", lud16: "omit" }),
      { requireSecret: false },
    );
    expect(parsed.secret).toBeUndefined();
  });

  test("rejects invalid secret", () => {
    expect(() =>
      NWCClient.parseWalletConnectUrl(nwcTestUri({ secret: "invalid" })),
    ).toThrow("Invalid secret in connection string");
  });

  test("constructor merges secret when requireSecret is false", () => {
    const explicitSecret = bytesToHex(generateSecretKey());
    const client = new NWCClient({
      nostrWalletConnectUrl: nwcTestUri({ secret: "omit", lud16: "omit" }),
      parseWalletConnectUrlOptions: { requireSecret: false },
      secret: explicitSecret,
    });
    expect(client.secret).toBe(explicitSecret);
    expect(client.walletPubkey).toBe(walletPubkeyHex);
  });

  test("constructor rejects requireSecret false without explicit secret", () => {
    expect(() =>
      new NWCClient({
        nostrWalletConnectUrl: nwcTestUri({ secret: "omit", lud16: "omit" }),
        parseWalletConnectUrlOptions: { requireSecret: false },
      }),
    ).toThrow(
      "NWCClient requires a client secret: pass `secret` when using parseWalletConnectUrlOptions.requireSecret: false without a secret in the URI",
    );
  });
});

describe("NWCClient", () => {
  test("standard protocol", () => {
    const nwcClient = new NWCClient({ nostrWalletConnectUrl: exampleNwcUrl });
    expect(nwcClient.walletPubkey).toBe(walletPubkeyHex);
    expect(nwcClient.secret).toBe(nwcSharedSecretHex);
    expect(nwcClient.lud16).toBe("payee@example.invalid");
    expect(nwcClient.options.lud16).toBe("payee@example.invalid");
  });

  test("getNostrWalletConnectUrl throws without client secret", () => {
    const client = new NWCClient({
      relayUrls: [TEST_RELAY_PRIMARY],
      walletPubkey: walletPubkeyHex,
    });
    expect(() => client.getNostrWalletConnectUrl()).toThrow(
      "Cannot build Nostr Wallet Connect URL without a client secret",
    );
  });
});

describe("getAuthorizationUrl", () => {
  test("standard url", () => {
    const pubkey =
      "c5dc47856f533dad6c016b979ee3b21f83f88ae0f0058001b67a4b348339fe94";

    expect(
      NWCClient.getAuthorizationUrl(
        "https://my.albyhub.com/apps/new",
        {
          budgetRenewal: "weekly",
          expiresAt: new Date("2023-07-21"),
          maxAmount: 100,
          name: "TestApp",
          returnTo: "https://example.com",
          requestMethods: ["pay_invoice", "get_balance"],
          notificationTypes: ["payment_received", "payment_sent"],
          isolated: true,
          metadata: { message: "hello world" },
        },
        pubkey,
      ).toString(),
    ).toEqual(
      `https://my.albyhub.com/apps/new?name=TestApp&pubkey=${pubkey}&return_to=https%3A%2F%2Fexample.com&budget_renewal=weekly&expires_at=1689897600&max_amount=100&request_methods=pay_invoice+get_balance&notification_types=payment_received+payment_sent&isolated=true&metadata=%7B%22message%22%3A%22hello+world%22%7D`,
    );
  });

  test("hash router url is not supported", () => {
    const pubkey =
      "c5dc47856f533dad6c016b979ee3b21f83f88ae0f0058001b67a4b348339fe94";

    try {
      NWCClient.getAuthorizationUrl(
        "https://my.albyhub.com/#/apps/new",
        {},
        pubkey,
      );
      fail("error should have been thrown");
    } catch (error) {
      expect("" + error).toEqual("Error: hash router paths not supported");
    }
  });
});
