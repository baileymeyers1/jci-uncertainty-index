# JCI Uncertainty Index

Full-stack Next.js app for the JCI Uncertainty Index dashboard and newsletter automation.

## Setup

1. Copy `.env.example` to `.env` and fill in secrets.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Generate Prisma client:
   ```bash
   npm run db:generate
   ```
4. Push schema to your Neon database:
   ```bash
   npm run db:push
   ```
5. Seed the admin user:
   ```bash
   npm run db:seed
   ```
6. Run the dev server:
   ```bash
   npm run dev
   ```

## Cron
Vercel cron is configured in `vercel.json` to hit `/api/cron/monthly` on the 2nd of each month at 12:00 UTC (7-8am US Eastern, depending on DST).

## Deployment (Vercel)
1. Push this repo to GitHub (private recommended).
2. Create a new Vercel project from the repo.
3. Set environment variables from `.env` in Vercel (do not copy secrets into git).
4. Set `NEXTAUTH_URL` to your Vercel domain.
5. Add `CRON_SECRET` in Vercel. The cron route accepts either `x-vercel-cron` (default) or `x-cron-secret`.
6. Deploy. Use Vercel’s dashboard to confirm the cron job fires on the 2nd.

## Notes
- Google Sheets is the source of truth for calculated values.
- Survey adapters live in `src/lib/ingest/adapters/sources.ts`. Several use HTML scraping and may need tuning if site copy changes.
- FRED API key is required for UMCSENT, USEPUINDXD, and USACSCICP02STSAM series.
- The app stores draft HTML and uses Brevo marketing campaigns for scheduled sends.
- Ingest validation flags outliers when |z| >= 4 using Meta tab mean/stdev; warnings are included in admin alerts.
