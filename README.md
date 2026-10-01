# G4 Builders Construction Cost Estimation and Billing System

Next.js application for house-design cost estimation, project billing, payments, approvals, documents, and role-based customer/staff workflows.

## Database setup

The application uses MongoDB. Runtime business records are no longer stored in browser `localStorage`, and demo credentials are not accepted by the login screen.

1. Copy `.env.example` to `.env.local`.
2. Set `MONGODB_URI`, `MONGODB_DB`, and a random `AUTH_SECRET` of at least 32 characters.
3. Set the required `SEED_ADMIN_*` values. Add the optional clerk/customer seed values if those roles are needed immediately.
4. Seed the reference catalog and initial accounts:

   ```bash
   npm run db:seed
   ```

5. Start the development server:

   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000).

## Billing Clerk workflow

Billing and payment management belongs to the Billing Clerk. Admin manages
projects and operational approvals; legacy billing approval records remain
stored but are hidden and cannot be approved through the admin API. Admin
scheduling handles client meetings only.

- Prepare a draft for an active/completed customer project, referencing the
  agreed contract milestone or approved accomplishment. Contract allocations
  include existing drafts. The project-progress percentage is informational.
- Review and issue the invoice from the clerk account. Customers see issued
  invoices and can submit payment details and optional image proof.
- Record and verify payments through Cash, Bank transfer, Card, E-wallet or Check.
  These record actual payments; they are not payment-gateway integrations.
- Only verified payments reduce balances. Partial payments generate individual
  receipts. Reversals preserve the original receipt snapshot and mark it void.
- Download printable HTML or use **Print / Save PDF**. Reports export verified
  collections by payment date and outstanding invoices by due date as CSV.
- Existing payments without invoice links remain visible as legacy/unallocated
  records; no invoice allocation or receipt is fabricated for them.

Billing writes use MongoDB transactions to keep balances, receipts, audit history,
and notifications consistent under concurrent requests. Use MongoDB Atlas or a
replica set. For the bundled local MongoDB, stop a previously running standalone
process and run `npm run db:local`; it initializes a single-node `g4-local` replica
set using the existing local data directory. The local URI can be
`mongodb://127.0.0.1:27017/?replicaSet=g4-local`. The launcher never stops an unrelated
process already using the port. A standalone server returns a setup error rather
than partially saving a billing transaction.

Run `npm run test:billing` for isolated replica-set tests covering payment races,
role/customer isolation, partial receipts, reversals, duplicate submissions, and
contract limits. No production records are used by these tests.

## Client registration and records

Email registration collects full name, email, age, contact number, complete address,
and optional occupation. These details are saved with the customer account and
appear automatically in the admin Client Module (`/admin/clients`) and the customer's
profile (`/customer/profile`). Both views use the same record, including later edits.
Existing accounts and Google registrations can complete missing details in their profile.

## Editable material prices

In Admin → House Designs → Edit Design, each default exterior material has a type
selector and an editable price in PHP per unit. Save Changes stores prices for
that house design and recalculates the admin and customer material breakdowns.
Prices are retained separately for each material option. Use the catalog-price
reset beside a changed material to restore its shared default. Existing designs
continue using catalog prices until an admin changes them. Saved estimates,
contracts, and invoices are not rewritten by editing a design's material prices.

## Google login and signup

For production hosting, follow the complete [Vercel and Google setup guide](docs/vercel-google-setup.md).

Both authentication pages support Google. First-time Google users receive an active
customer account. Returning users keep their account, projects, role, and status.
If the email already belongs to a password account, the user must enter their
existing G4 Builders password once to connect Google. Disabled accounts cannot sign in.

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview) in your Google Cloud project.
2. Configure the app branding and choose an External audience for customers using personal Google accounts. This app requests only basic identity scopes; Google's usual test-user restriction has an exception for these scopes. See [Google's audience settings](https://support.google.com/cloud/answer/15549945).
3. Create an OAuth client with application type **Web application** under Clients.
4. Add this **Authorized redirect URI** exactly:

   ```text
   http://localhost:3000/api/auth/google/callback
   ```

5. Add the following to `.env.local`, keeping the client secret on the server:

   ```dotenv
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
   ```

6. Restart `npm run dev`, open `/login` or `/register`, and use the Google button.

For hosting or an HTTPS tunnel, register its exact callback URL in Google and set
`GOOGLE_REDIRECT_URI` to that same URL. A different port, hostname, scheme, path, or
trailing slash is a different redirect URI. Production must use HTTPS. This server
redirect flow does not require an Authorized JavaScript origin or Google API access
beyond `openid email profile`.

The implementation uses Google's [OpenID Connect authorization code flow](https://developers.google.com/identity/openid-connect/openid-connect),
PKCE, a signed ten-minute state cookie, and a nonce. Google ID tokens are verified
with Google's signing keys, issuer, audience, and expiration. Google identities are
stored by their stable `sub` in a unique `users.googleSub` index; Google-only accounts
have no password hash. The normal application session, admin notifications, and
audit logs are reused. Google access/refresh tokens are not stored.

Without these environment values, email/password authentication remains available
and the Google button returns a friendly availability message.

## MongoDB collections

- `users`: credentials, profile, role, and account status
- `house_designs`: design details, pricing, material selections, images, and publication status
- `house_types`, `exterior_items`, `reference_values`: editable estimation/reference catalogs
- `messages`: persisted role-aware conversation messages
- `projects`, `design_requests`, `cost_estimates`, `approvals`: project and estimation workflow
- `invoices`, `payments`: billing and multiple-payment records
- `documents`, `notifications`, `audit_logs`: supporting records and traceability

Indexes are created when the application first connects. Seed data lives under `database/seeds` so it is bootstrap input, not a runtime fallback.

## Checks

```bash
npm run lint
npm run typecheck
npm run test:auth
npm run test:clients
npm run test:pricing
npm run build
```

`test:clients` covers client permissions, registration details, and duplicate accounts
using a temporary MongoDB instance. `test:auth` uses a temporary MongoDB instance and signed test identities, without
reading `.env.local`, contacting Google, or changing your application database.
The test MongoDB binary is downloaded automatically on first use. A real Google
account round trip still requires the OAuth configuration above.

## Requested designs and payment access

Customer Dashboard links to **Finished Designs** at /customer/finished-designs,
which contains the published inspiration catalog. **My House Design** contains
only the signed-in customer's requests and delivery/payment status.

1. The customer submits requirements and inspiration images in Design Requests.
2. Admin approves feasibility in Approvals, then uploads the finished images from
   the approved request. Delivery notifies the customer and Billing Clerk.
3. Billing Clerk opens Progress Billings and chooses **Prepare design fee** for
   a delivered request. Enter the agreed fee, billing reference, and due date;
   save the draft and issue it. The fee is separate from construction contracts
   and can be billed even when the customer has no construction project.
4. The customer submits payment details through Billing Status. Existing payment
   verification, partial-payment handling, and per-payment receipts apply.
5. Only full verified payment against that request's issued fee invoice unlocks
   viewing and downloading in My House Design. Pending/rejected payments and
   other invoices never unlock it. Reversal of payment restores the access lock.

Delivered images are never embedded in customer list responses or copied to the
published catalog. Authenticated image/download routes recheck ownership and
verified payment, and return private, no-store responses. Already downloaded
files cannot be recalled. Legacy delivered requests without a design-fee invoice
remain locked until the Billing Clerk bills and verifies their actual payment.
No fee amounts or historical payments are generated automatically.

The billing test suite also exercises delivery approval, image access, ownership,
full versus partial payments, reversals, legacy images, and concurrent fee drafts.
