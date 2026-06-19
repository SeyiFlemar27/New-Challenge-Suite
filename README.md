# Challenge Suite

Full-stack reconstruction of the Challenge Suite application from the supplied screenshot album.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- ShadCN-style component primitives
- Zustand
- React Query
- Framer Motion-ready UI
- Firebase Auth, Firestore, and Storage
- Stripe Checkout and webhooks

## Implemented Architecture

- Region gate: app access is limited to United States and Nigeria, with IP signal plus self-declared region.
- Compliance system: versioned legal document map and consent logging API with user, agreement type, version, timestamp, IP, device, region, and target.
- DoroCoin: virtual currency transaction API and required legal acknowledgement.
- Challenge creation validation: image/video submission policies, Entry Competition, 1 Rounder, OK date confirmation UI, Bragging Rights payout removal, entry-fee validation, custom categories, age restriction, time-limited uploads, editable rules, promo image upload, trailer video upload.
- Sponsorship allocation: buckets always normalize to 15%, proportionally redistributed across enabled buckets.
- Voting: backend endpoint enforces one free vote per challenge per day when Firebase Admin is configured.
- Stripe: real checkout route and webhook skeleton. Set Stripe price environment variables for each plan.
- Live events: host CTA is subscription gated by plan capabilities.
- Winner experience: winners are clearly labeled and open winner-context submission pages.
- Tournament formats: 2, 4, and 6 division tabs render distinct bracket structures.
- Notifications: browser permission request and preference persistence endpoint.

## Setup

1. Copy `.env.example` to `.env.local`.
2. Fill Firebase client credentials from Firebase Console > Project settings > General > Web app:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
3. Create a Firebase Admin service account key from Firebase Console > Project settings > Service accounts > Generate new private key. Add these values from the downloaded JSON:
   - `FIREBASE_CLIENT_EMAIL` from `client_email`
   - `FIREBASE_PRIVATE_KEY` from `private_key`

   Keep the private key on one env line with escaped newlines:

   ```env
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

   Server API routes intentionally fail with `503` until Firebase Admin is configured. They should not silently return demo data for production reads or writes.
4. Fill Stripe secret, webhook secret, publishable key, and plan price IDs:
   - `STRIPE_PRICE_CREATOR`
   - `STRIPE_PRICE_COMPETITOR`
   - `STRIPE_PRICE_EXECUTIVE_HOST`
   - `STRIPE_PRICE_CHIEF_PRODUCER`
   - `STRIPE_PRICE_BRAND_PARTNER`
   - `STRIPE_PRICE_ENTERPRISE_SPONSOR`
5. Install dependencies.
6. Run `pnpm dev`.
7. Verify the backend foundation:

   ```bash
   curl http://localhost:3000/api/backend/health
   ```

   This route checks Firebase Admin initialization, a real Firestore write/read, Firebase Storage bucket reachability, and Firebase Auth token verification when called with:

   ```bash
   curl -H "Authorization: Bearer <firebase-id-token>" http://localhost:3000/api/backend/health
   ```

## Legal Note

The included agreement text is operational draft copy for implementation and testing. Replace it with attorney-reviewed language before production launch.
