/**
 * Daily job: create in-app notifications (and optional email) when a booking window opens.
 *
 * Deploy:
 *   supabase functions deploy notify-booking-open
 *
 * Schedule (Dashboard → Edge Functions → notify-booking-open → Schedules):
 *   cron: 0 14 * * *   (every day at 14:00 UTC — adjust as you like)
 *
 * Secrets (optional email via Resend):
 *   RESEND_API_KEY=re_...
 *   NOTIFY_FROM_EMAIL=The Travel Log <onboarding@resend.dev>
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    const { data: createdCount, error: syncError } = await admin.rpc('sync_booking_open_notifications')
    if (syncError) throw syncError

    // Email newly created unread booking_open notifications from the last hour
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const from = Deno.env.get('NOTIFY_FROM_EMAIL') || 'The Travel Log <onboarding@resend.dev>'
    let emailsSent = 0

    if (resendKey) {
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const { data: fresh, error: listError } = await admin
        .from('notifications')
        .select('id, user_id, title, body, kind, created_at')
        .eq('kind', 'booking_open')
        .gte('created_at', since)

      if (listError) throw listError

      for (const n of fresh ?? []) {
        const { data: profile } = await admin
          .from('profiles')
          .select('email, username')
          .eq('id', n.user_id)
          .maybeSingle()
        if (!profile?.email) continue

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [profile.email],
            subject: n.title,
            text: `Hi ${profile.username || 'there'},\n\n${n.body}\n\n— The Travel Log`,
          }),
        })
        if (res.ok) emailsSent += 1
      }
    }

    return new Response(
      JSON.stringify({ ok: true, notificationsCreated: createdCount ?? 0, emailsSent }),
      { headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
