import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async () => {
  const maintenant = new Date();
  const aujourd_hui = maintenant.toISOString().split("T")[0];
  const jourSemaine = maintenant.getUTCDay();

  // Pas d'envoi le week-end
  if (jourSemaine === 0 || jourSemaine === 6) {
    return new Response(JSON.stringify({ message: "Week-end - pas d'envoi." }), { status: 200 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Récupère toutes les factures R1 envoyée mais R2 pas encore envoyée
  const { data: factures, error } = await supabase
    .from("factures")
    .select("id, numero, client, montant, date_relance, date_echeance")
    .eq("solde", false)
    .eq("litige", false)
    .not("date_relance", "is", null)
    .is("date_relance_r2", null)
    .is("date_appel", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  // Récupère la liste d'exclusion
  const { data: exclus } = await supabase.from("clients_exclus").select("nom");
  const nomsExclus = new Set((exclus || []).map((e: any) => e.nom));

  // Filtre : R1 envoyée depuis ≥ 15 jours, client non exclu
  const aujMs = new Date(aujourd_hui).getTime();
  const aRelancer = (factures || []).filter((f: any) => {
    if (nomsExclus.has(f.client)) return false;
    if (!f.date_relance) return false;
    const joursDepuisR1 = Math.floor((aujMs - new Date(f.date_relance).getTime()) / 86400000);
    return joursDepuisR1 >= 15;
  });

  if (aRelancer.length === 0) {
    return new Response(JSON.stringify({ message: "Aucune R2 à envoyer aujourd'hui." }), { status: 200 });
  }

  // Récupère le(s) email(s) des utilisateurs avec accès factures
  const { data: employes } = await supabase
    .from("employes")
    .select("nom, email")
    .eq("acces_factures", true)
    .not("email", "is", null);

  const destinataires = (employes || []).map((e: any) => e.email).filter(Boolean);
  if (destinataires.length === 0) {
    return new Response(JSON.stringify({ message: "Aucun destinataire (employes avec acces_factures + email)." }), { status: 200 });
  }

  // Groupe par client
  const parClient: Record<string, any[]> = {};
  for (const f of aRelancer) {
    if (!parClient[f.client]) parClient[f.client] = [];
    parClient[f.client].push(f);
  }

  const fmtEur = (v: number) => v.toLocaleString("fr-FR", { minimumFractionDigits: 2 });
  const fmtDate = (s: string) => {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  };

  const totalGlobal = aRelancer.reduce((s: number, f: any) => s + (parseFloat(f.montant) || 0), 0);
  const nbClients = Object.keys(parClient).length;

  const lignesClients = Object.entries(parClient)
    .map(([client, facs]) => {
      const total = facs.reduce((s, f) => s + (parseFloat(f.montant) || 0), 0);
      const joursR1Max = Math.max(...facs.map((f: any) => Math.floor((aujMs - new Date(f.date_relance).getTime()) / 86400000)));
      const factLignes = facs
        .map(
          (f: any) =>
            `<li style="margin-bottom:4px;"><b>${f.numero}</b> - ${fmtEur(parseFloat(f.montant))} € - échéance ${fmtDate(f.date_echeance)}</li>`
        )
        .join("");
      return `
        <div style="background:#fef2f2;border-left:4px solid #ef4444;border-radius:8px;padding:14px 18px;margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
            <b style="font-size:15px;color:#1a1815;">${client}</b>
            <span style="font-family:monospace;font-weight:700;color:#991b1b;">${fmtEur(total)} €</span>
          </div>
          <div style="font-size:12px;color:#7a766f;margin-bottom:8px;">R1 envoyée il y a ${joursR1Max} jour${joursR1Max > 1 ? "s" : ""}</div>
          <ul style="margin:0;padding-left:18px;color:#3a3733;font-size:13px;">${factLignes}</ul>
        </div>`;
    })
    .join("");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1a1815;max-width:640px;margin:0 auto;">
      <div style="border-bottom:2px solid #EE7E24;padding-bottom:12px;margin-bottom:20px;">
        <span style="font-weight:700;font-size:16px;color:#EE7E24;">SEGEDIA SERVICES - SuiviPro</span>
      </div>
      <h2 style="color:#1a1815;font-size:18px;margin:0 0 6px;">Relances R2 à envoyer</h2>
      <p style="color:#7a766f;margin:0 0 20px;">
        <b>${aRelancer.length}</b> facture${aRelancer.length > 1 ? "s" : ""} chez <b>${nbClients}</b> client${nbClients > 1 ? "s" : ""} - Total : <b style="font-family:monospace;color:#991b1b;">${fmtEur(totalGlobal)} €</b>
      </p>
      ${lignesClients}
      <div style="background:#fef3c7;border-radius:8px;padding:12px 16px;margin-top:20px;font-size:13px;color:#854d0e;">
        <b>Action recommandée :</b> ouvre l'onglet <b>Recouvrement</b> dans SuiviPro pour envoyer les R2 en un clic.
      </div>
      <div style="margin-top:24px;padding-top:12px;border-top:1px solid #eee;font-size:11.5px;color:#9ca3af;">
        Cet email est envoyé automatiquement par SuiviPro. Vérification quotidienne du jeudi.
      </div>
    </div>`;

  // Envoie l'email
  const responses = await Promise.all(
    destinataires.map((email: string) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "SuiviPro <suivipro@segedia.fr>",
          to: email,
          subject: `[SuiviPro] ${aRelancer.length} R2 à envoyer - ${fmtEur(totalGlobal)} €`,
          html,
        }),
      })
    )
  );

  const ok = responses.filter((r) => r.ok).length;
  return new Response(
    JSON.stringify({
      message: `Envoyé à ${ok}/${destinataires.length} destinataire(s)`,
      r2_a_envoyer: aRelancer.length,
      clients: nbClients,
      total_eur: totalGlobal,
    }),
    { status: 200 }
  );
});
