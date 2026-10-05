# Deploy NOVA's backend to Render

The blueprint creates one Node web service. It uses the existing Supabase PostgreSQL database; it does not create another database.

## Before creating the service

1. Merge the NOVA branch into `main` so this blueprint and the authentication changes are in the branch Render deploys.
2. Rotate the Supabase database password and replace the database connection string. The previous backend environment file was committed, so its credentials must be treated as exposed. Also rotate the MT5 bridge key.
3. Choose a strong, unique dashboard password. Do not reuse the Supabase password or an account password.

## Create the Render service

1. In Render, choose **New → Blueprint** and connect `viccodeneel/Nova` on `main`.
2. Review the `nova-backend` service and click **Apply**.
3. When prompted, enter:
   - `DATABASE_URL`: the rotated Supabase PostgreSQL connection string. Use the pooler connection string if direct database connections are unavailable.
   - `NOVA_AUTH_PASSWORD`: your new dashboard password.
4. Render generates `NOVA_AUTH_SECRET` and `MT5_BRIDGE_SECRET`. Keep both private.
5. Wait for the deploy and check `/api/health` on the Render service URL. It should report `database_connected: true`.

The free Render web service may sleep after 15 minutes without traffic; its next request can take about a minute to wake. Use a paid always-on plan if that delay is unsuitable. See [Render's free service limits](https://render.com/docs/free).

## Point GitHub Pages at the API

1. In the GitHub repository, open **Settings → Secrets and variables → Actions → Variables**.
2. Add the repository variable `VITE_API_BASE_URL` with the Render service's origin, for example `https://nova-backend.onrender.com` (no trailing slash and no `/api`).
3. In **Settings → Pages**, set the publishing source to **GitHub Actions**.
4. Run the **Deploy NOVA to GitHub Pages** workflow again from the Actions tab. The frontend needs a new build to include the API origin.

## Connect the local MT5 terminal

The Render service cannot reach `localhost` on your Windows computer. On that computer, configure the local connector with:

- `NOVA_BACKEND_URL`: the Render service origin.
- `MT5_BRIDGE_SECRET`: the generated Render bridge key.
- `MT5_LOGIN`, `MT5_PASSWORD`, and `MT5_SERVER`: the read-only MT5 Investor login details.
- `MT5_SIMULATION_MODE=false`.

Start the local connector in watch mode so it pushes snapshots to Render. Keep the bridge key identical on the Render service and the local connector. The dashboard sign-in password is separate from all MT5 credentials.
