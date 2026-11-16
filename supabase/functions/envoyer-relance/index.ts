import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY            = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Seule une personne connectée au site (session valide) peut déclencher un envoi
async function utilisateurConnecte(req: Request) {
  const jeton = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jeton) return null;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data } = await admin.auth.getUser(jeton);
  if (!data?.user) return null;
  const { data: e } = await admin.from("employes").select("id, nom, acces_factures").eq("auth_id", data.user.id).maybeSingle();
  return e;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const moi = await utilisateurConnecte(req);
  if (!moi || !moi.acces_factures) {
    return new Response(JSON.stringify({ error: "Connexion requise" }),
      { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  try {
    const { to, subject, html, ids, type } = await req.json();

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "Paramètres manquants (to, subject, html)" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Sécurité : la clé publique du site permet d'appeler cette fonction. Sans
    // contrôle, n'importe qui pouvait envoyer un mail « SEGEDIA SERVICES » à
    // n'importe quelle adresse. Une relance ne part donc que vers l'adresse
    // enregistrée pour le client des factures concernées.
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200) {
      return new Response(
        JSON.stringify({ error: "Factures concernées manquantes" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }
    const dbVerif = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: facs } = await dbVerif.from("factures").select("client").in("id", ids);
    const clients = [...new Set((facs || []).map((f: { client: string }) => f.client))];
    if (!facs || facs.length !== ids.length || clients.length !== 1) {
      return new Response(
        JSON.stringify({ error: "Factures introuvables ou de plusieurs clients" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }
    const { data: contacts } = await dbVerif.from("factures").select("email_client")
      .eq("client", clients[0]).not("email_client", "is", null);
    const adresses = new Set((contacts || []).map((c: { email_client: string }) => c.email_client.trim().toLowerCase()));
    if (typeof to !== "string" || !adresses.has(to.trim().toLowerCase())) {
      return new Response(
        JSON.stringify({ error: "Adresse non enregistrée pour ce client" }),
        { status: 403, headers: { ...CORS, "Content-Type": "application/json" } }
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
        reply_to: "info@segedia.fr",
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
