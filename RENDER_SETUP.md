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

## Enable dashboard LiveKit voice (optional)

NOVA's global orb can connect to a deployed LiveKit agent. The voice room is created only after the user selects **Connect LiveKit voice**. After the authenticated browser joins, NOVA explicitly dispatches the agent with a short-lived, room- and participant-bound tool credential in private job metadata. The tool credential is not embedded in or returned with the browser participant token.

In Render → `nova-backend` → **Environment**, configure these server-only values:

- `LIVEKIT_URL`: the LiveKit project WebSocket URL (`wss://...`), available in LiveKit Cloud project settings.
- `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`: the project's server credentials. Keep them on the backend; never add them to frontend build variables.
- `LIVEKIT_AGENT_NAME`: the exact Agent Builder agent name used for explicit dispatch.
- `LIVEKIT_TOOL_TOKEN_SECRET`: a generated secret of at least 32 characters used only by the NOVA backend to sign short-lived tool credentials.
- `LIVEKIT_AGENT_BRIDGE_SECRET`: a high-entropy server-to-server secret shared with the LiveKit agent deployment. Use the same value on both servers; the agent can only exchange it for a scoped credential while its matching LiveKit room and participants are active.
- `LIVEKIT_VOICE_ENABLED`: set to `true` only after the values above are present and the agent is deployed.

The Agent Builder preview is not a production deployment for dashboard rooms. Deploy the Python agent in LiveKit Cloud and confirm its exact dispatch name matches `LIVEKIT_AGENT_NAME`. NOVA uses LiveKit's explicit agent dispatch API after the browser joins; the configured production deployment is targeted by default. The backend initializes the `livekit_voice_sessions` and `livekit_voice_tool_requests` tables from `database/schema.sql`. Tool requests are limited to NOVA's existing read-only trading functions and explicit memory tools. Navigation is sent through a LiveKit RPC to the connected dashboard and only reports success after the browser acknowledges it. Payout access is not implemented. `LIVEKIT_SUMMARY_TOKEN` remains exclusively for completed-session summary ingestion.

The browser microphone permission prompt appears after the user connects. The existing browser-native voice and wake phrase remain available as a fallback and are paused while LiveKit is connecting or connected. Configure `NOVA_BACKEND_URL`, `LIVEKIT_AGENT_BRIDGE_SECRET`, and `LIVEKIT_SUMMARY_TOKEN` in the LiveKit agent deployment environment; keep `LIVEKIT_TOOL_TOKEN_SECRET` only in the backend environment.

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

## LiveKit voice agent: end-of-call summaries (optional)

NOVA exposes `POST /api/livekit/session-summary` for the LiveKit Agent Builder's **Summary and data collection endpoint URL**. It is authenticated with its own bearer token and is separate from the dashboard password and the MT5 bridge key.

1. In Render → `nova-backend` → **Environment**, add `LIVEKIT_SUMMARY_TOKEN` with a new random value of at least 32 characters (for example `openssl rand -hex 32`). Never reuse `MT5_BRIDGE_SECRET`. Without it, the endpoint returns 503 and accepts nothing.
2. In LiveKit's Agent Builder → **Call ending**, set the endpoint URL to `https://<your-render-host>/api/livekit/session-summary` and add the header `Authorization` = `Bearer <the same token>`. Prefer a LiveKit secret (`Bearer {{secrets.NOVA_SUMMARY_TOKEN}}`) over pasting the value inline.
3. Summaries are stored in the `livekit_session_summaries` table (created automatically at startup), keyed by `job_id` so retries are harmless. They are never added to NOVA's AI memory automatically.
