# Phase 5.8 Premium Responsive Layout

## Scope

This phase standardizes responsive spacing and navigation across the shared app shell, sponsor shell, authentication pages, sponsor onboarding, settings, public profiles, and trending challenge stories.

No product, payment, subscription, DoroCoin, payout, or fulfillment behavior changed.

## Responsive Rules

- Mobile uses 20px to 24px page gutters, single-column forms, 48px controls, and full-width primary actions where appropriate.
- Tablet uses wider gutters and introduces multi-column layouts only when the content remains readable.
- Desktop uses the normal sidebar or navigation, centered content containers, and wider section spacing.
- App content is constrained to a stable maximum width to avoid overly stretched dashboards.
- Cards use restrained 8px to 12px radii and responsive 20px to 32px padding.

## Navigation

- The normal app shell keeps its desktop sidebar and mobile navigation behavior.
- The sponsor shell now switches to its desktop sidebar at the `md` breakpoint.
- The sponsor hamburger and drawer render only below `md`.
- Drawers close after route changes and lock body scrolling while open.

## Sponsor Onboarding

- Desktop onboarding uses a centered six-column-width content area with a wide profile form and supporting review panels.
- The two-column form layout starts only on wide desktop screens.
- Mobile and smaller tablet layouts remain single-column.
- Headings, status cards, fields, option rows, and actions use a consistent vertical rhythm.

## Authentication

- Sign in, registration, email verification, and password reset use dynamic viewport height and responsive page padding.
- Cards use comfortable mobile padding rather than compressed desktop spacing.
- Form controls and buttons meet a 48px touch target.
- Long email addresses and footer links wrap safely.
- Verification code spacing scales down on narrow screens.

## Shared UI

- Buttons and links use consistent 48px minimum height.
- Inputs and textareas use readable 16px text on mobile.
- Page titles scale from compact mobile headings to desktop display sizes.
- Dashboard content is centered inside a stable maximum-width container.
- Settings sections use responsive padding and larger field gaps.

## Profiles And Stories

- Profile actions become a stable two-column mobile action grid and return to a wrapping row on larger screens.
- Story preview media keeps a safe minimum height.
- Story details scroll independently on short mobile screens.
- Story actions stack on mobile and expand into columns or a row at larger breakpoints.

## Visual QA Checklist

- Verify 390px, 430px, 768px, 1024px, and wide desktop viewports.
- Confirm sponsor onboarding has no hamburger at 768px and above.
- Confirm auth pages have no horizontal overflow with long email addresses.
- Confirm story close, previous, and next controls remain visible on short devices.
- Confirm mobile drawers close after navigation and restore body scrolling.
- Confirm desktop sidebars and dashboard grids retain their existing hierarchy.
- Confirm create-challenge and challenge-detail pages inherit the shared control sizing without clipping.
