const SUPABASE_URL = 'https://guzbikygjwsvztlthmnr.supabase.co'
const SUPABASE_KEY = 'sb_publishable_BqknWAgxurkaidzDdyQ60g_GnlnIcYk'

const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── RECHERCHE GLOBALE ────────────────────────────────────
let _searchTimeout = null
function onSearchInput(val) {
  clearTimeout(_searchTimeout)
  if (!val || val.length < 2) { fermerRecherche(); return }
  _searchTimeout = setTimeout(() => lancerRecherche(val), 220)
}

async function lancerRecherche(query) {
  const q = query.toLowerCase().trim()
  if (!q) return
  const [r1, r2, r3] = await Promise.all([
    db.from('projets').select('id,nom,client').eq('archive', false),
    db.from('taches').select('id,description,statut,projets(nom)').eq('archive', false),
    utilisateurAccesFactures
      ? db.from('factures').select('id,numero,client,montant,solde')
      : Promise.resolve({ data: [] })
  ])
  const projets  = (r1.data || []).filter(p => p.nom?.toLowerCase().includes(q) || p.client?.toLowerCase().includes(q))
  const taches   = (r2.data || []).filter(t => t.description?.toLowerCase().includes(q))
  const factures = (r3.data || []).filter(f => f.numero?.toLowerCase().includes(q) || f.client?.toLowerCase().includes(q))
  afficherResultatsRecherche({ projets, taches, factures }, query)
}

function afficherResultatsRecherche({ projets, taches, factures }, query) {
  const el = document.getElementById('search-results')
  if (!el) return
  const total = projets.length + taches.length + factures.length
  if (!total) {
    el.innerHTML = `<div style="padding:12px 14px;color:var(--muted);font-size:12.5px;">Aucun résultat pour « ${query} »</div>`
    el.style.display = 'block'
    return
  }
  let html = ''
  if (projets.length) {
    html += `<div style="padding:6px 10px 2px;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Projets</div>`
    html += projets.slice(0, 4).map(p => `
      <div onclick="ouvrirDetailProjetId('${p.id}');fermerRecherche()" style="padding:7px 10px;cursor:pointer;border-radius:6px;display:flex;align-items:center;gap:6px;" onmouseover="this.style.background='var(--surface-alt)'" onmouseout="this.style.background=''">
        <span style="font-size:12.5px;font-weight:600;color:var(--ink);">${p.nom}</span>
        ${p.client ? `<span style="font-size:11px;color:var(--muted);">· ${p.client}</span>` : ''}
      </div>`).join('')
  }
  if (taches.length) {
    html += `<div style="padding:6px 10px 2px;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;font-weight:600;${projets.length ? 'border-top:1px solid var(--border-soft);margin-top:4px;' : ''}">Tâches</div>`
    html += taches.slice(0, 4).map(t => `
      <div onclick="ouvrirEditionTache('${t.id}');fermerRecherche()" style="padding:7px 10px;cursor:pointer;border-radius:6px;" onmouseover="this.style.background='var(--surface-alt)'" onmouseout="this.style.background=''">
        <div style="font-size:12.5px;color:var(--ink);">${t.description}</div>
        <div style="font-size:10.5px;color:var(--muted);">${t.projets?.nom || 'Sans projet'}</div>
      </div>`).join('')
  }
  if (factures.length) {
    html += `<div style="padding:6px 10px 2px;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;font-weight:600;${(projets.length||taches.length) ? 'border-top:1px solid var(--border-soft);margin-top:4px;' : ''}">Factures</div>`
    html += factures.slice(0, 4).map(f => `
      <div onclick="showPage('factures');fermerRecherche()" style="padding:7px 10px;cursor:pointer;border-radius:6px;display:flex;align-items:center;gap:8px;" onmouseover="this.style.background='var(--surface-alt)'" onmouseout="this.style.background=''">
        <span style="font-size:11.5px;font-family:'IBM Plex Mono',monospace;color:var(--ink-soft);">${f.numero}</span>
        <span style="font-size:12.5px;font-weight:600;color:var(--ink);">${f.client}</span>
      </div>`).join('')
  }
  el.innerHTML = html
  el.style.display = 'block'
}

function fermerRecherche() {
  const el = document.getElementById('search-results')
  if (el) el.style.display = 'none'
  const inp = document.getElementById('search-input')
  if (inp) inp.value = ''
}

// Fermer la recherche si clic extérieur
document.addEventListener('click', e => {
  if (!e.target.closest('#search-results') && !e.target.closest('#search-input')) fermerRecherche()
})

let projetActif = null
let tousLesEmployes = []
let tacheEnEdition = null
let projetEnEdition = null
let filtreProjetEquipe = 'tous'
let filtreProjetStatut = 'tous'
let filtreTacheStatut = 'tous'
let filtreTacheEquipe = 'tous'
let vueProjet = 'liste'
let vueTachesGlobal = 'liste'
let filtreFactures  = 'toutes'

// Utilisateur actif (persisté en localStorage)
let utilisateurActifId       = localStorage.getItem('suivi_user_id')          || null
let utilisateurActifNom      = localStorage.getItem('suivi_user_nom')         || null
let utilisateurActifEquipe   = localStorage.getItem('suivi_user_equipe')      || null
let utilisateurAccesFactures = localStorage.getItem('suivi_acces_factures') === '1'

// --- NAVIGATION ---
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  document.getElementById('page-' + page).classList.add('active')
  const navMap = { dashboard: 'dashboard', projets: 'projet', taches: 'tâche', employes: 'équipe', archives: 'archive' }
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.textContent.toLowerCase().includes(navMap[page])) n.classList.add('active')
  })
  if (page === 'dashboard') chargerDashboard()
  if (page === 'projets') chargerProjets()
  if (page === 'taches') { projetActif = null; chargerTachesGlobal() }
  if (page === 'employes') chargerEmployes()
  if (page === 'archives') chargerArchives()
  if (page === 'calendrier') afficherCalendrier()
  if (page === 'factures') chargerFactures()
}

// --- UTILISATEUR ACTIF ---
function selectionnerUtilisateur(id, nom, equipe, accesFactures = false) {
  utilisateurActifId       = id
  utilisateurActifNom      = nom
  utilisateurActifEquipe   = equipe
  utilisateurAccesFactures = accesFactures
  localStorage.setItem('suivi_user_id',          id)
  localStorage.setItem('suivi_user_nom',         nom)
  localStorage.setItem('suivi_user_equipe',      equipe)
  localStorage.setItem('suivi_acces_factures',   accesFactures ? '1' : '0')
  fermerModals()
  mettreAJourSidebarUser()
  chargerDashboard()
}

function mettreAJourSidebarUser() {
  const avatarEl = document.getElementById('sidebar-user-avatar')
  const nomEl    = document.getElementById('sidebar-user-nom')
  const roleEl   = document.getElementById('sidebar-user-role')
  if (utilisateurActifNom) {
    if (avatarEl) avatarEl.textContent = initialesNom(utilisateurActifNom)
    if (nomEl)    nomEl.textContent    = utilisateurActifNom
    if (roleEl)   roleEl.textContent   = utilisateurActifEquipe || 'Utilisateur'
  }
  // Afficher/masquer l'onglet Factures selon les droits
  const navFinance  = document.getElementById('nav-finance')
  const navSectionF = document.getElementById('nav-section-finance')
  const show = utilisateurAccesFactures ? 'block' : 'none'
  if (navFinance)  navFinance.style.display  = show
  if (navSectionF) navSectionF.style.display = show
}

async function ouvrirSelecteurUtilisateur() {
  document.getElementById('modal-selecteur-user').classList.remove('hidden')
  const { data } = await db.from('employes').select('*').order('nom')
  const container = document.getElementById('liste-selecteur-users')
  if (!container || !data) return
  container.innerHTML = data.map(e => {
    const actif = utilisateurActifId === e.id
    const ini   = initialesNom(e.nom)
    return `
      <div onclick="selectionnerUtilisateur('${e.id}','${e.nom}','${e.equipe}',${!!e.acces_factures})"
           style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;cursor:pointer;border:1.5px solid ${actif ? 'var(--brand)' : 'var(--border)'};background:${actif ? 'var(--brand-soft)' : 'var(--surface)'};margin-bottom:8px;">
        <div style="width:36px;height:36px;border-radius:8px;background:${avatarColor(ini)};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;flex-shrink:0;">${ini}</div>
        <div>
          <div style="font-weight:600;color:var(--ink);">${e.nom}</div>
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;">${e.equipe}</div>
        </div>
        ${actif ? '<div style="margin-left:auto;color:var(--brand);font-weight:700;">✓</div>' : ''}
      </div>`
  }).join('')
}

