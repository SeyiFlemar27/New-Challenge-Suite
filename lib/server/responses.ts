import { NextResponse } from "next/server";

export type FieldErrors = Record<string, string>;

export function ok<T>(data: T, message = "Action completed successfully.") {
  return NextResponse.json({ ok: true, message, data });
}

export function fail(message: string, status = 400, details?: unknown, code = "REQUEST_FAILED") {
  return NextResponse.json({ ok: false, code, message, details }, { status });
}

export function validationError(fieldErrors: FieldErrors, message = "Validation failed.") {
  return fail(message, 400, { fieldErrors }, "VALIDATION_ERROR");
}

export function unauthorized(message = "Authentication required.") {
  return fail(message, 401, undefined, "AUTHENTICATION_REQUIRED");
}

export function forbidden(message = "Permission denied.") {
  return fail(message, 403, undefined, "PERMISSION_DENIED");
}

export function conflict(message: string, details?: unknown) {
  return fail(message, 409, details, "CONFLICT");
}

export function serverError(message = "Unexpected server error.", details?: unknown) {
  return fail(message, 500, details, "SERVER_ERROR");
}

export function serverUnavailable(feature: string) {
  return NextResponse.json({
    ok: false,
    code: "SERVER_CONFIGURATION_ERROR",
    message: `${feature} requires Firebase Admin credentials. Configure NEXT_PUBLIC_FIREBASE_PROJECT_ID, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY before this API can read or write production data.`
  }, { status: 503 });
}

export async function readJson(request: Request) {
  try {
    return { body: await request.json(), response: null };
  } catch {
    return { body: null, response: validationError({ body: "Request body must be valid JSON." }) };
  }
}
