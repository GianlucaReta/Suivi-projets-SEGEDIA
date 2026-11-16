// Connexion par code à 6 chiffres.
// Le code est vérifié ici, côté serveur (il n'est jamais lisible depuis le site).
// S'il est bon, on renvoie un jeton à usage unique que le site échange contre
// une vraie session : sans session, la base ne renvoie plus aucune donnée.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ESSAIS_MAX = 8;          // échecs autorisés…
const FENETRE_MIN = 15;        // …par adresse IP sur cette durée

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "inconnue";

  try {
    // Trop d'échecs récents depuis cette adresse → on bloque un moment
    const depuis = new Date(Date.now() - FENETRE_MIN * 60000).toISOString();
    const { count } = await db.from("tentatives_connexion").select("id", { count: "exact", head: true })
      .eq("ip", ip).eq("reussi", false).gte("created_at", depuis);
    if ((count || 0) >= ESSAIS_MAX) {
      return json({ error: `Trop d'essais. Réessaie dans ${FENETRE_MIN} minutes.` }, 429);
    }

    const { code } = await req.json().catch(() => ({}));
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) return json({ error: "Code incorrect" }, 401);

    const { data: employeId } = await db.rpc("trouver_employe_par_code", { p_code: code });
    if (!employeId) {
      await db.from("tentatives_connexion").insert({ ip, reussi: false });
      return json({ error: "Code incorrect" }, 401);
    }

    const { data: e, error: errE } = await db.from("employes")
      .select("id, nom, equipe, role, acces_factures, pin_a_changer, auth_id").eq("id", employeId).single();
    if (errE || !e) throw errE || new Error("employé introuvable");

    // Compte de connexion créé à la première connexion (adresse technique, jamais utilisée pour des mails)
    const emailTechnique = `${e.id}@connexion.suivipro.invalid`;
    let authId = e.auth_id;
    if (!authId) {
      const { data: cree, error: errC } = await db.auth.admin.createUser({
        email: emailTechnique, email_confirm: true, user_metadata: { employe_id: e.id },
      });
      if (errC) throw errC;
      authId = cree.user.id;
      await db.from("employes").update({ auth_id: authId }).eq("id", e.id);
    }

    const { data: lien, error: errL } = await db.auth.admin.generateLink({ type: "magiclink", email: emailTechnique });
    if (errL) throw errL;

    await db.from("tentatives_connexion").insert({ ip, reussi: true });
    return json({
      token_hash: lien.properties.hashed_token,
      profil: { id: e.id, nom: e.nom, equipe: e.equipe, role: e.role, acces_factures: e.acces_factures, pin_a_changer: e.pin_a_changer },
    });
  } catch (err) {
    console.error("connexion:", err);
    return json({ error: "Connexion impossible pour le moment" }, 500);
  }
});
