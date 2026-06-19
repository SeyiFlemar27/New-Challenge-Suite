# Firebase Setup for Challenge Suite

This app is wired to use Firebase Auth, Firestore, and Storage, but it will run in demo mode until Firebase environment variables are added.

## 1. Create Firebase Project

1. Go to https://console.firebase.google.com
2. Click **Add project**.
3. Name it `Challenge Suite`.
4. Disable or enable Analytics based on your preference.

## 2. Enable Authentication

1. Open **Build > Authentication**.
2. Click **Get started**.
3. Enable **Email/Password**.
4. Keep email link optional for now.

## 3. Create Firestore

1. Open **Build > Firestore Database**.
2. Create database.
3. Start in production mode.
4. Choose the closest region to your users.

## 4. Enable Storage

1. Open **Build > Storage**.
2. Click **Get started**.
3. Use production mode.

## 5. Web App Config

1. Open project settings.
2. Add a web app.
3. Copy the Firebase config values into `.env.local`:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

## 6. Admin SDK

1. Open **Project settings > Service accounts**.
2. Generate a new private key.
3. Add these values to `.env.local`:

```bash
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## 7. Bootstrap First Admin

Set one or more admin emails:

```bash
NEXT_PUBLIC_INITIAL_ADMIN_EMAILS=you@example.com
```

When that email signs up, the created profile will receive `isAdmin: true`. You can change this later in Firebase.

## 8. DoroCoin Packages

Current pricing decision:

- 50 DoroCoins = $1.99
- 100 DoroCoins = $7.99
- 500 DoroCoins = $19.99

Create Stripe prices for these packages and add:

```bash
STRIPE_PRICE_DOROCOIN_50=
STRIPE_PRICE_DOROCOIN_100=
STRIPE_PRICE_DOROCOIN_500=
```
