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

      // Marquer toutes les factures liées à cet email comme lues
      const { error } = await db
        .from("factures")
        .update({ relance_lue: true })
        .eq("relance_email_id", emailId)
        .eq("relance_lue", false); // seulement si pas déjà marqué

      if (error) console.error("Supabase update error:", error);
      else console.log(`Email ${emailId} marqué comme lu`);
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
