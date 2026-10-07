import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";

const webUrl = required("PMS_WEB_URL");
const secret = required("NEXTAUTH_SECRET");
const accessToken = await obtainAccessToken();
const sessionToken = await encode({
  secret,
  token: { accessToken, sub: "frontend-e2e", name: "Frontend E2E" },
  maxAge: 300,
});
const authenticatedHeaders = {
  cookie: `pms.session-token=${sessionToken}`,
  "x-correlation-id": randomUUID(),
};

const response = await fetch(
  `${webUrl}/api/core/reference-data/currencies/DZD?businessDate=2026-01-01`,
  { headers: authenticatedHeaders },
);
if (!response.ok) {
  throw new Error(
    `Authenticated BFF request failed with ${response.status}: ${await response.text()}`,
  );
}
const currency = await response.json();
if (currency.code !== "DZD" || currency.fractionDigits !== 2) {
  throw new Error(`Unexpected BFF response: ${JSON.stringify(currency)}`);
}

const catalogs = [
  ["products", "code", "MUDARABA_STD"],
  ["customers", "customerId", "20000000-0000-4000-8000-000000000001"],
  ["investment-pools", "poolId", "GLOBAL_POOL"],
  ["assets", "assetCode", "MUR-ALPHA-001"],
  ["currencies?businessDate=2026-01-01", "code", "DZD"],
];
for (const [path, field, expected] of catalogs) {
  const catalogResponse = await fetch(`${webUrl}/api/core/${path}`, {
    headers: { ...authenticatedHeaders, "x-correlation-id": randomUUID() },
  });
  if (!catalogResponse.ok) {
    throw new Error(`Catalog ${path} failed with ${catalogResponse.status}: ${await catalogResponse.text()}`);
  }
  const catalog = await catalogResponse.json();
  if (!Array.isArray(catalog.items) || !catalog.items.some((item) => item?.[field] === expected)) {
    throw new Error(`Catalog ${path} is missing seeded ${field}=${expected}: ${JSON.stringify(catalog)}`);
  }
}

const unauthenticatedResponse = await fetch(`${webUrl}/api/core/products`);
if (unauthenticatedResponse.status !== 401) {
  throw new Error(`Catalog without session returned ${unauthenticatedResponse.status}, expected 401`);
}

const customerId = randomUUID();
const customer = await postResource("customers", {
  customerId,
  identityToken: `tok_e2e_customer_${customerId.replaceAll("-", "")}`,
  beneficialOwnerTokens: [],
  representativeTokens: [],
  segment: "RETAIL",
  kycStatus: "VERIFIED",
  legalForm: "PERSON",
  sectorCode: "RETAIL",
  branchCode: "001",
  restrictions: [],
});
if (customer.customerId !== customerId) throw new Error("Customer creation returned a different identifier");
await verifyResource(`customers/${customerId}`, "customerId", customerId);

const productCode = `E2E_${randomUUID().slice(0, 8).toUpperCase()}`;
const product = await postResource("products", {
  code: productCode,
  name: "Produit de recette Docker",
  investorNisba: "70",
  bankNisba: "30",
});
if (product.code !== productCode || product.status !== "DRAFT" || typeof product.productId !== "string") {
  throw new Error("Product creation returned an unexpected draft");
}
await verifyResource(`products/${product.productId}`, "code", productCode);

const poolId = `E2E_POOL_${randomUUID().slice(0, 8).toUpperCase()}`;
const pool = await postResource("investment-pools", {
  poolId,
  displayName: "Pool de recette Docker",
  currency: "DZD",
  strategyCode: "BALANCED",
  validFrom: "2026-10-07",
  eligibleAssetCodes: ["MURABAHA"],
  mudaribProfitShare: "30",
});
if (pool.poolId !== poolId || pool.status !== "DRAFT") {
  throw new Error("Pool creation returned an unexpected draft");
}
await verifyResource(`investment-pools/${poolId}`, "poolId", poolId);

const accountId = randomUUID();
const subscriptionPath = `investment-accounts/subscriptions/${accountId}`;
const subscription = await postResource("investment-accounts/subscriptions", {
  accountId,
  customerId,
  productId: "10000000-0000-4000-8000-000000000002",
  productTermsVersionId: "11000000-0000-4000-8000-000000000002",
  contractVersion: "1.0",
  investorNisba: "72",
  bankNisba: "28",
  currency: "DZD",
});
if (subscription.accountId !== accountId || subscription.status !== "PRE_SIMULATION") {
  throw new Error("Subscription creation returned an unexpected pre-simulation");
}
const businessDate = new Date().toISOString().slice(0, 10);
for (const [action, additionalFields, expectedStatus] of [
  ["START", {}, "PENDING_SUBSCRIPTION"],
  ["ACCEPT", { acceptedAt: new Date().toISOString(), nonGuaranteeAccepted: true, profitSharingMethodAccepted: true }, "PENDING_SUBSCRIPTION"],
  ["ACTIVATE", {}, "ACTIVE"],
  ["DEPOSIT", { amount: "1000" }, "ACTIVE"],
]) {
  const result = await postResource(`${subscriptionPath}/actions`, {
    type: action,
    businessDate,
    ...additionalFields,
  });
  if (result.accountId !== accountId || result.status !== expectedStatus) {
    throw new Error(`Subscription ${action} returned an unexpected status`);
  }
}
const accountBalance = await verifyResource(subscriptionPath, "accountId", accountId);
if (Number(accountBalance.balance) !== 1000 || Number(accountBalance.totalDeposits) !== 1000) {
  throw new Error(`Subscription balance is incorrect: ${JSON.stringify(accountBalance)}`);
}

console.log(
  JSON.stringify({
    event: "frontend.e2e.real_bff.passed",
    dependencies: ["nextjs-bff", "keycloak", "backend-api", "postgresql"],
    verifiedCatalogs: catalogs.length,
    verifiedCreations: 3,
    verifiedSubscriptionBalance: true,
  }),
);

async function postResource(path, command) {
  const response = await fetch(`${webUrl}/api/core/${path}`, {
    method: "POST",
    headers: {
      ...authenticatedHeaders,
      "content-type": "application/json",
      "x-correlation-id": randomUUID(),
      "idempotency-key": randomUUID(),
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error(`Creation ${path} failed with ${response.status}: ${await response.text()}`);
  return response.json();
}

async function verifyResource(path, field, expected) {
  const response = await fetch(`${webUrl}/api/core/${path}`, {
    headers: { ...authenticatedHeaders, "x-correlation-id": randomUUID() },
  });
  if (!response.ok) throw new Error(`Read ${path} failed with ${response.status}: ${await response.text()}`);
  const item = await response.json();
  if (item?.[field] !== expected) throw new Error(`Read ${path} returned an unexpected ${field}`);
  return item;
}

async function obtainAccessToken() {
  const response = await fetch(required("OIDC_TOKEN_URL"), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: required("OIDC_CLIENT_ID"),
      username: required("OIDC_TEST_USERNAME"),
      password: required("OIDC_TEST_PASSWORD"),
    }),
  });
  if (!response.ok)
    throw new Error(
      `OIDC token request failed with ${response.status}: ${await response.text()}`,
    );
  const body = await response.json();
  if (typeof body.access_token !== "string")
    throw new Error("OIDC provider returned no access token");
  return body.access_token;
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
