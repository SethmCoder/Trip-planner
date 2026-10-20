# Supabase Setup — The Travel Log

To connect real Supabase (users create their own account):

1. Create a free project at https://supabase.com/dashboard
2. In the project, open **SQL Editor**, paste all of `supabase/schema.sql`, and run it. This creates `profiles`, `trips`, `itinerary_items`, Row Level Security policies, the new-user trigger, and the public `avatars` storage bucket.
3. Go to **Settings → API** and copy the Project URL and anon public key.
4. In this project, copy `.env.example` to `.env` and set:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
5. Restart `npm run dev`. The app automatically switches to Supabase when the keys are present — no code changes needed.

Notes:
- Auth uses Supabase Auth (email + password). Username login works by looking up the email for the username in `profiles`.
- If email confirmation is enabled in Supabase Auth settings, new users must confirm their email before first login; you can disable it under **Authentication → Providers → Email** for easier testing.
- Avatars upload to the `avatars` bucket under a folder named by user id.
