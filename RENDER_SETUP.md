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

## Connect an MT5 account from NOVA

MT5 runs on your Windows computer, so keep the read-only connector running locally while using the hosted dashboard. In `mt5-connector/.env`, configure:

- `NOVA_BACKEND_URL`: the Render service origin.
- `MT5_BRIDGE_SECRET`: the generated Render bridge key.
- `NOVA_FRONTEND_ORIGINS`: the exact dashboard origin, such as `https://nova-backend.onrender.com`. Add `https://viccodeneel.github.io` too if you use GitHub Pages. Use comma-separated origins, with no paths.
- `MT5_CONNECTOR_HOST=127.0.0.1` and `MT5_CONNECTOR_PORT=5001`.
- `MT5_SIMULATION_MODE=false`.

Start the local bridge with `python sync.py --server`. In NOVA, open **Accounts → Add Account** and enter the MT5 login number, server name, and read-only Investor Password. The browser sends those credentials directly to the local bridge; NOVA does not save the password. The connector authenticates with MT5 and pushes account snapshots to Render while it is running.

When the browser asks to allow NOVA to access your local network, allow it for the dashboard site. Keep the bridge key identical on the Render service and the local connector, and never put the Investor Password in `.env` or GitHub. The dashboard sign-in password is separate from MT5 credentials.
