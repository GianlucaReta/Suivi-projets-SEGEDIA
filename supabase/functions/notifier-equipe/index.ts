// Envoie un mail de notification interne (création/modification de tâche ou projet)
// à une liste de destinataires. Ne touche à aucune donnée métier (factures, relances).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { to, subject, html } = await req.json();

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "Paramètres manquants (to, subject, html)" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const demandes: string[] = (Array.isArray(to) ? to : [to])
      .filter((e: unknown) => typeof e === "string")
      .map((e: string) => e.trim().toLowerCase());

    // Sécurité : la clé publique du site permet d'appeler cette fonction, donc
    // n'importe qui pourrait envoyer des mails « SuiviPro » à n'importe qui.
    // On n'envoie qu'aux adresses des membres de l'équipe (table employes).
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: employes } = await db.from("employes").select("email").not("email", "is", null);
    const autorises = new Set((employes || []).map((e: { email: string }) => e.email.trim().toLowerCase()));
    const destinataires = [...new Set(demandes)].filter((e) => autorises.has(e));

    if (destinataires.length === 0) {
      return new Response(
        JSON.stringify({ message: "Aucun destinataire." }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "SuiviPro <alertes@segedia.fr>",
        reply_to: "info@segedia.fr",
        to: destinataires,
        subject,
        html,
        tags: [{ name: "type", value: "notif-activite" }],
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
    return new Response(
      JSON.stringify({ success: true, emailId: resendData.id ?? null }),
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
