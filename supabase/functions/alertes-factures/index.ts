import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY            = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DESTINATAIRE              = "gianlucareta21@gmail.com";

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

const fmtMontant = (v: number) => v.toLocaleString("fr-FR", { minimumFractionDigits: 2 });

Deno.serve(async () => {
  const maintenant   = new Date();
  const aujourd_hui  = maintenant.toISOString().split("T")[0];
  const jourSemaine  = maintenant.getUTCDay();

  // Pas d'envoi le week-end
  if (jourSemaine === 0 || jourSemaine === 6) {
    return new Response(JSON.stringify({ message: "Week-end - pas d'envoi." }), { status: 200 });
  }

  // Pas d'envoi les jours fériés
  const feries = joursFeriesFrance(maintenant.getUTCFullYear());
  if (feries.has(aujourd_hui)) {
    return new Response(JSON.stringify({ message: `Jour férié (${aujourd_hui}) - pas d'envoi.` }), { status: 200 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

  // ── Séparation par moyen de paiement dominant par client ──
  // Espèce & prélèvement ne sont pas de vrais impayés : en attente de
  // lettrage. On les isole du flux de relance (section dédiée).
  const MODES_LETTRAGE = new Set(["espèce", "prélèvement"]);
  const modeParClient: Record<string, Record<string, number>> = {};
  for (const f of factures) {
    const m = ((f.moyen_paiement as string) || "").toLowerCase().trim();
    if (!m) continue;
    (modeParClient[f.client] = modeParClient[f.client] || {})[m] =
      (modeParClient[f.client]?.[m] || 0) + 1;
  }
  const estLettrage = (client: string): boolean => {
    const counts = modeParClient[client];
    if (!counts) return false;
    let best: string | null = null, bestN = 0;
    for (const [m, n] of Object.entries(counts)) if (n > bestN) { best = m; bestN = n; }
    return best !== null && MODES_LETTRAGE.has(best);
  };
  const facturesRelance  = factures.filter((f: any) => !estLettrage(f.client));
  const facturesLettrage = factures.filter((f: any) => estLettrage(f.client));
  const montantLettrage  = facturesLettrage.reduce((s: number, f: any) => s + (parseFloat(f.montant) || 0), 0);
  const clientsLettrage  = new Set(facturesLettrage.map((f: any) => f.client)).size;

  // ── J+3 : factures À RELANCER échues exactement il y a 3 jours ──
  const dateJ3 = new Date(maintenant);
  dateJ3.setUTCDate(dateJ3.getUTCDate() - 3);
  const strJ3 = dateJ3.toISOString().split("T")[0];
  const facturesJ3 = facturesRelance.filter((f: any) => f.date_echeance === strJ3);
  const montantJ3  = facturesJ3.reduce((s: number, f: any) => s + (parseFloat(f.montant) || 0), 0);

  // ── Reste : autres factures À RELANCER en retard ──────────
  const facturesReste = facturesRelance.filter((f: any) => f.date_echeance !== strJ3);
  const montantReste  = facturesReste.reduce((s: number, f: any) => s + (parseFloat(f.montant) || 0), 0);
  const montantTotal  = facturesRelance.reduce((s: number, f: any) => s + (parseFloat(f.montant) || 0), 0);

  // ── Helper : tableau de lignes ─────────────────────────────
  const lignesTable = (arr: any[], showRetard: boolean) => arr.map((f: any) => {
    const joursRetard = Math.floor(
      (new Date(aujourd_hui).getTime() - new Date(f.date_echeance).getTime()) / 86400000
    );
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-family:monospace;font-size:12.5px;color:#555;">${f.numero}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-weight:600;font-size:13px;">${f.client}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-family:monospace;font-weight:600;font-size:13px;">${fmtMontant(parseFloat(f.montant))} €</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#6b7280;font-size:12.5px;">${f.date_echeance}</td>
        ${showRetard ? `<td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#ef4444;font-weight:600;font-size:12.5px;">+${joursRetard}j</td>` : ''}
      </tr>`;
  }).join("");

  const enteteTable = (showRetard: boolean) => `
    <thead>
      <tr style="background:#f9f9f9;">
        <th style="padding:8px 12px;text-align:left;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid #e5e7eb;">N° Facture</th>
        <th style="padding:8px 12px;text-align:left;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid #e5e7eb;">Client</th>
        <th style="padding:8px 12px;text-align:right;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid #e5e7eb;">Montant</th>
        <th style="padding:8px 12px;text-align:left;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid #e5e7eb;">Échéance</th>
        ${showRetard ? `<th style="padding:8px 12px;text-align:left;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid #e5e7eb;">Retard</th>` : ''}
      </tr>
    </thead>`;

  const totalRow = (montant: number, nb: number, showRetard: boolean) => `
    <tr style="background:#f9fafb;">
      <td colspan="${showRetard ? 2 : 2}" style="padding:10px 12px;font-size:12px;color:#6b7280;font-weight:600;">
        Total - ${nb} facture${nb > 1 ? "s" : ""}
      </td>
      <td style="padding:10px 12px;text-align:right;font-family:monospace;font-weight:700;font-size:14px;color:#1a1a1a;">${fmtMontant(montant)} €</td>
      <td colspan="${showRetard ? 2 : 1}"></td>
    </tr>`;

  // ── Section 1 : J+3 ──────────────────────────────────────
  const sectionJ3 = facturesJ3.length > 0 ? `
    <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:16px 20px;margin-bottom:28px;">
      <h3 style="color:#78350f;font-size:15px;margin:0 0 4px;">🔔 Nouvelles factures en dépassement J+3</h3>
      <p style="color:#92400e;font-size:12px;margin:0 0 14px;">Échues il y a 3 jours - ${facturesJ3.length} facture${facturesJ3.length > 1 ? "s" : ""}</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        ${enteteTable(false)}
        <tbody>
          ${lignesTable(facturesJ3, false)}
          ${totalRow(montantJ3, facturesJ3.length, false)}
        </tbody>
      </table>
    </div>` : `
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:14px 20px;margin-bottom:28px;">
      <p style="color:#166534;font-size:13px;font-weight:600;margin:0;">✅ Aucune nouvelle facture en dépassement J+3 aujourd'hui</p>
    </div>`;

  // ── Section 2 : Reste des retards ────────────────────────
  const sectionReste = facturesReste.length > 0 ? `
    <h2 style="color:#1a1a1a;font-size:16px;margin:0 0 4px;">Factures en retard (hors J+3)</h2>
    <p style="color:#6b7280;font-size:12.5px;margin:0 0 14px;">${facturesReste.length} facture${facturesReste.length > 1 ? "s" : ""}</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      ${enteteTable(true)}
      <tbody>
        ${lignesTable(facturesReste, true)}
        ${totalRow(montantReste, facturesReste.length, true)}
      </tbody>
    </table>` : `
    <p style="color:#6b7280;font-size:13px;">Aucune autre facture en retard.</p>`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:auto;color:#1a1a1a;padding:20px 0;">
      <div style="border-bottom:3px solid #EE7E24;padding-bottom:10px;margin-bottom:24px;">
        <span style="font-weight:700;font-size:18px;color:#EE7E24;">SEGEDIA SERVICES</span>
        <span style="color:#6b7280;font-size:13px;margin-left:12px;">Alerte factures - ${aujourd_hui}</span>
      </div>

      <div style="display:flex;gap:16px;margin-bottom:28px;">
        <div style="flex:1;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px;">
          <div style="font-size:10px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">À relancer</div>
          <div style="font-size:22px;font-weight:700;color:#991b1b;font-family:monospace;">${fmtMontant(montantTotal)} €</div>
          <div style="font-size:11px;color:#b91c1c;margin-top:2px;">${facturesRelance.length} facture${facturesRelance.length > 1 ? "s" : ""} · virement</div>
        </div>
        <div style="flex:1;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:14px;">
          <div style="font-size:10px;font-weight:700;color:#78350f;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Nouvelles J+3</div>
          <div style="font-size:22px;font-weight:700;color:#78350f;font-family:monospace;">${fmtMontant(montantJ3)} €</div>
          <div style="font-size:11px;color:#92400e;margin-top:2px;">${facturesJ3.length} facture${facturesJ3.length > 1 ? "s" : ""}</div>
        </div>
        <div style="flex:1;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;">
          <div style="font-size:10px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">🔵 En attente lettrage</div>
          <div style="font-size:22px;font-weight:700;color:#1e40af;font-family:monospace;">${fmtMontant(montantLettrage)} €</div>
          <div style="font-size:11px;color:#3b82f6;margin-top:2px;">${facturesLettrage.length} facture${facturesLettrage.length > 1 ? "s" : ""} · espèce/prélèv.</div>
        </div>
      </div>

      ${sectionJ3}
      ${sectionReste}

      ${facturesLettrage.length > 0 ? `
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 20px;margin-top:28px;">
          <h3 style="color:#1e40af;font-size:14px;margin:0 0 4px;">🔵 En attente de lettrage — pas de relance</h3>
          <p style="color:#3b82f6;font-size:12px;margin:0;">${facturesLettrage.length} facture${facturesLettrage.length > 1 ? "s" : ""} chez ${clientsLettrage} client${clientsLettrage > 1 ? "s" : ""} en espèce/prélèvement (${fmtMontant(montantLettrage)} €). Ce ne sont pas des impayés : en attente de validation/lettrage. Comptés dans l'encours mais hors relance.</p>
        </div>` : ""}

      <p style="margin-top:24px;font-size:12px;color:#9ca3af;border-top:1px solid #f0f0f0;padding-top:16px;">Connectez-vous à SuiviPro pour mettre à jour les statuts. - SuiviPro SEGEDIA</p>
    </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "SuiviPro <alertes@segedia.fr>",
      reply_to: "info@segedia.fr",
      to: [DESTINATAIRE],
      subject: `${facturesJ3.length > 0 ? `🔔 ${facturesJ3.length} nouvelle${facturesJ3.length > 1 ? "s" : ""} J+3 · ` : ""}${facturesRelance.length} à relancer · ${fmtMontant(montantTotal)} €`,
      html,
    }),
  });

  return new Response(
    JSON.stringify({
      envoi: { email: DESTINATAIRE, status: res.status },
      a_relancer: facturesRelance.length,
      montant_a_relancer: montantTotal,
      nbJ3: facturesJ3.length,
      en_attente_lettrage: facturesLettrage.length,
      montant_lettrage: montantLettrage,
    }),
    { status: 200 }
  );
});
