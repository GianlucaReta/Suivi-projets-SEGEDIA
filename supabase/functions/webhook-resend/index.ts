import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    const payload = await req.json();
    console.log("Resend webhook received:", payload.type);

    // On traite uniquement les événements d'ouverture
    if (payload.type === "email.opened") {
      const emailId = payload.data?.email_id;
      if (!emailId) {
        return new Response("ok", { status: 200 });
      }

      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // Marquer les factures R1 comme lues
      const { error: err1 } = await db
        .from("factures")
        .update({ relance_lue: true })
        .eq("relance_email_id", emailId)
        .eq("relance_lue", false);

      if (err1) console.error("Supabase update error (R1):", err1);
      else console.log(`Email ${emailId} marqué comme lu (R1)`);

      // Marquer les factures R2 comme lues
      const { error: err2 } = await db
        .from("factures")
        .update({ relance_r2_lue: true })
        .eq("relance_r2_email_id", emailId)
        .eq("relance_r2_lue", false);

      if (err2) console.error("Supabase update error (R2):", err2);
      else console.log(`Email ${emailId} marqué comme lu (R2)`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("Webhook error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
