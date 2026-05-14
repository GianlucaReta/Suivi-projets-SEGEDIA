import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Jours fériés français (calcul algorithmique) ─────────
function joursFeriesFrance(annee: number): Set<string> {
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const moisP = Math.floor((h + l - 7 * m + 114) / 31);
  const jourP = ((h + l - 7 * m + 114) % 31) + 1;
  const paques = new Date(Date.UTC(annee, moisP - 1, jourP));
  const fmt  = (d: Date) => d.toISOString().split("T")[0];
  const plus = (d: Date, n: number) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return fmt(r); };
  const fixe = (m: number, j: number) => `${annee}-${String(m).padStart(2,"0")}-${String(j).padStart(2,"0")}`;
  return new Set([
    fixe(1,1), fixe(5,1), fixe(5,8), fixe(7,14),
    fixe(8,15), fixe(11,1), fixe(11,11), fixe(12,25),
    plus(paques, 1), plus(paques, 39), plus(paques, 50),
  ]);
}

Deno.serve(async () => {
  const maintenant  = new Date();
  const aujourd_hui = maintenant.toISOString().split("T")[0];
  const jourSemaine = maintenant.getUTCDay();

  if (jourSemaine === 0 || jourSemaine === 6) {
    return new Response(JSON.stringify({ message: "Week-end — pas d'envoi." }), { status: 200 });
  }
  const feries = joursFeriesFrance(maintenant.getUTCFullYear());
  if (feries.has(aujourd_hui)) {
    return new Response(JSON.stringify({ message: `Jour férié (${aujourd_hui}) — pas d'envoi.` }), { status: 200 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Récupère toutes les tâches en retard (date_fin_prevue dépassée, pas finies)
  const { data: taches, error } = await supabase
    .from("taches")
    .select(`
      id,
      description,
      date_fin_prevue,
      statut,
      projets ( nom, client ),
      tache_assignations (
        employes ( nom, email )
      )
    `)
    .lt("date_fin_prevue", aujourd_hui)
    .neq("statut", "fait")
    .not("date_fin_prevue", "is", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!taches || taches.length === 0) {
    return new Response(JSON.stringify({ message: "Aucune tâche en retard." }), { status: 200 });
  }

  // Groupe les tâches par employé
  const parEmploye: Record<string, { nom: string; email: string; taches: typeof taches }> = {};

  for (const tache of taches) {
    for (const assignation of tache.tache_assignations) {
      const employe = assignation.employes;
      if (!employe?.email) continue;

      if (!parEmploye[employe.email]) {
        parEmploye[employe.email] = { nom: employe.nom, email: employe.email, taches: [] };
      }
      parEmploye[employe.email].taches.push(tache);
    }
  }

  // Envoie un mail par employé
  const envois = Object.values(parEmploye).map(async ({ nom, email, taches: tachesEmploye }) => {
    const lignes = tachesEmploye.map((t) => {
      const projet = t.projets?.nom ?? "Projet inconnu";
      const client = t.projets?.client ?? "";
      const retard = Math.floor(
        (new Date(aujourd_hui).getTime() - new Date(t.date_fin_prevue!).getTime()) / (1000 * 60 * 60 * 24)
      );
      return `<li><b>${t.description}</b> — ${projet}${client ? ` (${client})` : ""} — <span style="color:#ef4444;">En retard de ${retard} jour${retard > 1 ? "s" : ""}</span></li>`;
    });

    const html = `
      <div style="font-family:sans-serif; max-width:600px; margin:auto;">
        <h2 style="color:#6366f1;">Rappel SuiviPro — Tâches en retard</h2>
        <p>Bonjour <b>${nom}</b>,</p>
        <p>Les tâches suivantes sont en retard et nécessitent votre attention :</p>
        <ul style="line-height:2;">
          ${lignes.join("")}
        </ul>
        <p>Connectez-vous à SuiviPro pour mettre à jour leur statut.</p>
        <p style="color:#94a3b8; font-size:0.85rem;">— SuiviPro SEGEDIA</p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "SuiviPro <alertes@segedia.fr>",
        to: [email],
        subject: `${tachesEmploye.length} tâche${tachesEmploye.length > 1 ? "s" : ""} en retard — SuiviPro`,
        html,
      }),
    });

    return { email, status: res.status };
  });

  const resultats = await Promise.all(envois);

  return new Response(JSON.stringify({ envois: resultats }), { status: 200 });
});
