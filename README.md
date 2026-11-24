# M-A Poultry Suppliers - Billing App

Mobile-first Urdu web app: PIN login, shopkeeper ledger, barcode invoices, PDF + WhatsApp sharing.
Stack: static HTML + one Vercel serverless function (api/rpc.js) + Supabase Postgres.

## Setup (about 15 minutes)

### 1. Supabase (free)
1. Create a project at supabase.com.
2. SQL Editor -> paste `supabase/schema.sql` -> Run.
3. Project Settings -> API: copy the **Project URL** and the **service_role** key (keep it secret).

### 2. Vercel (free)
1. Put this folder in a GitHub repo and import it in Vercel (or run `npx vercel` in this folder).
2. Add Environment Variables:
   - `SUPABASE_URL`  = your Project URL
   - `SUPABASE_SERVICE_KEY` = the service_role key
   - `APP_PIN` = 4-digit PIN (e.g. 4821)
   - `SESSION_SECRET` = any long random string
3. Deploy, open the URL on mobile, then "Add to Home Screen".

If you want a PIN of a different length, change `PIN_LEN` at the top of the script in index.html.

## Offline mode
- Open the app once online (twice for the Urdu font to be cached), then "Add to Home Screen". After that it opens with no network.
- Offline you can add shopkeepers, create bills, view invoices/ledgers and make PDFs. Everything is saved on the phone and queued.
- When the network returns the queue syncs automatically (banner at the top shows pending count; bills with an hourglass are not yet synced). Items are sent in order and are safe to retry (client-generated ids).
- Bill numbers are created on the device as `MA<yymmdd>-<2-letter device code><seq>`, e.g. `MA261124-KQ003`, so two phones never collide. If a clash ever happens the bill is renumbered during sync.
- Limits: logging in the first time (or after the 30-day session expires) needs internet. Data cached on a phone stays on that phone; lost/cleared browser data before a sync loses unsynced entries.

## Business details
Name, owner, phone numbers, address and the footer note on the invoice are in the `BIZ` object at the top of the script in index.html. Verify the address wording against your printed book.

## Security notes
- The browser never sees the Supabase key; every request goes through /api/rpc with a signed, HttpOnly cookie (30 days).
- Tables have RLS enabled with no public policies, so the Supabase anon key cannot read them.
- A 4-digit PIN is weak by nature; failed attempts are slowed and locked for 60 s after 5 tries.

## WhatsApp
- On phones, "Send on WhatsApp" opens the share sheet with the PDF attached: pick WhatsApp, then the shopkeeper.
- On desktop it downloads the PDF and opens a WhatsApp chat to the saved number; attach the file there.
- Fully automatic sending (no tapping) needs the WhatsApp Business Cloud API (Meta business verification, approved templates, per-message cost). It can be added later via another API route.
