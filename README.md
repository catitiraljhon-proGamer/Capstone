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
npm run build
```

`test:auth` uses a temporary MongoDB instance and signed test identities, without
reading `.env.local`, contacting Google, or changing your application database.
The test MongoDB binary is downloaded automatically on first use. A real Google
account round trip still requires the OAuth configuration above.
