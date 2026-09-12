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

const response = await fetch(
  `${webUrl}/api/core/reference-data/currencies/DZD?businessDate=2026-01-01`,
  {
    headers: {
      cookie: `pms.session-token=${sessionToken}`,
      "x-correlation-id": randomUUID(),
    },
  },
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
console.log(
  JSON.stringify({
    event: "frontend.e2e.real_bff.passed",
    dependencies: ["nextjs-bff", "keycloak", "backend-api", "postgresql"],
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
