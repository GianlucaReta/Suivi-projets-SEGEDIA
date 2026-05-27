import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY            = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { to, subject, html, ids, type } = await req.json();

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "Paramètres manquants (to, subject, html)" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ── Envoi via Resend (avec suivi d'ouverture activé) ────────
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "SEGEDIA SERVICES <alertes@segedia.fr>",
        to: [to],
        subject,
        html,
        open_tracking: true,
        tags: [{ name: "type", value: "relance" }],
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("Resend error:", errText);
      return new Response(
        JSON.stringify({ error: `Erreur Resend : ${errText}` }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const resendData = await resendRes.json();
    const emailId = resendData.id ?? null;

    // ── Mise à jour factures selon le type de relance ──────────
    if (ids && ids.length > 0) {
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const dateAujourdhui = new Date().toISOString().split("T")[0];
      let updatePayload: Record<string, unknown>;
      if (type === "r2") {
        updatePayload = {
          date_relance_r2: dateAujourdhui,
          relance_r2_email_id: emailId,
          relance_r2_lue: false,
        };
      } else {
        // Par défaut (r1 ou compat. ascendante)
        updatePayload = {
          date_relance: dateAujourdhui,
          relance_email_id: emailId,
          relance_lue: false,
        };
      }
      const { error } = await db
        .from("factures")
        .update(updatePayload)
        .in("id", ids);
      if (error) console.error("Supabase update error:", error);
    }

    return new Response(
      JSON.stringify({ success: true, emailId }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("Unexpected error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