// --- DASHBOARD ---
async function chargerDashboard() {
  const aujourd_hui = new Date().toISOString().split('T')[0]

  // Greeting
  const greetingEl = document.getElementById('dashboard-greeting')
  if (greetingEl) {
    const now     = new Date()
    const semaine = getNumSemaine(now)
    const dateStr = now.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
    const nom = utilisateurActifNom
    greetingEl.innerHTML = nom
      ? `<h1 class="page-title" style="font-size:26px;letter-spacing:-0.02em;">Bonjour, ${nom}</h1>
         <p style="color:var(--muted);font-size:12.5px;margin-top:3px;text-transform:capitalize;">${dateStr} · Semaine ${semaine}</p>`
      : `<h1 class="page-title" style="font-size:26px;">Dashboard</h1>
         <p style="color:var(--muted);font-size:12.5px;margin-top:3px;text-transform:capitalize;">${dateStr}</p>`
  }

  // Stats
  const [r1, r2, r3, r4] = await Promise.all([
    db.from('projets').select('*', { count:'exact', head:true }).eq('statut','en cours').eq('archive', false),
    db.from('taches').select('*',  { count:'exact', head:true }).lt('date_fin_prevue', aujourd_hui).neq('statut','fait').eq('archive', false),
    db.from('taches').select('*',  { count:'exact', head:true }).eq('priorite','urgent').neq('statut','fait').eq('archive', false),
    db.from('taches').select('*',  { count:'exact', head:true }).eq('statut','fait').eq('archive', false),
  ])
  document.getElementById('stat-projets').textContent = r1.count ?? 0
  document.getElementById('stat-retard').textContent  = r2.count ?? 0
  document.getElementById('stat-urgent').textContent  = r3.count ?? 0
  document.getElementById('stat-fait').textContent    = r4.count ?? 0

  // ── Projets actifs ──────────────────────────────────────────
  const { data: projets } = await db.from('projets').select('*').eq('statut','en cours').eq('archive', false).order('created_at', { ascending: false })
  const containerPP = document.getElementById('dashboard-projets-prioritaires')

  if (projets && projets.length) {
    const avecPct = await Promise.all(projets.slice(0, 6).map(async p => {
      const { count: total } = await db.from('taches').select('*', { count:'exact', head:true }).eq('projet_id', p.id).eq('archive', false)
      const { count: faites } = await db.from('taches').select('*', { count:'exact', head:true }).eq('projet_id', p.id).eq('archive', false).eq('statut','fait')
      const pct = (total || 0) > 0 ? Math.round(((faites || 0) / (total || 1)) * 100) : 0
      return { ...p, pct }
    }))

    containerPP.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;">
        <div style="padding:14px 16px;border-bottom:1px solid var(--border-soft);display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:700;font-size:14px;color:var(--ink);">Projets actifs</div>
            <div style="font-size:11.5px;color:var(--muted);margin-top:1px;">En cours d'exécution</div>
          </div>
          <button onclick="showPage('projets')" style="font-size:11.5px;color:var(--brand);background:none;border:none;cursor:pointer;font-family:inherit;font-weight:600;">Voir tous →</button>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
          <thead>
            <tr style="background:var(--surface-alt);">
              <th style="padding:8px 16px;text-align:left;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Projet</th>
              <th style="padding:8px 16px;text-align:left;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Client</th>
              <th style="padding:8px 16px;text-align:left;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;font-weight:600;min-width:100px;">Avancement</th>
            </tr>
          </thead>
          <tbody>
            ${avecPct.map(p => `
              <tr onclick="ouvrirDetailProjetId('${p.id}')" style="border-top:1px solid var(--border-soft);cursor:pointer;" onmouseover="this.style.background='var(--surface-alt)'" onmouseout="this.style.background=''">
                <td style="padding:10px 16px;vertical-align:middle;">
                  <div style="font-weight:600;color:var(--ink);">${p.nom}</div>
                  <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin-top:1px;">${p.equipe || '—'}</div>
                </td>
                <td style="padding:10px 16px;color:var(--ink-soft);vertical-align:middle;font-size:12px;">${p.client || '—'}</td>
                <td style="padding:10px 16px;vertical-align:middle;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <div style="flex:1;height:4px;background:var(--surface-alt);border-radius:2px;min-width:60px;">
                      <div style="width:${p.pct}%;height:100%;background:${p.pct===100?'var(--success)':'var(--brand)'};border-radius:2px;"></div>
                    </div>
                    <span style="font-size:11px;font-family:'IBM Plex Mono',monospace;color:var(--ink-soft);">${p.pct}%</span>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`
  } else {
    containerPP.innerHTML = '<p style="color:var(--muted);">Aucun projet en cours.</p>'
  }

  // ── Mes tâches ───────────────────────────────────────────────
  const containerMT = document.getElementById('dashboard-mes-taches')
  if (utilisateurActifId) {
    const { data: assignations } = await db.from('tache_assignations')
      .select('taches(*, projets(nom))')
      .eq('employe_id', utilisateurActifId)

    const mesTaches = (assignations || [])
      .map(a => a.taches)
      .filter(t => t && t.statut !== 'fait' && !t.archive)
      .sort((a, b) => {
        if (!a.date_fin_prevue) return 1
        if (!b.date_fin_prevue) return -1
        return a.date_fin_prevue.localeCompare(b.date_fin_prevue)
      })

    const enRetardCount = mesTaches.filter(t => t.date_fin_prevue && t.date_fin_prevue < aujourd_hui).length

    containerMT.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;">
        <div style="padding:14px 16px;border-bottom:1px solid var(--border-soft);display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:700;font-size:14px;color:var(--ink);">Mes tâches</div>
            <div style="font-size:11.5px;color:var(--muted);margin-top:1px;">${mesTaches.length} à traiter${enRetardCount > 0 ? ` · <span style="color:var(--danger);">${enRetardCount} en retard</span>` : ''}</div>
          </div>
          <button onclick="showPage('taches')" style="font-size:11.5px;color:var(--brand);background:none;border:none;cursor:pointer;font-family:inherit;font-weight:600;">Tout voir →</button>
        </div>
        <div style="padding:8px;">
          ${mesTaches.length === 0
            ? '<p style="color:var(--muted);font-size:13px;padding:12px 8px;">Aucune tâche assignée — tout est à jour !</p>'
            : mesTaches.slice(0, 7).map(t => {
                const enRetard = t.date_fin_prevue && t.date_fin_prevue < aujourd_hui
                return `
                  <div onclick="ouvrirEditionTache('${t.id}')" style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;cursor:pointer;margin-bottom:2px;" onmouseover="this.style.background='var(--surface-alt)'" onmouseout="this.style.background=''">
                    <div style="width:15px;height:15px;border-radius:4px;border:1.5px solid ${enRetard ? 'var(--danger)' : 'var(--border)'};flex-shrink:0;"></div>
                    <div style="flex:1;min-width:0;">
                      <div style="font-size:12.5px;font-weight:500;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.description}</div>
                      <div style="font-size:11px;color:var(--muted);margin-top:1px;">${t.projets?.nom || 'Sans projet'}</div>
                    </div>
                    <div style="font-size:11px;color:${enRetard ? 'var(--danger)' : 'var(--muted)'};font-weight:${enRetard ? '600' : '400'};font-family:'IBM Plex Mono',monospace;flex-shrink:0;white-space:nowrap;">
                      ${t.date_fin_prevue ? formatDate(t.date_fin_prevue) : ''}
                    </div>
                  </div>`
              }).join('')}
        </div>
      </div>`
  } else {
    containerMT.innerHTML = `
      <div style="background:var(--brand-soft);border:1px solid #f0d5b0;border-radius:12px;padding:20px;text-align:center;">
        <div style="font-size:28px;margin-bottom:8px;">👤</div>
        <div style="font-weight:700;color:var(--ink);margin-bottom:4px;">Personnalisez votre dashboard</div>
        <div style="font-size:12.5px;color:var(--muted);margin-bottom:14px;">Sélectionnez votre profil pour voir vos tâches assignées</div>
        <button onclick="ouvrirSelecteurUtilisateur()" class="btn btn-primary" style="font-size:12.5px;">Choisir mon profil</button>
      </div>`
  }

  // ── Tâches en retard (globales) ──────────────────────────────
  const { data: retard } = await db.from('taches')
    .select('*, projets(nom)')
    .lt('date_fin_prevue', aujourd_hui)
    .neq('statut', 'fait')
    .eq('archive', false)
    .order('date_fin_prevue', { ascending: true })

  const containerR = document.getElementById('dashboard-retard')
  if (!retard || !retard.length) { containerR.innerHTML = ''; return }

  containerR.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;">
      <div style="padding:14px 16px;border-bottom:1px solid var(--border-soft);">
        <div style="font-weight:700;font-size:14px;color:var(--danger);">Retards équipe</div>
        <div style="font-size:11.5px;color:var(--muted);margin-top:1px;">${retard.length} tâche${retard.length > 1 ? 's' : ''} en retard</div>
      </div>
      <div style="padding:8px;">
        ${retard.slice(0, 5).map(t => {
          const jours = Math.floor((new Date(aujourd_hui) - new Date(t.date_fin_prevue)) / 86400000)
          return `
            <div onclick="ouvrirEditionTache('${t.id}')" style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;cursor:pointer;margin-bottom:2px;" onmouseover="this.style.background='var(--surface-alt)'" onmouseout="this.style.background=''">
              <div style="width:6px;height:6px;border-radius:3px;background:var(--danger);flex-shrink:0;"></div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:12.5px;font-weight:500;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.description}</div>
                <div style="font-size:11px;color:var(--muted);">${t.projets?.nom || 'Sans projet'}</div>
              </div>
              <div style="font-size:11px;color:var(--danger);font-weight:600;font-family:'IBM Plex Mono',monospace;white-space:nowrap;">+${jours}j</div>
            </div>`
        }).join('')}
      </div>
    </div>`

  // ── Widget factures (Gianluca seulement) ─────────────────────
  const containerF = document.getElementById('dashboard-factures')
  if (containerF && utilisateurAccesFactures) {
    const [{ data: facturesTout }, { data: exclusDash }] = await Promise.all([
      db.from('factures').select('client,montant,solde,date_echeance'),
      db.from('clients_exclus').select('nom')
    ])
    const nomsExclusDash = new Set((exclusDash || []).map(e => e.nom))
    const fNonSolde  = (facturesTout || []).filter(f => !f.solde && !nomsExclusDash.has(f.client))
    const fEnRetard  = fNonSolde.filter(f => !nomsExclusDash.has(f.client) && f.date_echeance && f.date_echeance < aujourd_hui)
    const totalAtt   = fNonSolde.reduce((s, f) => s + (parseFloat(f.montant) || 0), 0)
    const totalRetard= fEnRetard.reduce((s, f)  => s + (parseFloat(f.montant) || 0), 0)
    const fmt = v => v.toLocaleString('fr-FR', { minimumFractionDigits: 2 })
    containerF.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;">
        <div style="padding:14px 16px;border-bottom:1px solid var(--border-soft);display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:700;font-size:14px;color:var(--ink);">Factures</div>
            <div style="font-size:11.5px;color:var(--muted);margin-top:1px;">${fNonSolde.length} en attente · <span style="color:${fEnRetard.length > 0 ? 'var(--danger)' : 'var(--success)'};">${fEnRetard.length} en retard</span></div>
          </div>
          <button onclick="showPage('factures')" style="font-size:11.5px;color:var(--brand);background:none;border:none;cursor:pointer;font-family:inherit;font-weight:600;">Voir →</button>
        </div>
        <div style="padding:14px 16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <span style="font-size:12px;color:var(--muted);">À encaisser</span>
            <span style="font-size:15px;font-weight:700;font-family:'IBM Plex Mono',monospace;color:var(--ink);">${fmt(totalAtt)} €</span>
          </div>
          ${fEnRetard.length > 0 ? `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:#fef2f2;border-radius:7px;">
            <span style="font-size:11.5px;color:var(--danger);font-weight:500;">${fEnRetard.length} facture${fEnRetard.length > 1 ? 's' : ''} en retard</span>
            <span style="font-size:13px;font-weight:700;font-family:'IBM Plex Mono',monospace;color:var(--danger);">${fmt(totalRetard)} €</span>
          </div>` : `
          <div style="display:flex;align-items:center;gap:6px;padding:7px 10px;background:#f0fdf4;border-radius:7px;">
            <span style="color:var(--success);font-size:13px;">✓</span>
            <span style="font-size:11.5px;color:var(--success);font-weight:500;">Aucune facture en retard</span>
          </div>`}
        </div>
      </div>`
  } else if (containerF) {
    containerF.innerHTML = ''
  }

  // Historique des actions
  chargerHistorique()
}

// --- PROJETS ---
function renderTabsProjet(counts) {
  const tabs = [
    { val: 'tous',       label: 'Tous',        count: counts.tous },
    { val: 'en cours',   label: 'Actifs',       count: counts['en cours'] },
    { val: 'en attente', label: 'En attente',   count: counts['en attente'] },
    { val: 'fait',       label: 'Terminés',     count: counts['fait'] },
  ]
  const equipes = [
    { val: 'tous',         label: 'Toutes les équipes' },
    { val: 'technique',    label: '🔧 Technique' },
    { val: 'operationnel', label: '⚙️ Opérationnel' },
    { val: 'commercial',   label: '💼 Commercial' },
  ]
  return `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; gap:12px; flex-wrap:wrap;">
      <div style="display:flex; gap:2px; background:var(--surface); padding:3px; border-radius:8px; border:1px solid var(--border);">
        ${tabs.map(t => `
          <button onclick="setFiltreProjetStatut('${t.val}')" style="
            background:${filtreProjetStatut === t.val ? 'var(--brand-soft)' : 'transparent'};
            color:${filtreProjetStatut === t.val ? 'var(--brand-deep)' : 'var(--muted)'};
            border:none; cursor:pointer; padding:6px 12px; border-radius:6px;
            font-size:12.5px; font-weight:${filtreProjetStatut === t.val ? '600' : '500'};
            font-family:inherit; display:flex; align-items:center; gap:6px; white-space:nowrap;
          ">${t.label}<span style="font-size:10.5px; font-family:'IBM Plex Mono',monospace; background:${filtreProjetStatut === t.val ? 'white' : 'var(--surface-alt)'}; color:${filtreProjetStatut === t.val ? 'var(--brand-deep)' : 'var(--muted)'}; padding:1px 5px; border-radius:3px;">${t.count}</span></button>
        `).join('')}
      </div>
    </div>
    <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:14px;">
      ${equipes.map(e => `
        <button onclick="setFiltreProjetEquipe('${e.val}')" style="
          background:${filtreProjetEquipe === e.val ? 'var(--ink)' : 'var(--surface)'};
          color:${filtreProjetEquipe === e.val ? '#fff' : 'var(--muted)'};
          border:1px solid ${filtreProjetEquipe === e.val ? 'var(--ink)' : 'var(--border)'};
          cursor:pointer; padding:4px 12px; border-radius:20px;
          font-size:12px; font-weight:${filtreProjetEquipe === e.val ? '600' : '400'};
          font-family:inherit; white-space:nowrap; transition:all 0.1s;
        ">${e.label}</button>
      `).join('')}
    </div>`
}

function setFiltreProjetEquipe(val) { filtreProjetEquipe = val; chargerProjets() }
function setFiltreProjetStatut(val) { filtreProjetStatut = val; chargerProjets() }

function statutBadge(statut) {
  const map = {
    'en cours':   { dot: 'var(--success)', bg: 'var(--success-bg)', color: 'var(--success)', label: 'En cours' },
    'en attente': { dot: 'var(--warn)',    bg: 'var(--warn-bg)',    color: 'var(--warn)',    label: 'En attente' },
    'fait':       { dot: 'var(--muted)',   bg: 'var(--surface-alt)', color: 'var(--muted)', label: 'Terminé' },
  }
  const s = map[statut] || map['en attente']
  return `<span style="display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:600; padding:3px 8px; border-radius:4px; background:${s.bg}; color:${s.color};">
    <span style="width:6px;height:6px;border-radius:3px;background:${s.dot};display:inline-block;"></span>${s.label}
  </span>`
}

async function chargerProjets() {
  const { data } = await db.from('projets').select('*').eq('archive', false).order('created_at', { ascending: false })
  const filterEl = document.getElementById('filtres-projets')
  const container = document.getElementById('liste-projets')

  if (!data || !data.length) {
    if (filterEl) filterEl.innerHTML = ''
    container.innerHTML = '<p style="color:var(--muted); padding:20px;">Aucun projet pour le moment.</p>'
    return
  }

  // Compter par statut pour les tabs
  const counts = { tous: data.length, 'en cours': 0, 'en attente': 0, 'fait': 0 }
  data.forEach(p => { if (counts[p.statut] !== undefined) counts[p.statut]++ })
  if (filterEl) filterEl.innerHTML = renderTabsProjet(counts)

  const filtered = data.filter(p => {
    const okStatut = filtreProjetStatut === 'tous' || p.statut === filtreProjetStatut
    const okEquipe = filtreProjetEquipe === 'tous' || p.equipe === filtreProjetEquipe
    return okStatut && okEquipe
  })

  if (!filtered.length) {
    container.innerHTML = '<p style="color:var(--muted); padding:20px;">Aucun projet pour ce filtre.</p>'
    return
  }

  // Charger les progressions
  const projetsAvecPct = await Promise.all(filtered.map(async projet => {
    const { count: total } = await db.from('taches').select('*', { count: 'exact', head: true }).eq('projet_id', projet.id).eq('archive', false)
    const { count: faites } = await db.from('taches').select('*', { count: 'exact', head: true }).eq('projet_id', projet.id).eq('archive', false).eq('statut', 'fait')
    const pct = (total || 0) > 0 ? Math.round(((faites || 0) / (total || 1)) * 100) : 0
    return { ...projet, total: total || 0, faites: faites || 0, pct }
  }))

  const aujourd_hui = new Date().toISOString().split('T')[0]

  container.style.display = 'block'
  container.innerHTML = `
    <div style="background:var(--surface); border:1px solid var(--border); border-radius:12px; overflow:hidden;">
      <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
        <thead>
          <tr style="background:var(--surface-alt); border-bottom:1px solid var(--border-soft);">
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.08em; font-weight:600;">Projet</th>
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.08em; font-weight:600;">Client</th>
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.08em; font-weight:600;">Équipe</th>
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.08em; font-weight:600; min-width:140px;">Avancement</th>
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.08em; font-weight:600;">Statut</th>
          </tr>
        </thead>
        <tbody>
          ${projetsAvecPct.map(p => {
            const equipeLabel = { technique: 'Technique', operationnel: 'Opérationnel', commercial: 'Commercial' }[p.equipe] || p.equipe || '—'
            const equipeColor = { technique: 'var(--brand)', operationnel: 'var(--success)', commercial: 'var(--warn)' }[p.equipe] || 'var(--muted)'
            return `<tr onclick="ouvrirDetailProjetId('${p.id}')" style="border-bottom:1px solid var(--border-soft); cursor:pointer; transition:background 0.12s;" onmouseover="this.style.background='var(--surface-alt)'" onmouseout="this.style.background='transparent'">
              <td style="padding:12px 16px; vertical-align:middle;">
                <div style="font-size:10px; color:var(--muted); font-family:'IBM Plex Mono',monospace; letter-spacing:0.04em; margin-bottom:2px;">${p.equipe?.toUpperCase() || 'PROJET'}</div>
                <div style="font-weight:600; color:var(--ink); font-size:13px;">${p.nom}</div>
              </td>
              <td style="padding:12px 16px; color:var(--ink-soft); vertical-align:middle;">${p.client || '—'}</td>
              <td style="padding:12px 16px; vertical-align:middle;">
                <span style="font-size:11px; font-weight:500; color:${equipeColor}; background:${equipeColor}18; padding:2px 8px; border-radius:4px;">${equipeLabel}</span>
              </td>
              <td style="padding:12px 16px; vertical-align:middle;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <div style="flex:1; height:4px; background:var(--surface-alt); border-radius:2px; overflow:hidden; min-width:80px;">
                    <div style="width:${p.pct}%; height:100%; background:${p.pct === 100 ? 'var(--success)' : 'var(--brand)'}; border-radius:2px;"></div>
                  </div>
                  <span style="font-size:11px; color:var(--ink-soft); font-family:'IBM Plex Mono',monospace; min-width:30px;">${p.pct}%</span>
                </div>
                <div style="font-size:10.5px; color:var(--muted); margin-top:2px;">${p.faites}/${p.total} tâches</div>
              </td>
              <td style="padding:12px 16px; vertical-align:middle;">${statutBadge(p.statut)}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>
    <div style="font-size:11.5px; color:var(--muted); margin-top:10px; text-align:right;">${filtered.length} projet${filtered.length > 1 ? 's' : ''} affiché${filtered.length > 1 ? 's' : ''}</div>
  `
}

// Ouvrir un projet par ID depuis le tableau
async function ouvrirDetailProjetId(id) {
  const { data } = await db.from('projets').select('*').eq('id', id).single()
  if (data) ouvrirDetailProjet(data)
}

// --- ARCHIVES ---
async function chargerArchives() {
  const { data } = await db.from('projets').select('*').eq('archive', true).order('created_at', { ascending: false })
  const container = document.getElementById('liste-archives')
  if (!data || !data.length) {
    container.innerHTML = '<p style="color:var(--text-muted);">Aucun projet archivé.</p>'
    return
  }
  container.innerHTML = ''
  for (const projet of data) {
    const { count } = await db.from('taches').select('*', { count: 'exact', head: true }).eq('projet_id', projet.id)
    const card = document.createElement('div')
    card.className = `projet-card ${projet.equipe || 'technique'}`
    card.style.opacity = '0.7'
    card.innerHTML = `
      <h3>${projet.nom}</h3>
      <p class="client">${projet.client || 'Aucun client'}</p>
      <div class="projet-card-footer">
        <span class="badge fait">Archivé</span>
        <span class="nb-taches">${count || 0} tâche${count > 1 ? 's' : ''}</span>
      </div>
      <div style="display:flex; gap:0.5rem; margin-top:0.8rem;">
        <button class="btn btn-secondary" style="flex:1; font-size:0.8rem;" onclick="event.stopPropagation(); desarchiverProjet('${projet.id}')">↩ Désarchiver</button>
        <button class="btn btn-danger" style="font-size:0.8rem; padding:0.4rem 0.8rem;" onclick="event.stopPropagation(); supprimerProjetDefinitif('${projet.id}', '${projet.nom.replace(/'/g, "\\'")}')" title="Supprimer définitivement">🗑</button>
      </div>
    `
    card.addEventListener('click', () => ouvrirDetailProjet(projet))
    container.appendChild(card)
  }
}

async function archiverProjet() {
  if (!projetActif) return
  if (!confirm(`Archiver le projet "${projetActif.nom}" et toutes ses tâches ?`)) return
  await db.from('projets').update({ archive: true }).eq('id', projetActif.id)
  await db.from('taches').update({ archive: true }).eq('projet_id', projetActif.id)
  showPage('projets')
}

async function supprimerProjetDefinitif(id, nom) {
  const confirmation = confirm(`⚠️ Supprimer définitivement "${nom}" ?\n\nCette action est irréversible : le projet et toutes ses tâches seront effacés définitivement.`)
  if (!confirmation) return
  // Double confirmation pour une suppression définitive
  const double = confirm(`Dernière confirmation : supprimer "${nom}" et toutes ses tâches de façon permanente ?`)
  if (!double) return
  // Supprimer dans l'ordre : assignations → commentaires → tâches → projet
  const { data: taches } = await db.from('taches').select('id').eq('projet_id', id)
  const tacheIds = (taches || []).map(t => t.id)
  if (tacheIds.length) {
    await db.from('tache_assignations').delete().in('tache_id', tacheIds)
    await db.from('commentaires_taches').delete().in('tache_id', tacheIds)
  }
  await db.from('taches').delete().eq('projet_id', id)
  await db.from('projets').delete().eq('id', id)
  chargerArchives()
}

async function desarchiverProjet(id) {
  await db.from('projets').update({ archive: false }).eq('id', id)
  await db.from('taches').update({ archive: false }).eq('projet_id', id)
  chargerArchives()
}

// --- DETAIL PROJET ---
async function ouvrirDetailProjet(projet) {
  projetActif = projet
  vueProjet = 'liste'
  showPage('detail')
  document.getElementById('detail-titre').textContent = projet.nom
  document.getElementById('detail-client').textContent = projet.client || ''
  document.getElementById('detail-badge').innerHTML = `<span class="badge ${projet.statut.replace(' ', '-')}">${projet.statut}</span>`
  const btnVue = document.getElementById('btn-vue-projet')
  if (btnVue) btnVue.textContent = 'Vue Kanban'
  chargerTachesDetail()
  chargerCommentaires()
}

async function chargerTachesDetail() {
  if (!projetActif) return
  let query = db.from('taches').select('*').eq('projet_id', projetActif.id).order('created_at', { ascending: false })
  if (!projetActif.archive) query = query.eq('archive', false)
  const { data } = await query
  const container = document.getElementById('detail-taches')
  const kanbanEl = document.getElementById('detail-kanban')
  const ganttSection = document.getElementById('section-gantt')
  const aujourd_hui = new Date().toISOString().split('T')[0]

  // Toujours appliquer la bonne vue avant d'afficher les données
  appliquerVueProjet()

  if (!data || !data.length) {
    container.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1rem;">Aucune tâche pour ce projet.</p>'
    document.getElementById('detail-gantt').innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">Aucune tâche avec des dates.</p>'
    ;['body-en-attente','body-en-cours','body-fait'].forEach(id => {
      const el = document.getElementById(id)
      if (el) el.innerHTML = '<p class="kanban-empty">Aucune tâche</p>'
    })
    return
  }

  const tachesAvecAssignations = await Promise.all(data.map(async t => {
    const { data: assignations } = await db.from('tache_assignations').select('employes(nom, equipe)').eq('tache_id', t.id)
    return { ...t, assignations: assignations || [] }
  }))

  if (vueProjet === 'kanban') {
    afficherKanban(tachesAvecAssignations, aujourd_hui)
  } else {

    container.innerHTML = tachesAvecAssignations.map(t => {
      const enRetard = t.date_fin_prevue && t.date_fin_prevue < aujourd_hui && t.statut !== 'fait'
      const classe = enRetard ? 'retard' : t.priorite
      const membres = t.assignations.map(a => a.employes?.nom).filter(Boolean).join(', ')
      return `
        <div class="tache-item ${classe}" style="cursor:pointer;" onclick="ouvrirEditionTache('${t.id}')">
          <div class="tache-info">
            <div class="tache-desc">${t.description}</div>
            <div class="tache-meta">
              ${membres ? membres + ' · ' : ''}
              ${t.date_debut ? formatDate(t.date_debut) + ' → ' : ''}
              ${t.date_fin_prevue ? formatDate(t.date_fin_prevue) : ''}
              ${enRetard ? ' · <span style="color:var(--danger); font-weight:600;">Retard</span>' : ''}
            </div>
          </div>
          <div style="display:flex; gap:0.4rem; flex-wrap:wrap; justify-content:flex-end; align-items:center;">
            <span class="badge ${t.statut.replace(' ', '-')}" style="cursor:pointer;" title="Cliquer pour changer le statut" onclick="changerStatutTache('${t.id}', '${t.statut}', event)">↻ ${t.statut}</span>
            <span class="badge ${t.priorite}">${t.priorite}</span>
            <span style="font-size:11px; color:var(--muted); padding:2px 8px; border:1px solid var(--border); border-radius:5px; background:var(--surface-alt); white-space:nowrap;">Éditer</span>
          </div>
        </div>
      `
    }).join('')

    afficherGantt(tachesAvecAssignations, aujourd_hui)
  }
}

function basculerVueProjet() {
  vueProjet = vueProjet === 'liste' ? 'kanban' : 'liste'
  const btn = document.getElementById('btn-vue-projet')
  if (btn) btn.textContent = vueProjet === 'kanban' ? 'Vue liste' : 'Vue Kanban'
  appliquerVueProjet()
  chargerTachesDetail()
}

function appliquerVueProjet() {
  const container  = document.getElementById('detail-taches')
  const kanbanEl   = document.getElementById('detail-kanban')
  const ganttSection = document.getElementById('section-gantt')
  if (!container || !kanbanEl) return
  if (vueProjet === 'kanban') {
    container.style.display  = 'none'
    if (ganttSection) ganttSection.style.display = 'none'
    kanbanEl.style.display   = 'block'
  } else {
    container.style.display  = 'block'
    if (ganttSection) ganttSection.style.display = 'block'
    kanbanEl.style.display   = 'none'
  }
}

function initialesNom(nom) {
  if (!nom) return '?'
  const parts = nom.trim().split(' ')
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase()
}

function avatarColor(initiales) {
  const colors = ['#1A1815','#EE7E24','#3A3733','#7A766F','#C25E10','#5A4A3A']
  const code = (initiales.charCodeAt(0) || 0) + (initiales.charCodeAt(1) || 0)
  return colors[code % colors.length]
}

function afficherKanban(taches, aujourd_hui) {
  const colonnes = {
    'en attente': 'body-en-attente',
    'en cours':   'body-en-cours',
    'fait':       'body-fait'
  }
  const counts = {
    'en attente': 'count-en-attente',
    'en cours':   'count-en-cours',
    'fait':       'count-fait'
  }

  for (const [statut, bodyId] of Object.entries(colonnes)) {
    const tachesDuStatut = taches.filter(t => t.statut === statut)
    const col = document.getElementById(bodyId)
    const countEl = document.getElementById(counts[statut])
    if (countEl) countEl.textContent = tachesDuStatut.length

    if (!tachesDuStatut.length) {
      col.innerHTML = '<p class="kanban-empty">Glisser une tâche ici</p>'
      continue
    }

    col.innerHTML = tachesDuStatut.map(t => {
      const enRetard = t.date_fin_prevue && aujourd_hui && t.date_fin_prevue < aujourd_hui && t.statut !== 'fait'
      const membres = t.assignations?.map(a => a.employes?.nom).filter(Boolean) || []
      const isUrgent = t.priorite === 'urgent'
      const highlight = isUrgent && statut === 'en cours'

      const avatars = membres.slice(0, 3).map(nom => {
        const ini = initialesNom(nom)
        const col = avatarColor(ini)
        return `<div title="${nom}" style="width:24px;height:24px;border-radius:6px;background:${col};color:#fff;font-size:9.5px;font-weight:600;display:flex;align-items:center;justify-content:center;letter-spacing:0.02em;border:2px solid #fff;flex-shrink:0;">${ini}</div>`
      }).join('')

      return `
        <div class="kanban-card ${t.priorite}${enRetard ? ' retard' : ''}"
             draggable="true" data-id="${t.id}" data-statut="${t.statut}"
             ondragstart="onDragStart(event)" ondragend="onDragEnd(event)"
             onclick="ouvrirEditionTache('${t.id}')"
             style="${highlight ? 'box-shadow:0 0 0 1.5px var(--brand),0 2px 6px rgba(238,126,36,0.12);' : ''}">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
            <span style="width:4px;height:4px;border-radius:2px;background:${isUrgent ? 'var(--brand)' : 'var(--muted-soft)'};display:inline-block;flex-shrink:0;"></span>
            <span style="font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:0.06em; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${projetActif?.nom || ''}</span>
          </div>
          <div class="kanban-card-desc">${t.description}</div>
          ${t.priorite === 'urgent' ? `<div style="display:inline-flex; align-items:center; margin-top:8px; font-size:10px; font-weight:600; color:var(--brand-deep); background:var(--brand-soft); padding:1px 7px; border-radius:3px;">Urgent</div>` : ''}
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
            <div style="display:flex; gap:-4px;">${avatars || '<div style="width:24px;height:24px;border-radius:6px;background:var(--surface-alt);border:2px solid var(--border);"></div>'}</div>
            ${t.date_fin_prevue ? `<div style="font-size:10.5px; color:${enRetard ? 'var(--danger)' : 'var(--muted)'}; font-weight:${enRetard ? '600' : '500'}; font-family:'IBM Plex Mono',monospace;">${enRetard ? '⚑ ' : ''}${formatDate(t.date_fin_prevue)}</div>` : ''}
          </div>
        </div>
      `
    }).join('')
  }
}

function onDragStart(event) {
  event.dataTransfer.setData('tacheId', event.currentTarget.dataset.id)
  event.dataTransfer.effectAllowed = 'move'
  setTimeout(() => event.currentTarget.classList.add('dragging'), 0)
}

function onDragEnd(event) {
  event.currentTarget.classList.remove('dragging')
  document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'))
}

function onDragOver(event) {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  event.currentTarget.classList.add('drag-over')
}

function onDragLeave(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    event.currentTarget.classList.remove('drag-over')
  }
}

async function onDrop(event) {
  event.preventDefault()
  event.currentTarget.classList.remove('drag-over')
  const tacheId = event.dataTransfer.getData('tacheId')
  const nouveauStatut = event.currentTarget.dataset.statut
  if (!tacheId || !nouveauStatut) return
  await db.from('taches').update({ statut: nouveauStatut }).eq('id', tacheId)
  if (projetActif) chargerTachesDetail()
  else chargerTachesGlobal()
}

// --- GANTT ---
function afficherGantt(taches, aujourd_hui) {
  const avecDates = taches.filter(t => t.date_debut && t.date_fin_prevue)
  const ganttEl = document.getElementById('detail-gantt')
  if (!avecDates.length) {
    ganttEl.innerHTML = '<p style="color:var(--muted); font-size:0.85rem; padding:8px 0;">Aucune tâche avec des dates — ajoutez une date de début et de fin à vos tâches pour voir le Gantt.</p>'
    return
  }

  const dates = avecDates.flatMap(t => [new Date(t.date_debut), new Date(t.date_fin_prevue)])
  const minDate = new Date(Math.min(...dates))
  const maxDate = new Date(Math.max(...dates))
  minDate.setDate(minDate.getDate() - 2)
  maxDate.setDate(maxDate.getDate() + 3)

  // Cap à 150 jours pour éviter un Gantt infini
  const totalJoursRaw = Math.ceil((maxDate - minDate) / 86400000)
  const totalJours = Math.min(totalJoursRaw, 150)
  if (totalJoursRaw > 150) maxDate.setTime(minDate.getTime() + 150 * 86400000)

  const largeurJour = 24
  const largeurLabel = 160
  const largeurTotal = totalJours * largeurJour
  const rowHeight = 32
  const aujourd_huiDate = new Date()
  aujourd_huiDate.setHours(0,0,0,0)

  // Mois headers
  const moisNoms = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
  let mois = []
  let curMois = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
  while (curMois <= maxDate) { mois.push(new Date(curMois)); curMois.setMonth(curMois.getMonth() + 1) }

  let headerMois = ''
  for (const m of mois) {
    const debutMois = new Date(m.getFullYear(), m.getMonth(), 1)
    const finMois   = new Date(m.getFullYear(), m.getMonth() + 1, 0)
    const debutC = debutMois < minDate ? minDate : debutMois
    const finC   = finMois   > maxDate ? maxDate : finMois
    const left  = Math.ceil((debutC - minDate) / 86400000) * largeurJour
    const width = (Math.ceil((finC - debutC) / 86400000) + 1) * largeurJour
    headerMois += `<div style="position:absolute;left:${left}px;top:0;width:${width}px;font-size:10px;font-weight:700;color:var(--brand-deep);border-left:1px solid var(--border);padding-left:5px;height:18px;line-height:18px;overflow:hidden;white-space:nowrap;">${moisNoms[m.getMonth()]} ${m.getFullYear()}</div>`
  }

  // Jours headers
  let headerJours = ''
  for (let i = 0; i < totalJours; i++) {
    const d = new Date(minDate); d.setDate(d.getDate() + i)
    const isToday   = d.getTime() === aujourd_huiDate.getTime()
    const isWeekend = d.getDay() === 0 || d.getDay() === 6
    headerJours += `<div style="position:absolute;left:${i*largeurJour}px;top:0;width:${largeurJour}px;text-align:center;font-size:9px;color:${isToday?'var(--brand)':isWeekend?'var(--muted-soft)':'var(--muted)'};font-weight:${isToday?'700':'400'};height:18px;line-height:18px;border-left:1px solid var(--border-soft);">${d.getDate()}</div>`
  }

  // Fond commun (1 seule fois, pas par ligne)
  let fondCommun = ''
  for (let i = 0; i < totalJours; i++) {
    const d = new Date(minDate); d.setDate(d.getDate() + i)
    const isToday   = d.getTime() === aujourd_huiDate.getTime()
    const isWeekend = d.getDay() === 0 || d.getDay() === 6
    if (isWeekend) fondCommun += `<div style="position:absolute;left:${i*largeurJour}px;top:0;width:${largeurJour}px;height:100%;background:rgba(0,0,0,0.025);"></div>`
    if (isToday)   fondCommun += `<div style="position:absolute;left:${i*largeurJour}px;top:0;width:2px;height:100%;background:var(--brand);opacity:0.5;z-index:1;"></div>`
  }

  // Labels colonne gauche (fixed)
  const labelsHtml = avecDates.map(t => `
    <div style="height:${rowHeight}px;display:flex;align-items:center;padding:0 8px;border-bottom:1px solid var(--border-soft);overflow:hidden;">
      <span style="font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ink);" title="${t.description}">${t.description}</span>
    </div>`).join('')

  // Barres tâches (sans fond intégré)
  const barsHtml = avecDates.map(t => {
    const debut = new Date(t.date_debut); debut.setHours(0,0,0,0)
    const fin   = new Date(t.date_fin_prevue); fin.setHours(0,0,0,0)
    const leftJ  = Math.max(0, Math.round((debut - minDate) / 86400000))
    const rightJ = Math.min(totalJours, Math.round((fin - minDate) / 86400000) + 1)
    const left  = leftJ * largeurJour
    const width = Math.max((rightJ - leftJ) * largeurJour, largeurJour)
    const enRetard = fin < aujourd_huiDate && t.statut !== 'fait'
    const couleur  = enRetard ? 'var(--danger)' : t.priorite === 'urgent' ? 'var(--brand)' : '#4F87C5'
    const opacity  = t.statut === 'fait' ? '0.4' : '0.85'
    const label    = t.description.length > 14 ? t.description.slice(0,14)+'…' : t.description
    return `
      <div style="height:${rowHeight}px;position:relative;border-bottom:1px solid var(--border-soft);">
        <div onclick="ouvrirEditionTache('${t.id}')" title="${t.description} · ${t.statut}" style="position:absolute;left:${left}px;width:${width}px;height:20px;top:6px;background:${couleur};border-radius:4px;opacity:${opacity};display:flex;align-items:center;padding:0 6px;cursor:pointer;z-index:2;">
          <span style="font-size:9.5px;color:#fff;white-space:nowrap;overflow:hidden;font-weight:500;">${t.statut==='fait'?'✓ ':''}${label}</span>
        </div>
      </div>`
  }).join('')

  const totalHeight = avecDates.length * rowHeight

  ganttEl.innerHTML = `
    <div style="display:flex;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--surface);">
      <!-- Colonne labels (fixed) -->
      <div style="flex-shrink:0;width:${largeurLabel}px;border-right:2px solid var(--border);background:var(--surface);z-index:3;">
        <div style="height:38px;background:var(--surface-alt);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 8px;">
          <span style="font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;">Tâche</span>
        </div>
        ${labelsHtml}
      </div>
      <!-- Zone scrollable -->
      <div style="overflow-x:auto;flex:1;min-width:0;">
        <div style="min-width:${largeurTotal}px;">
          <div style="position:relative;height:20px;background:var(--surface-alt);border-bottom:1px solid var(--border-soft);">${headerMois}</div>
          <div style="position:relative;height:18px;background:var(--surface-alt);border-bottom:1px solid var(--border);">${headerJours}</div>
          <!-- Fond + barres -->
          <div style="position:relative;height:${totalHeight}px;">
            <div style="position:absolute;inset:0;overflow:hidden;pointer-events:none;">${fondCommun}</div>
            ${barsHtml}
          </div>
        </div>
      </div>
    </div>
  `
}

function getNumSemaine(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
}

// --- EDITION TACHE ---
async function ouvrirEditionTache(id) {
  const { data: t } = await db.from('taches').select('*').eq('id', id).single()
  if (!t) return
  tacheEnEdition = t

  const { data: assignations } = await db.from('tache_assignations').select('employe_id').eq('tache_id', id)
  const assignesIds = (assignations || []).map(a => a.employe_id)

  await chargerEmployes()

  document.getElementById('input-tache-desc').value = t.description
  document.getElementById('input-tache-priorite').value = t.priorite
  document.getElementById('input-tache-statut').value = t.statut
  document.getElementById('input-tache-debut').value = t.date_debut || ''
  document.getElementById('input-tache-fin').value = t.date_fin_prevue || ''
  document.getElementById('erreur-dates').style.display = 'none'

  // Cocher les bons employés
  document.querySelectorAll('input[name="employe-checkbox"]').forEach(cb => {
    cb.checked = assignesIds.includes(cb.value)
  })

  document.getElementById('btn-supprimer-tache').style.display = 'block'
  document.querySelector('#modal-tache h2').textContent = 'Modifier la tâche'
  // Afficher la section commentaires (uniquement en édition)
  const secCom = document.getElementById('section-commentaires-tache')
  if (secCom) { secCom.style.display = 'block'; chargerCommentairesTache(id) }
  document.getElementById('modal-tache').classList.remove('hidden')
}

// --- COMMENTAIRES ---
async function chargerCommentaires() {
  const { data } = await db.from('projets').select('commentaire').eq('id', projetActif.id).single()
  const container = document.getElementById('liste-commentaires')
  if (data?.commentaire) {
    const lines = data.commentaire.split('\n---\n').filter(Boolean)
    container.innerHTML = lines.reverse().map(l => `
      <div style="padding:0.6rem 0; border-bottom:1px solid var(--border); font-size:0.85rem; color:var(--text);">${l}</div>
    `).join('')
  } else {
    container.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">Aucun commentaire.</p>'
  }
}

async function ajouterCommentaire() {
  const texte = document.getElementById('input-commentaire').value.trim()
  if (!texte) return
  const { data } = await db.from('projets').select('commentaire').eq('id', projetActif.id).single()
  const ancien = data?.commentaire || ''
  const nouveau = ancien + (ancien ? '\n---\n' : '') + `[${new Date().toLocaleDateString('fr-FR')}] ${texte}`
  await db.from('projets').update({ commentaire: nouveau }).eq('id', projetActif.id)
  document.getElementById('input-commentaire').value = ''
  chargerCommentaires()
}

async function changerStatutTache(id, statutActuel, event) {
  event.stopPropagation()
  const ordre = ['en attente', 'en cours', 'fait']
  const nouveauStatut = ordre[(ordre.indexOf(statutActuel) + 1) % ordre.length]
  const { data: t } = await db.from('taches').select('description').eq('id', id).single()
  await db.from('taches').update({ statut: nouveauStatut }).eq('id', id)
  if (t) logAction('tache_statut', 'taches', id, `"${t.description}" → ${nouveauStatut}`)
  if (projetActif) chargerTachesDetail()
  else chargerTachesGlobal()
}

async function supprimerTache() {
  if (!tacheEnEdition) return
  if (!confirm('Supprimer cette tâche définitivement ?')) return
  await db.from('tache_assignations').delete().eq('tache_id', tacheEnEdition.id)
  await db.from('taches').delete().eq('id', tacheEnEdition.id)
  fermerModals()
  if (projetActif) chargerTachesDetail()
  else chargerTachesGlobal()
}

// ── COMMENTAIRES SUR TÂCHES ──────────────────────────────
async function chargerCommentairesTache(tacheId) {
  const { data } = await db.from('commentaires_taches')
    .select('*')
    .eq('tache_id', tacheId)
    .order('created_at', { ascending: false })
  const container = document.getElementById('commentaires-tache-liste')
  if (!container) return
  if (!data || !data.length) {
    container.innerHTML = '<p style="color:var(--muted);font-size:12px;padding:4px 0;">Aucun commentaire.</p>'
    return
  }
  container.innerHTML = data.map(c => `
    <div style="padding:8px 0;border-bottom:1px solid var(--border-soft);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
        <span style="font-size:11px;font-weight:600;color:var(--ink);">${c.auteur}</span>
        <span style="font-size:10.5px;color:var(--muted);">${new Date(c.created_at).toLocaleDateString('fr-FR', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
      </div>
      <div style="font-size:12.5px;color:var(--ink-soft);line-height:1.5;white-space:pre-wrap;">${c.contenu}</div>
    </div>
  `).join('')
}

async function ajouterCommentaireTache() {
  if (!tacheEnEdition) return
  const input = document.getElementById('input-commentaire-tache')
  const contenu = input?.value?.trim()
  if (!contenu) return
  const auteur = utilisateurActifNom || 'Anonyme'
  const { error } = await db.from('commentaires_taches').insert({ tache_id: tacheEnEdition.id, auteur, contenu })
  if (!error) {
    input.value = ''
    logAction('commentaire', 'taches', tacheEnEdition.id, `Commentaire sur "${tacheEnEdition.description}"`)
    chargerCommentairesTache(tacheEnEdition.id)
  }
}

// --- TACHES GLOBAL ---
function renderFiltresTache() {
  const statuts = [
    { val: 'tous', label: 'Tous' },
    { val: 'en cours', label: 'En cours' },
    { val: 'en attente', label: 'En attente' },
    { val: 'fait', label: 'Fait' },
    { val: 'urgent', label: '🔴 Urgent' },
    { val: 'retard', label: '⚠ Retard' }
  ]
  const equipes = [
    { val: 'tous', label: 'Toutes' },
    { val: 'technique', label: '🔧 Technique' },
    { val: 'operationnel', label: '⚙️ Opérationnel' },
    { val: 'commercial', label: '💼 Commercial' },
  ]
  return `
    <div style="display:flex; gap:0.4rem; flex-wrap:wrap; margin-bottom:0.5rem; align-items:center;">
      ${statuts.map(s => `<button class="btn ${filtreTacheStatut === s.val ? 'btn-primary' : 'btn-secondary'}" style="padding:3px 12px; font-size:0.78rem;" onclick="setFiltreTacheStatut('${s.val}')">${s.label}</button>`).join('')}
    </div>
    <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:1rem; align-items:center;">
      ${equipes.map(e => `<button style="background:${filtreTacheEquipe===e.val?'var(--ink)':'var(--surface)'};color:${filtreTacheEquipe===e.val?'#fff':'var(--muted)'};border:1px solid ${filtreTacheEquipe===e.val?'var(--ink)':'var(--border)'};cursor:pointer;padding:3px 11px;border-radius:20px;font-size:11.5px;font-weight:${filtreTacheEquipe===e.val?'600':'400'};font-family:inherit;white-space:nowrap;" onclick="setFiltreTacheEquipe('${e.val}')">${e.label}</button>`).join('')}
    </div>`
}

function setFiltreTacheStatut(val) { filtreTacheStatut = val; chargerTachesGlobal() }
function setFiltreTacheEquipe(val) { filtreTacheEquipe = val; chargerTachesGlobal() }

function setVueTachesGlobal(vue) {
  vueTachesGlobal = vue
  ;[['btn-taches-liste','liste'],['btn-taches-kanban','kanban']].forEach(([id, v]) => {
    const btn = document.getElementById(id)
    if (!btn) return
    btn.style.background  = vue === v ? 'var(--brand-soft)' : 'transparent'
    btn.style.color       = vue === v ? 'var(--brand-deep)' : 'var(--muted)'
    btn.style.fontWeight  = vue === v ? '600' : '500'
  })
  chargerTachesGlobal()
}

async function chargerTachesGlobal() {
  const aujourd_hui = new Date().toISOString().split('T')[0]

  // Filtre visible uniquement en vue liste
  const filterEl = document.getElementById('filtres-taches')
  if (filterEl) filterEl.style.display = vueTachesGlobal === 'liste' ? 'block' : 'none'
  if (filterEl && vueTachesGlobal === 'liste') filterEl.innerHTML = renderFiltresTache()

  // Basculer les conteneurs
  const listeEl  = document.getElementById('liste-taches-global')
  const kanbanEl = document.getElementById('kanban-taches-global')
  if (listeEl)  listeEl.style.display  = vueTachesGlobal === 'liste'  ? 'block' : 'none'
  if (kanbanEl) kanbanEl.style.display = vueTachesGlobal === 'kanban' ? 'block' : 'none'

  const { data } = await db.from('taches').select('*, projets(nom, equipe)').eq('archive', false).order('date_fin_prevue', { ascending: true })
  if (!data || !data.length) {
    if (listeEl) listeEl.innerHTML = '<p style="color:var(--muted);">Aucune tâche.</p>'
    return
  }

  const tachesAvecAssignations = await Promise.all(data.map(async t => {
    const { data: assignations } = await db.from('tache_assignations').select('employes(nom)').eq('tache_id', t.id)
    return { ...t, assignations: assignations || [] }
  }))

  // Stats bar
  const actives  = tachesAvecAssignations.filter(t => t.statut !== 'fait').length
  const enRetardAll = tachesAvecAssignations.filter(t => t.date_fin_prevue && t.date_fin_prevue < aujourd_hui && t.statut !== 'fait').length
  const statsEl = document.getElementById('taches-stats-bar')
  if (statsEl) statsEl.innerHTML = `${actives} tâche${actives>1?'s':''} actives · <span style="color:${enRetardAll>0?'var(--danger)':'var(--success)'};">${enRetardAll} en retard</span>`

  if (vueTachesGlobal === 'kanban') {
    afficherKanbanGlobal(tachesAvecAssignations, aujourd_hui)
    return
  }

  // ── VUE LISTE ──────────────────────────────────────────────
  const filtered = tachesAvecAssignations.filter(t => {
    const enRetard = t.date_fin_prevue && t.date_fin_prevue < aujourd_hui && t.statut !== 'fait'
    const okStatut = filtreTacheStatut === 'retard' ? enRetard
      : filtreTacheStatut === 'urgent' ? (t.priorite === 'urgent' && t.statut !== 'fait')
      : filtreTacheStatut !== 'tous'   ? t.statut === filtreTacheStatut
      : true
    const okEquipe = filtreTacheEquipe === 'tous' || (t.projets?.equipe === filtreTacheEquipe)
    return okStatut && okEquipe
  })
  if (!filtered.length) {
    listeEl.innerHTML = '<p style="color:var(--muted);">Aucune tâche pour ce filtre.</p>'
    return
  }
  listeEl.innerHTML = filtered.map(t => {
    const enRetard = t.date_fin_prevue && t.date_fin_prevue < aujourd_hui && t.statut !== 'fait'
    const classe   = enRetard ? 'retard' : t.priorite
    const membres  = t.assignations.map(a => a.employes?.nom).filter(Boolean).join(', ')
    return `
      <div class="tache-item ${classe}" style="cursor:pointer;" onclick="ouvrirEditionTache('${t.id}')">
        <div class="tache-info">
          <div class="tache-desc">${t.description}</div>
          <div class="tache-meta">
            ${t.projets?.nom ? t.projets.nom + ' · ' : '<span style="color:var(--muted-soft);">Sans projet · </span>'}
            ${membres ? membres + ' · ' : ''}
            ${t.date_fin_prevue ? formatDate(t.date_fin_prevue) : 'Pas de date'}
            ${enRetard ? ' · <span style="color:var(--danger);font-weight:600;">Retard</span>' : ''}
          </div>
        </div>
        <div style="display:flex;gap:0.4rem;flex-direction:column;align-items:flex-end;">
          <span class="badge ${t.statut.replace(' ','-')}" style="cursor:pointer;" title="Cliquer pour changer le statut" onclick="changerStatutTache('${t.id}','${t.statut}',event)">↻ ${t.statut}</span>
          <span class="badge ${t.priorite}">${t.priorite}</span>
          <span style="font-size:11px;color:var(--muted);padding:2px 8px;border:1px solid var(--border);border-radius:5px;background:var(--surface-alt);white-space:nowrap;">Éditer</span>
        </div>
      </div>`
  }).join('')
}

function afficherKanbanGlobal(taches, aujourd_hui) {
  const colonnes = { 'en attente': 'g-body-en-attente', 'en cours': 'g-body-en-cours', 'fait': 'g-body-fait' }
  const counts   = { 'en attente': 'g-count-en-attente', 'en cours': 'g-count-en-cours', 'fait': 'g-count-fait' }

  for (const [statut, bodyId] of Object.entries(colonnes)) {
    const tachesDuStatut = taches.filter(t => t.statut === statut)
    const col     = document.getElementById(bodyId)
    const countEl = document.getElementById(counts[statut])
    if (!col) continue
    if (countEl) countEl.textContent = tachesDuStatut.length

    if (!tachesDuStatut.length) {
      col.innerHTML = '<p class="kanban-empty">Glisser une tâche ici</p>'
      continue
    }

    col.innerHTML = tachesDuStatut.map(t => {
      const enRetard = t.date_fin_prevue && t.date_fin_prevue < aujourd_hui && t.statut !== 'fait'
      const membres  = t.assignations?.map(a => a.employes?.nom).filter(Boolean) || []
      const isUrgent = t.priorite === 'urgent'
      const projetNom   = t.projets?.nom || null
      const projetEquipe= t.projets?.equipe || 'technique'
      const equipeColor = { technique:'var(--brand)', operationnel:'var(--success)', commercial:'var(--warn)' }[projetEquipe] || 'var(--muted)'

      const avatars = membres.slice(0, 3).map(nom => {
        const ini = initialesNom(nom)
        return `<div title="${nom}" style="width:24px;height:24px;border-radius:6px;background:${avatarColor(ini)};color:#fff;font-size:9.5px;font-weight:600;display:flex;align-items:center;justify-content:center;border:2px solid #fff;flex-shrink:0;">${ini}</div>`
      }).join('')

      return `
        <div class="kanban-card ${t.priorite}${enRetard?' retard':''}"
             draggable="true" data-id="${t.id}" data-statut="${t.statut}"
             ondragstart="onDragStart(event)" ondragend="onDragEnd(event)"
             onclick="ouvrirEditionTache('${t.id}')"
             style="${isUrgent && statut==='en cours' ? 'box-shadow:0 0 0 1.5px var(--brand),0 2px 6px rgba(238,126,36,0.12);' : ''}">
          <div style="display:flex;align-items:center;gap:5px;margin-bottom:6px;">
            <span style="width:4px;height:4px;border-radius:2px;background:${equipeColor};display:inline-block;flex-shrink:0;"></span>
            <span style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${projetNom || 'Sans projet'}</span>
          </div>
          <div class="kanban-card-desc">${t.description}</div>
          ${isUrgent ? `<div style="display:inline-flex;align-items:center;margin-top:8px;font-size:10px;font-weight:600;color:var(--brand-deep);background:var(--brand-soft);padding:1px 7px;border-radius:3px;">Urgent</div>` : ''}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
            <div style="display:flex;gap:2px;">${avatars || '<div style="width:24px;height:24px;border-radius:6px;background:var(--surface-alt);border:2px solid var(--border);"></div>'}</div>
            ${t.date_fin_prevue ? `<div style="font-size:10.5px;color:${enRetard?'var(--danger)':'var(--muted)'};font-weight:${enRetard?'600':'500'};font-family:'IBM Plex Mono',monospace;">${enRetard?'⚑ ':''}${formatDate(t.date_fin_prevue)}</div>` : ''}
          </div>
        </div>`
    }).join('')
  }
}

// --- EMPLOYES ---
async function chargerEmployes() {
  const { data } = await db.from('employes').select('*').order('nom')
  tousLesEmployes = data || []
  const container = document.getElementById('liste-employes')
  if (container) {
    if (!data || !data.length) {
      container.innerHTML = '<p style="color:var(--text-muted);">Aucun membre pour le moment.</p>'
    } else {
      container.innerHTML = data.map(e => `
        <div class="employe-card" onclick="ouvrirFicheEmploye('${e.id}')" style="cursor:pointer;">
          <div class="employe-avatar avatar-${e.equipe}">${initiales(e.nom)}</div>
          <div class="employe-nom">${e.nom}</div>
          <div class="employe-equipe">${e.equipe}</div>
          ${e.email ? `<div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">${e.email}</div>` : ''}
          ${e.telephone ? `<div style="font-size:0.72rem; color:var(--text-muted);">${e.telephone}</div>` : ''}
        </div>
      `).join('')
    }
  }

  const checkboxContainer = document.getElementById('liste-checkboxes-employes')
  if (checkboxContainer && data) {
    checkboxContainer.innerHTML = data.map(e => `
      <label style="display:flex; align-items:center; gap:0.4rem; padding:0.3rem 0.6rem; border-radius:6px; background:var(--gris-light); cursor:pointer; font-size:0.85rem;">
        <input type="checkbox" value="${e.id}" name="employe-checkbox" />
        ${e.nom}
      </label>
    `).join('')
  }
}

function ouvrirFicheEmploye(id) {
  const e = tousLesEmployes.find(emp => emp.id === id)
  if (!e) return
  document.getElementById('modal-employe-titre').textContent = 'Modifier le membre'
  document.getElementById('input-employe-id').value = e.id
  document.getElementById('input-employe-nom').value = e.nom
  document.getElementById('input-employe-equipe').value = e.equipe
  document.getElementById('input-employe-email').value = e.email || ''
  document.getElementById('input-employe-telephone').value = e.telephone || ''
  document.getElementById('btn-supprimer-employe').style.display = 'block'
  document.getElementById('modal-employe').classList.remove('hidden')
}

async function supprimerEmploye() {
  const id = document.getElementById('input-employe-id').value
  const nom = document.getElementById('input-employe-nom').value
  if (!confirm(`Supprimer ${nom} ?`)) return
  await db.from('employes').delete().eq('id', id)
  fermerModals()
  chargerEmployes()
}

// --- VALIDATION DATES ---
function validerDates() {
  const debut = document.getElementById('input-tache-debut').value
  const fin = document.getElementById('input-tache-fin').value
  const erreur = document.getElementById('erreur-dates')
  if (debut && fin && fin < debut) {
    erreur.style.display = 'block'
    document.getElementById('input-tache-fin').style.borderColor = 'var(--rouge)'
  } else {
    erreur.style.display = 'none'
    document.getElementById('input-tache-fin').style.borderColor = 'var(--border)'
  }
}

// --- MODALS ---
function ouvrirModalProjet() {
  projetEnEdition = null
  document.getElementById('modal-projet-titre').textContent = 'Nouveau projet'
  document.getElementById('input-projet-id').value = ''
  document.getElementById('input-projet-nom').value = ''
  document.getElementById('input-projet-client').value = ''
  document.getElementById('input-projet-description').value = ''
  document.getElementById('input-projet-equipe').value = 'technique'
  document.getElementById('input-projet-statut').value = 'en cours'
  document.getElementById('modal-projet').classList.remove('hidden')
}

function ouvrirEditionProjet() {
  if (!projetActif) return
  projetEnEdition = projetActif
  document.getElementById('modal-projet-titre').textContent = 'Modifier le projet'
  document.getElementById('input-projet-id').value = projetActif.id
  document.getElementById('input-projet-nom').value = projetActif.nom
  document.getElementById('input-projet-client').value = projetActif.client || ''
  document.getElementById('input-projet-description').value = projetActif.description || ''
  document.getElementById('input-projet-equipe').value = projetActif.equipe || 'technique'
  document.getElementById('input-projet-statut').value = projetActif.statut
  document.getElementById('modal-projet').classList.remove('hidden')
}

function ouvrirModalTache() {
  tacheEnEdition = null
  chargerEmployes()
  document.getElementById('input-tache-desc').value = ''
  document.getElementById('input-tache-priorite').value = 'normal'
  document.getElementById('input-tache-statut').value = 'en cours'
  document.getElementById('input-tache-debut').value = ''
  document.getElementById('input-tache-fin').value = ''
  document.getElementById('erreur-dates').style.display = 'none'
  document.getElementById('btn-supprimer-tache').style.display = 'none'
  document.querySelector('#modal-tache h2').textContent = 'Nouvelle tâche'
  // Cacher les commentaires pour une nouvelle tâche
  const secCom = document.getElementById('section-commentaires-tache')
  if (secCom) secCom.style.display = 'none'
  document.getElementById('modal-tache').classList.remove('hidden')
}

function ouvrirModalEmploye() {
  document.getElementById('modal-employe-titre').textContent = 'Nouveau membre'
  document.getElementById('input-employe-id').value = ''
  document.getElementById('input-employe-nom').value = ''
  document.getElementById('input-employe-email').value = ''
  document.getElementById('input-employe-telephone').value = ''
  document.getElementById('btn-supprimer-employe').style.display = 'none'
  document.getElementById('modal-employe').classList.remove('hidden')
}

function fermerModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'))
  tacheEnEdition = null
}

document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) fermerModals() })
})

// --- SAUVEGARDES ---
async function sauvegarderProjet() {
  const nom = document.getElementById('input-projet-nom').value.trim()
  if (!nom) { alert('Le nom est obligatoire.'); return }
  const id = document.getElementById('input-projet-id').value
  const payload = {
    nom,
    client: document.getElementById('input-projet-client').value.trim(),
    description: document.getElementById('input-projet-description').value.trim(),
    equipe: document.getElementById('input-projet-equipe').value,
    statut: document.getElementById('input-projet-statut').value,
  }
  if (id) {
    const { error } = await db.from('projets').update(payload).eq('id', id)
    if (error) { console.error(error); alert('Erreur lors de la modification.'); return }
    projetActif = { ...projetActif, ...payload }
    fermerModals()
    ouvrirDetailProjet(projetActif)
  } else {
    const { error } = await db.from('projets').insert({ ...payload, archive: false })
    if (error) { console.error(error); alert('Erreur lors de la sauvegarde.'); return }
    fermerModals()
  }
  chargerProjets()
}

async function sauvegarderTache() {
  const desc = document.getElementById('input-tache-desc').value.trim()
  if (!desc) { alert('La description est obligatoire.'); return }
  const debut = document.getElementById('input-tache-debut').value
  const fin = document.getElementById('input-tache-fin').value
  if (debut && fin && fin < debut) { alert('La date de fin ne peut pas être avant la date de début.'); return }

  const payload = {
    description: desc,
    priorite: document.getElementById('input-tache-priorite').value,
    statut: document.getElementById('input-tache-statut').value,
    date_debut: debut || null,
    date_fin_prevue: fin || null,
    archive: false
  }

  let tacheId = null

  if (tacheEnEdition) {
    const { error } = await db.from('taches').update(payload).eq('id', tacheEnEdition.id)
    if (error) { console.error(error); alert('Erreur lors de la modification.'); return }
    tacheId = tacheEnEdition.id
    await db.from('tache_assignations').delete().eq('tache_id', tacheId)
  } else {
    const { data: tache, error } = await db.from('taches').insert({
      ...payload,
      projet_id: projetActif?.id || null,
    }).select().single()
    if (error) { console.error(error); alert('Erreur lors de la sauvegarde.'); return }
    tacheId = tache.id
  }

  const checkboxes = document.querySelectorAll('input[name="employe-checkbox"]:checked')
  if (checkboxes.length > 0 && tacheId) {
    const assignations = Array.from(checkboxes).map(cb => ({ tache_id: tacheId, employe_id: cb.value }))
    await db.from('tache_assignations').insert(assignations)
  }

  fermerModals()
  if (projetActif) chargerTachesDetail()
  else chargerTachesGlobal()
}

async function sauvegarderEmploye() {
  const nom = document.getElementById('input-employe-nom').value.trim()
  if (!nom) { alert('Le nom est obligatoire.'); return }
  const id = document.getElementById('input-employe-id').value
  const payload = {
    nom,
    equipe: document.getElementById('input-employe-equipe').value,
    email: document.getElementById('input-employe-email').value.trim() || null,
    telephone: document.getElementById('input-employe-telephone').value.trim() || null
  }
  if (id) {
    await db.from('employes').update(payload).eq('id', id)
  } else {
    await db.from('employes').insert(payload)
  }
  fermerModals()
  chargerEmployes()
}

// --- UTILS ---
function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatPhone(p) {
  if (!p) return null
  const d = p.replace(/\D/g, '')
  if (d.length === 10) return d.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5')
  return p
}

function initiales(nom) {
  return nom.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

// --- INIT ---
mettreAJourSidebarUser()
chargerDashboard()
chargerEmployes()
// --- CALENDRIER ---
let calDate = new Date()
let calType = 'projets' // projets ou taches
let calVue = 'mensuelle' // mensuelle ou timeline

function toggleCalType() {
  calType = calType === 'projets' ? 'taches' : 'projets'
  document.getElementById('toggle-cal-type').textContent = calType === 'projets' ? '📁 Projets' : '✅ Tâches'
  afficherCalendrier()
}

function toggleCalVue() {
  calVue = calVue === 'mensuelle' ? 'timeline' : 'mensuelle'
  document.getElementById('toggle-cal-vue').textContent = calVue === 'mensuelle' ? '📊 Timeline' : '📅 Mensuelle'
  afficherCalendrier()
}

function calNaviguer(direction) {
  if (calVue === 'mensuelle') {
    calDate.setMonth(calDate.getMonth() + direction)
  } else {
    calDate.setMonth(calDate.getMonth() + direction)
  }
  afficherCalendrier()
}

function calAujourdhui() {
  calDate = new Date()
  afficherCalendrier()
}

async function afficherCalendrier() {
  const titre = document.getElementById('cal-titre')
  const moisNoms = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
  titre.textContent = `${moisNoms[calDate.getMonth()]} ${calDate.getFullYear()}`

  if (calType === 'projets') {
    const { data } = await db.from('projets').select('*').eq('archive', false)
    if (calVue === 'mensuelle') afficherCalMensuelle(data || [], 'projet')
    else afficherCalTimeline(data || [], 'projet')
  } else {
    const { data } = await db.from('taches').select('*, projets(nom)').eq('archive', false)
    if (calVue === 'mensuelle') afficherCalMensuelle(data || [], 'tache')
    else afficherCalTimeline(data || [], 'tache')
  }
}

function afficherCalMensuelle(items, type) {
  const container = document.getElementById('cal-contenu')
  const annee = calDate.getFullYear()
  const mois = calDate.getMonth()
  const premier = new Date(annee, mois, 1)
  const dernier = new Date(annee, mois + 1, 0)
  const aujourd_hui = new Date()
  aujourd_hui.setHours(0,0,0,0)

  // Début de la grille (lundi de la semaine du 1er)
  const debutGrille = new Date(premier)
  debutGrille.setDate(debutGrille.getDate() - ((debutGrille.getDay() + 6) % 7))

  const jours = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
  let html = '<div class="cal-grille">'

  // Headers
  jours.forEach(j => { html += `<div class="cal-header-jour">${j}</div>` })

  // Jours
  const cur = new Date(debutGrille)
  for (let i = 0; i < 42; i++) {
    const isAujourdhui = cur.getTime() === aujourd_hui.getTime()
    const isAutreMois = cur.getMonth() !== mois
    html += `<div class="cal-jour ${isAujourdhui ? 'aujourd-hui' : ''} ${isAutreMois ? 'autre-mois' : ''}">`
    html += `<div class="cal-num">${cur.getDate()}</div>`

    // Trouver les items de ce jour
    const curStr = cur.toISOString().split('T')[0]
    items.forEach(item => {
      const debut = type === 'projet' ? null : item.date_debut
      const fin = type === 'projet' ? null : item.date_fin_prevue
      const nom = type === 'projet' ? item.nom : item.description
      const equipe = type === 'projet' ? (item.equipe || 'technique') : 'technique'
      const client = type === 'projet' ? (item.client || '') : (item.projets?.nom || '')

      // Pour les projets on n'a pas de dates, on affiche selon created_at
      if (type === 'projet') {
        const created = item.created_at?.split('T')[0]
        if (created === curStr) {
          html += `<div class="cal-event ${equipe}" onclick="ouvrirDetailProjetParId('${item.id}')" title="${nom} — ${client}">${nom}${client ? ' · ' + client : ''}</div>`
        }
      } else {
        if ((debut && debut <= curStr && fin && fin >= curStr)) {
          html += `<div class="cal-event technique" title="${nom}">${nom}</div>`
        }
      }
    })

    html += '</div>'
    cur.setDate(cur.getDate() + 1)
  }

  html += '</div>'
  container.innerHTML = html
}

function afficherCalTimeline(items, type) {
  const container = document.getElementById('cal-contenu')
  const annee = calDate.getFullYear()
  const mois = calDate.getMonth()
  const nbJours = new Date(annee, mois + 1, 0).getDate()
  const largeurJour = 28
  const largeurTotal = nbJours * largeurJour
  const aujourd_hui = new Date()
  aujourd_hui.setHours(0,0,0,0)

  // Header jours
  let headerJours = ''
  for (let i = 1; i <= nbJours; i++) {
    const d = new Date(annee, mois, i)
    const isToday = d.getTime() === aujourd_hui.getTime()
    const isWeekend = d.getDay() === 0 || d.getDay() === 6
    headerJours += `<div style="position:absolute; left:${(i-1)*largeurJour}px; width:${largeurJour}px; text-align:center; font-size:0.65rem; color:${isToday ? 'var(--bleu)' : isWeekend ? '#ccc' : 'var(--text-muted)'}; font-weight:${isToday ? '700' : '400'};">${i}</div>`
  }

  // Lignes fond
  let fond = ''
  for (let i = 1; i <= nbJours; i++) {
    const d = new Date(annee, mois, i)
    const isToday = d.getTime() === aujourd_hui.getTime()
    const isWeekend = d.getDay() === 0 || d.getDay() === 6
    if (isWeekend) fond += `<div style="position:absolute; left:${(i-1)*largeurJour}px; top:0; width:${largeurJour}px; height:100%; background:rgba(0,0,0,0.03);"></div>`
    if (isToday) fond += `<div style="position:absolute; left:${(i-1)*largeurJour}px; top:0; width:2px; height:100%; background:var(--bleu);"></div>`
  }

  const rows = items.map(item => {
    const nom = type === 'projet' ? item.nom : item.description
    const equipe = type === 'projet' ? (item.equipe || 'technique') : 'technique'
    const client = type === 'projet' ? (item.client || '') : ''
    const statut = item.statut || ''

    let debut, fin
    if (type === 'projet') {
      // Utiliser le mois entier si pas de dates
      debut = new Date(annee, mois, 1)
      fin = new Date(annee, mois + 1, 0)
    } else {
      if (!item.date_debut || !item.date_fin_prevue) return ''
      debut = new Date(item.date_debut)
      fin = new Date(item.date_fin_prevue)
    }

    const debutMois = new Date(annee, mois, 1)
    const finMois = new Date(annee, mois + 1, 0)
    if (fin < debutMois || debut > finMois) return ''

    const debutClamp = debut < debutMois ? debutMois : debut
    const finClamp = fin > finMois ? finMois : fin
    const leftJour = debutClamp.getDate() - 1
    const widthJours = finClamp.getDate() - debutClamp.getDate() + 1
    const left = leftJour * largeurJour
    const width = Math.max(widthJours * largeurJour, largeurJour)

    const onclick = type === 'projet' ? `ouvrirDetailProjetParId('${item.id}')` : ''

    return `
      <div class="timeline-row">
        <div class="timeline-label" title="${nom}">${nom}${client ? ' · ' + client : ''}</div>
        <div class="timeline-track" style="position:relative; width:${largeurTotal}px;">
          ${fond}
          <div class="timeline-bar ${equipe}" style="left:${left}px; width:${width}px;" onclick="${onclick}" ${onclick ? 'style="cursor:pointer;"' : ''}>
            ${statut}
          </div>
        </div>
      </div>
    `
  }).filter(Boolean).join('')

  container.innerHTML = `
    <div style="overflow-x:auto;">
      <div style="min-width:${180 + largeurTotal}px;">
        <div style="display:flex; margin-bottom:8px; border-bottom:1px solid var(--border); padding-bottom:4px;">
          <div style="width:180px; flex-shrink:0;"></div>
          <div style="position:relative; width:${largeurTotal}px; height:20px; flex-shrink:0;">${headerJours}</div>
        </div>
        ${rows || '<p style="color:var(--text-muted); padding:1rem;">Aucun élément ce mois-ci.</p>'}
      </div>
    </div>
  `
}

async function ouvrirDetailProjetParId(id) {
  const { data } = await db.from('projets').select('*').eq('id', id).single()
  if (data) ouvrirDetailProjet(data)
}

// ═══════════════════════════════════════════════════════
// --- HISTORIQUE DES ACTIONS ---
// ═══════════════════════════════════════════════════════

async function logAction(type, entite, entiteId, description) {
  const auteur = utilisateurActifNom || 'Anonyme'
  await db.from('historique_actions').insert({ type, entite, entite_id: entiteId, description, auteur })
}

async function chargerHistorique() {
  const container = document.getElementById('dashboard-historique')
  if (!container) return
  const { data } = await db.from('historique_actions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(15)
  if (!data || !data.length) {
    container.innerHTML = ''
    return
  }
  const icones = {
    tache_statut:     '↻',
    facture_soldee:   '✓',
    facture_annulee:  '↩',
    commentaire:      '💬',
    projet_statut:    '📁',
  }
  container.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;">
      <div style="padding:14px 16px;border-bottom:1px solid var(--border-soft);">
        <div style="font-weight:700;font-size:14px;color:var(--ink);">Activité récente</div>
      </div>
      <div style="padding:6px 8px;">
        ${data.map(a => {
          const icone = icones[a.type] || '·'
          const date  = new Date(a.created_at)
          const quand = date.toLocaleDateString('fr-FR', { day:'numeric', month:'short' })
                      + ' ' + date.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
          return `
            <div style="display:flex;align-items:flex-start;gap:10px;padding:7px 8px;border-radius:7px;" onmouseover="this.style.background='var(--surface-alt)'" onmouseout="this.style.background=''">
              <div style="width:22px;height:22px;border-radius:6px;background:var(--surface-alt);display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;margin-top:1px;">${icone}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:12.5px;color:var(--ink);line-height:1.4;">${a.description}</div>
                <div style="font-size:11px;color:var(--muted);margin-top:2px;">${a.auteur} · ${quand}</div>
              </div>
            </div>`
        }).join('')}
      </div>
    </div>`
}

// ═══════════════════════════════════════════════════════
// --- FACTURES ---
// ═══════════════════════════════════════════════════════

let filtreFacturesClient = ''
let ongletFactures = 'liste'
let calEncMois = new Date()
let analytiquePeriode = 'mensuel'
let _clientsListeFactures = []

function setAnalytiquePeriode(p) { analytiquePeriode = p; chargerAnalytique() }

function filtrerClientSuggestions(val) {
  const el = document.getElementById('client-suggestions')
  if (!el) return
  const cleared = !val || !val.trim()
  if (cleared) { setFiltreFacturesClient(''); el.style.display = 'none'; return }
  const q = val.toLowerCase()
  const matches = _clientsListeFactures.filter(c => c.toLowerCase().includes(q)).slice(0, 10)
  if (!matches.length) { el.style.display = 'none'; return }
  el.innerHTML = matches.map(c => {
    const esc = c.replace(/\\/g,'\\\\').replace(/'/g,"\\'")
    return `<div onclick="setFiltreFacturesClient('${esc}');document.getElementById('search-client-factures').value='${esc}';document.getElementById('client-suggestions').style.display='none'"
      style="padding:7px 10px;cursor:pointer;border-radius:6px;font-size:12.5px;color:var(--ink);"
      onmouseover="this.style.background='var(--surface-alt)'" onmouseout="this.style.background=''">${c}</div>`
  }).join('')
  el.style.display = 'block'
}
document.addEventListener('click', e => {
  if (!e.target.closest('#client-search-wrapper')) {
    const el = document.getElementById('client-suggestions')
    if (el) el.style.display = 'none'
  }
})

function editerContactFacture(id, champ, valActuelle, el) {
  const type = champ === 'email_client' ? 'email' : 'tel'
  el.dataset.original = el.innerHTML
  const escVal = (valActuelle || '').replace(/"/g,'&quot;')
  el.innerHTML = `<input type="${type}" value="${escVal}"
    style="width:100%;padding:2px 5px;border:1px solid var(--brand);border-radius:4px;font-size:11.5px;font-family:inherit;box-sizing:border-box;"
    onblur="sauvegarderContactFacture('${id}','${champ}',this.value)"
    onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape'){this.parentElement.innerHTML=this.parentElement.dataset.original}" />`
  el.querySelector('input').focus()
}
async function sauvegarderContactFacture(id, champ, valeur) {
  const val = valeur.trim() || null
  await db.from('factures').update({ [champ]: val }).eq('id', id)
  chargerFactures()
}

function setOngletFactures(onglet) {
  ongletFactures = onglet
  const tabs = ['liste', 'encaissements', 'analytique']
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-factures-${t}`)
    const sec = document.getElementById(`section-factures-${t}`)
    if (btn) {
      btn.style.background = t === onglet ? 'var(--brand-soft)' : 'transparent'
      btn.style.color      = t === onglet ? 'var(--brand-deep)' : 'var(--muted)'
      btn.style.fontWeight = t === onglet ? '600' : '500'
    }
    if (sec) sec.style.display = t === onglet ? 'block' : 'none'
  })
  if (onglet === 'encaissements') chargerEncaissements()
  if (onglet === 'analytique')    chargerAnalytique()
}

async function chargerFactures() {
  if (!utilisateurAccesFactures) {
    document.getElementById('liste-factures').innerHTML = '<p style="color:var(--muted);">Accès restreint.</p>'
    return
  }
  // Charger la liste d'exclusion ET le panel en parallèle
  const [{ data: exclusData }, { data: factures }] = await Promise.all([
    db.from('clients_exclus').select('nom'),
    db.from('factures').select('*').order('date_echeance', { ascending: true })
  ])
  chargerClientsExclus()

  const nomsExclus = new Set((exclusData || []).map(e => e.nom))
  const aujourd_hui = new Date().toISOString().split('T')[0]

  // Exclure les clients masqués de TOUT l'affichage et des stats
  const toutes   = (factures || []).filter(f => !nomsExclus.has(f.client))
  const nonSolde = toutes.filter(f => !f.solde)
  // Ne pas compter les factures en litige dans les retards
  const enRetard = nonSolde.filter(f => !f.litige && f.date_echeance && f.date_echeance < aujourd_hui)
  const montantTotal  = nonSolde.reduce((s, f) => s + (parseFloat(f.montant) || 0), 0)
  const montantRetard = enRetard.reduce((s, f) => s + (parseFloat(f.montant) || 0), 0)

  // Bandeau J+1 : factures dont l'échéance était hier (exactement 1 jour de retard) et non en litige
  const hier = new Date(); hier.setDate(hier.getDate() - 1); const hierStr = hier.toISOString().split('T')[0]
  const facturesJ1 = nonSolde.filter(f => !f.litige && f.date_echeance === hierStr)
  const bandeauEl = document.getElementById('bandeau-j1')
  const bandeauListeEl = document.getElementById('bandeau-j1-liste')
  if (bandeauEl && bandeauListeEl) {
    if (facturesJ1.length > 0) {
      bandeauEl.style.display = 'block'
      bandeauListeEl.innerHTML = facturesJ1.map(f =>
        `<div style="margin-top:3px;">· <b>${f.numero}</b> — ${f.client} — <b>${parseFloat(f.montant).toLocaleString('fr-FR', {minimumFractionDigits:2})} €</b></div>`
      ).join('')
    } else {
      bandeauEl.style.display = 'none'
    }
  }

  // Stats bar
  const statsEl = document.getElementById('factures-stats-bar')
  if (statsEl) statsEl.innerHTML = `
    <span>${nonSolde.length} en attente · </span>
    <span style="color:${enRetard.length > 0 ? 'var(--danger)' : 'var(--success)'};">${enRetard.length} en retard</span>
    <span> · Total à encaisser : <b style="font-family:'IBM Plex Mono',monospace;">${montantTotal.toLocaleString('fr-FR', {minimumFractionDigits:2})} €</b></span>
    ${enRetard.length > 0 ? ` · <span style="color:var(--danger);">Retards : <b style="font-family:'IBM Plex Mono',monospace;">${montantRetard.toLocaleString('fr-FR', {minimumFractionDigits:2})} €</b></span>` : ''}
  `

  // Filtres statut + recherche client
  const clients = [...new Set(toutes.map(f => f.client).filter(Boolean))].sort()
  _clientsListeFactures = clients
  const filtres = [
    { val:'toutes',  label:'Toutes' },
    { val:'attente', label:'En attente' },
    { val:'retard',  label:'En retard' },
    { val:'soldees', label:'Soldées' }
  ]
  const filtresEl = document.getElementById('filtres-factures')
  if (filtresEl) filtresEl.innerHTML = `
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;width:100%;">
      ${filtres.map(f => `
        <button onclick="setFiltreFactures('${f.val}')" style="
          background:${filtreFactures===f.val ? 'var(--ink)' : 'var(--surface)'};
          color:${filtreFactures===f.val ? '#fff' : 'var(--muted)'};
          border:1px solid ${filtreFactures===f.val ? 'var(--ink)' : 'var(--border)'};
          cursor:pointer;padding:4px 14px;border-radius:20px;font-size:12px;
          font-weight:${filtreFactures===f.val ? '600' : '400'};font-family:inherit;white-space:nowrap;
        ">${f.label}</button>`).join('')}
      <div id="client-search-wrapper" style="position:relative;margin-left:auto;">
        <svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);pointer-events:none;" width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="5" cy="5" r="3.5" stroke="#9ca3af" stroke-width="1.3"/><path d="M8 8l2.5 2.5" stroke="#9ca3af" stroke-width="1.3" stroke-linecap="round"/></svg>
        <input id="search-client-factures" type="text" placeholder="Rechercher un client…"
          value="${filtreFacturesClient}"
          oninput="filtrerClientSuggestions(this.value)"
          onkeydown="if(event.key==='Escape'){setFiltreFacturesClient('');this.value='';document.getElementById('client-suggestions').style.display='none'}"
          style="padding:5px 30px 5px 28px;border:1px solid var(--border);border-radius:20px;font-size:12px;font-family:inherit;background:var(--surface);color:var(--ink);width:220px;outline:none;" />
        ${filtreFacturesClient ? `<button onclick="setFiltreFacturesClient('');document.getElementById('search-client-factures').value=''" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--muted);font-size:16px;line-height:1;padding:0;">×</button>` : ''}
        <div id="client-suggestions" style="display:none;position:absolute;right:0;top:calc(100% + 4px);background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.1);z-index:100;max-height:240px;overflow-y:auto;min-width:240px;padding:4px;"></div>
      </div>
    </div>`

  // Filtrer (statut + client)
  const filtered = toutes.filter(f => {
    const retard = !f.solde && f.date_echeance && f.date_echeance < aujourd_hui
    const okStatut = filtreFactures === 'attente' ? (!f.solde && !retard)
      : filtreFactures === 'retard'  ? retard
      : filtreFactures === 'soldees' ? f.solde
      : true
    const okClient = !filtreFacturesClient || f.client === filtreFacturesClient
    return okStatut && okClient
  })

  const listeEl = document.getElementById('liste-factures')
  if (!filtered.length) {
    listeEl.innerHTML = '<p style="color:var(--muted); padding:20px;">Aucune facture pour ce filtre.</p>'
    return
  }

  listeEl.innerHTML = `
    <div style="background:var(--surface); border:1px solid var(--border); border-radius:12px; overflow:hidden; overflow-x:auto;">
      <table style="width:100%; border-collapse:collapse; font-size:12.5px; min-width:1100px;">
        <thead>
          <tr style="background:var(--surface-alt); border-bottom:1px solid var(--border);">
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600; white-space:nowrap;">N° Facture</th>
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600;">Client</th>
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600;">Contact</th>
            <th style="padding:10px 16px; text-align:right; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600;">Montant</th>
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600; white-space:nowrap;">Réglé</th>
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600;">Émission</th>
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600;">Échéance</th>
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600;">Statut</th>
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600; white-space:nowrap;">Payé le</th>
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600;">Relance</th>
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600;">Note</th>
            <th style="padding:10px 16px; text-align:center; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(f => {
            const enRetard = !f.solde && !f.litige && f.date_echeance && f.date_echeance < aujourd_hui
            const joursRetard = enRetard ? Math.floor((new Date(aujourd_hui) - new Date(f.date_echeance)) / 86400000) : 0

            // Couleurs tranches de retard
            let statutHtml
            if (f.solde) {
              statutHtml = `<span style="color:var(--success); font-weight:600; font-size:11px;">Soldée</span>`
            } else if (f.litige) {
              statutHtml = `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:2px 7px;border-radius:4px;background:#ede9fe;color:#5b21b6;">⚠ Litige</span>`
            } else if (enRetard) {
              let bg, col
              if (joursRetard <= 30)       { bg = '#fef9c3'; col = '#854d0e' }
              else if (joursRetard <= 60)  { bg = '#ffedd5'; col = '#9a3412' }
              else if (joursRetard <= 90)  { bg = '#fee2e2'; col = '#991b1b' }
              else                          { bg = '#7f1d1d'; col = '#fff'    }
              statutHtml = `<span style="display:inline-flex;align-items:center;font-size:11px;font-weight:600;padding:2px 7px;border-radius:4px;background:${bg};color:${col};">+${joursRetard}j retard</span>`
            } else {
              statutHtml = `<span style="color:var(--warn); font-weight:500; font-size:11px;">En attente</span>`
            }

            // Colonne Réglé
            const montantPaye = parseFloat(f.montant_paye) || 0
            const montant     = parseFloat(f.montant) || 0
            const pct         = montant > 0 ? Math.min(100, Math.round((montantPaye / montant) * 100)) : 0
            const regleHtml = montantPaye > 0
              ? `<div style="font-size:11px;color:var(--success);font-weight:600;">${montantPaye.toLocaleString('fr-FR',{minimumFractionDigits:2})} €</div>
                 <div style="height:4px;background:var(--border);border-radius:2px;margin-top:3px;width:60px;">
                   <div style="width:${pct}%;height:100%;background:var(--success);border-radius:2px;"></div>
                 </div>
                 <div style="font-size:10px;color:var(--muted);margin-top:1px;">${pct}%</div>`
              : `<span style="color:var(--muted);font-size:11px;">—</span>`

            // Colonne Relance
            const relanceHtml = f.date_relance
              ? `<div style="font-size:11px;color:var(--muted);">${formatDate(f.date_relance)}</div>
                 <button onclick="marquerRelance('${f.id}')" style="font-size:10px;padding:1px 6px;border-radius:4px;background:var(--surface-alt);color:var(--muted);border:1px solid var(--border);cursor:pointer;font-family:inherit;margin-top:2px;">📤 Relancer</button>`
              : `<button onclick="marquerRelance('${f.id}')" style="font-size:10.5px;padding:2px 7px;border-radius:4px;background:var(--surface-alt);color:var(--ink-soft);border:1px solid var(--border);cursor:pointer;font-family:inherit;">📤 Relancer</button>`

            // Payé le éditable
            const payeLe = f.date_paiement
              ? `<span id="paye-${f.id}-view" onclick="editerDatePaiement('${f.id}','${f.date_paiement}')" style="cursor:pointer;font-size:12px;color:var(--success);font-family:'IBM Plex Mono',monospace;" title="Cliquer pour modifier">${formatDate(f.date_paiement)}</span>`
              : `<span id="paye-${f.id}-view" onclick="editerDatePaiement('${f.id}','')" style="cursor:pointer;font-size:11px;color:var(--muted);" title="Cliquer pour saisir la date">+ Ajouter</span>`

            // Boutons action
            const actionBtns = `
              <div style="display:flex;flex-direction:column;gap:3px;align-items:center;">
                ${!f.solde
                  ? `<button onclick="marquerFactureSoldee('${f.id}')" style="font-size:11px;padding:3px 10px;border-radius:5px;background:var(--success);color:#fff;border:none;cursor:pointer;font-family:inherit;white-space:nowrap;">✓ Soldée</button>`
                  : `<button onclick="marquerFactureNonSoldee('${f.id}')" style="font-size:11px;padding:3px 10px;border-radius:5px;background:var(--surface-alt);color:var(--muted);border:1px solid var(--border);cursor:pointer;font-family:inherit;white-space:nowrap;">Annuler</button>`}
                ${!f.solde
                  ? (f.litige
                      ? `<button onclick="annulerLitige('${f.id}')" style="font-size:10.5px;padding:2px 8px;border-radius:4px;background:#ede9fe;color:#5b21b6;border:none;cursor:pointer;font-family:inherit;white-space:nowrap;">Clore litige</button>`
                      : `<button onclick="marquerLitige('${f.id}')" style="font-size:10.5px;padding:2px 8px;border-radius:4px;background:var(--surface-alt);color:var(--muted);border:1px solid var(--border);cursor:pointer;font-family:inherit;white-space:nowrap;">⚠ Litige</button>`)
                  : ''}
                <button onclick="editerMontantPaye('${f.id}',${montantPaye})" style="font-size:10.5px;padding:2px 8px;border-radius:4px;background:var(--surface-alt);color:var(--muted);border:1px solid var(--border);cursor:pointer;font-family:inherit;white-space:nowrap;">+ Acompte</button>
              </div>`

            return `
              <tr style="border-bottom:1px solid var(--border-soft);" onmouseover="this.style.background='var(--surface-alt)'" onmouseout="this.style.background=''">
                <td style="padding:10px 16px; font-family:'IBM Plex Mono',monospace; font-size:11.5px; color:var(--ink-soft); white-space:nowrap;">${f.numero}</td>
                <td style="padding:10px 16px; font-weight:600; color:var(--ink);">${f.client}</td>
                <td style="padding:8px 16px; min-width:150px; max-width:180px;">
                  <div onclick="editerContactFacture('${f.id}','telephone','${(f.telephone||'').replace(/'/g,"\\'").replace(/"/g,'&quot;')}',this)" title="Cliquer pour modifier" style="cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:${f.telephone ? 'var(--ink)' : 'var(--muted)'};padding:2px 0;">${f.telephone ? '📞 ' + formatPhone(f.telephone) : '<span style="font-size:11px;">+ Tél.</span>'}</div>
                  <div onclick="editerContactFacture('${f.id}','email_client','${(f.email_client||'').replace(/'/g,"\\'").replace(/"/g,'&quot;')}',this)" title="Cliquer pour modifier" style="cursor:pointer;font-size:11px;color:${f.email_client ? 'var(--ink-soft)' : 'var(--muted)'};padding:2px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:170px;">${f.email_client ? '✉ ' + f.email_client : '<span>+ Email</span>'}</div>
                </td>
                <td style="padding:10px 16px; text-align:right; font-family:'IBM Plex Mono',monospace; font-weight:600; color:${enRetard ? 'var(--danger)' : 'var(--ink)'}; white-space:nowrap;">${parseFloat(f.montant).toLocaleString('fr-FR', {minimumFractionDigits:2})} €</td>
                <td style="padding:10px 16px;">${regleHtml}</td>
                <td style="padding:10px 16px; color:var(--ink-soft); font-size:12px; white-space:nowrap;">${f.date_emission ? formatDate(f.date_emission) : '—'}</td>
                <td style="padding:10px 16px; color:${enRetard ? 'var(--danger)' : 'var(--ink-soft)'}; font-weight:${enRetard ? '600' : '400'}; font-size:12px; white-space:nowrap;">${f.date_echeance ? formatDate(f.date_echeance) : '—'}</td>
                <td style="padding:10px 16px;">${statutHtml}</td>
                <td style="padding:10px 16px; white-space:nowrap;">
                  ${payeLe}
                  <span id="paye-${f.id}-edit" style="display:none;">
                    <input type="date" id="paye-${f.id}-input" value="${f.date_paiement || ''}" style="font-size:11.5px;padding:3px 6px;border:1px solid var(--brand);border-radius:5px;font-family:inherit;"
                      onblur="sauvegarderDatePaiement('${f.id}',this.value)"
                      onchange="sauvegarderDatePaiement('${f.id}',this.value)" />
                  </span>
                </td>
                <td style="padding:10px 16px;">${relanceHtml}</td>
                <td style="padding:6px 16px; width:130px; max-width:130px;">
                  <button onclick="ouvrirNoteFacture('${f.id}', \`${(f.note || '').replace(/`/g,'\\`').replace(/\n/g,' ')}\`)" style="font-size:11px;padding:3px 8px;border-radius:5px;border:1px solid var(--border);background:var(--surface-alt);cursor:pointer;color:${f.note ? 'var(--ink-soft)' : 'var(--muted)'};font-family:inherit;width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;text-align:left;" title="${(f.note||'').replace(/"/g,'&quot;')}">${f.note ? '📝 ' + f.note.slice(0,22) + (f.note.length > 22 ? '…' : '') : '+ Note'}</button>
                </td>
                <td style="padding:10px 16px; text-align:center; white-space:nowrap;">${actionBtns}</td>
              </tr>`
          }).join('')}
        </tbody>
      </table>
      <div style="padding:10px 16px; font-size:11.5px; color:var(--muted); border-top:1px solid var(--border-soft);">
        ${filtered.length} facture${filtered.length > 1 ? 's' : ''} affichée${filtered.length > 1 ? 's' : ''}
      </div>
    </div>
  `
}

function setFiltreFactures(val) { filtreFactures = val; chargerFactures() }
function setFiltreFacturesClient(val) { filtreFacturesClient = val; chargerFactures() }

// ── CLIENTS EXCLUS ───────────────────────────────────────
function togglePanelExclus() {
  const panel = document.getElementById('panel-clients-exclus')
  if (!panel) return
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none'
}

async function chargerClientsExclus() {
  const { data } = await db.from('clients_exclus').select('*').order('nom')
  const container = document.getElementById('liste-clients-exclus')
  if (!container) return
  if (!data || !data.length) {
    container.innerHTML = '<span style="font-size:12px;color:var(--muted);">Aucun client exclu.</span>'
    return
  }
  container.innerHTML = data.map(c => `
    <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px 4px 12px;background:var(--surface);border:1px solid var(--border);border-radius:20px;font-size:12px;color:var(--ink);">
      <span style="font-weight:500;">${c.nom}</span>
      <button onclick="supprimerClientExclu('${c.id}','${c.nom.replace(/'/g,"\\'")}')"
        title="Retirer de la liste"
        style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:14px;line-height:1;padding:0;display:flex;align-items:center;" >×</button>
    </div>`).join('')
}

async function ajouterClientExclu() {
  const input = document.getElementById('input-nouveau-client-exclu')
  const nom = input?.value?.trim().toUpperCase()
  if (!nom) return
  const { error } = await db.from('clients_exclus').insert({ nom })
  if (error) {
    if (error.code === '23505') alert(`"${nom}" est déjà dans la liste.`)
    else alert('Erreur : ' + error.message)
    return
  }
  input.value = ''
  chargerFactures()
}

async function supprimerClientExclu(id, nom) {
  if (!confirm(`Retirer "${nom}" de la liste d'exclusion ?\nSes factures réapparaîtront dans le tableau.`)) return
  await db.from('clients_exclus').delete().eq('id', id)
  chargerFactures()
}

async function marquerFactureSoldee(id) {
  const date_paiement = new Date().toISOString().split('T')[0]
  const { data: f } = await db.from('factures').select('numero,client,montant').eq('id', id).single()
  await db.from('factures').update({ solde: true, date_paiement }).eq('id', id)
  if (f) {
    const montantFmt = parseFloat(f.montant).toLocaleString('fr-FR', { minimumFractionDigits: 2 })
    logAction('facture_soldee', 'factures', id, `Facture ${f.numero} soldée — ${f.client} — ${montantFmt} €`)
  }
  chargerFactures()
}

async function marquerFactureNonSoldee(id) {
  const { data: f } = await db.from('factures').select('numero,client').eq('id', id).single()
  await db.from('factures').update({ solde: false, date_paiement: null }).eq('id', id)
  if (f) logAction('facture_annulee', 'factures', id, `Facture ${f.numero} remise en attente — ${f.client}`)
  chargerFactures()
}

function ouvrirNoteFacture(id, noteActuelle) {
  document.getElementById('modal-note-facture-id').value = id
  document.getElementById('modal-note-facture-textarea').value = noteActuelle || ''
  document.getElementById('modal-note-facture').classList.remove('hidden')
  setTimeout(() => document.getElementById('modal-note-facture-textarea').focus(), 50)
}

async function sauvegarderNoteModalFacture(id) {
  const note = document.getElementById('modal-note-facture-textarea')?.value?.trim() || null
  await db.from('factures').update({ note }).eq('id', id)
  fermerModals()
  chargerFactures()
}

// Conservé pour compatibilité (ancien inline)
async function sauvegarderNoteFacture(id) {
  const note = document.getElementById(`note-${id}-input`)?.value?.trim() || null
  await db.from('factures').update({ note }).eq('id', id)
  chargerFactures()
}

// ── Payé le inline ───────────────────────────────────────
function editerDatePaiement(id, dateActuelle) {
  const viewEl = document.getElementById(`paye-${id}-view`)
  const editEl = document.getElementById(`paye-${id}-edit`)
  const inputEl = document.getElementById(`paye-${id}-input`)
  if (viewEl) viewEl.style.display = 'none'
  if (editEl) editEl.style.display = 'inline'
  if (inputEl) { inputEl.value = dateActuelle || ''; setTimeout(() => inputEl.focus(), 30) }
}

async function sauvegarderDatePaiement(id, valeur) {
  const editEl = document.getElementById(`paye-${id}-edit`)
  if (editEl) editEl.style.display = 'none'
  const date_paiement = valeur || null
  await db.from('factures').update({ date_paiement }).eq('id', id)
  chargerFactures()
}

// ── Acompte / paiement partiel ──────────────────────────
async function editerMontantPaye(id, montantActuel) {
  const val = prompt(`Montant réglé (€) :`, montantActuel || '0')
  if (val === null) return
  const montantPaye = parseFloat(val.replace(',', '.')) || 0
  // Récupérer le montant total pour vérifier si soldée
  const { data: f } = await db.from('factures').select('montant').eq('id', id).single()
  const montantTotal = parseFloat(f?.montant) || 0
  const updates = { montant_paye: montantPaye }
  if (montantPaye >= montantTotal && montantTotal > 0) {
    updates.solde = true
    updates.date_paiement = new Date().toISOString().split('T')[0]
  }
  await db.from('factures').update(updates).eq('id', id)
  chargerFactures()
}

// ── Litige ──────────────────────────────────────────────
async function marquerLitige(id) {
  await db.from('factures').update({ litige: true }).eq('id', id)
  chargerFactures()
}

async function annulerLitige(id) {
  await db.from('factures').update({ litige: false }).eq('id', id)
  chargerFactures()
}

// ── Relance ─────────────────────────────────────────────
async function marquerRelance(id) {
  const date_relance = new Date().toISOString().split('T')[0]
  await db.from('factures').update({ date_relance }).eq('id', id)
  chargerFactures()
}

// ── Encaissements ────────────────────────────────────────
async function chargerEncaissements() {
  const container = document.getElementById('contenu-encaissements')
  if (!container) return

  const { data: exclusData } = await db.from('clients_exclus').select('nom')
  const { data: factures }   = await db.from('factures').select('*').eq('solde', false).order('date_echeance', { ascending: true })

  const nomsExclus = new Set((exclusData || []).map(e => e.nom))
  const nonSoldes  = (factures || []).filter(f => !nomsExclus.has(f.client) && f.date_echeance && !f.litige)

  const aujourd_hui = new Date(); aujourd_hui.setHours(0,0,0,0)
  const dans7j  = new Date(aujourd_hui); dans7j.setDate(dans7j.getDate() + 7)
  const finMois = new Date(aujourd_hui.getFullYear(), aujourd_hui.getMonth() + 1, 0)

  const en_retard     = nonSoldes.filter(f => new Date(f.date_echeance) < aujourd_hui)
  const cette_semaine = nonSoldes.filter(f => { const d = new Date(f.date_echeance); return d >= aujourd_hui && d <= dans7j })
  const ce_mois       = nonSoldes.filter(f => { const d = new Date(f.date_echeance); return d > dans7j && d <= finMois })
  const plus_tard     = nonSoldes.filter(f => new Date(f.date_echeance) > finMois)

  const fmt = v => parseFloat(v).toLocaleString('fr-FR', { minimumFractionDigits: 2 })
  const tot = arr => arr.reduce((s,f)=>s+(parseFloat(f.montant)||0),0)

  const lignesFactures = (arr, colorRetard) => arr.length === 0
    ? '<div style="color:var(--muted);font-size:12px;padding:8px 0;">Aucune facture.</div>'
    : arr.map(f => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:7px;background:var(--surface);border:1px solid var(--border-soft);margin-bottom:4px;">
        <div style="font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:${colorRetard ? 'var(--danger)' : 'var(--muted)'};flex-shrink:0;min-width:68px;">${formatDate(f.date_echeance)}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:12.5px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${f.client}</div>
          <div style="font-size:10.5px;color:var(--muted);">${f.numero}</div>
        </div>
        <div style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:${colorRetard ? 'var(--danger)' : 'var(--ink)'};font-size:12.5px;flex-shrink:0;">${fmt(f.montant)} €</div>
      </div>`).join('')

  const section = (titre, couleur, arr, colorRetard=false) => {
    const montant = tot(arr)
    return arr.length === 0 ? '' : `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div>
          <span style="font-size:13px;font-weight:700;color:${couleur};">${titre}</span>
          <span style="font-size:11.5px;color:var(--muted);margin-left:8px;">${arr.length} facture${arr.length>1?'s':''}</span>
        </div>
        <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:13px;color:${couleur};">${fmt(montant)} €</span>
      </div>
      ${lignesFactures(arr, colorRetard)}
    </div>`
  }

  container.innerHTML = `
    ${section('⚠ En retard', 'var(--danger)', en_retard, true)}
    ${section('📅 Cette semaine', 'var(--brand)', cette_semaine)}
    ${section('🗓 Ce mois', 'var(--ink)', ce_mois)}
    ${section('⏳ Plus tard', 'var(--muted)', plus_tard)}
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:700;color:var(--ink);">📆 Calendrier des échéances</div>
        <div style="display:flex;gap:6px;align-items:center;">
          <button onclick="calEncNaviguer(-1)" class="btn btn-secondary" style="font-size:12px;padding:4px 12px;">←</button>
          <span id="cal-enc-titre" style="font-weight:600;font-size:13px;min-width:150px;text-align:center;"></span>
          <button onclick="calEncNaviguer(1)" class="btn btn-secondary" style="font-size:12px;padding:4px 12px;">→</button>
        </div>
      </div>
      <p style="font-size:11.5px;color:var(--muted);margin:0 0 10px;">Cliquez sur une date pour voir les factures à échéance ce jour-là.</p>
      <div id="cal-enc-detail" style="margin-bottom:12px;"></div>
      <div id="cal-enc-contenu"></div>
    </div>`

  window._encaissementsData = nonSoldes
  afficherCalendrierEncaissements()
}

function calEncNaviguer(dir) {
  calEncMois.setMonth(calEncMois.getMonth() + dir)
  afficherCalendrierEncaissements()
}

function afficherCalendrierEncaissements() {
  const moisNoms = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
  const titreEl = document.getElementById('cal-enc-titre')
  if (titreEl) titreEl.textContent = `${moisNoms[calEncMois.getMonth()]} ${calEncMois.getFullYear()}`

  const container = document.getElementById('cal-enc-contenu')
  if (!container) return

  const annee = calEncMois.getFullYear()
  const mois  = calEncMois.getMonth()
  const premier = new Date(annee, mois, 1)
  const aujourd_hui = new Date(); aujourd_hui.setHours(0,0,0,0)

  const debutGrille = new Date(premier)
  debutGrille.setDate(debutGrille.getDate() - ((debutGrille.getDay() + 6) % 7))

  const factures = window._encaissementsData || []
  // Grouper par date
  const parDate = {}
  factures.forEach(f => {
    if (f.date_echeance) {
      if (!parDate[f.date_echeance]) parDate[f.date_echeance] = []
      parDate[f.date_echeance].push(f)
    }
  })

  const jours = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
  let html = '<div class="cal-grille">'
  jours.forEach(j => { html += `<div class="cal-header-jour">${j}</div>` })

  const cur = new Date(debutGrille)
  for (let i = 0; i < 42; i++) {
    const isAujourdHui = cur.getTime() === aujourd_hui.getTime()
    const isAutreMois  = cur.getMonth() !== mois
    const curStr = cur.toISOString().split('T')[0]
    const factsDuJour = parDate[curStr] || []
    const nbFacts = factsDuJour.length
    html += `<div class="cal-jour ${isAujourdHui ? 'aujourd-hui' : ''} ${isAutreMois ? 'autre-mois' : ''}" data-date="${curStr}" style="cursor:${nbFacts > 0 ? 'pointer' : 'default'};" ${nbFacts > 0 ? `onclick="afficherDetailJourEncaissement('${curStr}')"` : ''}>`
    html += `<div class="cal-num">${cur.getDate()}</div>`
    if (nbFacts > 0) {
      const tot = factsDuJour.reduce((s,f)=>s+(parseFloat(f.montant)||0),0)
      html += `<div style="font-size:9px;font-weight:600;color:var(--brand);background:var(--brand-soft);padding:1px 5px;border-radius:3px;margin-top:2px;">${nbFacts} · ${tot.toLocaleString('fr-FR',{maximumFractionDigits:0})} €</div>`
    }
    html += '</div>'
    cur.setDate(cur.getDate() + 1)
  }
  html += '</div>'
  container.innerHTML = html
}

function afficherDetailJourEncaissement(dateStr) {
  const container = document.getElementById('cal-enc-detail')
  if (!container) return
  // Mettre en surbrillance le jour sélectionné
  document.querySelectorAll('.cal-jour').forEach(el => el.style.outline = '')
  const jourEl = document.querySelector(`[data-date="${dateStr}"]`)
  if (jourEl) jourEl.style.outline = '2px solid var(--brand)'

  const factures = (window._encaissementsData || []).filter(f => f.date_echeance === dateStr)
  if (!factures.length) { container.innerHTML = ''; return }
  const fmt = v => parseFloat(v).toLocaleString('fr-FR', { minimumFractionDigits: 2 })
  const tot = factures.reduce((s,f)=>s+(parseFloat(f.montant)||0),0)
  container.innerHTML = `
    <div style="background:var(--brand-soft);border:1px solid var(--brand);border-radius:10px;padding:12px 14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="font-size:13px;font-weight:700;color:var(--brand-deep);">Échéances du ${formatDate(dateStr)}</div>
        <div style="font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:13px;color:var(--brand-deep);">${fmt(tot)} € · ${factures.length} facture${factures.length>1?'s':''}</div>
      </div>
      ${factures.map(f => `
        <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;background:var(--surface);border-radius:7px;margin-bottom:4px;border:1px solid var(--border-soft);">
          <div style="flex:1;"><div style="font-weight:600;font-size:12.5px;color:var(--ink);">${f.client}</div><div style="font-size:10.5px;color:var(--muted);">${f.numero}${f.telephone ? ' · 📞 ' + formatPhone(f.telephone) : ''}</div></div>
          <div style="font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:12.5px;color:var(--ink);">${fmt(f.montant)} €</div>
        </div>`).join('')}
    </div>`
  container.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

// ── Analytique ───────────────────────────────────────────
async function chargerAnalytique() {
  const container = document.getElementById('contenu-analytique')
  if (!container) return

  const { data: exclusData } = await db.from('clients_exclus').select('nom')
  const { data: factures }   = await db.from('factures').select('*').order('date_echeance', { ascending: true })

  const nomsExclus = new Set((exclusData || []).map(e => e.nom))
  const toutes = (factures || []).filter(f => !nomsExclus.has(f.client))
  const enRetard = toutes.filter(f => {
    const auj = new Date().toISOString().split('T')[0]
    return !f.solde && !f.litige && f.date_echeance && f.date_echeance < auj
  })

  const auj = new Date().toISOString().split('T')[0]
  const tranches = [
    { label: '0–30j',  min: 0,  max: 30,  bg: '#fef9c3', col: '#854d0e' },
    { label: '31–60j', min: 31, max: 60,  bg: '#ffedd5', col: '#9a3412' },
    { label: '61–90j', min: 61, max: 90,  bg: '#fee2e2', col: '#991b1b' },
    { label: '90j+',   min: 91, max: Infinity, bg: '#7f1d1d', col: '#fff' },
  ]

  const statsTransches = tranches.map(t => {
    const arr = enRetard.filter(f => {
      const j = Math.floor((new Date(auj) - new Date(f.date_echeance)) / 86400000)
      return j >= t.min && j <= t.max
    })
    const tot = arr.reduce((s,f)=>s+(parseFloat(f.montant)||0),0)
    return { ...t, count: arr.length, total: tot }
  })

  // Cards tranches
  const cardsHtml = statsTransches.map(t => `
    <div style="background:${t.bg};border-radius:10px;padding:14px 16px;flex:1;min-width:120px;">
      <div style="font-size:11px;font-weight:700;color:${t.col};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${t.label}</div>
      <div style="font-size:20px;font-weight:700;color:${t.col};">${t.count}</div>
      <div style="font-size:11px;color:${t.col};opacity:0.85;margin-top:2px;font-family:'IBM Plex Mono',monospace;">${t.total.toLocaleString('fr-FR',{minimumFractionDigits:2})} €</div>
    </div>`).join('')

  // Graphique selon la période choisie
  const moisNoms = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
  const now = new Date()
  let points = []

  if (analytiquePeriode === 'hebdomadaire') {
    // 13 dernières semaines
    for (let i = 12; i >= 0; i--) {
      const debut = new Date(now); debut.setDate(debut.getDate() - i * 7 - debut.getDay() + 1); debut.setHours(0,0,0,0)
      const fin   = new Date(debut); fin.setDate(fin.getDate() + 6)
      const debutStr = debut.toISOString().split('T')[0]
      const finStr   = fin.toISOString().split('T')[0]
      const arr = toutes.filter(f => f.date_echeance && f.date_echeance >= debutStr && f.date_echeance <= finStr && !f.solde)
      const montant = arr.reduce((s,f)=>s+(parseFloat(f.montant)||0),0)
      const num = `S${Math.ceil((debut.getDate()) / 7)}\n${debut.getDate()}/${debut.getMonth()+1}`
      points.push({ label: `S${debut.getDate()}/${debut.getMonth()+1}`, montant })
    }
  } else if (analytiquePeriode === 'annuel') {
    // 5 dernières années
    for (let i = 4; i >= 0; i--) {
      const annee = now.getFullYear() - i
      const arr = toutes.filter(f => f.date_echeance && f.date_echeance.startsWith(`${annee}`) && !f.solde)
      const montant = arr.reduce((s,f)=>s+(parseFloat(f.montant)||0),0)
      points.push({ label: `${annee}`, montant })
    }
  } else {
    // Mensuel : 12 derniers mois
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const moisStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      const arr = toutes.filter(f => f.date_echeance && f.date_echeance.startsWith(moisStr) && !f.solde)
      const montant = arr.reduce((s,f)=>s+(parseFloat(f.montant)||0),0)
      points.push({ label: moisNoms[d.getMonth()], montant })
    }
  }

  const maxVal = Math.max(...points.map(p => p.montant), 1)
  const W = 700, H = 180, padL = 40, padR = 10, padT = 15, padB = 30
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const step = points.length > 1 ? innerW / (points.length - 1) : innerW

  const ptsStr = points.map((p, i) => {
    const x = padL + i * step
    const y = padT + innerH - (p.montant / maxVal) * innerH
    return `${x},${y}`
  }).join(' ')

  const labels = points.map((p, i) => {
    const x = padL + i * step
    return `<text x="${x}" y="${H - 4}" text-anchor="middle" fill="var(--muted)" font-size="9" font-family="Inter,sans-serif">${p.label}</text>`
  }).join('')

  const dots = points.map((p, i) => {
    const x = padL + i * step
    const y = padT + innerH - (p.montant / maxVal) * innerH
    const fmtV = p.montant.toLocaleString('fr-FR', {maximumFractionDigits:0})
    return `<circle cx="${x}" cy="${y}" r="4" fill="var(--brand)"><title>${p.label} : ${fmtV} €</title></circle>`
  }).join('')

  const svgHtml = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="overflow:visible;">
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT+innerH}" stroke="var(--border)" stroke-width="1"/>
      <line x1="${padL}" y1="${padT+innerH}" x2="${W-padR}" y2="${padT+innerH}" stroke="var(--border)" stroke-width="1"/>
      <polyline points="${ptsStr}" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      ${labels}
    </svg>`

  const periodes = [
    { val: 'hebdomadaire', label: 'Hebdo' },
    { val: 'mensuel',      label: 'Mensuel' },
    { val: 'annuel',       label: 'Annuel' },
  ]
  const togglePeriode = periodes.map(p => `
    <button onclick="setAnalytiquePeriode('${p.val}')" style="font-size:12px;padding:4px 14px;border-radius:6px;border:none;cursor:pointer;font-family:inherit;font-weight:${analytiquePeriode===p.val?'700':'400'};background:${analytiquePeriode===p.val?'var(--brand)':'var(--surface-alt)'};color:${analytiquePeriode===p.val?'#fff':'var(--muted)'};">
      ${p.label}
    </button>`).join('')

  const titreGraphique = analytiquePeriode === 'hebdomadaire' ? '13 dernières semaines'
    : analytiquePeriode === 'annuel' ? '5 dernières années' : '12 derniers mois'

  container.innerHTML = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;">${cardsHtml}</div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
        <div style="font-size:13px;font-weight:700;color:var(--ink);">Encours — <span style="color:var(--muted);font-weight:500;">${titreGraphique}</span></div>
        <div style="display:flex;gap:4px;background:var(--surface-alt);border-radius:8px;padding:3px;">${togglePeriode}</div>
      </div>
      ${svgHtml}
    </div>`
}

// ── Parser CSV DISTRILOG ──────────────────────────────────
function parseCSVDISTRILOG(text) {
  const rows = []
  let col = '', cols = [], inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') { inQ = !inQ }
    else if (c === ';' && !inQ) { cols.push(col.trim()); col = '' }
    else if ((c === '\n' || c === '\r') && !inQ) {
      cols.push(col.trim()); col = ''
      if (cols.some(x => x)) rows.push(cols)
      cols = []
      if (c === '\r' && text[i+1] === '\n') i++
    } else { col += c }
  }
  if (col || cols.length) { cols.push(col.trim()); if (cols.some(x => x)) rows.push(cols) }
  return rows
}

function parseDateEmissionDL(str) {
  if (!str) return null
  const part = str.split(' ')[0]
  const [d, m, y] = part.split('/')
  if (!d || !m || !y) return null
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
}

function parseDateEcheanceDL(str) {
  if (!str) return null
  const [d, m, y] = str.trim().split('/')
  if (!d || !m || !y) return null
  const annee = y.length === 2 ? '20' + y : y
  return `${annee}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
}

async function importerCSVFactures(file) {
  if (!file) return
  const text = await file.text()
  const rows = parseCSVDISTRILOG(text)
  if (!rows.length) { alert('Fichier vide ou format invalide.'); return }

  // Charger clients exclus + factures existantes en parallèle
  const [{ data: exclus }, { data: existantes }] = await Promise.all([
    db.from('clients_exclus').select('nom'),
    db.from('factures').select('numero, solde, note')
  ])
  const nomsExclus  = new Set((exclus     || []).map(e => e.nom))
  // Map numero → { solde, note } pour préserver les données manuelles
  const existantesMap = new Map((existantes || []).map(f => [f.numero, f]))

  // Ignorer la ligne header
  const dataRows = rows.slice(1).filter(r => r[5] && r[5].trim())

  let nbExclus = 0, nbNouveaux = 0, nbMisAJour = 0
  const factures = dataRows.map(cols => {
    const numero  = cols[5]?.trim() || null
    const client  = cols[0]?.trim() || 'Client inconnu'

    // 1. Exclure les clients de la liste (comparaison exacte)
    if (nomsExclus.has(client)) { nbExclus++; return null }
    if (!numero) return null

    const montantStr    = (cols[4] || '0').trim().replace(',', '.')
    const montant       = parseFloat(montantStr) || 0
    const date_emission = parseDateEmissionDL(cols[1])
    const date_echeance = parseDateEcheanceDL(cols[11])
    const soldeCSV      = (cols[6] || '').trim() === 'Oui'
    const ville         = cols[7]?.trim() || null
    const commentaire   = cols[3]?.trim().slice(0, 500) || null

    const existant = existantesMap.get(numero)
    if (existant) {
      nbMisAJour++
      // Règle anti-régression : le statut soldé ne peut jamais reculer.
      // Si marqué manuellement "soldé" dans l'app → on garde true même si le CSV dit non.
      // Si DISTRILOG dit soldé → on met true.
      const solde = existant.solde || soldeCSV
      // La note manuelle n'est jamais écrasée par le CSV
      const note = existant.note ?? null
      return { numero, client, montant, date_emission, date_echeance, solde, ville, commentaire, note }
    } else {
      nbNouveaux++
      return { numero, client, montant, date_emission, date_echeance, solde: soldeCSV, ville, commentaire }
    }
  }).filter(Boolean)

  if (!factures.length) {
    alert(`Aucune facture valide trouvée.${nbExclus > 0 ? `\n(${nbExclus} ligne${nbExclus>1?'s':''} ignorée${nbExclus>1?'s':''} — clients exclus)` : ''}`)
    return
  }

  // Upsert garanti sans doublon (clé unique : numero)
  const { error } = await db.from('factures').upsert(factures, { onConflict: 'numero', ignoreDuplicates: false })
  if (error) { console.error(error); alert('Erreur import : ' + error.message); return }

  // Réinitialiser l'input file
  document.getElementById('input-csv-factures').value = ''
  const lignes = [
    nbNouveaux  > 0 ? `${nbNouveaux} nouvelle${nbNouveaux>1?'s':''} facture${nbNouveaux>1?'s':''}` : null,
    nbMisAJour  > 0 ? `${nbMisAJour} mise${nbMisAJour>1?'s':''} à jour` : null,
    nbExclus    > 0 ? `${nbExclus} ignorée${nbExclus>1?'s':''} (clients exclus)` : null,
  ].filter(Boolean)
  alert('✓ Import terminé\n' + lignes.join(' · '))
  chargerFactures()
}