# Deploy G4 Builders to Vercel with Google login and signup

Repository: [catitiraljhon-proGamer/Capstone](https://github.com/catitiraljhon-proGamer/Capstone), branch `main`.

The application uses Next.js, MongoDB, and Google OpenID Connect. Deployment needs
your own MongoDB connection, application secret, and Google OAuth credentials.
`.env.local` stays on your computer; its values are not included in GitHub.

## 1. Prepare the hosted database

If you already use MongoDB Atlas, reuse the intended cluster and database. Using
the same database preserves the existing accounts and project records. Choosing
a new database starts with no application records.

For a new database:

1. Sign in to [MongoDB Atlas](https://cloud.mongodb.com/) and create a project and cluster.
2. Under **Database Access**, create a database user with read/write access to the application database. This database user is separate from your Atlas login.
3. Under **Network Access**, configure access for the machines connecting to Atlas: your computer for local setup and the Vercel deployment for the hosted app.
4. Choose **Connect > Drivers > Node.js** and copy the connection string. Replace the username/password placeholders with your database user's credentials; URL-encode special characters in credentials.
5. Choose the database name, for example `g4_construction`.

Vercel's normal outbound addresses can change. Allowlisting only your home IP will
not allow the deployed app to connect. When using Vercel Static IPs or Secure
Compute, add their outbound addresses to Atlas. An Atlas `0.0.0.0/0` entry permits
connections from any IPv4 address and is a broader alternative; use a strong,
unique database password and a database user limited to this application's data.
See [Vercel's database IP guidance](https://vercel.com/kb/guide/how-to-allowlist-deployment-ip-address)
and [Atlas connection setup](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/).

Do not set Vercel's `MONGODB_URI` to `mongodb://127.0.0.1:27017`: that address cannot
reach the MongoDB instance on your computer.

## 2. Initialize a fresh database, if needed

Skip this step if your chosen database already has the required administrator and catalog.

1. On your computer, open this project's `.env.local`. If it does not exist, copy `.env.example` to `.env.local`.
2. Set `MONGODB_URI` to the Atlas connection string and `MONGODB_DB` to the chosen database name.
3. Fill in `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, and `SEED_ADMIN_PASSWORD`. The password must contain at least eight characters.
4. Run from the project directory:

   ```bash
   npm ci
   npm run db:seed
   ```

The seed command creates the initial administrator and reference catalog. It also
updates matching seeded users and catalog records, so do not run it repeatedly
against an established database without reviewing those updates.
The `SEED_*` values are only needed for this command; they are not required in Vercel.

## 3. Import the GitHub repository into Vercel

If you already have a Vercel project connected to this repository, open that project
and confirm that its production branch is `main`.

For a new Vercel project:

1. Open [Vercel New Project](https://vercel.com/new) and connect the GitHub account that owns the repository.
2. Import `catitiraljhon-proGamer/Capstone`.
3. Use **Next.js** as the framework and the repository root as the root directory.
4. Keep the standard build settings: install with `npm ci`, build with `npm run build`, and leave the output directory at the Next.js default.
5. Use Node.js **24.x**, which matches the runtime used for local verification.
6. Add these Production environment variables before deploying:

   | Name | Value |
   | --- | --- |
   | `MONGODB_URI` | Your Atlas connection string |
   | `MONGODB_DB` | Your database name, for example `g4_construction` |
   | `AUTH_SECRET` | A random secret of at least 32 characters |
   | `MONGOMS_DISABLE_POSTINSTALL` | `1` (skips downloading the test database binary during Vercel installation) |

   Generate an `AUTH_SECRET` on your computer with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

7. Deploy, then copy the stable **Production domain** shown under the project's Domains settings. Use this domain or your custom domain for Google. The first deployment can run with email/password login while Google is being configured.

The remaining examples use `https://YOUR-APP.vercel.app`. Replace that placeholder
with the actual production domain assigned to your project. Do not use a changing
deployment-specific preview URL.

See [Vercel's GitHub integration](https://vercel.com/docs/git/vercel-for-github)
and [supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## 4. Create a Google OAuth web client

If you already have a Google OAuth **Web application** client, you can add the
production callback to that client and reuse its client ID and secret.

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview) and select or create a Google Cloud project.
2. Complete the branding setup with your app name, support email, and developer contact email. Use `G4 Builders Inc` as the app name.
3. Under **Audience**, choose **External** if customers will use personal Google accounts. **Internal** limits access to the project's Google Workspace organization.
4. Under **Clients**, choose **Create client**, then **Web application**.
5. Give it a name such as `G4 Builders Web`.
6. Under **Authorized redirect URIs**, add:

   ```text
   https://YOUR-APP.vercel.app/api/auth/google/callback
   ```

7. To keep local development working with this same client, also add:

   ```text
   http://localhost:3000/api/auth/google/callback
   ```

8. Create/save the client, then save its **Client ID** and **Client secret** securely.

The callback must match exactly, including HTTPS, domain, path, and trailing slash.
This integration uses a server redirect, so an Authorized JavaScript origin is
not needed for this flow. It requests only `openid email profile`; Gmail, Drive,
Calendar, and billing APIs are not required.

Google makes an exception to the usual Testing user-list and seven-day rules for
apps requesting only these basic identity scopes. If you later add other scopes,
review the audience, test-user, publishing, and verification requirements again.
See [Google OAuth setup](https://developers.google.com/identity/protocols/oauth2/web-server)
and [Google's audience rules](https://support.google.com/cloud/answer/15549945).

## 5. Add Google credentials to Vercel and redeploy

1. Open the Vercel project, then **Settings > Environment Variables** (or the **Environment Variables** sidebar).
2. Add each of these for **Production**, without surrounding quotes:

   | Name | Value |
   | --- | --- |
   | `GOOGLE_CLIENT_ID` | The client ID from step 4, ending in `.apps.googleusercontent.com` |
   | `GOOGLE_CLIENT_SECRET` | The client secret from that same Google client |
   | `GOOGLE_REDIRECT_URI` | `https://YOUR-APP.vercel.app/api/auth/google/callback` |

3. Confirm `MONGODB_URI`, `MONGODB_DB`, and `AUTH_SECRET` from step 3 are present too.
4. Keep these server variables under their exact names; do not add a `NEXT_PUBLIC_` prefix.
5. Open **Deployments**, select the latest production deployment, and choose **Redeploy**.
6. Wait until the new deployment is **Ready**. Environment-variable changes only take effect in a new deployment. See [Vercel's environment-variable instructions](https://vercel.com/docs/environment-variables/managing-environment-variables).

For local development, keep `GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback`
in `.env.local` and restart `npm run dev` after editing it.

## 6. Test the deployed app

1. Open the production domain in a private/incognito browser window.
2. Open `/register` and choose **Sign up with Google**. Select a Google account that does not already exist in the application.
3. Confirm it opens the customer dashboard. A first-time Google user always receives the customer role.
4. Log out. Open `/login`, choose **Sign in with Google**, and confirm the same account and data return.
5. For an existing email/password account, choose Google with the same email, then enter the existing **G4 Builders password** when prompted. This connects Google while preserving the existing account and role.
6. Cancel Google consent once and confirm the app returns to the correct form with a helpful message.

Google login and signup use the same OAuth client and callback; separate clients
are not needed. The implementation's automated tests use signed test identities
and an isolated temporary database. A real Google account round trip must be
verified after the production configuration is complete.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Google sign-in is not available yet | All three `GOOGLE_*` values exist in the Production environment, and the app was redeployed. |
| `redirect_uri_mismatch` | The Google client's authorized callback exactly matches `GOOGLE_REDIRECT_URI`. |
| Returns to localhost or a different domain | Vercel still has the local callback or an old domain; update it and redeploy. |
| Google succeeds but the application cannot finish login | Check Atlas database credentials, network access, database permissions, and Vercel runtime logs. |
| Sign-in request expired | Start again from the configured production domain, allow cookies, and finish within ten minutes. Starting a second Google flow in the same browser replaces the first. |
| Account cannot use Google sign-in | The application account may be disabled or already connected to a different Google identity. |
| Organization-only or access-blocked error | Check Google Audience and any Google Workspace restrictions; use External for customers outside your organization. |
| Google login in a preview opens production | This app returns to the configured callback domain. To test independently in previews, use a stable preview domain, matching Preview variables, and register that exact callback in Google. |
