# Windows Server / IIS deployment for ABDM callbacks

The public callback must reach the **same Windows host** on which this Node
process is running. Do not leave the tunnel forwarding to the Mac after moving
the backend to Windows: doing so creates a second, stale hop and makes the
mobile application wait for a process that has no current state.

## Recommended callback path

Use the reserved ngrok URL already registered with ABDM, but run the ngrok
agent on Windows and point it directly at Node:

```powershell
ngrok http 3000 --domain=<your-reserved-ngrok-domain>
```

Set `PUBLIC_BASE_URL` to that HTTPS URL. This keeps IIS out of the
time-sensitive ABDM webhook path. IIS can still host the browser frontend.

If the public URL must pass through IIS, run the Windows ngrok agent against
IIS instead (`ngrok http 80`) and ensure the rewrite target is
`http://127.0.0.1:3000/{R:1}`. Enable ARR proxy at the IIS server level; do not
run the tunnel on a different machine.

## Keep the worker alive

In the IIS application pool used for the API/front-end:

- Set **Start Mode** to `AlwaysRunning`.
- Set **Idle Time-out (minutes)** to `0`.
- Install/enable **Application Initialization**, then set the site/application
  **Preload Enabled** setting to `True`.
- Avoid an unplanned periodic recycle during working hours. If recycling is
  required, schedule it and let the health check warm the service before it
  receives ABDM traffic.

Run Node as one persistent PM2 process (the backend has file-backed token and
transaction state, so do not use PM2 cluster mode):

```powershell
pm2 start ecosystem.config.js --only abdm-backend
pm2 save
pm2 status
```

Configure PM2 as a Windows service using your organisation's approved service
manager so it starts before IIS receives traffic.

## Production environment

Keep the existing credentials and gateway URLs in `backend/.env`; add or
confirm these non-secret settings:

```dotenv
NODE_ENV=production
API_DEBUG=false
GATEWAY_TOKEN_TIMEOUT_MS=8000
GATEWAY_TOKEN_ATTEMPTS=2
M3_GATEWAY_TOKEN_TIMEOUT_MS=8000
ABDM_TOKEN_WARM_INTERVAL_MS=60000
GATEWAY_TOKEN_WARM_INTERVAL_MS=60000
```

The process now keeps M2/M3 gateway credentials warm every minute and reuses
outbound HTTPS connections. It also stops buffering complete API responses for
debug logging in production. Those changes prevent expired credentials and
slow IIS log writes from consuming the mobile application's callback timeout.

## Verify before testing on the mobile app

From the Windows host:

```powershell
Invoke-WebRequest http://127.0.0.1:3000/api/health
pm2 logs abdm-backend --lines 100
```

From an external network, request:

```text
https://<your-public-domain>/api/health
```

Both checks must respond immediately. If the local health request is fast but
the public one is slow, the problem is IIS/ngrok/network placement—not ABDM or
the record lookup code.
