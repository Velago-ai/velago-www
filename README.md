# Velago WWW Frontend

React + Vite frontend for Velago voice booking, payment handoff, and order history UI.

## Stack

- React 19 + TypeScript
- Vite 7
- Wouter routing
- TanStack Query
- `jsPDF` for confirmation export
- npm workspaces

## Workspace structure

- `app` - main web application (`@workspace/velago-landing`)
- `lib/api-client-react` - shared API client package
- `lib/api-spec` - OpenAPI source and codegen config
- `cdk` - infra/deployment helpers

## Prerequisites

- Node.js 18+
- npm 7+

## Install

```bash
npm install
```

## Run

From repo root:

```bash
npm run dev
```

App starts at `http://localhost:5173`.

If PowerShell blocks `npm` scripts, use `npm.cmd`.

## Build

Build all workspaces:

```bash
npm run build
```

Build only frontend app:

```bash
npm.cmd run build -w @workspace/velago-landing
```

## Main routes

- `/` - root (authenticated users are routed to voice page)
- `/landing` - landing page
- `/auth` - auth
- `/voice` - voice assistant page
- `/bookings` - orders history page
- `/settings` - settings page

## Runtime configuration

- `VITE_API_URL` (optional) - backend base URL.  
  Default: `https://api.velago.ai`

Websocket endpoint for voice is currently hardcoded in UI:

- `wss://ws.velago.ai/ws`

## Implemented product behavior

### Voice page

- Displays both assistant and user transcript entries.
- Handles booking confirmation cards.
- Supports payment handoff:
- detects `checkout_url` from structured websocket payload (preferred),
- fallback: detects payment URL in assistant text.
- Shows `Pay order` button on confirmed card when payment URL is available.
- Opens payment in popup/new tab (does not navigate away from current chat tab).

### Orders page (`/bookings`)

- Uses authenticated `GET /orders` API.
- Sends query params: `category`, `page`, `per_page`.
- Currently UI exposes only 2 backend categories:
- `flights`
- `parcel_delivery`
- Splits list into sections:
- `My bookings` for non-final statuses
- `Past bookings` only for `completed`, `failed`, `canceled/cancelled`
- Status display mapping:
- `paid` -> `Paid`
- payment-required statuses -> `Awaiting Payment`
- delivery-like in-progress statuses -> `Delivery`
- flight in-progress statuses -> `In Progress`
- unknown values -> humanized title case
- Supports PDF export from real order data in each expanded order row.

## PDF confirmations

Order PDF export is implemented in:

- `app/src/lib/order-confirmation-pdf.ts`

It generates a branded confirmation with:

- order status
- ids/references
- provider/service/category
- total and date
- available detail rows from order payload

## Backend alignment notes

For stable payment UX, backend should send a dedicated websocket event with checkout link, for example:

```json
{
  "type": "PaymentRequiresAction",
  "requires_action": true,
  "order_id": "...",
  "order_token": "...",
  "checkout_url": "https://sandbox-checkout.revolut.com/payment-link/..."
}
```

`ConversationText` should contain human-readable instruction without full URL (to avoid TTS reading long links).

## API codegen

OpenAPI codegen lives in `lib/api-spec`:

```bash
npm.cmd run codegen -w @workspace/api-spec
```

