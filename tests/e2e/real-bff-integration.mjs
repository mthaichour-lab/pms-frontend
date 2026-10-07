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
console.log(
  JSON.stringify({
    event: "frontend.e2e.real_bff.passed",
    dependencies: ["nextjs-bff", "keycloak", "backend-api", "postgresql"],
    verifiedCatalogs: catalogs.length,
  }),
);

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
