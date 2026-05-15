import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY            = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DESTINATAIRE              = "gianluca.reta@essca.eu";

// ── Jours fériés français (calcul algorithmique) ─────────
function joursFeriesFrance(annee: number): Set<string> {
  // Algorithme de Meeus/Jones/Butcher pour calculer la date de Pâques
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

  const fmt   = (d: Date) => d.toISOString().split("T")[0];
  const plus  = (d: Date, n: number) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return fmt(r); };
  const fixe  = (m: number, j: number) => `${annee}-${String(m).padStart(2,"0")}-${String(j).padStart(2,"0")}`;

  return new Set([
    fixe(1,  1),   // Nouvel An
    fixe(5,  1),   // Fête du Travail
    fixe(5,  8),   // Victoire 1945
    fixe(7,  14),  // Fête nationale
    fixe(8,  15),  // Assomption
    fixe(11, 1),   // Toussaint
    fixe(11, 11),  // Armistice
    fixe(12, 25),  // Noël
    plus(paques, 1),   // Lundi de Pâques
    plus(paques, 39),  // Ascension
    plus(paques, 50),  // Lundi de Pentecôte
  ]);
}

Deno.serve(async () => {
  const maintenant   = new Date();
  const aujourd_hui  = maintenant.toISOString().split("T")[0];
  const jourSemaine  = maintenant.getUTCDay(); // 0 = dim, 6 = sam

  // Pas d'envoi le week-end
  if (jourSemaine === 0 || jourSemaine === 6) {
    return new Response(JSON.stringify({ message: "Week-end — pas d'envoi." }), { status: 200 });
  }

  // Pas d'envoi les jours fériés
  const feries = joursFeriesFrance(maintenant.getUTCFullYear());
  if (feries.has(aujourd_hui)) {
    return new Response(JSON.stringify({ message: `Jour férié (${aujourd_hui}) — pas d'envoi.` }), { status: 200 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Exclure les clients de la liste d'exclusion
  const { data: exclus } = await supabase.from("clients_exclus").select("nom");
  const nomsExclus = new Set((exclus || []).map((e: any) => e.nom));

  const { data: toutesFactures, error } = await supabase
    .from("factures")
    .select("*")
    .lt("date_echeance", aujourd_hui)
    .eq("solde", false)
    .eq("litige", false)
    .not("date_echeance", "is", null)
    .order("date_echeance", { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const factures = (toutesFactures || []).filter((f: any) => !nomsExclus.has(f.client));

  if (!factures.length) {
    return new Response(JSON.stringify({ message: "Aucune facture en retard." }), { status: 200 });
  }

  const montantTotal = factures.reduce((s: number, f: any) => s + (parseFloat(f.montant) || 0), 0);

  // ── Section J+1 : factures échues hier exactement ─────────
  const hierDate = new Date(maintenant);
  hierDate.setUTCDate(hierDate.getUTCDate() - 1);
  const hier = hierDate.toISOString().split("T")[0];
  const facturesJ1 = factures.filter((f: any) => f.date_echeance === hier);

  let sectionJ1 = "";
  if (facturesJ1.length > 0) {
    const lignesJ1 = facturesJ1.map((f: any) => {
      const montantFmtJ1 = parseFloat(f.montant).toLocaleString("fr-FR", { minimumFractionDigits: 2 });
      return `
        <tr>
          <td style="padding:7px 12px;border-bottom:1px solid #fde68a;font-family:monospace;font-size:13px;color:#78350f;">${f.numero}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #fde68a;font-weight:600;color:#78350f;">${f.client}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #fde68a;text-align:right;font-family:monospace;font-weight:600;color:#78350f;">${montantFmtJ1} €</td>
        </tr>`;
    }).join("");
    sectionJ1 = `
      <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:16px;margin-bottom:24px;">
        <h3 style="color:#78350f;font-size:15px;margin:0 0 8px;">🔔 Nouvelles échéances dépassées aujourd'hui (J+1)</h3>
        <p style="color:#92400e;font-size:12px;margin:0 0 12px;">${facturesJ1.length} facture${facturesJ1.length > 1 ? "s" : ""} arrivée${facturesJ1.length > 1 ? "s" : ""} à échéance hier</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#fef3c7;">
              <th style="padding:6px 12px;text-align:left;font-size:10px;color:#92400e;text-transform:uppercase;letter-spacing:0.06em;">N° Facture</th>
              <th style="padding:6px 12px;text-align:left;font-size:10px;color:#92400e;text-transform:uppercase;letter-spacing:0.06em;">Client</th>
              <th style="padding:6px 12px;text-align:right;font-size:10px;color:#92400e;text-transform:uppercase;letter-spacing:0.06em;">Montant</th>
            </tr>
          </thead>
          <tbody>${lignesJ1}</tbody>
        </table>
      </div>`;
  }

  const lignes = factures.map((f: any) => {
    const joursRetard = Math.floor(
      (new Date(aujourd_hui).getTime() - new Date(f.date_echeance).getTime()) / 86400000
    );
    const montantFmt = parseFloat(f.montant).toLocaleString("fr-FR", { minimumFractionDigits: 2 });
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-family:monospace;font-size:13px;color:#555;">${f.numero}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-weight:600;">${f.client}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-family:monospace;font-weight:600;">${montantFmt} €</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#6b7280;">${f.date_echeance}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#ef4444;font-weight:600;">+${joursRetard} jour${joursRetard > 1 ? "s" : ""}</td>
      </tr>`;
  }).join("");

  const montantFmt = montantTotal.toLocaleString("fr-FR", { minimumFractionDigits: 2 });

  const html = `
    <div style="font-family:sans-serif;max-width:700px;margin:auto;color:#1a1a1a;">
      ${sectionJ1}
      <h2 style="color:#1a1a1a;font-size:18px;margin-bottom:4px;">Factures en retard de paiement</h2>
      <p style="color:#6b7280;font-size:13px;margin-top:0;">${factures.length} facture${factures.length > 1 ? "s" : ""} non soldée${factures.length > 1 ? "s" : ""} · Total : <strong>${montantFmt} €</strong></p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:13px;">
        <thead>
          <tr style="background:#f9f9f9;">
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid #e5e7eb;">N° Facture</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid #e5e7eb;">Client</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid #e5e7eb;">Montant</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid #e5e7eb;">Échéance</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid #e5e7eb;">Retard</th>
          </tr>
        </thead>
        <tbody>${lignes}</tbody>
      </table>
      <p style="margin-top:20px;font-size:13px;color:#6b7280;">Connectez-vous à SuiviPro pour mettre à jour les statuts.</p>
      <p style="color:#d1d5db;font-size:11px;margin-top:24px;">— SuiviPro SEGEDIA</p>
    </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "SuiviPro <alertes@segedia.fr>",
      to: [DESTINATAIRE],
      subject: `${factures.length} facture${factures.length > 1 ? "s" : ""} en retard · ${montantFmt} € à encaisser`,
      html,
    }),
  });

  return new Response(JSON.stringify({ envoi: { email: DESTINATAIRE, status: res.status }, nb: factures.length, montant: montantTotal }), { status: 200 });
});
