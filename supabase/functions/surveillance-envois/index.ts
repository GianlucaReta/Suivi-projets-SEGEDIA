// Vérifie chaque jour ouvré que les 3 alertes automatiques du matin sont bien
// parties (compte-rendu dans envois_auto). Sinon : mail aux administrateurs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ATTENDUES: Record<string, string> = {
  "alertes-factures": "Alerte factures en retard (7 h)",
  "alerte-r2-a-envoyer": "Rappel des R2 à envoyer (8 h)",
  "alertes-retard": "Rappel des tâches en retard (9 h)",
};

function joursFeriesFrance(annee: number): Set<string> {
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const paques = new Date(Date.UTC(annee, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1));
  const fmt = (x: Date) => x.toISOString().split("T")[0];
  const plus = (x: Date, n: number) => { const r = new Date(x); r.setUTCDate(r.getUTCDate() + n); return fmt(r); };
  const fixe = (mo: number, j: number) => `${annee}-${String(mo).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
  return new Set([fixe(1, 1), fixe(5, 1), fixe(5, 8), fixe(7, 14), fixe(8, 15), fixe(11, 1), fixe(11, 11), fixe(12, 25),
    plus(paques, 1), plus(paques, 39), plus(paques, 50)]);
}

Deno.serve(async () => {
  const maintenant = new Date();
  const jour = maintenant.toISOString().split("T")[0];
  const js = maintenant.getUTCDay();
  if (js === 0 || js === 6 || joursFeriesFrance(maintenant.getUTCFullYear()).has(jour)) {
    return new Response(JSON.stringify({ message: "Pas de vérification aujourd'hui." }), { status: 200 });
  }
  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: lignes } = await db.from("envois_auto").select("fonction, statut, detail, created_at")
    .gte("created_at", `${jour}T00:00:00Z`).order("created_at", { ascending: false });

  const problemes: string[] = [];
  for (const [fonction, libelle] of Object.entries(ATTENDUES)) {
    const derniere = (lignes || []).find((l) => l.fonction === fonction);
    if (!derniere) problemes.push(`<li><b>${libelle}</b> : ne s'est pas exécutée ce matin.</li>`);
    else if (derniere.statut === "erreur") {
      const detail = String(derniere.detail || "").replace(/[<>&]/g, " ").slice(0, 200);
      problemes.push(`<li><b>${libelle}</b> : erreur lors de l'envoi.<br><span style="color:#6b7280;font-size:12px;">${detail}</span></li>`);
    }
  }
  if (!problemes.length) return new Response(JSON.stringify({ message: "Tout est parti normalement." }), { status: 200 });

  const { data: admins } = await db.from("employes").select("email").eq("role", "admin").not("email", "is", null);
  const destinataires = (admins || []).map((a) => a.email).filter(Boolean);
  if (!destinataires.length) return new Response(JSON.stringify({ error: "Aucun admin avec un mail" }), { status: 500 });

  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1a1815;">
    <div style="border-bottom:2px solid #EE7E24;padding-bottom:10px;margin-bottom:18px;"><b style="color:#EE7E24;font-size:16px;">SuiviPro</b></div>
    <h2 style="font-size:17px;margin:0 0 10px;">⚠️ Des mails automatiques ne sont pas partis ce matin</h2>
    <ul style="line-height:1.7;padding-left:18px;">${problemes.join("")}</ul>
    <p style="font-size:13px;color:#6b7280;">Les alertes peuvent être relancées à la main depuis Supabase (Edge Functions → la fonction → « Test »), ou demande à Claude de regarder.</p>
  </div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "SuiviPro <alertes@segedia.fr>", reply_to: "info@segedia.fr", to: destinataires,
      subject: `⚠️ SuiviPro : ${problemes.length} alerte${problemes.length > 1 ? "s" : ""} automatique${problemes.length > 1 ? "s" : ""} non partie${problemes.length > 1 ? "s" : ""}`, html }),
  });
  return new Response(JSON.stringify({ problemes: problemes.length, mail: res.status }), { status: 200 });
});
