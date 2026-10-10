# Deploy ResQNet: Render + MongoDB Atlas

This repository includes `render.yaml`, which defines the Node.js backend as a Render Web Service. Render supplies `PORT`; the backend binds to `0.0.0.0:$PORT` and serves both REST/Socket.IO and the Command Center from the same service.

## 1. Create MongoDB Atlas database

1. Create an Atlas project and a database deployment.
2. Create a **database user** with access to the `resqnet` database.
3. In **Network Access**, allow the Render service to reach Atlas. For a simple first deployment, this is commonly an IP access-list entry of `0.0.0.0/0`; restrict this later using a private-network solution or known egress addresses.
4. Copy the driver's Node.js SRV connection string and replace the username, password, and database name:

```text
mongodb+srv://<db-user>:<url-encoded-password>@<cluster-host>/resqnet?retryWrites=true&w=majority
```

Never commit this URI to Git.

## 2. Create Render Web Service

1. In Render, choose **New → Blueprint** and select this GitHub repository.
2. Render reads `render.yaml` and creates the `resqnet-backend` Web Service with:
   - Root directory: `backend`
   - Build command: `npm ci`
   - Start command: `npm start`
   - Health check: `/api/health`
3. In the service's **Environment** page, set the secret values below.

| Variable | Required value |
| --- | --- |
| `MONGODB_URI` | Atlas SRV connection string |
| `DEMO_PASSWORD` | Strong non-default development/demo password |
| `RESQNET_API_KEY` | Long random API key for protected API access |
| `CORS_ORIGINS` | `https://<your-service>.onrender.com` (comma-separate additional trusted web origins) |
| `AI_SERVICE_URL` | Optional AI service endpoint; leave unset if not deployed |
| `OSRM_BASE_URL` | `https://router.project-osrm.org` or your own routing service |
| `RATE_LIMIT_PER_MINUTE` | Example: `120` |
| `DEMO_MODE` | `false` for a deployed environment |
| `COMMAND_CENTER_USER` | Controller username, for example `operator` |

`NODE_ENV=production` and Node 22 are declared by `render.yaml`. Do **not** set a fixed `PORT`; Render supplies it.

## 3. Verify the service

When Render finishes deploying, note its URL:

```text
https://<your-service>.onrender.com
```

Verify these URLs:

```text
https://<your-service>.onrender.com/api/health
https://<your-service>.onrender.com/dashboard.html
```

The dashboard and Socket.IO endpoint use the same Render origin, so no separate web deployment or socket host is needed.

## 4. Point Android at Render

Create or update `android/gradle.properties` on the build machine:

```properties
RESQNET_BACKEND_URL=https://<your-service>.onrender.com/
```

Then build/install the Android app again:

```powershell
cd android
.\gradlew.bat :app:assembleDebug
```

The same base URL is emitted to Android as `DEFAULT_BACKEND_URL` and `DEFAULT_SOCKET_URL`. Do not use `localhost`, `10.0.2.2`, or a laptop LAN IP for a deployed Android build.

## Security checklist

- Use a unique Atlas database user and a strong password; URL-encode special characters in the password.
- Keep `MONGODB_URI`, `DEMO_PASSWORD`, and `RESQNET_API_KEY` only in Render secrets.
- Restrict Atlas network access after initial testing.
- Restrict `CORS_ORIGINS` to actual web origins; do not use `*` in production.
- Rotate credentials immediately if they are exposed in Git, logs, screenshots, or chat.
