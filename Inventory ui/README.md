# YEN Inventory UI

Next.js frontend for warehouse and outlet inventory workflows, including physical stock updates, stock variance approval flows, and stock ledger reporting.

## Scripts

```bash
npm run dev
npm run build
npm run start
```

## Environment

The app expects client-side environment variables for API and runtime URLs:

- `NEXT_PUBLIC_LOCAL_URL`
- `NEXT_PUBLIC_PRODUCTION_URL`
- `NEXT_PUBLIC_LIVEDATE_URL`
- `NEXT_PUBLIC_LOGIN_URL`

## Current Deployment Shape

- App Router Next.js frontend
- Static export enabled in `next.config.ts`
- Browser talks directly to YEN ERP APIs
- Redux Toolkit used for inventory state management
