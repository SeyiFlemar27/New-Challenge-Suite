import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const parser = await import(pathToFileURL(join(root, "lib/api/response-parser.ts")).href);

function sourceFiles(path) {
  const absolute = join(root, path);
  return readdirSync(absolute).flatMap((entry) => {
    const next = join(absolute, entry);
    return statSync(next).isDirectory() ? sourceFiles(next.slice(root.length + 1)) : /\.(ts|tsx|js|jsx)$/.test(entry) ? [next] : [];
  });
}

async function friendly(response) {
  const result = await parser.parseApiResponse(response);
  assert.equal(result.ok, false);
  assert.ok(result.error?.code);
  assert.equal(result.error?.message, result.message);
  assert.doesNotMatch(result.message, /invalid\s+server\s+response|firebaseerror|stripeerror|auth\//i);
  return result;
}

const contracts = {
  "test-api-response-contracts-return-json-on-error.mjs": async () => {
    const source = read("lib/server/responses.ts");
    assert.match(source, /error:\s*\{\s*code,\s*message\s*\}/);
    assert.match(source, /NextResponse\.json/);
    assert.doesNotMatch(source, /FIREBASE_PRIVATE_KEY|FIREBASE_CLIENT_EMAIL/);
  },
  "test-fetch-helper-non_json_response_friendly_error.mjs": async () => {
    const result = await friendly(new Response("plain failure", { status: 502, headers: { "content-type": "text/plain" } }));
    assert.equal(result.message, parser.FRIENDLY_API_MESSAGES.general);
  },
  "test-fetch-helper-empty_response_friendly_error.mjs": async () => {
    const result = await friendly(new Response(null, { status: 204 }));
    assert.equal(result.message, parser.FRIENDLY_API_MESSAGES.general);
  },
  "test-fetch-helper-html_response_friendly_error.mjs": async () => {
    const result = await friendly(new Response("<!doctype html><html>error</html>", { status: 500, headers: { "content-type": "text/html" } }));
    assert.equal(result.message, parser.FRIENDLY_API_MESSAGES.general);
  },
  "test-fetch-helper-redirect_response_session_message.mjs": async () => {
    const result = await friendly(Response.redirect("https://example.test/auth/login", 307));
    assert.equal(result.message, parser.FRIENDLY_API_MESSAGES.session);
  },
  "test-no_invalid_server_response_visible.mjs": async () => {
    const files = ["app", "components", "lib"].flatMap(sourceFiles);
    for (const file of files) assert.doesNotMatch(readFileSync(file, "utf8"), /Invalid server response/i, file);
  },
  "test-no_raw_provider_errors_visible.mjs": async () => {
    for (const message of ["FirebaseError: auth/email-already-in-use", "StripeError: provider request failed"]) {
      const result = await friendly(new Response(JSON.stringify({ ok: false, message }), { status: 400, headers: { "content-type": "application/json" } }));
      assert.equal(result.message, parser.FRIENDLY_API_MESSAGES.general);
    }
  },
  "test-auth-register_no_invalid_server_response.mjs": async () => {
    const source = read("lib/firebase/auth-service.ts");
    assert.match(source, /parseApiResponse<BootstrapResponse>/);
    assert.match(source, /parseApiResponse<\{ state\?: SignupEmailState/);
    assert.doesNotMatch(source, /\.json\(\)\.catch\(\(\) => \(\{ ok: false/);
  },
  "test-delete-account_no_invalid_server_response.mjs": async () => {
    const source = read("app/account/deletion-status/page.tsx");
    assert.match(source, /ApiErrorPanel/);
    assert.match(source, /onRetry=\{loadStatus\}/);
  },
  "test-subscription-success_no_invalid_server_response.mjs": async () => {
    const route = read("app/checkout/subscription/success/route.ts");
    const journey = read("components/payment-status-journey.tsx");
    assert.match(route, /NextResponse\.redirect/);
    assert.match(journey, /apiRequest<PaymentStatus>/);
  },
  "test-host-entitlement-refresh_no_invalid_server_response.mjs": async () => {
    const source = read("app/dashboard/host/page.tsx");
    assert.match(source, /apiRequest<\{ state\?: string \}>/);
    assert.doesNotMatch(source, /response\.json\(\)\.catch/);
  },
  "test-challenge-publish_no_invalid_server_response.mjs": async () => {
    assert.match(read("lib/api/services.ts"), /publishChallengeDraft[\s\S]*apiRequest/);
    assert.match(read("components/challenge-builder.tsx"), /ApiErrorPanel/);
  },
  "test-withdrawal-request_no_invalid_server_response.mjs": async () => {
    assert.match(read("app/wallet/withdraw/page.tsx"), /apiRequest<\{ request: WithdrawalRecord \}>/);
    const route = read("app/api/withdrawals/route.ts");
    assert.match(route, /fail\(|readJson\(|serverUnavailable\(/);
    assert.match(route, /requireRequestUser/);
  },
  "test-contact-support_routes_to_contact_from_errors.mjs": async () => {
    const source = read("components/api-error-panel.tsx");
    assert.match(source, /href="\/contact"/);
    assert.match(source, /Try Again/);
  }
};

export async function runContract(metaUrl) {
  const name = basename(new URL(metaUrl).pathname);
  const contract = contracts[name];
  assert.ok(contract, `No contract registered for ${name}`);
  await contract();
  console.log(`${name}: ok`);
}
