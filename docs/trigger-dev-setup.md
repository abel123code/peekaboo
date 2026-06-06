# Trigger.dev Setup Notes

## Local Use

Use this when running the web app on your own machine.

Terminal 1:

```powershell
cd C:\Users\65837\Desktop\agent-writer\apps\web
npm run dev
```

Terminal 2:

```powershell
cd C:\Users\65837\Desktop\agent-writer\apps\web
npm run trigger:dev
```

Then open the local web app and run workflows.

In this setup:

- Next.js runs locally.
- Trigger runs locally through `trigger:dev`.
- Supabase stores workflow runs, drafts, and artifacts.
- The Trigger DEV key is enough.
- No production deployment is needed.

You only need to deploy when you want the app to run without your terminal open, or when other people need to use it from a hosted URL.

## Production Setup

Production needs three pieces.

### 1. Deploy The Trigger Task

From `apps/web`:

```powershell
npm run trigger:deploy
```

### 2. Set Trigger.dev Cloud Environment Variables

In the Trigger.dev dashboard, set these in the production environment:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
DATAFORSEO_USERNAME=
DATAFORSEO_PASSWORD=
UNSPLASH_ACCESS_KEY=
```

These are needed because the workflow runs inside Trigger.dev Cloud in production.

### 3. Set Next.js Host Environment Variables

If the Next.js app is deployed to Vercel or another host, set these in that host's environment variable dashboard:

```env
TRIGGER_PROJECT_REF=proj_xxx
TRIGGER_SECRET_KEY=tr_prod_xxx
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Local `.env` only affects your local machine. A deployed Next.js app needs these variables configured in the hosting provider.

Use the Trigger PROD key for the deployed Next.js app, not the DEV key.
