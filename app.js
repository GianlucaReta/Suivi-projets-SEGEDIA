const SUPABASE_URL = 'https://guzbikygjwsvztlthmnr.supabase.co'
const SUPABASE_KEY = 'sb_publishable_BqknWAgxurkaidzDdyQ60g_GnlnIcYk'
const SUPABASE_ANON_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1emJpa3lnandzdnp0bHRobW5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczOTA3MzUsImV4cCI6MjA5Mjk2NjczNX0.U7y7458ZAoDBbuVjSbYuDg7zmt77mbLvc1gxEtq9MK8'

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
let filtresProjEquipe = new Set()   // vide = "tous"
let filtresProjStatut = new Set()   // vide = "tous"
let filtresTacheStatut = new Set()   // vide = "tous"
let filtresTacheEquipe = new Set()   // vide = "toutes"
let vueProjet = 'liste'
let vueTachesGlobal = 'liste'
let filtresFact = new Set()          // vide = "toutes"
let facturesPage    = 1
const FACTURES_PAR_PAGE = 50

// Utilisateur actif (persisté en localStorage)
let utilisateurActifId       = localStorage.getItem('suivi_user_id')          || null
let utilisateurActifNom      = localStorage.getItem('suivi_user_nom')         || null
let utilisateurActifEquipe   = localStorage.getItem('suivi_user_equipe')      || null
let utilisateurAccesFactures = localStorage.getItem('suivi_acces_factures') === '1'
let utilisateurRole          = localStorage.getItem('suivi_user_role')        || 'admin'  // 'admin' | 'commercial' | 'operationnel'

function estAdmin()        { return utilisateurRole === 'admin' }
function estCommercial()   { return utilisateurRole === 'commercial' || utilisateurRole === 'admin' }
function estOperationnel() { return utilisateurRole === 'operationnel' || estCommercial() }

function deconnexion() {
  localStorage.removeItem('sp_auth')
  localStorage.removeItem('suivi_user_id')
  localStorage.removeItem('suivi_user_nom')
  localStorage.removeItem('suivi_user_equipe')
  localStorage.removeItem('suivi_user_role')
  localStorage.removeItem('suivi_acces_factures')
  window.location.reload()
}

function ouvrirMenuUtilisateur() {
  const m = document.getElementById('menu-utilisateur')
  if (!m) return
  m.style.display = m.style.display === 'none' ? 'block' : 'none'
}
function fermerMenuUtilisateur() {
  const m = document.getElementById('menu-utilisateur')
  if (m) m.style.display = 'none'
}
// Fermer le menu si clic ailleurs
document.addEventListener('click', e => {
  if (!e.target.closest('#menu-utilisateur') && !e.target.closest('.sidebar-user')) fermerMenuUtilisateur()
})

// ── SIDEBAR TOGGLE ──────────────────────────────────────────
let _sidebarCollapsed = localStorage.getItem('suivi_sidebar_collapsed') === '1'

function toggleSidebar() {
  _sidebarCollapsed = !_sidebarCollapsed
  localStorage.setItem('suivi_sidebar_collapsed', _sidebarCollapsed ? '1' : '0')
  appliqueSidebarState()
}

function appliqueSidebarState() {
  const sidebar = document.getElementById('main-sidebar')
  const main    = document.querySelector('.main')
  const btn     = document.getElementById('sidebar-toggle-btn')
  const icon    = document.getElementById('sidebar-toggle-icon')
  if (!sidebar || !main || !btn) return
  if (_sidebarCollapsed) {
    sidebar.classList.add('collapsed')
    main.classList.add('sidebar-collapsed')
    btn.classList.add('collapsed')
    btn.title = 'Agrandir le menu'
    // Flèche vers la droite (›) quand réduit
    if (icon) icon.innerHTML = '<path d="M3.5 2L6.5 5l-3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
  } else {
    sidebar.classList.remove('collapsed')
    main.classList.remove('sidebar-collapsed')
    btn.classList.remove('collapsed')
    btn.title = 'Réduire le menu'
    // Flèche vers la gauche (‹) quand ouvert
    if (icon) icon.innerHTML = '<path d="M6.5 2L3.5 5l3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
  }
}

// Appliquer l'état sauvegardé au chargement
document.addEventListener('DOMContentLoaded', appliqueSidebarState)

// --- NAVIGATION ---
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  document.getElementById('page-' + page).classList.add('active')
  const navMap = { dashboard: 'dashboard', projets: 'projet', taches: 'tâche', employes: 'équipe', archives: 'archive', calendrier: 'calendrier', factures: 'factures', recouvrement: 'recouvrement', recurrents: 'récurrents' }
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
  if (page === 'recouvrement') { chargerRecouvrement(); mettreAJourBadgeRecouvrement() }
  if (page === 'recurrents') chargerRecurrents()
  // Mémoriser l'onglet courant pour le restaurer au rechargement
  // On exclut les sous-pages sans état propre (detail = vue d'un projet spécifique)
  if (page !== 'detail') localStorage.setItem('suivi_current_page', page)
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
  if (!retard || !retard.length) { containerR.innerHTML = '' }

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
  const actifS = v => v === 'tous' ? filtresProjStatut.size === 0 : filtresProjStatut.has(v)
  const actifE = v => v === 'tous' ? filtresProjEquipe.size === 0 : filtresProjEquipe.has(v)
  return `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; gap:12px; flex-wrap:wrap;">
      <div style="display:flex; gap:2px; background:var(--surface); padding:3px; border-radius:8px; border:1px solid var(--border);">
        ${tabs.map(t => `
          <button onclick="toggleFiltreProjetStatut('${t.val}')" style="
            background:${actifS(t.val) ? 'var(--brand-soft)' : 'transparent'};
            color:${actifS(t.val) ? 'var(--brand-deep)' : 'var(--muted)'};
            border:none; cursor:pointer; padding:6px 12px; border-radius:6px;
            font-size:12.5px; font-weight:${actifS(t.val) ? '600' : '500'};
            font-family:inherit; display:flex; align-items:center; gap:6px; white-space:nowrap;
          ">${t.label}<span style="font-size:10.5px; font-family:'IBM Plex Mono',monospace; background:${actifS(t.val) ? 'white' : 'var(--surface-alt)'}; color:${actifS(t.val) ? 'var(--brand-deep)' : 'var(--muted)'}; padding:1px 5px; border-radius:3px;">${t.count}</span></button>
        `).join('')}
      </div>
    </div>
    <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:14px;">
      ${equipes.map(e => `
        <button onclick="toggleFiltreProjetEquipe('${e.val}')" style="
          background:${actifE(e.val) ? 'var(--ink)' : 'var(--surface)'};
          color:${actifE(e.val) ? '#fff' : 'var(--muted)'};
          border:1px solid ${actifE(e.val) ? 'var(--ink)' : 'var(--border)'};
          cursor:pointer; padding:4px 12px; border-radius:20px;
          font-size:12px; font-weight:${actifE(e.val) ? '600' : '400'};
          font-family:inherit; white-space:nowrap; transition:all 0.1s;
        ">${e.label}</button>
      `).join('')}
    </div>`
}

function toggleFiltreProjetStatut(val) {
  if (val === 'tous') { filtresProjStatut.clear() }
  else { filtresProjStatut.has(val) ? filtresProjStatut.delete(val) : filtresProjStatut.add(val) }
  chargerProjets()
}
function toggleFiltreProjetEquipe(val) {
  if (val === 'tous') { filtresProjEquipe.clear() }
  else { filtresProjEquipe.has(val) ? filtresProjEquipe.delete(val) : filtresProjEquipe.add(val) }
  chargerProjets()
}
// aliases legacy
function setFiltreProjetEquipe(val) { filtresProjEquipe.clear(); if (val !== 'tous') filtresProjEquipe.add(val); chargerProjets() }
function setFiltreProjetStatut(val) { filtresProjStatut.clear(); if (val !== 'tous') filtresProjStatut.add(val); chargerProjets() }

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
    const okStatut = filtresProjStatut.size === 0 || filtresProjStatut.has(p.statut)
    const okEquipe = filtresProjEquipe.size === 0 || filtresProjEquipe.has(p.equipe)
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
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.08em; font-weight:600;">Date limite</th>
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.08em; font-weight:600;">Statut</th>
          </tr>
        </thead>
        <tbody>
          ${projetsAvecPct.map(p => {
            const equipeLabel = { technique: 'Technique', operationnel: 'Opérationnel', commercial: 'Commercial' }[p.equipe] || p.equipe || '—'
            const equipeColor = { technique: 'var(--brand)', operationnel: 'var(--success)', commercial: 'var(--warn)' }[p.equipe] || 'var(--muted)'
            let dateLimiteHtml = '<span style="color:var(--muted);">—</span>'
            if (p.date_fin_prevue) {
              const joursRestants = Math.ceil((new Date(p.date_fin_prevue) - new Date(aujourd_hui)) / 86400000)
              const enRetardProjet = joursRestants < 0 && p.statut !== 'fait'
              const bientot = joursRestants >= 0 && joursRestants <= 7 && p.statut !== 'fait'
              const couleur = enRetardProjet ? 'var(--danger)' : bientot ? 'var(--warn)' : 'var(--ink-soft)'
              const prefixe = enRetardProjet ? '⚑ ' : bientot ? '⚠ ' : ''
              dateLimiteHtml = `<span style="font-size:11.5px; font-weight:${enRetardProjet || bientot ? '600' : '400'}; color:${couleur}; font-family:'IBM Plex Mono',monospace;">${prefixe}${formatDate(p.date_fin_prevue)}</span>`
            }
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
              <td style="padding:12px 16px; vertical-align:middle;">${dateLimiteHtml}</td>
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
    { val: 'tous',       label: 'Tous' },
    { val: 'en cours',   label: 'En cours' },
    { val: 'en attente', label: 'En attente' },
    { val: 'fait',       label: 'Fait' },
    { val: 'urgent',     label: '🔴 Urgent' },
    { val: 'retard',     label: '⚠ Retard' }
  ]
  const equipes = [
    { val: 'tous',           label: 'Toutes' },
    { val: 'technique',      label: '🔧 Technique' },
    { val: 'operationnel',   label: '⚙️ Opérationnel' },
    { val: 'commercial',     label: '💼 Commercial' },
  ]
  const actifS = v => v === 'tous' ? filtresTacheStatut.size === 0 : filtresTacheStatut.has(v)
  const actifE = v => v === 'tous' ? filtresTacheEquipe.size === 0 : filtresTacheEquipe.has(v)
  return `
    <div style="display:flex; gap:0.4rem; flex-wrap:wrap; margin-bottom:0.5rem; align-items:center;">
      ${statuts.map(s => `<button class="btn ${actifS(s.val) ? 'btn-primary' : 'btn-secondary'}" style="padding:3px 12px; font-size:0.78rem;" onclick="toggleFiltreTacheStatut('${s.val}')">${s.label}</button>`).join('')}
    </div>
    <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:1rem; align-items:center;">
      ${equipes.map(e => `<button style="background:${actifE(e.val)?'var(--ink)':'var(--surface)'};color:${actifE(e.val)?'#fff':'var(--muted)'};border:1px solid ${actifE(e.val)?'var(--ink)':'var(--border)'};cursor:pointer;padding:3px 11px;border-radius:20px;font-size:11.5px;font-weight:${actifE(e.val)?'600':'400'};font-family:inherit;white-space:nowrap;" onclick="toggleFiltreTacheEquipe('${e.val}')">${e.label}</button>`).join('')}
    </div>`
}

function toggleFiltreTacheStatut(val) {
  if (val === 'tous') { filtresTacheStatut.clear() }
  else { filtresTacheStatut.has(val) ? filtresTacheStatut.delete(val) : filtresTacheStatut.add(val) }
  chargerTachesGlobal()
}
function toggleFiltreTacheEquipe(val) {
  if (val === 'tous') { filtresTacheEquipe.clear() }
  else { filtresTacheEquipe.has(val) ? filtresTacheEquipe.delete(val) : filtresTacheEquipe.add(val) }
  chargerTachesGlobal()
}
// aliases legacy
function setFiltreTacheStatut(val) { filtresTacheStatut.clear(); if (val !== 'tous') filtresTacheStatut.add(val); chargerTachesGlobal() }
function setFiltreTacheEquipe(val) { filtresTacheEquipe.clear(); if (val !== 'tous') filtresTacheEquipe.add(val); chargerTachesGlobal() }

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
    const { data: assignations } = await db.from('tache_assignations').select('employes(nom, equipe)').eq('tache_id', t.id)
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
    // Multi-select statut : OR entre tous les filtres actifs
    const okStatut = filtresTacheStatut.size === 0 || [...filtresTacheStatut].some(v =>
      v === 'retard' ? enRetard :
      v === 'urgent' ? (t.priorite === 'urgent' && t.statut !== 'fait') :
      t.statut === v
    )
    // Multi-select équipe : OR entre toutes les équipes actives.
    // Une tâche matche si son projet est de cette équipe, OU si l'un des
    // assignés en fait partie — couvre les tâches sans projet (projet_id
    // null) et les cas de collaboration inter-équipes.
    const okEquipe = filtresTacheEquipe.size === 0
      || filtresTacheEquipe.has(t.projets?.equipe)
      || t.assignations.some(a => filtresTacheEquipe.has(a.employes?.equipe))
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
      const roleBadge = r => {
        const map = {
          admin: { lbl: 'Admin', col: '#7c3aed', bg: '#ede9fe' },
          commercial: { lbl: 'Commercial', col: '#0369a1', bg: '#e0f2fe' },
          operationnel: { lbl: 'Opérationnel', col: '#6b7280', bg: '#f3f4f6' },
        }
        const m = map[r] || map.operationnel
        return `<span style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:2px 7px;border-radius:4px;background:${m.bg};color:${m.col};">${m.lbl}</span>`
      }
      container.innerHTML = data.map(e => `
        <div class="employe-card" onclick="ouvrirFicheEmploye('${e.id}')" style="cursor:pointer;position:relative;">
          ${estAdmin() ? `<div style="position:absolute;top:8px;right:8px;">${roleBadge(e.role)}</div>` : ''}
          <div class="employe-avatar avatar-${e.equipe}">${initiales(e.nom)}</div>
          <div class="employe-nom">${e.nom}</div>
          <div class="employe-equipe">${e.equipe}</div>
          ${e.email ? `<div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">${e.email}</div>` : ''}
          ${e.telephone ? `<div style="font-size:0.72rem; color:var(--text-muted);">${e.telephone}</div>` : ''}
          ${estAdmin() && e.code_pin ? `<div style="font-size:0.7rem;color:var(--success);margin-top:4px;font-family:monospace;">🔑 PIN configuré</div>` : ''}
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

  // Section admin : rôle + PIN (visible uniquement pour les admins)
  const sectionAdmin = document.getElementById('section-admin-employe')
  if (sectionAdmin) sectionAdmin.style.display = estAdmin() ? 'block' : 'none'
  const inputRole = document.getElementById('input-employe-role')
  const inputPin  = document.getElementById('input-employe-pin')
  if (inputRole) inputRole.value = e.role || 'operationnel'
  if (inputPin)  inputPin.value  = e.code_pin || ''

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
  document.getElementById('input-projet-date-fin').value = ''
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
  document.getElementById('input-projet-date-fin').value = projetActif.date_fin_prevue || ''
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

// ── RACCOURCIS CLAVIER ──────────────────────────────────────
function afficherAidRaccourcis() {
  const aide = document.getElementById('aide-raccourcis')
  if (aide) { aide.remove(); return }
  const div = document.createElement('div')
  div.id = 'aide-raccourcis'
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9998;display:flex;align-items:center;justify-content:center;'
  div.onclick = e => { if (e.target === div) div.remove() }
  div.innerHTML = `
    <div style="background:var(--surface);border-radius:14px;padding:28px 32px;max-width:480px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,0.2);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
        <div style="font-weight:700;font-size:17px;color:var(--ink);">Raccourcis clavier</div>
        <button onclick="document.getElementById('aide-raccourcis').remove()" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--muted);padding:0 6px;">×</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;font-size:12.5px;">
        ${[
          ['⌘ K  /  Ctrl K','Recherche globale'],
          ['G puis D','Dashboard'],
          ['G puis P','Projets'],
          ['G puis T','Tâches'],
          ['G puis F','Factures'],
          ['G puis R','Recouvrement'],
          ['G puis E','Équipe'],
          ['G puis C','Calendrier'],
          ['N','Nouvelle tâche'],
          ['Échap','Fermer modal / recherche'],
          ['?','Afficher cette aide'],
        ].map(([k,v]) => `
          <div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--border-soft);">
            <span style="color:var(--muted);">${v}</span>
            <kbd style="font-family:'IBM Plex Mono',monospace;background:var(--surface-alt);border:1px solid var(--border);border-radius:5px;padding:1px 8px;font-size:11px;color:var(--ink);white-space:nowrap;">${k}</kbd>
          </div>`).join('')}
      </div>
    </div>`
  document.body.appendChild(div)
}

let _seqNav = null
let _seqNavTimer = null
document.addEventListener('keydown', e => {
  // Ne pas intercepter pendant la saisie
  const tag = (e.target.tagName || '').toLowerCase()
  const isInput = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable

  // Échap : fermer modal / aide / recherche
  if (e.key === 'Escape') {
    const aide = document.getElementById('aide-raccourcis')
    if (aide) { aide.remove(); return }
    const modalsOuverts = document.querySelectorAll('.modal-overlay:not(.hidden)')
    if (modalsOuverts.length) { fermerModals(); return }
    fermerRecherche()
    return
  }

  // ⌘K / Ctrl+K : recherche globale
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    const input = document.getElementById('search-input')
    if (input) input.focus()
    return
  }

  if (isInput) return

  // ? : aide
  if (e.key === '?' || (e.shiftKey && e.key === '/')) {
    e.preventDefault()
    afficherAidRaccourcis()
    return
  }

  // N : nouvelle tâche (si l'utilisateur est sur une page où c'est possible)
  if (e.key === 'n' || e.key === 'N') {
    const btnNouv = document.querySelector('[onclick*="ouvrirNouvelleTache"]:not([style*="display:none"])')
    if (btnNouv) { e.preventDefault(); btnNouv.click() }
    return
  }

  // Séquence G puis lettre : navigation
  if (_seqNav === 'g') {
    clearTimeout(_seqNavTimer)
    _seqNav = null
    const navMap = { d:'dashboard', p:'projets', t:'taches', f:'factures', r:'recouvrement', e:'employes', c:'calendrier' }
    const cible = navMap[e.key.toLowerCase()]
    if (cible) {
      e.preventDefault()
      // Cacher Factures / Recouvrement si pas accès
      if ((cible === 'factures' || cible === 'recouvrement') && !utilisateurAccesFactures) return
      showPage(cible)
    }
    return
  }
  if (e.key === 'g' || e.key === 'G') {
    _seqNav = 'g'
    _seqNavTimer = setTimeout(() => { _seqNav = null }, 1200)
  }
})

// --- SAUVEGARDES ---
async function sauvegarderProjet() {
  const nom = document.getElementById('input-projet-nom').value.trim()
  if (!nom) { alert('Le nom est obligatoire.'); return }
  const id = document.getElementById('input-projet-id').value
  const dateFin = document.getElementById('input-projet-date-fin').value
  const payload = {
    nom,
    client: document.getElementById('input-projet-client').value.trim(),
    description: document.getElementById('input-projet-description').value.trim(),
    equipe: document.getElementById('input-projet-equipe').value,
    statut: document.getElementById('input-projet-statut').value,
    date_fin_prevue: dateFin || null,
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

  // Champs admin : rôle + PIN (uniquement si admin)
  if (estAdmin()) {
    const role = document.getElementById('input-employe-role')?.value
    const pin  = document.getElementById('input-employe-pin')?.value.trim()
    if (role) {
      payload.role = role
      // acces_factures s'ajuste automatiquement selon le rôle
      payload.acces_factures = (role === 'admin' || role === 'commercial')
    }
    if (pin !== undefined) {
      if (pin && !/^\d{6}$/.test(pin)) { alert('Le code PIN doit faire exactement 6 chiffres.'); return }
      payload.code_pin = pin || null
    }
  }

  let res
  if (id) {
    res = await db.from('employes').update(payload).eq('id', id)
  } else {
    res = await db.from('employes').insert(payload)
  }
  if (res.error) {
    if (res.error.code === '23505') alert('Ce code PIN est déjà utilisé par un autre utilisateur.')
    else alert('Erreur : ' + res.error.message)
    return
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

// Solde restant dû sur une facture = montant total - acompte/avoir déjà réglé.
// Utilisé partout où on calcule un montant à relancer, pour ne jamais
// réclamer une somme déjà couverte par un acompte ou un avoir.
function soldeRestant(f) {
  const montant = parseFloat(f.montant) || 0
  const paye    = parseFloat(f.montant_paye) || 0
  return Math.max(0, montant - paye)
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
const _pageSauvegardee = localStorage.getItem('suivi_current_page')
if (_pageSauvegardee && document.getElementById('page-' + _pageSauvegardee)) {
  showPage(_pageSauvegardee)
} else {
  chargerDashboard()
}
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
    db.from('factures').select('*').order('date_echeance', { ascending: false }).limit(5000)
  ])
  chargerClientsExclus()

  const nomsExclus = new Set((exclusData || []).map(e => e.nom))
  const aujourd_hui = new Date().toISOString().split('T')[0]

  // Exclure les clients masqués de TOUT l'affichage et des stats
  const toutes   = (factures || []).filter(f => !nomsExclus.has(f.client))
  window._toutesFactures = toutes   // utilisé par ouvrirModalRelance
  const nonSolde = toutes.filter(f => !f.solde)
  // Ne pas compter les factures en litige dans les retards
  const enRetard = nonSolde.filter(f => !f.litige && f.date_echeance && f.date_echeance < aujourd_hui)
  const montantTotal  = nonSolde.reduce((s, f) => s + (parseFloat(f.montant) || 0), 0)
  const montantRetard = enRetard.reduce((s, f) => s + (parseFloat(f.montant) || 0), 0)

  // Bandeau J+3 : factures dont l'échéance était il y a exactement 3 jours et non en litige
  const j3 = new Date(); j3.setDate(j3.getDate() - 3); const hierStr = j3.toISOString().split('T')[0]
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
    { val:'toutes',   label:'Toutes' },
    { val:'attente',  label:'En attente' },
    { val:'retard',   label:'En retard' },
    { val:'soldees',  label:'Soldées' },
    { val:'acompte',  label:'💰 Avec acompte' }
  ]
  const actifF = v => v === 'toutes' ? filtresFact.size === 0 : filtresFact.has(v)
  const filtresEl = document.getElementById('filtres-factures')
  if (filtresEl) filtresEl.innerHTML = `
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;width:100%;">
      ${filtres.map(f => `
        <button onclick="toggleFiltreFactures('${f.val}')" style="
          background:${actifF(f.val) ? 'var(--ink)' : 'var(--surface)'};
          color:${actifF(f.val) ? '#fff' : 'var(--muted)'};
          border:1px solid ${actifF(f.val) ? 'var(--ink)' : 'var(--border)'};
          cursor:pointer;padding:4px 14px;border-radius:20px;font-size:12px;
          font-weight:${actifF(f.val) ? '600' : '400'};font-family:inherit;white-space:nowrap;
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

  // Filtrer (statut multi-select + client)
  const filtered = toutes.filter(f => {
    const retard = !f.solde && f.date_echeance && f.date_echeance < aujourd_hui
    const okStatut = filtresFact.size === 0 || [...filtresFact].some(v =>
      v === 'attente' ? (!f.solde && !retard) :
      v === 'retard'  ? retard :
      v === 'soldees' ? f.solde :
      v === 'acompte' ? (parseFloat(f.montant_paye) > 0 && !f.solde) :
      true
    )
    const okClient = !filtreFacturesClient || f.client === filtreFacturesClient
    return okStatut && okClient
  })

  const listeEl = document.getElementById('liste-factures')
  if (!filtered.length) {
    listeEl.innerHTML = '<p style="color:var(--muted); padding:20px;">Aucune facture pour ce filtre.</p>'
    return
  }

  // Pagination
  const nbPages  = Math.ceil(filtered.length / FACTURES_PAR_PAGE)
  if (facturesPage > nbPages) facturesPage = nbPages
  if (facturesPage < 1)       facturesPage = 1
  const debut    = (facturesPage - 1) * FACTURES_PAR_PAGE
  const paginees = filtered.slice(debut, debut + FACTURES_PAR_PAGE)

  const paginationHtml = nbPages <= 1 ? '' : `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-top:1px solid var(--border);background:var(--surface-alt);flex-wrap:wrap;gap:8px;">
      <span style="font-size:12px;color:var(--muted);">${filtered.length} factures — page <b>${facturesPage}</b>/${nbPages}</span>
      <div style="display:flex;gap:6px;">
        <button onclick="facturesPage=1;chargerFactures()" ${facturesPage===1?'disabled':''} style="font-size:12px;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);cursor:pointer;font-family:inherit;opacity:${facturesPage===1?'0.4':'1'};">«</button>
        <button onclick="facturesPage--;chargerFactures()" ${facturesPage<=1?'disabled':''} style="font-size:12px;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);cursor:pointer;font-family:inherit;opacity:${facturesPage<=1?'0.4':'1'};">‹ Précédent</button>
        <button onclick="facturesPage++;chargerFactures()" ${facturesPage>=nbPages?'disabled':''} style="font-size:12px;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);cursor:pointer;font-family:inherit;opacity:${facturesPage>=nbPages?'0.4':'1'};">Suivant ›</button>
        <button onclick="facturesPage=${nbPages};chargerFactures()" ${facturesPage===nbPages?'disabled':''} style="font-size:12px;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);cursor:pointer;font-family:inherit;opacity:${facturesPage===nbPages?'0.4':'1'};">»</button>
      </div>
    </div>`

  listeEl.innerHTML = `
    <div id="bulk-action-bar" style="display:none;background:var(--ink);color:#fff;padding:10px 16px;border-radius:10px;margin-bottom:10px;align-items:center;gap:12px;flex-wrap:wrap;">
      <span style="font-size:13px;font-weight:600;"><span id="bulk-count">0</span> facture(s) sélectionnée(s)</span>
      <div style="flex:1;"></div>
      <button onclick="bulkSolderFactures()" style="font-size:12px;padding:5px 12px;border-radius:6px;background:var(--success);color:#fff;border:none;cursor:pointer;font-family:inherit;font-weight:600;">Marquer soldées</button>
      <button onclick="bulkExporterFactures()" style="font-size:12px;padding:5px 12px;border-radius:6px;background:var(--surface);color:var(--ink);border:none;cursor:pointer;font-family:inherit;font-weight:600;">Exporter CSV</button>
      <button onclick="bulkClearSelection()" style="font-size:12px;padding:5px 10px;border-radius:6px;background:transparent;color:#fff;border:1px solid #fff;cursor:pointer;font-family:inherit;">Annuler</button>
    </div>
    <div style="background:var(--surface); border:1px solid var(--border); border-radius:12px; overflow:hidden; overflow-x:auto;">
      <table style="width:100%; border-collapse:collapse; font-size:12.5px; min-width:1100px;">
        <thead>
          <tr style="background:var(--surface-alt); border-bottom:1px solid var(--border);">
            <th style="padding:10px 8px 10px 16px;width:32px;"><input type="checkbox" id="bulk-checkall" onchange="bulkToggleAll(this.checked)" style="cursor:pointer;" /></th>
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600; white-space:nowrap;">N° Facture</th>
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600;">Client</th>
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600;">Contact</th>
            <th style="padding:10px 16px; text-align:right; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600;">Montant</th>
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
          ${paginees.map(f => {
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

            // ── Colonne Relance — pipeline R1/R2/Appel ──────────────────
            const dot = (emailId, lue) => emailId
              ? (lue
                  ? `<span title="✓ Email ouvert" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--success);margin-left:4px;vertical-align:middle;flex-shrink:0;"></span>`
                  : `<span title="📨 Email envoyé — non ouvert" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--warn);margin-left:4px;vertical-align:middle;flex-shrink:0;"></span>`)
              : ''

            const etapeF = !f.date_relance ? 'r0'
              : f.date_appel ? 'appel'
              : f.date_relance_r2 ? 'r2'
              : 'r1'
            const joursR1 = f.date_relance ? Math.floor((new Date(aujourd_hui) - new Date(f.date_relance)) / 86400000) : 0
            const r2Urgent = etapeF === 'r1' && joursR1 >= 15

            let relanceHtml
            if (etapeF === 'r0') {
              relanceHtml = f.solde ? '' : `<button onclick="ouvrirModalRelance('${f.id}')" style="font-size:10.5px;padding:2px 7px;border-radius:4px;background:var(--brand-soft);color:var(--brand-deep);border:1px solid var(--brand);cursor:pointer;font-family:inherit;font-weight:600;">📤 R1</button>`
            } else if (etapeF === 'r1') {
              relanceHtml = `
                <div style="display:flex;align-items:center;gap:2px;margin-bottom:3px;">
                  <span style="font-size:10.5px;color:var(--muted);">R1 · ${formatDate(f.date_relance)}</span>${dot(f.relance_email_id, f.relance_lue)}
                </div>
                <button onclick="ouvrirModalRelanceR2('${f.id}')" style="font-size:10px;padding:2px 7px;border-radius:4px;background:${r2Urgent ? '#fee2e2' : 'var(--surface-alt)'};color:${r2Urgent ? '#991b1b' : 'var(--muted)'};border:1px solid ${r2Urgent ? '#fca5a5' : 'var(--border)'};cursor:pointer;font-family:inherit;font-weight:${r2Urgent ? '700' : '400'};white-space:nowrap;">${r2Urgent ? '🔴 R2 urgente' : '📤 R2'}</button>`
            } else if (etapeF === 'r2') {
              relanceHtml = `
                <div style="display:flex;align-items:center;gap:2px;margin-bottom:3px;">
                  <span style="font-size:10.5px;color:var(--muted);">R2 · ${formatDate(f.date_relance_r2)}</span>${dot(f.relance_r2_email_id, f.relance_r2_lue)}
                </div>
                <button onclick="ouvrirModalAppel('${f.id}')" style="font-size:10px;padding:2px 7px;border-radius:4px;background:#ede9fe;color:#5b21b6;border:1px solid #c4b5fd;cursor:pointer;font-family:inherit;font-weight:600;white-space:nowrap;">📞 Appel</button>`
            } else {
              relanceHtml = `
                <div style="font-size:10.5px;color:var(--success);font-weight:600;margin-bottom:2px;">📞 ${formatDate(f.date_appel)}</div>
                ${f.note_appel ? `<div style="font-size:10px;color:var(--muted);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(f.note_appel||'').replace(/"/g,'&quot;')}">${f.note_appel}</div>` : ''}
                <button onclick="ouvrirModalAppel('${f.id}')" style="font-size:10px;padding:1px 6px;border-radius:4px;background:var(--surface-alt);color:var(--muted);border:1px solid var(--border);cursor:pointer;font-family:inherit;margin-top:2px;">✏️ Modifier</button>`
            }

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
                <button onclick="editerMontantPaye('${f.id}',${montantPaye})" style="font-size:10.5px;padding:2px 8px;border-radius:4px;background:${montantPaye > 0 ? '#fee2e2' : 'var(--surface-alt)'};color:${montantPaye > 0 ? '#991b1b' : 'var(--muted)'};border:1px solid ${montantPaye > 0 ? '#fca5a5' : 'var(--border)'};cursor:pointer;font-family:inherit;white-space:nowrap;font-weight:${montantPaye > 0 ? '700' : '400'};">${montantPaye > 0 ? '💰 Acompte' : '+ Acompte'}</button>
              </div>`

            return `
              <tr data-fid="${f.id}" style="border-bottom:1px solid var(--border-soft);" onmouseover="this.style.background='var(--surface-alt)'" onmouseout="this.style.background=''">
                <td style="padding:10px 8px 10px 16px;width:32px;"><input type="checkbox" class="bulk-fac" value="${f.id}" data-solde="${f.solde}" onchange="bulkUpdateCounter()" style="cursor:pointer;" onclick="event.stopPropagation()" /></td>
                <td style="padding:10px 16px; font-family:'IBM Plex Mono',monospace; font-size:11.5px; color:var(--ink-soft); white-space:nowrap;">${f.numero}</td>
                <td style="padding:10px 16px; font-weight:600; color:var(--ink);"><span onclick="ouvrirFicheClient('${f.client.replace(/'/g,"\\'")}')" style="cursor:pointer;border-bottom:1px dotted var(--muted);" title="Voir la fiche client 360°">${f.client}</span></td>
                <td style="padding:8px 16px; min-width:150px; max-width:180px;">
                  <div onclick="editerContactFacture('${f.id}','telephone','${(f.telephone||'').replace(/'/g,"\\'").replace(/"/g,'&quot;')}',this)" title="Cliquer pour modifier" style="cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:${f.telephone ? 'var(--ink)' : 'var(--muted)'};padding:2px 0;">${f.telephone ? '📞 ' + formatPhone(f.telephone) : '<span style="font-size:11px;">+ Tél.</span>'}</div>
                  <div onclick="editerContactFacture('${f.id}','email_client','${(f.email_client||'').replace(/'/g,"\\'").replace(/"/g,'&quot;')}',this)" title="Cliquer pour modifier" style="cursor:pointer;font-size:11px;color:${f.email_client ? 'var(--ink-soft)' : 'var(--muted)'};padding:2px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:170px;">${f.email_client ? '✉ ' + f.email_client : '<span>+ Email</span>'}</div>
                </td>
                <td style="padding:10px 16px; text-align:right; font-family:'IBM Plex Mono',monospace; font-weight:600; color:${enRetard ? 'var(--danger)' : 'var(--ink)'}; white-space:nowrap;">${parseFloat(f.montant).toLocaleString('fr-FR', {minimumFractionDigits:2})} €</td>
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
                <td style="padding:6px 20px 6px 16px; width:160px; max-width:160px;">
                  <button onclick="ouvrirNoteFacture('${f.id}', \`${(f.note || '').replace(/`/g,'\\`').replace(/\n/g,' ')}\`)" style="font-size:11px;padding:3px 10px;border-radius:5px;border:1px solid var(--border);background:var(--surface-alt);cursor:pointer;color:${f.note ? 'var(--ink-soft)' : 'var(--muted)'};font-family:inherit;width:100%;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;text-align:left;" title="${(f.note||'').replace(/"/g,'&quot;')}">${f.note ? '📝 ' + f.note.slice(0,22) + (f.note.length > 22 ? '…' : '') : '+ Note'}</button>
                </td>
                <td style="padding:10px 16px; text-align:center; white-space:nowrap;">${actionBtns}</td>
              </tr>`
          }).join('')}
        </tbody>
      </table>
      ${paginationHtml}
    </div>
  `
}

function toggleFiltreFactures(val) {
  if (val === 'toutes') { filtresFact.clear() }
  else { filtresFact.has(val) ? filtresFact.delete(val) : filtresFact.add(val) }
  facturesPage = 1; chargerFactures()
}
// alias legacy
function setFiltreFactures(val) { filtresFact.clear(); if (val !== 'toutes') filtresFact.add(val); facturesPage = 1; chargerFactures() }
function setFiltreFacturesClient(val) { filtreFacturesClient = val; facturesPage = 1; chargerFactures() }

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
  chargerAnalytique()
}

async function supprimerClientExclu(id, nom) {
  if (!confirm(`Retirer "${nom}" de la liste d'exclusion ?\nSes factures réapparaîtront dans le tableau.`)) return
  await db.from('clients_exclus').delete().eq('id', id)
  chargerFactures()
  chargerAnalytique()
}

// ── FICHE CLIENT 360° ────────────────────────────────────
async function ouvrirFicheClient(nomClient) {
  let modal = document.getElementById('modal-fiche-client')
  if (!modal) {
    modal = document.createElement('div')
    modal.id = 'modal-fiche-client'
    modal.className = 'modal-overlay'
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9990;display:flex;align-items:center;justify-content:center;padding:20px;'
    modal.onclick = e => { if (e.target === modal) modal.remove() }
    document.body.appendChild(modal)
  }
  modal.innerHTML = `<div style="background:var(--surface);border-radius:14px;padding:28px;max-width:900px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,0.2);"><div style="text-align:center;color:var(--muted);padding:40px;">Chargement…</div></div>`

  const { data: factures } = await db.from('factures').select('*').eq('client', nomClient).order('date_emission', { ascending: false })
  const facs = factures || []
  if (!facs.length) {
    modal.querySelector('div').innerHTML = `<div style="background:var(--surface);border-radius:14px;padding:28px;max-width:600px;width:100%;"><div style="font-weight:700;font-size:18px;margin-bottom:8px;">${nomClient}</div><div style="color:var(--muted);">Aucune facture pour ce client.</div></div>`
    return
  }

  const auj = new Date().toISOString().split('T')[0]
  const fmt = v => parseFloat(v).toLocaleString('fr-FR', { minimumFractionDigits: 2 })

  // KPIs
  const soldees = facs.filter(f => f.solde && f.date_paiement && f.date_emission)
  const impayees = facs.filter(f => !f.solde)
  const enRetard = impayees.filter(f => !f.litige && f.date_echeance && f.date_echeance < auj)
  const totalCA = facs.reduce((s,f) => s + (parseFloat(f.montant)||0), 0)
  const totalImpaye = impayees.reduce((s,f) => s + (parseFloat(f.montant)||0), 0)
  const totalRetard = enRetard.reduce((s,f) => s + (parseFloat(f.montant)||0), 0)
  const delaiMoyen = soldees.length
    ? Math.round(soldees.reduce((s,f) => s + (new Date(f.date_paiement) - new Date(f.date_emission)) / 86400000, 0) / soldees.length)
    : null
  // Délai vs échéance
  const delaiEcheance = soldees.length
    ? Math.round(soldees.reduce((s,f) => s + (new Date(f.date_paiement) - new Date(f.date_echeance)) / 86400000, 0) / soldees.length)
    : null
  // Score : <0 = très bon, 0-7 = bon, 8-30 = moyen, >30 = mauvais
  const score = delaiEcheance === null ? null
    : delaiEcheance < 0 ? { lbl: 'Excellent', col: '#059669', desc: 'Paye en avance' }
    : delaiEcheance <= 7 ? { lbl: 'Bon', col: '#22c55e', desc: 'Paye à temps' }
    : delaiEcheance <= 30 ? { lbl: 'Moyen', col: '#f59e0b', desc: `+${delaiEcheance}j de retard moyen` }
    : { lbl: 'À risque', col: '#ef4444', desc: `+${delaiEcheance}j de retard moyen` }

  const contact = facs.find(f => f.email_client || f.telephone)
  const email = contact?.email_client || null
  const tel = contact?.telephone || null
  const moyenPaiement = facs.find(f => f.moyen_paiement)?.moyen_paiement || null

  const factLignes = facs.slice(0, 30).map(f => {
    const montant = parseFloat(f.montant)||0
    let statut
    if (f.solde) statut = `<span style="color:var(--success);font-size:11px;font-weight:600;">✓ Soldée${f.date_paiement?' '+formatDate(f.date_paiement):''}</span>`
    else if (f.litige) statut = `<span style="color:#5b21b6;font-size:11px;font-weight:600;">⚠ Litige</span>`
    else if (f.date_echeance && f.date_echeance < auj) {
      const j = Math.floor((new Date(auj) - new Date(f.date_echeance))/86400000)
      statut = `<span style="color:var(--danger);font-size:11px;font-weight:600;">+${j}j retard</span>`
    }
    else statut = `<span style="color:var(--warn);font-size:11px;">En attente</span>`
    return `<tr style="border-bottom:1px solid var(--border-soft);">
      <td style="padding:8px 12px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--ink-soft);">${f.numero}</td>
      <td style="padding:8px 12px;font-size:11.5px;color:var(--muted);">${f.date_emission ? formatDate(f.date_emission) : '—'}</td>
      <td style="padding:8px 12px;font-size:11.5px;color:${f.date_echeance && f.date_echeance < auj && !f.solde ? 'var(--danger)' : 'var(--ink-soft)'};font-weight:${f.date_echeance && f.date_echeance < auj && !f.solde ? '600' : '400'};">${f.date_echeance ? formatDate(f.date_echeance) : '—'}</td>
      <td style="padding:8px 12px;text-align:right;font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:12px;color:var(--ink);">${fmt(montant)} €</td>
      <td style="padding:8px 12px;">${statut}</td>
    </tr>`
  }).join('')

  modal.innerHTML = `<div style="background:var(--surface);border-radius:14px;padding:28px;max-width:900px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,0.2);">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
      <div>
        <div style="font-weight:700;font-size:20px;color:var(--ink);">${nomClient}</div>
        <div style="display:flex;gap:14px;margin-top:6px;font-size:12px;color:var(--muted);flex-wrap:wrap;align-items:center;">
          ${email ? `<span>✉ ${email}</span>` : `<span style="color:var(--danger);">Pas d'email</span>`}
          ${tel ? `<span>📞 ${formatPhone(tel)}</span>` : ''}
          <span style="display:flex;align-items:center;gap:6px;">
            <span style="color:var(--muted);">Paiement :</span>
            <select id="select-moyen-paiement" onchange="sauvegarderMoyenPaiement('${nomClient.replace(/'/g, "\\'")}')" style="font-size:12px;padding:2px 6px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--ink);cursor:pointer;font-family:inherit;">
              <option value="">— non défini —</option>
              <option value="virement" ${moyenPaiement==='virement'?'selected':''}>Virement</option>
              <option value="prélèvement" ${moyenPaiement==='prélèvement'?'selected':''}>Prélèvement</option>
              <option value="espèce" ${moyenPaiement==='espèce'?'selected':''}>Espèce</option>
            </select>
          </span>
        </div>
      </div>
      <button onclick="document.getElementById('modal-fiche-client').remove()" style="background:none;border:none;cursor:pointer;font-size:22px;color:var(--muted);padding:0 6px;">×</button>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px;">
      <div style="background:var(--surface-alt);border-radius:10px;padding:12px;">
        <div style="font-size:10px;text-transform:uppercase;color:var(--muted);font-weight:600;letter-spacing:0.07em;margin-bottom:6px;">CA Total</div>
        <div style="font-size:17px;font-weight:700;font-family:'IBM Plex Mono',monospace;">${fmt(totalCA)} €</div>
        <div style="font-size:10.5px;color:var(--muted);margin-top:2px;">${facs.length} facture${facs.length>1?'s':''}</div>
      </div>
      <div style="background:var(--surface-alt);border-radius:10px;padding:12px;">
        <div style="font-size:10px;text-transform:uppercase;color:var(--muted);font-weight:600;letter-spacing:0.07em;margin-bottom:6px;">Impayé</div>
        <div style="font-size:17px;font-weight:700;font-family:'IBM Plex Mono',monospace;color:${totalImpaye>0?'var(--danger)':'var(--ink)'};">${fmt(totalImpaye)} €</div>
        <div style="font-size:10.5px;color:var(--muted);margin-top:2px;">${impayees.length} en attente · ${enRetard.length} en retard</div>
      </div>
      <div style="background:var(--surface-alt);border-radius:10px;padding:12px;">
        <div style="font-size:10px;text-transform:uppercase;color:var(--muted);font-weight:600;letter-spacing:0.07em;margin-bottom:6px;">Délai moyen</div>
        <div style="font-size:17px;font-weight:700;font-family:'IBM Plex Mono',monospace;">${delaiMoyen !== null ? delaiMoyen + 'j' : '—'}</div>
        <div style="font-size:10.5px;color:var(--muted);margin-top:2px;">émission → paiement</div>
      </div>
      <div style="background:${score ? score.col+'15' : 'var(--surface-alt)'};border-radius:10px;padding:12px;border:1px solid ${score ? score.col+'40' : 'transparent'};">
        <div style="font-size:10px;text-transform:uppercase;color:var(--muted);font-weight:600;letter-spacing:0.07em;margin-bottom:6px;">Score paiement</div>
        <div style="font-size:17px;font-weight:700;color:${score ? score.col : 'var(--muted)'};">${score ? score.lbl : '—'}</div>
        <div style="font-size:10.5px;color:var(--muted);margin-top:2px;">${score ? score.desc : 'Pas assez de données'}</div>
      </div>
    </div>

    ${enRetard.length > 0 ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px 14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <div><span style="font-weight:700;color:var(--danger);">${enRetard.length}</span> <span style="color:#991b1b;">facture${enRetard.length>1?'s':''} en retard — ${fmt(totalRetard)} €</span></div>
      <button onclick="ouvrirModalRelance('${enRetard[0].id}');document.getElementById('modal-fiche-client').remove()" style="font-size:11.5px;padding:5px 12px;border-radius:6px;background:var(--brand);color:#fff;border:none;cursor:pointer;font-family:inherit;font-weight:600;">Envoyer R1</button>
    </div>` : ''}

    <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px;">Historique factures (${facs.length > 30 ? '30 dernières sur ' + facs.length : facs.length})</div>
    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:var(--surface-alt);">
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;">N°</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;">Émission</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;">Échéance</th>
            <th style="padding:8px 12px;text-align:right;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;">Montant</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;">Statut</th>
          </tr>
        </thead>
        <tbody>${factLignes}</tbody>
      </table>
    </div>
  </div>`
}

async function sauvegarderMoyenPaiement(nomClient) {
  const sel = document.getElementById('select-moyen-paiement')
  if (!sel) return
  const val = sel.value || null
  const { error } = await db.from('factures').update({ moyen_paiement: val }).eq('client', nomClient)
  if (error) { afficherToast('Erreur lors de la sauvegarde', 'danger'); return }
  afficherToast(`Moyen de paiement mis à jour pour ${nomClient}`, 'success')
}

// ── BULK ACTIONS sur factures ────────────────────────────
function bulkUpdateCounter() {
  const cocheees = document.querySelectorAll('.bulk-fac:checked')
  const bar = document.getElementById('bulk-action-bar')
  const count = document.getElementById('bulk-count')
  if (count) count.textContent = cocheees.length
  if (bar) bar.style.display = cocheees.length > 0 ? 'flex' : 'none'
  const all = document.getElementById('bulk-checkall')
  const allCb = document.querySelectorAll('.bulk-fac')
  if (all && allCb.length) all.checked = cocheees.length === allCb.length
}

function bulkToggleAll(checked) {
  document.querySelectorAll('.bulk-fac').forEach(cb => { cb.checked = checked })
  bulkUpdateCounter()
}

function bulkClearSelection() {
  document.querySelectorAll('.bulk-fac').forEach(cb => { cb.checked = false })
  const all = document.getElementById('bulk-checkall')
  if (all) all.checked = false
  bulkUpdateCounter()
}

async function bulkSolderFactures() {
  const ids = Array.from(document.querySelectorAll('.bulk-fac:checked'))
    .filter(cb => cb.dataset.solde !== 'true')
    .map(cb => cb.value)
  if (!ids.length) { alert('Aucune facture non-soldée dans la sélection.'); return }
  if (!confirm(`Marquer ${ids.length} facture${ids.length>1?'s':''} comme soldée${ids.length>1?'s':''} ?`)) return
  const date_paiement = new Date().toISOString().split('T')[0]
  await db.from('factures').update({ solde: true, date_paiement }).in('id', ids)
  afficherToast(`${ids.length} facture${ids.length>1?'s':''} soldée${ids.length>1?'s':''}`)
  chargerFactures()
}

function bulkExporterFactures() {
  const ids = new Set(Array.from(document.querySelectorAll('.bulk-fac:checked')).map(cb => cb.value))
  if (!ids.size) return
  const toutes = window._toutesFactures || []
  const sel = toutes.filter(f => ids.has(f.id))
  const headers = ['Numero','Client','Montant','Date emission','Date echeance','Date paiement','Solde','Litige','Email','Telephone','Ville','Note']
  const lignes = sel.map(f => [
    f.numero, f.client, f.montant, f.date_emission||'', f.date_echeance||'',
    f.date_paiement||'', f.solde?'Oui':'Non', f.litige?'Oui':'Non',
    f.email_client||'', f.telephone||'', f.ville||'', (f.note||'').replace(/[\n;]/g,' ')
  ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(';'))
  const csv = '﻿' + headers.join(';') + '\n' + lignes.join('\n')
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const today = new Date().toISOString().split('T')[0]
  a.href = url; a.download = `factures_export_${today}.csv`
  document.body.appendChild(a); a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 100)
  afficherToast(`${sel.length} facture${sel.length>1?'s':''} exportée${sel.length>1?'s':''}`)
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
// ── Relance email ─────────────────────────────────────────
function ouvrirModalRelance(id) {
  const toutes = window._toutesFactures || []
  const facture = toutes.find(f => f.id === id)
  if (!facture) return

  const client = facture.client
  // Priorité à l'email du client cliqué, sinon cherche dans les autres factures du client
  const email = toutes.find(f => f.client === client && f.email_client)?.email_client || null

  const fmt = v => parseFloat(v).toLocaleString('fr-FR', { minimumFractionDigits: 2 })
  const auj = new Date().toISOString().split('T')[0]

  // Uniquement les factures en retard (échues) — exclure celles pas encore dues
  const facImpayees = toutes
    .filter(f => f.client === client && !f.solde && !f.litige && f.date_echeance && f.date_echeance < auj)
    .sort((a, b) => (a.date_echeance || '').localeCompare(b.date_echeance || ''))

  const total = facImpayees.reduce((s, f) => s + soldeRestant(f), 0)
  const ids   = facImpayees.map(f => f.id)

  // Corps du mail selon singulier/pluriel
  let sujet, corps
  if (facImpayees.length === 1) {
    const f = facImpayees[0]
    const restant = soldeRestant(f)
    const mentionAcompte = f.montant_paye > 0 ? ` (après déduction d'un acompte/avoir de ${fmt(f.montant_paye)} €)` : ''
    sujet = `Relance facture N°${f.numero} - SEGEDIA SERVICES`
    corps = `Bonjour,

Sauf erreur de notre part, la facture N°${f.numero} d'un montant de ${fmt(restant)} €${mentionAcompte}, dont l'échéance était fixée au ${formatDate(f.date_echeance)}, n'a pas encore été réglée à ce jour.

Nous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais, aux coordonnées bancaires figurant au bas de votre facture.

Si le paiement de cette facture a déjà été effectué, merci de ne pas tenir compte de ce message.

Cordialement,
SEGEDIA SERVICES`
  } else {
    const lignes = facImpayees.map(f => {
      const restant = soldeRestant(f)
      const mention = f.montant_paye > 0 ? ` (acompte/avoir de ${fmt(f.montant_paye)} € déduit)` : ''
      return `  • N°${f.numero} - ${fmt(restant)} €${mention} - échéance le ${formatDate(f.date_echeance)}`
    }).join('\n')
    sujet = `Relance factures impayées - SEGEDIA SERVICES`
    corps = `Bonjour,

Sauf erreur de notre part, les factures suivantes n'ont pas encore été réglées à ce jour :

${lignes}

Total dû : ${fmt(total)} €

Nous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais, aux coordonnées bancaires figurant au bas de vos factures.

Si le paiement de ces factures a déjà été effectué, merci de ne pas tenir compte de ce message.

Cordialement,
SEGEDIA SERVICES`
  }

  // Remplir le modal
  window._relanceData = { client, email, ids, type: 'r1' }
  document.getElementById('modal-relance-client').textContent = client
  document.getElementById('modal-relance-nb').textContent =
    `${facImpayees.length} facture${facImpayees.length > 1 ? 's' : ''} impayée${facImpayees.length > 1 ? 's' : ''} · Total : ${fmt(total)} €`
  document.getElementById('modal-relance-to').textContent = email || 'Aucun email renseigné'
  document.getElementById('modal-relance-to').style.color = email ? 'var(--success)' : 'var(--danger)'
  document.getElementById('modal-relance-sujet').value = sujet
  document.getElementById('modal-relance-corps').value = corps

  const warning = document.getElementById('modal-relance-warning')
  const sendBtn = document.getElementById('btn-envoyer-relance')
  if (!email) {
    warning.style.display = 'flex'
    sendBtn.disabled = true
    sendBtn.style.opacity = '0.4'
    sendBtn.style.cursor = 'not-allowed'
  } else {
    warning.style.display = 'none'
    sendBtn.disabled = false
    sendBtn.style.opacity = '1'
    sendBtn.style.cursor = 'pointer'
  }

  document.getElementById('modal-relance-email').classList.remove('hidden')
}

async function envoyerRelanceEmail() {
  const { client, email, ids } = window._relanceData || {}
  if (!email) return

  const sujet = document.getElementById('modal-relance-sujet').value.trim()
  const corps = document.getElementById('modal-relance-corps').value.trim()

  const btn = document.getElementById('btn-envoyer-relance')
  btn.textContent = 'Envoi en cours…'
  btn.disabled = true

  // Convertir le texte brut en HTML propre pour l'email
  const lignesHtml = corps
    .split('\n\n')
    .map(para => `<p style="margin:0 0 14px;">${para.replace(/\n/g, '<br>')}</p>`)
    .join('')

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.75;color:#1a1815;max-width:580px;margin:0 auto;">
      <div style="border-bottom:2px solid #EE7E24;padding-bottom:12px;margin-bottom:24px;">
        <span style="font-weight:700;font-size:16px;color:#EE7E24;">SEGEDIA SERVICES</span>
      </div>
      ${lignesHtml}
      <div style="margin-top:24px;padding-top:12px;border-top:1px solid #eee;font-size:12px;color:#888;">
        Ce message est envoyé automatiquement. Merci de ne pas y répondre directement.
      </div>
    </div>`

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/envoyer-relance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_JWT}`,
      },
      body: JSON.stringify({ to: email, subject: sujet, html, ids, type: window._relanceData?.type || 'r1' }),
    })
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error || 'Erreur serveur')

    fermerModals()
    afficherToast(`Mail envoyé à ${email}`)
    const pageRec = document.getElementById('page-recouvrement')
    if (pageRec && pageRec.classList.contains('active')) chargerRecouvrement()
    else chargerFactures()
    mettreAJourBadgeRecouvrement()
  } catch (e) {
    btn.textContent = '📤 Envoyer'
    btn.disabled = false
    afficherToast(`❌ Échec de l'envoi : ${e.message}`, true)
  }
}

function afficherToast(msg, erreur = false) {
  const t = document.createElement('div')
  t.textContent = msg
  t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 18px;border-radius:10px;font-size:13px;font-weight:600;font-family:inherit;box-shadow:0 4px 16px rgba(0,0,0,0.15);transition:opacity 0.4s;background:${erreur ? '#fee2e2' : '#d1fae5'};color:${erreur ? '#991b1b' : '#166534'};border:1px solid ${erreur ? '#fca5a5' : '#6ee7b7'};`
  document.body.appendChild(t)
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400) }, 3500)
}

// ── Relance R2 ──────────────────────────────────────────
function ouvrirModalRelanceR2(id) {
  const toutes = window._toutesFactures || []
  const facture = toutes.find(f => f.id === id)
  if (!facture) return

  const client = facture.client
  const email = toutes.find(f => f.client === client && f.email_client)?.email_client || null
  const fmt = v => parseFloat(v).toLocaleString('fr-FR', { minimumFractionDigits: 2 })

  const auj2 = new Date().toISOString().split('T')[0]
  const facImpayees = toutes
    .filter(f => f.client === client && !f.solde && !f.litige && f.date_echeance && f.date_echeance < auj2)
    .sort((a, b) => (a.date_echeance || '').localeCompare(b.date_echeance || ''))

  const total = facImpayees.reduce((s, f) => s + soldeRestant(f), 0)
  const ids   = facImpayees.map(f => f.id)

  const echeancier = total >= 1000
    ? `\nToutefois, si vous rencontrez des difficultés de trésorerie, nous restons ouverts à la mise en place d'un échéancier de paiement. N'hésitez pas à nous contacter pour en discuter.\n`
    : ''

  let sujet, corps
  if (facImpayees.length === 1) {
    const f = facImpayees[0]
    const restant = soldeRestant(f)
    const mentionAcompte = f.montant_paye > 0 ? ` (après déduction d'un acompte/avoir de ${fmt(f.montant_paye)} €)` : ''
    sujet = `Relance 2ème avis - Facture N°${f.numero} - SEGEDIA SERVICES`
    corps = `Bonjour,

Sauf erreur de notre part, et malgré notre premier rappel, la facture N°${f.numero} d'un montant de ${fmt(restant)} €${mentionAcompte}, dont l'échéance était fixée au ${formatDate(f.date_echeance)}, n'a toujours pas été réglée à ce jour.

Nous vous demandons de bien vouloir procéder au règlement dans les plus brefs délais, aux coordonnées bancaires figurant au bas de votre facture.

Sans règlement de votre part sous 5 jours ouvrés, votre retard de paiement est susceptible d'impacter la continuité de nos prestations et l'acheminement de vos commandes futures.
${echeancier}
Si le paiement a déjà été effectué, merci de ne pas tenir compte de ce message.

Cordialement,
SEGEDIA SERVICES`
  } else {
    const lignes = facImpayees.map(f => {
      const restant = soldeRestant(f)
      const mention = f.montant_paye > 0 ? ` (acompte/avoir de ${fmt(f.montant_paye)} € déduit)` : ''
      return `  • N°${f.numero} - ${fmt(restant)} €${mention} - échéance le ${formatDate(f.date_echeance)}`
    }).join('\n')
    sujet = `Relance 2ème avis - Factures impayées - SEGEDIA SERVICES`
    corps = `Bonjour,

Sauf erreur de notre part, et malgré notre premier rappel, les factures suivantes n'ont toujours pas été réglées à ce jour :

${lignes}

Total dû : ${fmt(total)} €

Nous vous demandons de bien vouloir procéder au règlement dans les plus brefs délais, aux coordonnées bancaires figurant au bas de vos factures.

Sans règlement de votre part sous 5 jours ouvrés, votre retard de paiement est susceptible d'impacter la continuité de nos prestations et l'acheminement de vos commandes futures.
${echeancier}
Si le paiement a déjà été effectué, merci de ne pas tenir compte de ce message.

Cordialement,
SEGEDIA SERVICES`
  }

  window._relanceData = { client, email, ids, type: 'r2' }
  document.getElementById('modal-relance-client').textContent = client
  document.getElementById('modal-relance-nb').textContent =
    `2ème relance · ${facImpayees.length} facture${facImpayees.length > 1 ? 's' : ''} · Total : ${fmt(total)} €`
  document.getElementById('modal-relance-to').textContent = email || 'Aucun email renseigné'
  document.getElementById('modal-relance-to').style.color = email ? 'var(--success)' : 'var(--danger)'
  document.getElementById('modal-relance-sujet').value = sujet
  document.getElementById('modal-relance-corps').value = corps

  const warning = document.getElementById('modal-relance-warning')
  const sendBtn = document.getElementById('btn-envoyer-relance')
  const titleEl = document.querySelector('#modal-relance-email h2')
  if (titleEl) titleEl.innerHTML = `📤 Relance R2 — <span id="modal-relance-client">${client}</span>`
  if (!email) {
    warning.style.display = 'flex'
    sendBtn.disabled = true; sendBtn.style.opacity = '0.4'; sendBtn.style.cursor = 'not-allowed'
  } else {
    warning.style.display = 'none'
    sendBtn.disabled = false; sendBtn.style.opacity = '1'; sendBtn.style.cursor = 'pointer'
  }
  document.getElementById('modal-relance-email').classList.remove('hidden')
}

// ── Modal Appel ─────────────────────────────────────────
function ouvrirModalAppel(id) {
  const toutes = window._toutesFactures || []
  const facture = toutes.find(f => f.id === id)
  if (!facture) return

  const client = facture.client
  const facImpayees = toutes.filter(f => f.client === client && !f.solde && !f.litige)
  const ids = facImpayees.map(f => f.id)
  const noteExistante = facImpayees.find(f => f.note_appel)?.note_appel || ''
  const dateExistante = facImpayees.find(f => f.date_appel)?.date_appel || new Date().toISOString().split('T')[0]
  const fmt = v => parseFloat(v).toLocaleString('fr-FR', { minimumFractionDigits: 2 })
  const total = facImpayees.reduce((s, f) => s + soldeRestant(f), 0)

  window._appelData = { client, ids }
  document.getElementById('modal-appel-client').textContent = client
  document.getElementById('modal-appel-nb').textContent =
    `${facImpayees.length} facture${facImpayees.length > 1 ? 's' : ''} impayée${facImpayees.length > 1 ? 's' : ''} · Total : ${fmt(total)} €`
  document.getElementById('modal-appel-date').value = dateExistante
  document.getElementById('modal-appel-note').value = noteExistante

  document.getElementById('modal-appel').classList.remove('hidden')
  setTimeout(() => document.getElementById('modal-appel-note').focus(), 50)
}

async function enregistrerAppel() {
  const { client, ids } = window._appelData || {}
  if (!ids || !ids.length) return

  const date_appel = document.getElementById('modal-appel-date').value
  const note_appel = document.getElementById('modal-appel-note').value.trim() || null

  if (!date_appel) { alert('Veuillez saisir une date.'); return }

  await db.from('factures').update({ date_appel, note_appel }).in('id', ids)
  fermerModals()
  afficherToast(`Appel enregistré pour ${client}`)
  const pageRecouv = document.getElementById('page-recouvrement')
  if (pageRecouv && pageRecouv.classList.contains('active')) chargerRecouvrement()
  else chargerFactures()
  mettreAJourBadgeRecouvrement()
}

// ── Badge nav Recouvrement ─────────────────────────────
async function mettreAJourBadgeRecouvrement() {
  if (!utilisateurAccesFactures) return
  const badge = document.getElementById('nav-badge-recouvrement')
  if (!badge) return
  const auj = new Date().toISOString().split('T')[0]
  const { data: exclusData } = await db.from('clients_exclus').select('nom')
  const { data: factures }   = await db.from('factures').select('client,date_echeance,date_relance,date_relance_r2,date_appel,solde,litige,moyen_paiement').eq('solde', false).eq('litige', false).limit(5000)
  const nomsExclus = new Set((exclusData || []).map(e => e.nom))
  const enRetard = (factures || []).filter(f => !nomsExclus.has(f.client) && f.date_echeance && f.date_echeance < auj)
  const MODES_LETTRAGE = new Set(['espèce', 'prélèvement'])
  const parClient = {}
  enRetard.forEach(f => { if (!parClient[f.client]) parClient[f.client] = []; parClient[f.client].push(f) })
  // Count urgent: r0 (no relance) + r1_urgent (R1 ≥ 15j, no R2)
  // — en excluant les clients espèce/prélèvement (en attente de lettrage, pas de relance)
  let urgent = 0
  Object.values(parClient).forEach(facts => {
    const counts = {}
    for (const f of facts) { const m = (f.moyen_paiement || '').toLowerCase().trim(); if (m) counts[m] = (counts[m] || 0) + 1 }
    let mode = null, bestN = 0
    for (const [m, n] of Object.entries(counts)) if (n > bestN) { mode = m; bestN = n }
    if (MODES_LETTRAGE.has(mode)) return
    const f = facts[0]
    if (!f.date_relance) { urgent++; return }
    if (!f.date_relance_r2 && !f.date_appel) {
      const j = Math.floor((new Date(auj) - new Date(f.date_relance)) / 86400000)
      if (j >= 15) urgent++
    }
  })
  badge.textContent = urgent > 0 ? urgent : ''
  badge.style.display = urgent > 0 ? 'inline-block' : 'none'
}

// ── Page Recouvrement ──────────────────────────────────
function filtrerRecouvrement(q) {
  const terme = q.toLowerCase().trim()
  const cards = document.querySelectorAll('#recouvrement-liste .rec-card')
  let visible = 0
  cards.forEach(card => {
    const nom = card.querySelector('[data-client]')?.dataset.client || card.textContent
    const match = !terme || nom.toLowerCase().includes(terme)
    card.style.display = match ? '' : 'none'
    if (match) visible++
  })
  const counter = document.getElementById('recouvrement-search-count')
  if (counter) counter.textContent = terme ? `${visible} résultat${visible !== 1 ? 's' : ''}` : ''
}

window._recouvrementTri = 'etape'  // 'etape' | 'montant' | 'anciennete'
function changerTriRecouvrement(val) {
  window._recouvrementTri = val
  chargerRecouvrement()
}

async function chargerRecouvrement() {
  if (!utilisateurAccesFactures) return
  const searchInput = document.getElementById('recouvrement-search')
  if (searchInput) searchInput.value = ''
  const searchCount = document.getElementById('recouvrement-search-count')
  if (searchCount) searchCount.textContent = ''
  const triSelect = document.getElementById('recouvrement-tri')
  if (triSelect) triSelect.value = window._recouvrementTri || 'etape'
  const liste = document.getElementById('recouvrement-liste')
  const kpis  = document.getElementById('recouvrement-kpis')
  const stats = document.getElementById('recouvrement-stats-bar')
  if (!liste) return
  liste.innerHTML = `<div style="color:var(--muted);text-align:center;padding:40px 0;font-size:13px;">Chargement…</div>`

  const [{ data: exclusData }, { data: factures }] = await Promise.all([
    db.from('clients_exclus').select('nom'),
    db.from('factures').select('*').eq('solde', false).eq('litige', false).not('date_echeance', 'is', null).order('date_echeance', { ascending: true }).limit(5000)
  ])

  const nomsExclus = new Set((exclusData || []).map(e => e.nom))
  const auj = new Date().toISOString().split('T')[0]
  const fmt = v => parseFloat(v).toLocaleString('fr-FR', { minimumFractionDigits: 2 })

  // Rendre les factures accessibles aux modals R1/R2/Appel
  window._toutesFactures = factures || []

  const enRetard = (factures || []).filter(f => !nomsExclus.has(f.client) && f.date_echeance < auj)

  if (!enRetard.length) {
    if (kpis) kpis.innerHTML = ''
    if (stats) stats.innerHTML = ''
    liste.innerHTML = `<div style="text-align:center;padding:60px 0;color:var(--success);font-size:15px;font-weight:600;">✅ Aucune facture en retard !</div>`
    return
  }

  // Group by client
  const parClient = {}
  enRetard.forEach(f => {
    if (!parClient[f.client]) parClient[f.client] = []
    parClient[f.client].push(f)
  })

  // ── Séparation par moyen de paiement ──────────────────────
  // Espèce & prélèvement ne sont PAS de vrais impayés : ils attendent
  // seulement la validation/le lettrage. On les sort du flux de relance
  // mais on les garde dans l'encours analytique (section dédiée + total).
  const MODES_LETTRAGE = new Set(['espèce', 'prélèvement'])
  function moyenDominant(facts) {
    const counts = {}
    for (const f of facts) {
      const m = (f.moyen_paiement || '').toLowerCase().trim()
      if (m) counts[m] = (counts[m] || 0) + 1
    }
    let best = null, bestN = 0
    for (const [m, n] of Object.entries(counts)) if (n > bestN) { best = m; bestN = n }
    return best
  }
  const parClientRelance = {}
  const parClientLettrage = {}
  for (const [nom, facts] of Object.entries(parClient)) {
    if (MODES_LETTRAGE.has(moyenDominant(facts))) parClientLettrage[nom] = facts
    else parClientRelance[nom] = facts
  }

  function getEtapeClient(facts) {
    if (facts.some(f => f.date_appel)) return 'appel'
    if (facts.some(f => f.date_relance_r2)) return 'r2'
    if (facts.some(f => f.date_relance)) return 'r1'
    return 'r0'
  }

  const triSelectionne = window._recouvrementTri || 'etape'
  const clientsList = Object.entries(parClientRelance).map(([nom, facts]) => {
    const etape = getEtapeClient(facts)
    const r1Date = facts.find(f => f.date_relance)?.date_relance
    const joursR1 = r1Date ? Math.floor((new Date(auj) - new Date(r1Date)) / 86400000) : 0
    const r2Urgent = etape === 'r1' && joursR1 >= 15
    const total = facts.reduce((s, f) => s + soldeRestant(f), 0)
    const joursRetardMax = Math.max(...facts.map(f => Math.floor((new Date(auj) - new Date(f.date_echeance)) / 86400000)))
    return { nom, facts, etape, r2Urgent, joursR1, total, joursRetardMax }
  }).sort((a, b) => {
    if (triSelectionne === 'montant')     return b.total - a.total
    if (triSelectionne === 'anciennete')  return b.joursRetardMax - a.joursRetardMax
    const order = { r0: 0, r1_urgent: 1, r1: 2, r2: 3, appel: 4 }
    const ka = a.r2Urgent ? 'r1_urgent' : a.etape
    const kb = b.r2Urgent ? 'r1_urgent' : b.etape
    return (order[ka] ?? 9) - (order[kb] ?? 9)
  })

  // Clients espèce/prélèvement : en attente de lettrage (hors relance)
  const lettrageList = Object.entries(parClientLettrage).map(([nom, facts]) => {
    const total = facts.reduce((s, f) => s + soldeRestant(f), 0)
    return { nom, facts, total, moyen: moyenDominant(facts) }
  }).sort((a, b) => b.total - a.total)

  // KPI counts
  const nbR0     = clientsList.filter(c => c.etape === 'r0').length
  const nbR1Urg  = clientsList.filter(c => c.r2Urgent).length
  const nbR1     = clientsList.filter(c => c.etape === 'r1' && !c.r2Urgent).length
  const nbR2     = clientsList.filter(c => c.etape === 'r2').length
  const nbAppel  = clientsList.filter(c => c.etape === 'appel').length
  const nbFacRelance  = clientsList.reduce((s, c) => s + c.facts.length, 0)
  const totalRelance  = clientsList.reduce((s, c) => s + c.total, 0)
  const totalLettrage = lettrageList.reduce((s, c) => s + c.total, 0)
  const totalEnc      = totalRelance + totalLettrage  // encours analytique complet

  if (stats) stats.innerHTML =
    `<b>${clientsList.length}</b> client${clientsList.length > 1 ? 's' : ''} à relancer · ${nbFacRelance} facture${nbFacRelance > 1 ? 's' : ''} · <b style="font-family:'IBM Plex Mono',monospace;color:var(--danger);">${fmt(totalRelance)} €</b>`
    + (lettrageList.length ? ` &nbsp;·&nbsp; <span style="color:var(--muted);">🔵 ${lettrageList.length} en attente de lettrage · ${fmt(totalLettrage)} €</span>` : '')
    + ` &nbsp;·&nbsp; <span style="color:var(--muted);">Encours total <b style="font-family:'IBM Plex Mono',monospace;">${fmt(totalEnc)} €</b></span>`

  const kpiData = [
    { label: 'À relancer', count: nbR0,    bg: '#fef2f2', border: '#fecaca', col: '#991b1b', emoji: '⚠' },
    { label: 'R2 urgente',  count: nbR1Urg, bg: '#fff7ed', border: '#fed7aa', col: '#9a3412', emoji: '🔴' },
    { label: 'R1 envoyée',  count: nbR1,    bg: '#fffbeb', border: '#fde68a', col: '#78350f', emoji: '✉' },
    { label: 'R2 envoyée',  count: nbR2,    bg: '#eff6ff', border: '#bfdbfe', col: '#1e40af', emoji: '📧' },
    { label: 'Appel fait',  count: nbAppel, bg: '#f0fdf4', border: '#86efac', col: '#166534', emoji: '📞' },
  ]
  if (kpis) kpis.innerHTML = kpiData.map(k => `
    <div style="background:${k.bg};border:1px solid ${k.border};border-radius:12px;padding:14px 18px;min-width:110px;flex:1;">
      <div style="font-size:10px;font-weight:700;color:${k.col};text-transform:uppercase;letter-spacing:0.07em;margin-bottom:6px;">${k.emoji} ${k.label}</div>
      <div style="font-size:28px;font-weight:700;color:${k.col};line-height:1;">${k.count}</div>
      <div style="font-size:10.5px;color:${k.col};opacity:0.6;margin-top:2px;">client${k.count !== 1 ? 's' : ''}</div>
    </div>`).join('')

  // Stage config
  const stageCfg = {
    r0:    { label: 'À relancer',       bg: '#fef2f2', border: '#fecaca', col: '#991b1b', dot: '#ef4444' },
    r1:    { label: 'R1 envoyée',       bg: '#fffbeb', border: '#fde68a', col: '#78350f', dot: '#f59e0b' },
    r1u:   { label: '⚠ R2 urgente',    bg: '#fff7ed', border: '#fed7aa', col: '#9a3412', dot: '#f97316' },
    r2:    { label: 'R2 envoyée',       bg: '#eff6ff', border: '#bfdbfe', col: '#1e40af', dot: '#3b82f6' },
    appel: { label: '📞 Appelé',        bg: '#f0fdf4', border: '#86efac', col: '#166534', dot: '#22c55e' },
  }

  const dotHtml = (emailId, lue) => emailId
    ? (lue
        ? `<span title="✓ Ouvert" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--success);vertical-align:middle;"></span>`
        : `<span title="Non ouvert" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--warn);vertical-align:middle;"></span>`)
    : ''

  const cardsHtml = clientsList.length ? clientsList.map(c => {
    const cfgKey = c.etape === 'appel' ? 'appel' : c.etape === 'r2' ? 'r2' : c.r2Urgent ? 'r1u' : c.etape === 'r1' ? 'r1' : 'r0'
    const cfg = stageCfg[cfgKey]

    // Representative fact values for timeline
    const r1Fact = c.facts.find(f => f.date_relance)
    const r2Fact = c.facts.find(f => f.date_relance_r2)
    const appelFact = c.facts.find(f => f.date_appel)
    const firstId = c.facts[0]?.id

    // Timeline steps
    const steps = [
      { label: `En retard`, sub: `depuis ${c.joursRetardMax}j`, done: true, active: c.etape === 'r0', col: '#ef4444' },
      { label: `R1 envoyée`, sub: r1Fact ? formatDate(r1Fact.date_relance) : '—', done: !!r1Fact, extra: r1Fact ? dotHtml(r1Fact.relance_email_id, r1Fact.relance_lue) : '', col: '#f59e0b' },
      { label: `R2 envoyée`, sub: r2Fact ? formatDate(r2Fact.date_relance_r2) : '—', done: !!r2Fact, extra: r2Fact ? dotHtml(r2Fact.relance_r2_email_id, r2Fact.relance_r2_lue) : '', col: '#3b82f6' },
      { label: `Appel`, sub: appelFact ? formatDate(appelFact.date_appel) : '—', done: !!appelFact, col: '#22c55e' },
    ]

    const timelineHtml = `
      <div style="display:flex;align-items:flex-start;gap:0;margin:14px 0 16px;position:relative;">
        ${steps.map((s, i) => `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;position:relative;">
            ${i < steps.length - 1 ? `<div style="position:absolute;top:8px;left:50%;right:-50%;height:2px;background:${s.done ? s.col : 'var(--border)'};z-index:0;"></div>` : ''}
            <div style="width:16px;height:16px;border-radius:50%;background:${s.done ? s.col : 'var(--border)'};border:2px solid ${s.done ? s.col : 'var(--border-soft)'};z-index:1;position:relative;"></div>
            <div style="font-size:10px;font-weight:600;color:${s.done ? s.col : 'var(--muted)'};margin-top:5px;text-align:center;">${s.label} ${s.extra || ''}</div>
            <div style="font-size:9.5px;color:var(--muted);margin-top:1px;text-align:center;">${s.sub}</div>
          </div>`).join('')}
      </div>`

    // Action button
    let actionBtn = ''
    if (c.etape === 'r0') {
      actionBtn = `<button onclick="ouvrirModalRelance('${firstId}')" style="font-size:12px;padding:6px 14px;border-radius:7px;background:var(--brand);color:#fff;border:none;cursor:pointer;font-family:inherit;font-weight:600;">Envoyer R1</button>`
    } else if (c.etape === 'r1') {
      actionBtn = `<button onclick="ouvrirModalRelanceR2('${firstId}')" style="font-size:12px;padding:6px 14px;border-radius:7px;background:${c.r2Urgent ? '#ef4444' : 'var(--brand)'};color:#fff;border:none;cursor:pointer;font-family:inherit;font-weight:600;">${c.r2Urgent ? 'Envoyer R2 (urgent!)' : 'Envoyer R2'}</button>`
    } else if (c.etape === 'r2') {
      actionBtn = `<button onclick="ouvrirModalAppel('${firstId}')" style="font-size:12px;padding:6px 14px;border-radius:7px;background:#7c3aed;color:#fff;border:none;cursor:pointer;font-family:inherit;font-weight:600;">Enregistrer appel</button>`
    } else {
      actionBtn = `<button onclick="ouvrirModalAppel('${firstId}')" style="font-size:12px;padding:6px 14px;border-radius:7px;background:var(--surface-alt);color:var(--muted);border:1px solid var(--border);cursor:pointer;font-family:inherit;">Modifier appel</button>`
    }

    // Invoice list
    const facLignes = c.facts.map(f => {
      const j = Math.floor((new Date(auj) - new Date(f.date_echeance)) / 86400000)
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border-soft);">
          <div style="font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:var(--muted);min-width:80px;">${f.numero}</div>
          <div style="flex:1;font-size:12px;color:var(--ink);">${formatDate(f.date_echeance)}</div>
          <div style="font-size:10.5px;color:var(--danger);font-weight:600;">+${j}j</div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:700;color:var(--danger);">${fmt(soldeRestant(f))} €</div>
        </div>`
    }).join('')

    return `
      <div class="rec-card" data-client="${c.nom}" style="background:var(--surface);border:1px solid ${cfg.border};border-left:4px solid ${cfg.dot};border-radius:12px;padding:16px 20px;margin-bottom:12px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:4px;">
              <div onclick="ouvrirFicheClient('${c.nom.replace(/'/g,"\\'")}')" style="font-size:14px;font-weight:700;color:var(--ink);cursor:pointer;border-bottom:1px dotted var(--muted);" title="Voir la fiche client 360°">${c.nom}</div>
              <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;padding:2px 8px;border-radius:10px;background:${cfg.bg};color:${cfg.col};border:1px solid ${cfg.border};">${cfg.label}</span>
            </div>
            <div style="font-size:12px;color:var(--muted);">${c.facts.length} facture${c.facts.length > 1 ? 's' : ''} · <b style="font-family:'IBM Plex Mono',monospace;color:var(--danger);">${fmt(c.total)} €</b></div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            ${actionBtn}
            <button onclick="(function(btn){const d=btn.closest('.rec-card').querySelector('.rec-detail');d.style.display=d.style.display==='none'?'block':'none';btn.innerHTML=d.style.display==='none'?'▼ Factures':'▲ Masquer';})(this)" style="font-size:11.5px;padding:5px 12px;border-radius:7px;background:var(--surface-alt);color:var(--muted);border:1px solid var(--border);cursor:pointer;font-family:inherit;">▼ Factures</button>
          </div>
        </div>
        ${timelineHtml}
        ${appelFact?.note_appel ? `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:8px 12px;font-size:12px;color:#166534;margin-bottom:12px;">📝 Note appel : ${appelFact.note_appel}</div>` : ''}
        <div class="rec-detail" style="display:none;margin-top:4px;">${facLignes}</div>
      </div>`
  }).join('') : `<div style="text-align:center;padding:32px 0;color:var(--success);font-size:14px;font-weight:600;">✅ Aucune facture à relancer (virement / non défini)</div>`

  // ── Section "En attente de lettrage" (espèce & prélèvement) ────────
  const lettrageHtml = lettrageList.length ? `
    <div style="margin-top:30px;padding-top:22px;border-top:1px dashed var(--border);">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:4px;">
        <span style="font-size:14px;font-weight:700;color:#1e40af;">🔵 En attente de lettrage</span>
        <span style="font-size:11px;color:#1e40af;background:#eff6ff;border:1px solid #bfdbfe;padding:2px 9px;border-radius:10px;font-weight:600;">${lettrageList.length} client${lettrageList.length > 1 ? 's' : ''} · ${fmt(totalLettrage)} €</span>
      </div>
      <div style="font-size:11.5px;color:var(--muted);margin-bottom:14px;">Espèce & prélèvement — pas de relance (en attente de validation/lettrage), mais comptés dans l'encours.</div>
      ${lettrageList.map(c => {
        const badge = c.moyen === 'espèce'
          ? `<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:2px 8px;border-radius:10px;background:#fef9c3;color:#854d0e;border:1px solid #fde68a;">💵 Espèce</span>`
          : `<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:2px 8px;border-radius:10px;background:#e0e7ff;color:#3730a3;border:1px solid #c7d2fe;">🔄 Prélèvement</span>`
        const facLignes = c.facts.map(f => {
          const j = Math.floor((new Date(auj) - new Date(f.date_echeance)) / 86400000)
          return `
            <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border-soft);">
              <div style="font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:var(--muted);min-width:80px;">${f.numero}</div>
              <div style="flex:1;font-size:12px;color:var(--ink);">${formatDate(f.date_echeance)}</div>
              <div style="font-size:10.5px;color:var(--muted);font-weight:600;">+${j}j</div>
              <div style="font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:700;color:var(--ink);">${fmt(soldeRestant(f))} €</div>
            </div>`
        }).join('')
        return `
          <div class="rec-card" data-client="${c.nom}" style="background:var(--surface);border:1px solid #bfdbfe;border-left:4px solid #3b82f6;border-radius:12px;padding:14px 20px;margin-bottom:10px;">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:4px;">
                  <div onclick="ouvrirFicheClient('${c.nom.replace(/'/g,"\\'")}')" style="font-size:14px;font-weight:700;color:var(--ink);cursor:pointer;border-bottom:1px dotted var(--muted);" title="Voir la fiche client 360°">${c.nom}</div>
                  ${badge}
                </div>
                <div style="font-size:12px;color:var(--muted);">${c.facts.length} facture${c.facts.length > 1 ? 's' : ''} · <b style="font-family:'IBM Plex Mono',monospace;color:var(--ink);">${fmt(c.total)} €</b></div>
              </div>
              <button onclick="(function(btn){const d=btn.closest('.rec-card').querySelector('.rec-detail');d.style.display=d.style.display==='none'?'block':'none';btn.innerHTML=d.style.display==='none'?'▼ Factures':'▲ Masquer';})(this)" style="font-size:11.5px;padding:5px 12px;border-radius:7px;background:var(--surface-alt);color:var(--muted);border:1px solid var(--border);cursor:pointer;font-family:inherit;">▼ Factures</button>
            </div>
            <div class="rec-detail" style="display:none;margin-top:8px;">${facLignes}</div>
          </div>`
      }).join('')}
    </div>` : ''

  liste.innerHTML = cardsHtml + lettrageHtml

  mettreAJourBadgeRecouvrement()
}

// ── Encaissements ────────────────────────────────────────
async function chargerEncaissements() {
  const container = document.getElementById('contenu-encaissements')
  if (!container) return

  const { data: exclusData } = await db.from('clients_exclus').select('nom')
  const { data: factures }   = await db.from('factures').select('*').eq('solde', false).order('date_echeance', { ascending: true }).limit(5000)

  const nomsExclus = new Set((exclusData || []).map(e => e.nom))
  const nonSoldes  = (factures || []).filter(f => !nomsExclus.has(f.client) && f.date_echeance && !f.litige)

  const auj = new Date(); auj.setHours(0,0,0,0)
  const dans7j  = new Date(auj); dans7j.setDate(dans7j.getDate() + 7)
  const finMois = new Date(auj.getFullYear(), auj.getMonth() + 1, 0)

  const en_retard     = nonSoldes.filter(f => new Date(f.date_echeance) < auj)
  const cette_semaine = nonSoldes.filter(f => { const d = new Date(f.date_echeance); return d >= auj && d <= dans7j })
  const ce_mois       = nonSoldes.filter(f => { const d = new Date(f.date_echeance); return d > dans7j && d <= finMois })
  const plus_tard     = nonSoldes.filter(f => new Date(f.date_echeance) > finMois)

  const fmt = v => parseFloat(v).toLocaleString('fr-FR', { minimumFractionDigits: 2 })
  const tot = arr => arr.reduce((s,f)=>s+(parseFloat(f.montant)||0),0)
  const totalGlobal = tot(nonSoldes)

  // Génère le HTML d'une liste compacte pour le détail d'une carte
  const lignesCompact = (arr, dangerColor) => arr.map(f => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-soft);">
      <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:${dangerColor ? 'var(--danger)' : 'var(--muted)'};flex-shrink:0;min-width:58px;">${formatDate(f.date_echeance)}</div>
      <div style="flex:1;min-width:0;font-weight:600;font-size:12px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${f.client}</div>
      <div style="font-family:'IBM Plex Mono',monospace;font-size:11.5px;font-weight:700;color:${dangerColor ? 'var(--danger)' : 'var(--ink)'};">${fmt(f.montant)} €</div>
    </div>`).join('')

  // Carte KPI cliquable qui déplie sa liste
  const kpiCard = (id, emoji, titre, arr, bg, border, col, dangerColor=false) => {
    const montant = tot(arr)
    const pct = totalGlobal > 0 ? Math.round((montant / totalGlobal) * 100) : 0
    if (arr.length === 0) return `
      <div style="background:${bg};border:1px solid ${border};border-radius:12px;padding:14px 16px;flex:1;min-width:140px;opacity:0.5;">
        <div style="font-size:10.5px;font-weight:600;color:${col};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${emoji} ${titre}</div>
        <div style="font-size:24px;font-weight:700;color:${col};">0</div>
        <div style="font-size:11px;color:${col};opacity:0.7;margin-top:2px;">—</div>
      </div>`
    return `
      <div onclick="toggleEncSection('${id}')" style="background:${bg};border:1px solid ${border};border-radius:12px;padding:14px 16px;flex:1;min-width:140px;cursor:pointer;transition:opacity 0.15s;" onmouseover="this.style.opacity='0.88'" onmouseout="this.style.opacity='1'">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div style="font-size:10.5px;font-weight:600;color:${col};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${emoji} ${titre}</div>
          <svg id="enc-chevron-${id}" width="12" height="12" viewBox="0 0 12 12" fill="none" style="color:${col};opacity:0.5;flex-shrink:0;transition:transform 0.2s;"><path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div style="font-size:26px;font-weight:700;color:${col};line-height:1;">${arr.length}</div>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:600;color:${col};margin-top:3px;">${fmt(montant)} €</div>
        <div style="font-size:10px;color:${col};opacity:0.55;margin-top:2px;">${pct}% du total</div>
      </div>
      <div id="enc-section-${id}" style="display:none;"></div>`
  }

  window._encSections = { retard: en_retard, semaine: cette_semaine, mois: ce_mois, plus: plus_tard }
  window._encDangerMap = { retard: true, semaine: false, mois: false, plus: false }

  container.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px;">
      ${kpiCard('retard', '⚠', 'En retard', en_retard, '#fef2f2', '#fecaca', '#991b1b', true)}
      ${kpiCard('semaine', '📅', 'Cette semaine', cette_semaine, 'var(--brand-soft)', 'var(--brand)', 'var(--brand-deep)')}
      ${kpiCard('mois', '🗓', 'Ce mois', ce_mois, 'var(--surface)', 'var(--border)', 'var(--ink)')}
      ${kpiCard('plus', '⏳', 'Plus tard', plus_tard, 'var(--surface-alt)', 'var(--border)', 'var(--muted)')}
    </div>

    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:700;color:var(--ink);">📆 Calendrier des échéances</div>
        <div style="display:flex;gap:6px;align-items:center;">
          <button onclick="calEncNaviguer(-1)" class="btn btn-secondary" style="font-size:12px;padding:4px 12px;">←</button>
          <span id="cal-enc-titre" style="font-weight:600;font-size:13px;min-width:150px;text-align:center;"></span>
          <button onclick="calEncNaviguer(1)" class="btn btn-secondary" style="font-size:12px;padding:4px 12px;">→</button>
        </div>
      </div>
      <div id="cal-enc-detail" style="margin-bottom:12px;"></div>
      <div id="cal-enc-contenu"></div>
    </div>`

  window._encaissementsData = nonSoldes
  afficherCalendrierEncaissements()
}

function toggleEncSection(id) {
  const el = document.getElementById(`enc-section-${id}`)
  const chevron = document.getElementById(`enc-chevron-${id}`)
  if (!el) return
  const isOpen = el.style.display !== 'none'
  if (isOpen) {
    el.style.display = 'none'
    if (chevron) chevron.style.transform = ''
    return
  }
  const arr = (window._encSections || {})[id] || []
  const fmt = v => parseFloat(v).toLocaleString('fr-FR', { minimumFractionDigits: 2 })
  const danger = (window._encDangerMap || {})[id] || false
  const fmt2 = v => parseFloat(v).toLocaleString('fr-FR', { minimumFractionDigits: 2 })
  el.style.display = 'block'
  el.style.background = 'var(--surface)'
  el.style.border = '1px solid var(--border)'
  el.style.borderRadius = '10px'
  el.style.padding = '12px 14px'
  el.style.marginTop = '-6px'
  el.style.marginBottom = '4px'
  el.innerHTML = arr.length === 0
    ? '<div style="color:var(--muted);font-size:12px;">Aucune facture.</div>'
    : arr.map(f => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-soft);">
          <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:${danger ? 'var(--danger)' : 'var(--muted)'};flex-shrink:0;min-width:58px;">${formatDate(f.date_echeance)}</div>
          <div style="flex:1;min-width:0;font-weight:600;font-size:12px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${f.client}</div>
          <div style="font-size:10px;color:var(--muted);flex-shrink:0;">${f.numero}</div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:11.5px;font-weight:700;color:${danger ? 'var(--danger)' : 'var(--ink)'};">${fmt2(f.montant)} €</div>
        </div>`).join('')
  if (chevron) chevron.style.transform = 'rotate(180deg)'
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

  container.innerHTML = `<div style="text-align:center;color:var(--muted);padding:40px;">Chargement…</div>`

  try {

  const { data: exclusData, error: errExclus } = await db.from('clients_exclus').select('nom')
  const { data: factures, error: errFact }     = await db.from('factures').select('*').order('date_echeance', { ascending: true }).limit(5000)

  if (errFact) { container.innerHTML = `<div style="color:var(--danger);padding:20px;">Erreur chargement : ${errFact.message}</div>`; return }

  // Calcule des paliers Y "propres" (ex: 0, 10, 20, 30k…)
  function niceYTicks(max, padL, padT, innerH, unit='€') {
    const rough = max / 4
    const mag   = Math.pow(10, Math.floor(Math.log10(rough || 1)))
    const n     = rough / mag
    const step  = n <= 1.5 ? mag : n <= 3 ? 2*mag : n <= 7 ? 5*mag : 10*mag
    const maxR  = Math.ceil(max / step) * step
    const ticks = []
    for (let v = 0; v <= maxR; v += step) {
      const y   = padT + innerH - (v / maxR) * innerH
      const lbl = unit === '%' ? v+'%' : v >= 1000 ? (v/1000).toLocaleString('fr-FR',{maximumFractionDigits:0})+'k€' : v+'€'
      ticks.push({ v, y, lbl })
    }
    return { ticks, maxR }
  }

  const nomsExclus = new Set((exclusData || []).map(e => e.nom))
  const toutes = (factures || []).filter(f => !nomsExclus.has(f.client))
  const enRetard = toutes.filter(f => {
    const auj = new Date().toISOString().split('T')[0]
    return !f.solde && !f.litige && f.date_echeance && f.date_echeance < auj
  })

  const auj = new Date().toISOString().split('T')[0]

  // ── DSO : délai moyen émission → paiement (factures soldées) ──
  const soldees = toutes.filter(f => f.solde && f.date_paiement && f.date_emission)
  const dso = soldees.length
    ? Math.round(soldees.reduce((s, f) => s + (new Date(f.date_paiement) - new Date(f.date_emission)) / 86400000, 0) / soldees.length)
    : null

  // ── Taux de recouvrement global : % soldées dans les délais ──
  const soldeesDansDelai = soldees.filter(f => f.date_paiement <= f.date_echeance)
  const tauxGlobal = soldees.length ? Math.round((soldeesDansDelai.length / soldees.length) * 100) : null

  // ── Encaissé ce mois + Facturé ce mois ──────────────────────
  const now = new Date()
  const moisActuel = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const encaissesMois = toutes.filter(f => f.date_paiement && f.date_paiement.startsWith(moisActuel))
  const encaisseMoisTotal = encaissesMois.reduce((s,f) => s + (parseFloat(f.montant)||0), 0)
  const facturesMois = toutes.filter(f => f.date_emission && f.date_emission.startsWith(moisActuel))
  const factureMoisTotal = facturesMois.reduce((s,f) => s + (parseFloat(f.montant)||0), 0)
  const tauxMois = factureMoisTotal > 0 ? Math.round((encaisseMoisTotal / factureMoisTotal) * 100) : null

  // ── Taux de recouvrement mensuel sur 12 mois (courbe) ────────
  const moisNomsLong = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
  const tauxPoints = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const moisStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    const duMois = toutes.filter(f => f.date_echeance && f.date_echeance.startsWith(moisStr))
    if (!duMois.length) { tauxPoints.push({ label: moisNomsLong[d.getMonth()], taux: null }); continue }
    const payesDansDelai = duMois.filter(f => f.solde && f.date_paiement && f.date_paiement <= f.date_echeance)
    tauxPoints.push({ label: moisNomsLong[d.getMonth()], taux: Math.round((payesDansDelai.length / duMois.length) * 100) })
  }

  // ── Encaissements réels mensuels (12 mois, basé sur date_paiement) ─
  const encaissPoints = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const moisStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    const encaissesDuMois = toutes.filter(f => f.date_paiement && f.date_paiement.startsWith(moisStr))
    const montant = encaissesDuMois.reduce((s,f) => s + (parseFloat(f.montant)||0), 0)
    encaissPoints.push({ label: moisNomsLong[d.getMonth()], montant, mois: moisStr })
  }

  // ── Cash-flow prévisionnel : encaissements attendus sur 90 jours ─
  // Délai moyen de paiement par client (basé sur factures soldées)
  const delaiParClient = {}
  soldees.forEach(f => {
    const j = Math.floor((new Date(f.date_paiement) - new Date(f.date_echeance)) / 86400000)
    if (!delaiParClient[f.client]) delaiParClient[f.client] = []
    delaiParClient[f.client].push(j)
  })
  const delaiMoyenClient = c => {
    const arr = delaiParClient[c]
    if (!arr || !arr.length) return null
    return Math.round(arr.reduce((s,x)=>s+x,0) / arr.length)
  }
  const delaiGlobal = soldees.length
    ? Math.round(soldees.reduce((s,f) => s + Math.floor((new Date(f.date_paiement) - new Date(f.date_echeance)) / 86400000), 0) / soldees.length)
    : 0

  const nonSoldees = toutes.filter(f => !f.solde && !f.litige && f.date_echeance)
  const aujMs = new Date(auj).getTime()
  const buckets = { '0-30': 0, '30-60': 0, '60-90': 0, '90+': 0 }
  nonSoldees.forEach(f => {
    const delaiMoy = delaiMoyenClient(f.client) ?? delaiGlobal
    const datePrev = new Date(new Date(f.date_echeance).getTime() + delaiMoy * 86400000)
    const joursDepuisAuj = Math.floor((datePrev.getTime() - aujMs) / 86400000)
    const montant = parseFloat(f.montant) || 0
    if (joursDepuisAuj < 0) buckets['90+'] += montant  // déjà en retard → long terme
    else if (joursDepuisAuj <= 30) buckets['0-30'] += montant
    else if (joursDepuisAuj <= 60) buckets['30-60'] += montant
    else if (joursDepuisAuj <= 90) buckets['60-90'] += montant
    else buckets['90+'] += montant
  })
  const cashflowTotal = Object.values(buckets).reduce((s,v)=>s+v,0)

  // KPI cards : DSO + Taux global + Encaissé ce mois + Facturé ce mois
  const kpiHtml = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 20px;min-width:140px;flex:1;">
        <div style="font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px;">DSO — Délai moyen</div>
        <div style="font-size:28px;font-weight:700;color:${dso === null ? 'var(--muted)' : dso > 45 ? 'var(--danger)' : dso > 30 ? 'var(--warn)' : 'var(--success)'};">${dso !== null ? dso + 'j' : '—'}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px;">entre émission et paiement</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 20px;min-width:140px;flex:1;">
        <div style="font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px;">Taux de recouvrement</div>
        <div style="font-size:28px;font-weight:700;color:${tauxGlobal === null ? 'var(--muted)' : tauxGlobal >= 70 ? 'var(--success)' : tauxGlobal >= 50 ? 'var(--warn)' : 'var(--danger)'};">${tauxGlobal !== null ? tauxGlobal + '%' : '—'}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px;">payées dans les délais (global)</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 20px;min-width:140px;flex:1;">
        <div style="font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px;">Encaissé ce mois</div>
        <div style="font-size:28px;font-weight:700;color:var(--success);font-family:'IBM Plex Mono',monospace;">${encaisseMoisTotal.toLocaleString('fr-FR',{maximumFractionDigits:0})} €</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px;">${encaissesMois.length} facture${encaissesMois.length>1?'s':''} encaissée${encaissesMois.length>1?'s':''}</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 20px;min-width:140px;flex:1;">
        <div style="font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px;">Facturé ce mois</div>
        <div style="font-size:28px;font-weight:700;color:var(--brand);font-family:'IBM Plex Mono',monospace;">${factureMoisTotal.toLocaleString('fr-FR',{maximumFractionDigits:0})} €</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px;">${tauxMois !== null ? `Taux encaissement : <b style="color:${tauxMois>=70?'var(--success)':tauxMois>=40?'var(--warn)':'var(--danger)'}">${tauxMois}%</b>` : `${facturesMois.length} facture${facturesMois.length>1?'s':''}`}</div>
      </div>
    </div>`

  // Graphique taux de recouvrement mensuel
  const tauxValides = tauxPoints.filter(p => p.taux !== null)
  const WR = 700, HR = 160, padLR = 40, padRR = 10, padTR = 15, padBR = 28
  const innerWR = WR - padLR - padRR, innerHR = HR - padTR - padBR
  const stepR = tauxValides.length > 1 ? innerWR / (tauxPoints.length - 1) : innerWR
  const ptsTauxStr = tauxPoints.map((p, i) => {
    if (p.taux === null) return null
    const x = padLR + i * stepR
    const y = padTR + innerHR - (p.taux / 100) * innerHR
    return `${x},${y}`
  }).filter(Boolean).join(' ')
  const dotsTaux = tauxPoints.map((p, i) => {
    if (p.taux === null) return ''
    const x = padLR + i * stepR
    const y = padTR + innerHR - (p.taux / 100) * innerHR
    const col = p.taux >= 70 ? '#3D6B3D' : p.taux >= 50 ? '#B58836' : '#991b1b'
    return `<circle cx="${x}" cy="${y}" r="4" fill="${col}"><title>${p.label} : ${p.taux}%</title></circle>`
  }).join('')
  const labelsTaux = tauxPoints.map((p, i) => {
    const x = padLR + i * stepR
    return `<text x="${x}" y="${HR - 4}" text-anchor="middle" fill="var(--muted)" font-size="9" font-family="Inter,sans-serif">${p.label}</text>`
  }).join('')
  // Graduations Y : 0% → 100% par paliers de 20%
  const y80 = padTR + innerHR - 0.8 * innerHR
  const yTicksTaux = [0, 20, 40, 60, 80, 100].map(v => {
    const y = padTR + innerHR - (v / 100) * innerHR
    return `<line x1="${padLR - 3}" y1="${y}" x2="${padLR}" y2="${y}" stroke="var(--border)" stroke-width="1"/>
            <text x="${padLR - 6}" y="${y + 3.5}" text-anchor="end" fill="var(--muted)" font-size="8.5" font-family="Inter,sans-serif">${v}%</text>`
  }).join('')
  const svgTaux = `
    <svg viewBox="0 0 ${WR} ${HR}" width="100%" style="overflow:visible;">
      <line x1="${padLR}" y1="${padTR}" x2="${padLR}" y2="${padTR+innerHR}" stroke="var(--border)" stroke-width="1"/>
      <line x1="${padLR}" y1="${padTR+innerHR}" x2="${WR-padRR}" y2="${padTR+innerHR}" stroke="var(--border)" stroke-width="1"/>
      ${yTicksTaux}
      <line x1="${padLR}" y1="${y80}" x2="${WR-padRR}" y2="${y80}" stroke="#3D6B3D" stroke-width="1" stroke-dasharray="4,4" opacity="0.4"/>
      ${ptsTauxStr ? `<polyline points="${ptsTauxStr}" fill="none" stroke="var(--success)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
      ${dotsTaux}
      ${labelsTaux}
    </svg>`

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
      const moisCourts = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc']
      points.push({ label: `${debut.getDate()} ${moisCourts[debut.getMonth()]}`, montant })
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
  const W = 700, H = 180, padL = 55, padR = 10, padT = 15, padB = 30
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

  // Graduations Y propres en €
  const { ticks: ticksEncours, maxR: maxEncours } = niceYTicks(maxVal, padL, padT, innerH)
  const yTicksEncours = ticksEncours.map(t =>
    `<line x1="${padL-3}" y1="${t.y}" x2="${padL}" y2="${t.y}" stroke="var(--border)" stroke-width="1"/>
     <text x="${padL-6}" y="${t.y+3.5}" text-anchor="end" fill="var(--muted)" font-size="8.5" font-family="Inter,sans-serif">${t.lbl}</text>`
  ).join('')
  // Recalcule les points avec maxEncours (axe normalisé)
  const ptsStrN = points.map((p, i) => {
    const x = padL + i * step
    const y = padT + innerH - (p.montant / maxEncours) * innerH
    return `${x},${y}`
  }).join(' ')
  const dotsN = points.map((p, i) => {
    const x = padL + i * step
    const y = padT + innerH - (p.montant / maxEncours) * innerH
    const fmtV = p.montant.toLocaleString('fr-FR', {maximumFractionDigits:0})
    return `<circle cx="${x}" cy="${y}" r="4" fill="var(--brand)"><title>${p.label} : ${fmtV} €</title></circle>`
  }).join('')

  const svgHtml = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="overflow:visible;">
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT+innerH}" stroke="var(--border)" stroke-width="1"/>
      <line x1="${padL}" y1="${padT+innerH}" x2="${W-padR}" y2="${padT+innerH}" stroke="var(--border)" stroke-width="1"/>
      ${yTicksEncours}
      <polyline points="${ptsStrN}" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${dotsN}
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

  // ── Graphique 2 : Top clients par encours ───────────────────
  const encours = toutes.filter(f => !f.solde && !f.litige)
  const parClient = {}
  encours.forEach(f => {
    const c = f.client || '—'
    parClient[c] = (parClient[c] || 0) + (parseFloat(f.montant) || 0)
  })
  const topClients = Object.entries(parClient)
    .sort((a,b) => b[1] - a[1])
    .slice(0, 8)

  const maxClient = topClients.length ? topClients[0][1] : 1
  const barH = 28, barGap = 8, labelW = 140, barAreaW = 420, padV = 12
  const svgH2 = topClients.length * (barH + barGap) + padV * 2
  const svgW2 = labelW + barAreaW + 80

  const barsSvg = topClients.map(([nom, val], i) => {
    const y = padV + i * (barH + barGap)
    const w = Math.max(4, (val / maxClient) * barAreaW)
    const nomCourt = nom.length > 20 ? nom.slice(0, 19) + '…' : nom
    const valFmt = val.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
    const isDanger = enRetard.some(f => f.client === nom)
    const barCol = isDanger ? '#ef4444' : 'var(--brand)'
    const barBg  = isDanger ? '#fee2e2' : 'var(--brand-soft)'
    return `
      <text x="${labelW - 8}" y="${y + barH/2 + 4}" text-anchor="end" fill="var(--ink-soft)" font-size="11" font-family="Inter,sans-serif">${nomCourt}</text>
      <rect x="${labelW}" y="${y}" width="${barAreaW}" height="${barH}" rx="4" fill="${barBg}"/>
      <rect x="${labelW}" y="${y}" width="${w}" height="${barH}" rx="4" fill="${barCol}" opacity="0.85"/>
      <text x="${labelW + w + 6}" y="${y + barH/2 + 4}" fill="${isDanger ? '#991b1b' : 'var(--ink-soft)'}" font-size="10.5" font-family="'IBM Plex Mono',monospace" font-weight="600">${valFmt} €</text>`
  }).join('')

  const svgBars = topClients.length
    ? `<svg viewBox="0 0 ${svgW2} ${svgH2}" width="100%" style="overflow:visible;">${barsSvg}</svg>`
    : `<div style="color:var(--muted);font-size:13px;padding:20px 0;text-align:center;">Aucun encours.</div>`

  container.innerHTML = `
    ${kpiHtml}
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">${cardsHtml}</div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">

      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
          <div style="font-size:13px;font-weight:700;color:var(--ink);">Encours — <span style="color:var(--muted);font-weight:500;">${titreGraphique}</span></div>
          <div style="display:flex;gap:4px;background:var(--surface-alt);border-radius:8px;padding:3px;">${togglePeriode}</div>
        </div>
        ${svgHtml}
      </div>

      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;">
        <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:14px;">Top clients — encours non soldé <span style="font-size:10.5px;font-weight:400;color:var(--muted);margin-left:6px;">(rouge = en retard)</span></div>
        ${svgBars}
      </div>

    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <div style="font-size:13px;font-weight:700;color:var(--ink);">Taux de recouvrement mensuel <span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px;">% payées dans les délais</span></div>
          <span style="font-size:10.5px;color:var(--success);font-weight:600;background:var(--success-bg);padding:2px 8px;border-radius:10px;">Objectif 80%</span>
        </div>
        ${svgTaux}
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;">
        <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:6px;">Cash-flow prévisionnel <span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px;">basé sur le délai moyen par client</span></div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:14px;">Total attendu : <b style="font-family:'IBM Plex Mono',monospace;color:var(--ink);">${cashflowTotal.toLocaleString('fr-FR',{maximumFractionDigits:0})} €</b></div>
        ${(()=>{
          const maxB = Math.max(...Object.values(buckets), 1)
          const labels = [
            { key:'0-30', label:'0–30j', sub:'Encaissement proche', col:'#22c55e', bg:'#dcfce7' },
            { key:'30-60', label:'30–60j', sub:'Court terme', col:'#f59e0b', bg:'#fef3c7' },
            { key:'60-90', label:'60–90j', sub:'Moyen terme', col:'#f97316', bg:'#ffedd5' },
            { key:'90+', label:'90j+', sub:'Long terme / à risque', col:'#ef4444', bg:'#fee2e2' },
          ]
          return labels.map(b => {
            const v = buckets[b.key]
            const w = Math.round((v/maxB) * 100)
            return `<div style="margin-bottom:12px;">
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
                <span style="font-size:11.5px;color:var(--ink);font-weight:600;">${b.label}</span>
                <span style="font-size:10.5px;color:var(--muted);">${b.sub}</span>
                <span style="font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:700;color:${b.col};margin-left:auto;">${v.toLocaleString('fr-FR',{maximumFractionDigits:0})} €</span>
              </div>
              <div style="height:10px;background:${b.bg};border-radius:5px;overflow:hidden;">
                <div style="width:${w}%;height:100%;background:${b.col};border-radius:5px;transition:width 0.4s;"></div>
              </div>
            </div>`
          }).join('')
        })()}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr;gap:14px;margin-bottom:14px;">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;">
        <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:14px;">Encaissements mensuels réels <span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px;">basé sur date d'encaissement</span></div>
        ${(()=>{
          const maxE = Math.max(...encaissPoints.map(p=>p.montant), 1)
          const WE=700,HE=160,pLE=55,pRE=10,pTE=15,pBE=28
          const iWE=WE-pLE-pRE, iHE=HE-pTE-pBE
          const stepE = encaissPoints.length>1 ? iWE/(encaissPoints.length-1) : iWE
          const ptsE = encaissPoints.map((p,i)=>`${pLE+i*stepE},${pTE+iHE-(p.montant/maxE)*iHE}`).join(' ')
          const dotsE = encaissPoints.map((p,i)=>{
            const x=pLE+i*stepE, y=pTE+iHE-(p.montant/maxE)*iHE
            const isActuel = p.mois===moisActuel
            return `<circle cx="${x}" cy="${y}" r="${isActuel?5:4}" fill="${isActuel?'var(--success)':'#22c55e'}" opacity="${isActuel?1:0.75}"><title>${p.label} : ${p.montant.toLocaleString('fr-FR',{maximumFractionDigits:0})} €</title></circle>`
          }).join('')
          const labsE = encaissPoints.map((p,i)=>`<text x="${pLE+i*stepE}" y="${HE-4}" text-anchor="middle" fill="var(--muted)" font-size="9" font-family="Inter,sans-serif">${p.label}</text>`).join('')
          const { ticks: ticksE, maxR: maxRE } = niceYTicks(maxE, pLE, pTE, iHE)
          const yTicksE = ticksE.map(t=>
            `<line x1="${pLE-3}" y1="${t.y}" x2="${pLE}" y2="${t.y}" stroke="var(--border)" stroke-width="1"/><text x="${pLE-6}" y="${t.y+3.5}" text-anchor="end" fill="var(--muted)" font-size="8.5" font-family="Inter,sans-serif">${t.lbl}</text>`
          ).join('')
          const ptsEN = encaissPoints.map((p,i)=>`${pLE+i*stepE},${pTE+iHE-(p.montant/maxRE)*iHE}`).join(' ')
          const dotsEN = encaissPoints.map((p,i)=>{
            const x=pLE+i*stepE, y=pTE+iHE-(p.montant/maxRE)*iHE
            const isActuel = p.mois===moisActuel
            return `<circle cx="${x}" cy="${y}" r="${isActuel?5:4}" fill="${isActuel?'var(--success)':'#22c55e'}" opacity="${isActuel?1:0.75}"><title>${p.label} : ${p.montant.toLocaleString('fr-FR',{maximumFractionDigits:0})} €</title></circle>`
          }).join('')
          return `<svg viewBox="0 0 ${WE} ${HE}" width="100%" style="overflow:visible;">
            <line x1="${pLE}" y1="${pTE}" x2="${pLE}" y2="${pTE+iHE}" stroke="var(--border)" stroke-width="1"/>
            <line x1="${pLE}" y1="${pTE+iHE}" x2="${WE-pRE}" y2="${pTE+iHE}" stroke="var(--border)" stroke-width="1"/>
            ${yTicksE}
            <polyline points="${ptsEN}" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
            ${dotsEN}${labsE}
          </svg>`
        })()}
      </div>
    </div>`

  } catch(e) {
    container.innerHTML = `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:20px;color:var(--danger);">
      <b>Erreur dans l'analytique :</b> ${e.message}
      <pre style="font-size:11px;margin-top:8px;white-space:pre-wrap;">${e.stack||''}</pre>
    </div>`
    console.error('chargerAnalytique error:', e)
  }
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

// Détecte un avoir dans les tâches associées (ex: "A2404001").
// Un avoir commence par "A" suivi directement d'un chiffre — à distinguer
// des bons de livraison (BL..., BLNOURDINN..., BLJOODIS...).
function contientAvoir(texte) {
  return !!texte && /(?:^|[\s/])A\d{3,}/.test(texte)
}

// Résout la position des colonnes utiles à partir de la ligne d'en-tête,
// au lieu d'indices fixes — l'ordre des colonnes DISTRILOG varie selon
// le type d'export (ex: "T.associées" en position 3 ou 8 selon le fichier).
function resoudreColonnesCSV(header) {
  const norm = (s) => (s || '').toLowerCase().trim().replace(/[°.]/g, '')
  const h = header.map(norm)
  const trouve = (...noms) => {
    for (const nom of noms) {
      const i = h.findIndex(x => x === nom)
      if (i !== -1) return i
    }
    for (const nom of noms) {
      const i = h.findIndex(x => x.includes(nom))
      if (i !== -1) return i
    }
    return -1
  }
  return {
    client:          trouve('tiers'),
    dateEmission:    trouve('date début', 'date debut'),
    montant:         trouve('val ref', 'valref'),
    numero:          trouve('npièce', 'npiece', 'numero'),
    solde:           trouve('soldé', 'solde'),
    ville:           trouve('ville'),
    tachesAssociees: trouve('tassociées', 'tassociees'),
    dateEcheance:    trouve('date échéance', 'date echeance'),
    datePaiement:    trouve('date encaiss'),
  }
}

async function importerCSVFactures(file) {
  if (!file) return
  const text = await file.text()
  const rows = parseCSVDISTRILOG(text)
  if (!rows.length) { alert('Fichier vide ou format invalide.'); return }

  // Résoudre les colonnes par nom d'en-tête (avec repli sur les positions
  // historiques si l'en-tête ne correspond pas à un format connu)
  const col = resoudreColonnesCSV(rows[0])
  const idx = {
    client:          col.client          !== -1 ? col.client          : 0,
    dateEmission:    col.dateEmission     !== -1 ? col.dateEmission     : 1,
    montant:         col.montant          !== -1 ? col.montant          : 4,
    numero:          col.numero           !== -1 ? col.numero           : 5,
    solde:           col.solde            !== -1 ? col.solde            : 6,
    ville:           col.ville            !== -1 ? col.ville            : 7,
    tachesAssociees: col.tachesAssociees  !== -1 ? col.tachesAssociees  : 3,
    dateEcheance:    col.dateEcheance     !== -1 ? col.dateEcheance     : 11,
    datePaiement:    col.datePaiement     !== -1 ? col.datePaiement     : 12,
  }

  // Charger clients exclus + factures existantes en parallèle
  const [{ data: exclus }, { data: existantes }] = await Promise.all([
    db.from('clients_exclus').select('nom'),
    db.from('factures').select('numero, solde, note, date_paiement')
  ])
  const nomsExclus  = new Set((exclus     || []).map(e => e.nom))
  // Map numero → { solde, note } pour préserver les données manuelles
  const existantesMap = new Map((existantes || []).map(f => [f.numero, f]))

  // Ignorer la ligne header
  const dataRows = rows.slice(1).filter(r => r[idx.numero] && r[idx.numero].trim())

  let nbExclus = 0, nbNouveaux = 0, nbMisAJour = 0, nbAvoirs = 0, nbZeroEuro = 0
  const factures = dataRows.map(cols => {
    const numero  = cols[idx.numero]?.trim() || null
    const client  = cols[idx.client]?.trim() || 'Client inconnu'

    // 1. Exclure les clients de la liste (comparaison exacte)
    if (nomsExclus.has(client)) { nbExclus++; return null }
    if (!numero) return null

    const montantStr    = (cols[idx.montant] || '0').trim().replace(',', '.')
    const montant       = parseFloat(montantStr) || 0
    // Les factures à 0 € n'ont aucune valeur à suivre (rien à encaisser,
    // rien à relancer) — on ne les importe jamais, ni en création ni en MàJ.
    if (montant === 0) { nbZeroEuro++; return null }
    const date_emission = parseDateEmissionDL(cols[idx.dateEmission])
    const date_echeance = parseDateEcheanceDL(cols[idx.dateEcheance])
    const soldeCSV      = (cols[idx.solde] || '').trim() === 'Oui'
    const ville         = cols[idx.ville]?.trim() || null
    const commentaire   = cols[idx.tachesAssociees]?.trim().slice(0, 500) || null
    const date_paiement_csv = parseDateEcheanceDL(cols[idx.datePaiement]?.trim() || null)
    // Un avoir dans les tâches associées solde la facture, même sans paiement
    const avoirDetecte = contientAvoir(commentaire)
    if (avoirDetecte) nbAvoirs++

    const existant = existantesMap.get(numero)
    if (existant) {
      nbMisAJour++
      // Règle anti-régression : le statut soldé ne peut jamais reculer.
      // Si marqué manuellement "soldé" dans l'app → on garde true même si le CSV dit non.
      // Si DISTRILOG dit soldé (ou qu'un avoir a été détecté) → on met true.
      const solde = existant.solde || soldeCSV || avoirDetecte
      // La note manuelle n'est jamais écrasée par le CSV
      const note = existant.note ?? null
      // date_paiement : priorité à la valeur existante, sinon celle du CSV
      const date_paiement = existant.date_paiement ?? date_paiement_csv
      return { numero, client, montant, date_emission, date_echeance, solde, ville, commentaire, note, date_paiement }
    } else {
      nbNouveaux++
      return { numero, client, montant, date_emission, date_echeance, solde: soldeCSV || avoirDetecte, ville, commentaire, date_paiement: date_paiement_csv }
    }
  }).filter(Boolean)

  if (!factures.length) {
    alert(`Aucune facture valide trouvée.${nbExclus > 0 ? `\n(${nbExclus} ligne${nbExclus>1?'s':''} ignorée${nbExclus>1?'s':''} — clients exclus)` : ''}${nbZeroEuro > 0 ? `\n(${nbZeroEuro} ligne${nbZeroEuro>1?'s':''} ignorée${nbZeroEuro>1?'s':''} — montant à 0 €)` : ''}`)
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
    nbAvoirs    > 0 ? `${nbAvoirs} avoir${nbAvoirs>1?'s':''} détecté${nbAvoirs>1?'s':''} → soldée${nbAvoirs>1?'s':''} automatiquement` : null,
    nbZeroEuro  > 0 ? `${nbZeroEuro} ignorée${nbZeroEuro>1?'s':''} (montant à 0 €)` : null,
    nbExclus    > 0 ? `${nbExclus} ignorée${nbExclus>1?'s':''} (clients exclus)` : null,
  ].filter(Boolean)
  alert('✓ Import terminé\n' + lignes.join(' · '))
  chargerFactures()
}

// ═══════════════════════════════════════════════════════════
//  FACTURATION RÉCURRENTE (fontaines, compteurs, badges)
// ═══════════════════════════════════════════════════════════

window._anneeRecurrents = new Date().getFullYear()
window._recurrentsShowAll = false  // filtre : false = seulement les contrats avec actions en cours
window._contratEditionId = null
window._releveEnCours    = null  // { contratId, periode, contrat }
window._historiqueContratId = null

// ── Helpers ──────────────────────────────────────────────

function periodeLabel(periode) {
  if (!periode) return ''
  if (periode.includes('-Q')) {
    const [annee, q] = periode.split('-Q')
    return `T${q} ${annee}`
  }
  const [annee, mois] = periode.split('-')
  const moisNoms = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
  return `${moisNoms[parseInt(mois) - 1]} ${annee}`
}

function periodeTrimestrielle(annee, trimestre) {
  return `${annee}-Q${trimestre}`
}

function periodeMensuelle(annee, mois) {
  return `${annee}-${String(mois).padStart(2,'0')}`
}

function statutPeriode(periode, anneeAff) {
  // Logique : on facture le mois/trimestre PRÉCÉDENT (le mois en cours n'est pas encore terminé)
  // Ex: en juin → on traite mai ; en T2 (avr-juin) → on traite T1
  const now = new Date()

  if (now.getFullYear() !== anneeAff) {
    return now.getFullYear() > anneeAff ? 'passe' : 'futur'
  }

  const moisCourant = now.getMonth() + 1  // 1-12
  const trimCourant = Math.ceil(moisCourant / 3)  // 1-4

  if (periode.includes('-Q')) {
    const trim = parseInt(periode.split('-Q')[1])
    const trimActionnable = trimCourant - 1  // dernier trimestre complété
    if (trimActionnable <= 0) return 'futur'  // en Q1, rien d'actionnable cette année
    if (trim < trimActionnable) return 'passe'
    if (trim === trimActionnable) return 'courant'
    return 'futur'
  } else {
    const mois = parseInt(periode.split('-')[1])
    const moisActionnable = moisCourant - 1  // mois précédent
    if (moisActionnable <= 0) return 'futur'  // en janvier, rien d'actionnable cette année
    if (mois < moisActionnable) return 'passe'
    if (mois === moisActionnable) return 'courant'
    return 'futur'
  }
}

function typeLabel(type) {
  return { location_fontaine: '📦 Fontaine', compteur: '🔢 Compteur', badge: '🏷️ Badge', mixte: '📦+🔢 Mixte' }[type] || type
}

// ── Chargement principal ──────────────────────────────────

async function chargerRecurrents() {
  const annee = window._anneeRecurrents
  document.getElementById('recurrents-annee-label').textContent = annee

  const [{ data: contrats }, { data: employes }] = await Promise.all([
    db.from('contrats_recurrents').select('*').eq('actif', true).order('client'),
    db.from('employes').select('id,nom,email').order('nom')
  ])

  if (!contrats) return

  // Charger les relevés de l'année
  const ids = contrats.map(c => c.id)
  const { data: releves } = ids.length
    ? await db.from('releves_recurrents').select('*').in('contrat_id', ids).like('periode', `${annee}%`)
    : { data: [] }

  // Map contrat_id → periode → releve
  const relevesMap = {}
  for (const r of releves || []) {
    if (!relevesMap[r.contrat_id]) relevesMap[r.contrat_id] = {}
    relevesMap[r.contrat_id][r.periode] = r
  }

  afficherRecurrents(contrats, relevesMap, annee, employes || [])
  mettreAJourBadgeRecurrents(contrats, relevesMap, annee)
}

function changerAnneeRecurrents(delta) {
  window._anneeRecurrents = (window._anneeRecurrents || new Date().getFullYear()) + delta
  chargerRecurrents()
}

// ── Mise à jour badge nav ─────────────────────────────────

function mettreAJourBadgeRecurrents(contrats, relevesMap, annee) {
  const now = new Date()
  if (now.getFullYear() !== annee) {
    const badge = document.getElementById('nav-badge-recurrents')
    if (badge) badge.style.display = 'none'
    return
  }
  const moisCourantBadge = now.getMonth() + 1  // 1-12
  const moisActionnable = now.getMonth()  // = moisCourant - 1 (0-indexed = nb de mois à vérifier)
  const trimActionnable = Math.max(0, Math.ceil(moisCourantBadge / 3) - 1)  // trimestres complétés
  let nbRetard = 0
  for (const c of contrats) {
    const periodes = c.frequence === 'mensuelle'
      ? Array.from({length: moisActionnable}, (_, i) => periodeMensuelle(annee, i + 1))
      : Array.from({length: trimActionnable}, (_, i) => periodeTrimestrielle(annee, i + 1))
    for (const p of periodes) {
      const releve = relevesMap[c.id]?.[p]
      if (!releve || !releve.fait) nbRetard++
    }
  }
  const badge = document.getElementById('nav-badge-recurrents')
  if (badge) {
    badge.style.display = nbRetard > 0 ? '' : 'none'
    badge.textContent = nbRetard > 9 ? '9+' : nbRetard
  }
  const statsBar = document.getElementById('recurrents-stats-bar')
  if (statsBar) statsBar.textContent = nbRetard > 0 ? `${nbRetard} période${nbRetard>1?'s':''} en attente de traitement` : ''
}

// ── Affichage principal ───────────────────────────────────

function toggleFiltreRecurrents() {
  window._recurrentsShowAll = !window._recurrentsShowAll
  chargerRecurrents()
}

function afficherRecurrents(contrats, relevesMap, annee, employes) {
  const el = document.getElementById('recurrents-liste')
  if (!el) return

  const mensuel = contrats.filter(c => c.frequence === 'mensuelle')
  const trimest = contrats.filter(c => c.frequence === 'trimestrielle')

  const moisNomsCourt = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
  const now = new Date()
  const anneeEnCours = now.getFullYear()
  const moisCourant = now.getMonth() + 1  // 1-12
  const moisActionnable = moisCourant - 1  // période mensuelle courante à traiter
  const trimActionnable = Math.max(0, Math.ceil(moisCourant / 3) - 1)  // trimestre courant à traiter
  const showAll = !!window._recurrentsShowAll

  // Cellule d'une période
  function cellule(contrat, periode, isCourantCol) {
    const releve = relevesMap[contrat.id]?.[periode]
    const statut = statutPeriode(periode, annee)
    const fait = releve?.fait
    const enAttente = releve?.en_attente && !fait
    const colBorder = isCourantCol ? 'border:2px solid #f59e0b;' : 'border:1px solid var(--border-soft);'

    if (statut === 'futur') {
      return `<td style="padding:8px 4px;text-align:center;${colBorder}background:var(--surface-alt);min-width:44px;"></td>`
    }
    if (fait) {
      const dateStr = releve.date_traitement ? `\nTraité le ${formatDate(releve.date_traitement)}` : ''
      const commentaire = releve.commentaire ? `\n${releve.commentaire}` : ''
      const valeurs = releve.valeurs && Object.keys(releve.valeurs).length
        ? '\n' + Object.entries(releve.valeurs).map(([k,v]) => `${k}: ${v}`).join(', ')
        : ''
      return `<td style="padding:8px 4px;text-align:center;${colBorder}background:#f0fdf4;cursor:pointer;min-width:44px;" onclick="ouvrirModalReleve('${contrat.id}','${periode}')" title="Fait${dateStr}${valeurs}${commentaire}">
        <span style="color:var(--success);font-size:17px;font-weight:700;">✓</span>
      </td>`
    }
    if (enAttente) {
      const commentaire = releve.commentaire ? `\n${releve.commentaire}` : ''
      return `<td style="padding:8px 4px;text-align:center;${colBorder}background:#fff7ed;cursor:pointer;min-width:44px;" onclick="ouvrirModalReleve('${contrat.id}','${periode}')" title="En attente${commentaire}">
        <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#f97316;"></span>
      </td>`
    }
    // À traiter, période passée ou courante
    const isCourantStatut = statut === 'courant'
    const bg = isCourantStatut ? '#fffbeb' : '#fef2f2'
    const icon = isCourantStatut ? '⚠' : '●'
    const color = isCourantStatut ? '#f59e0b' : '#ef4444'
    return `<td style="padding:8px 4px;text-align:center;${colBorder}background:${bg};cursor:pointer;min-width:44px;" onclick="ouvrirModalReleve('${contrat.id}','${periode}')" title="À traiter">
      <span style="color:${color};font-size:15px;">${icon}</span>
    </td>`
  }

  // Helpers pour savoir si un contrat a des actions en cours
  function contratAActionnable(c) {
    if (annee !== anneeEnCours) return true  // pour les années passées, tout afficher
    const periodes = c.frequence === 'mensuelle'
      ? Array.from({length: moisActionnable}, (_, i) => periodeMensuelle(annee, i + 1))
      : Array.from({length: trimActionnable}, (_, i) => periodeTrimestrielle(annee, i + 1))
    return periodes.some(p => {
      const r = relevesMap[c.id]?.[p]
      return !r?.fait
    })
  }

  // ── Section "À traiter maintenant" ────────────────────────
  let htmlPriorite = ''
  if (annee === anneeEnCours) {
    // Contrats mensuels non traités pour le mois actionnable
    const urgentMensuel = moisActionnable > 0
      ? mensuel.filter(c => {
          const p = periodeMensuelle(annee, moisActionnable)
          const r = relevesMap[c.id]?.[p]
          return !r?.fait && !r?.en_attente
        })
      : []

    // Contrats trimestriels non traités pour le trimestre actionnable
    const urgentTrimest = trimActionnable > 0
      ? trimest.filter(c => {
          const p = periodeTrimestrielle(annee, trimActionnable)
          const r = relevesMap[c.id]?.[p]
          return !r?.fait && !r?.en_attente
        })
      : []

    // Contrats en attente (tous)
    const enAttenteItems = []
    for (const c of contrats) {
      const periodes = c.frequence === 'mensuelle'
        ? Array.from({length: moisActionnable}, (_, i) => periodeMensuelle(annee, i + 1))
        : Array.from({length: trimActionnable}, (_, i) => periodeTrimestrielle(annee, i + 1))
      for (const p of periodes) {
        const r = relevesMap[c.id]?.[p]
        if (r?.en_attente && !r?.fait) {
          enAttenteItems.push({ contrat: c, periode: p, releve: r })
        }
      }
    }

    // Contrats en retard (passés mais pas faits)
    const retardItems = []
    for (const c of mensuel) {
      for (let m = 1; m < moisActionnable; m++) {
        const p = periodeMensuelle(annee, m)
        const r = relevesMap[c.id]?.[p]
        if (!r?.fait && !r?.en_attente) retardItems.push({ contrat: c, periode: p })
      }
    }
    for (const c of trimest) {
      for (let t = 1; t < trimActionnable; t++) {
        const p = periodeTrimestrielle(annee, t)
        const r = relevesMap[c.id]?.[p]
        if (!r?.fait && !r?.en_attente) retardItems.push({ contrat: c, periode: p })
      }
    }

    const moisLabel = moisActionnable > 0 ? moisNomsCourt[moisActionnable - 1] : ''
    const trimLabel = trimActionnable > 0 ? `T${trimActionnable}` : ''

    const totalUrgent = urgentMensuel.length + urgentTrimest.length
    const totalRetard = retardItems.length
    const totalAttente = enAttenteItems.length

    // Bloc priorité principal
    let blocksHtml = ''

    // Bloc "Ce mois / ce trimestre"
    if (totalUrgent > 0) {
      const cardsM = urgentMensuel.map(c => {
        const assignes = Array.isArray(c.assignes) && c.assignes.length ? c.assignes : (c.assigne_a ? [c.assigne_a] : [])
        return `<div onclick="ouvrirModalReleve('${c.id}','${periodeMensuelle(annee, moisActionnable)}')"
          style="background:white;border:1.5px solid #fbbf24;border-radius:8px;padding:10px 12px;cursor:pointer;min-width:150px;max-width:220px;flex-shrink:0;transition:box-shadow 0.15s;"
          onmouseover="this.style.boxShadow='0 2px 8px rgba(251,191,36,0.35)'" onmouseout="this.style.boxShadow=''">
          <div style="font-weight:600;font-size:12.5px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.client}</div>
          ${c.numero_machine ? `<div style="font-size:10px;color:var(--muted);">#${c.numero_machine}</div>` : ''}
          <div style="font-size:10px;color:var(--muted);margin-top:2px;">${typeLabel(c.type_prestation)}</div>
          ${assignes.length ? `<div style="font-size:10px;color:var(--muted);margin-top:2px;">👤 ${assignes.join(', ')}</div>` : ''}
          <div style="margin-top:6px;font-size:10.5px;font-weight:600;color:#d97706;">⚠ ${moisLabel}</div>
        </div>`
      }).join('')
      const cardsT = urgentTrimest.map(c => {
        const assignes = Array.isArray(c.assignes) && c.assignes.length ? c.assignes : (c.assigne_a ? [c.assigne_a] : [])
        return `<div onclick="ouvrirModalReleve('${c.id}','${periodeTrimestrielle(annee, trimActionnable)}')"
          style="background:white;border:1.5px solid #fbbf24;border-radius:8px;padding:10px 12px;cursor:pointer;min-width:150px;max-width:220px;flex-shrink:0;transition:box-shadow 0.15s;"
          onmouseover="this.style.boxShadow='0 2px 8px rgba(251,191,36,0.35)'" onmouseout="this.style.boxShadow=''">
          <div style="font-weight:600;font-size:12.5px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.client}</div>
          ${c.numero_machine ? `<div style="font-size:10px;color:var(--muted);">#${c.numero_machine}</div>` : ''}
          <div style="font-size:10px;color:var(--muted);margin-top:2px;">${typeLabel(c.type_prestation)}</div>
          ${assignes.length ? `<div style="font-size:10px;color:var(--muted);margin-top:2px;">👤 ${assignes.join(', ')}</div>` : ''}
          <div style="margin-top:6px;font-size:10.5px;font-weight:600;color:#d97706;">⚠ ${trimLabel}</div>
        </div>`
      }).join('')
      blocksHtml += `
        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:700;color:#d97706;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
            <span style="background:#fef3c7;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;">⚠</span>
            À traiter${moisLabel ? ` — ${moisLabel}${trimLabel ? ' / '+trimLabel : ''}` : ''} <span style="font-weight:400;color:var(--muted);font-size:11px;margin-left:4px;">${totalUrgent} contrat${totalUrgent>1?'s':''}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">${cardsM}${cardsT}</div>
        </div>`
    }

    // Bloc retards
    if (totalRetard > 0) {
      const grouped = {}
      for (const {contrat, periode} of retardItems) {
        const key = contrat.id
        if (!grouped[key]) grouped[key] = { contrat, periodes: [] }
        grouped[key].periodes.push(periode)
      }
      const cards = Object.values(grouped).map(({contrat: c, periodes}) => {
        const assignes = Array.isArray(c.assignes) && c.assignes.length ? c.assignes : (c.assigne_a ? [c.assigne_a] : [])
        const periodesLabel = periodes.map(p => p.includes('-Q') ? p.split('-')[1] : moisNomsCourt[parseInt(p.split('-')[1])-1]).join(', ')
        return `<div onclick="ouvrirModalReleve('${c.id}','${periodes[periodes.length-1]}')"
          style="background:white;border:1.5px solid #fca5a5;border-radius:8px;padding:10px 12px;cursor:pointer;min-width:150px;max-width:220px;flex-shrink:0;transition:box-shadow 0.15s;"
          onmouseover="this.style.boxShadow='0 2px 8px rgba(239,68,68,0.25)'" onmouseout="this.style.boxShadow=''">
          <div style="font-weight:600;font-size:12.5px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.client}</div>
          ${c.numero_machine ? `<div style="font-size:10px;color:var(--muted);">#${c.numero_machine}</div>` : ''}
          <div style="font-size:10px;color:var(--muted);margin-top:2px;">${typeLabel(c.type_prestation)}</div>
          ${assignes.length ? `<div style="font-size:10px;color:var(--muted);margin-top:2px;">👤 ${assignes.join(', ')}</div>` : ''}
          <div style="margin-top:6px;font-size:10.5px;font-weight:600;color:#ef4444;">● ${periodes.length} période${periodes.length>1?'s':''} : ${periodesLabel}</div>
        </div>`
      }).join('')
      blocksHtml += `
        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:700;color:#ef4444;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
            <span style="background:#fee2e2;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;">●</span>
            En retard <span style="font-weight:400;color:var(--muted);font-size:11px;margin-left:4px;">${Object.keys(grouped).length} contrat${Object.keys(grouped).length>1?'s':''}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">${cards}</div>
        </div>`
    }

    // Bloc en attente
    if (totalAttente > 0) {
      const grouped = {}
      for (const {contrat, periode} of enAttenteItems) {
        const key = contrat.id
        if (!grouped[key]) grouped[key] = { contrat, periodes: [] }
        grouped[key].periodes.push(periode)
      }
      const cards = Object.values(grouped).map(({contrat: c, periodes}) => {
        const periodesLabel = periodes.map(p => p.includes('-Q') ? p.split('-')[1] : moisNomsCourt[parseInt(p.split('-')[1])-1]).join(', ')
        return `<div onclick="ouvrirModalReleve('${c.id}','${periodes[0]}')"
          style="background:white;border:1.5px solid #fdba74;border-radius:8px;padding:10px 12px;cursor:pointer;min-width:150px;max-width:220px;flex-shrink:0;transition:box-shadow 0.15s;"
          onmouseover="this.style.boxShadow='0 2px 8px rgba(249,115,22,0.25)'" onmouseout="this.style.boxShadow=''">
          <div style="font-weight:600;font-size:12.5px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.client}</div>
          ${c.numero_machine ? `<div style="font-size:10px;color:var(--muted);">#${c.numero_machine}</div>` : ''}
          <div style="font-size:10px;color:var(--muted);margin-top:2px;">${typeLabel(c.type_prestation)}</div>
          <div style="margin-top:6px;font-size:10.5px;font-weight:600;color:#f97316;">⏳ ${periodesLabel}</div>
        </div>`
      }).join('')
      blocksHtml += `
        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:700;color:#f97316;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
            <span style="background:#fff7ed;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;">⏳</span>
            En attente <span style="font-weight:400;color:var(--muted);font-size:11px;margin-left:4px;">${Object.keys(grouped).length} contrat${Object.keys(grouped).length>1?'s':''}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">${cards}</div>
        </div>`
    }

    if (totalUrgent === 0 && totalRetard === 0 && totalAttente === 0) {
      blocksHtml = `<div style="display:flex;align-items:center;gap:10px;color:var(--success);font-size:13px;font-weight:600;padding:12px 0;">
        <span style="font-size:20px;">✅</span> Tout est à jour ! Aucune action requise.
      </div>`
    }

    htmlPriorite = `
      <div style="background:var(--surface-alt);border:1px solid var(--border-soft);border-radius:12px;padding:16px 20px;margin-bottom:24px;">
        <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:12px;display:flex;align-items:center;gap:8px;">
          🎯 Actions à faire maintenant
          <span style="font-size:11px;font-weight:400;color:var(--muted);">${new Date().toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}</span>
        </div>
        ${blocksHtml}
      </div>`
  }

  // ── Grille complète (tableau) ─────────────────────────────
  const colHighlightMois = annee === anneeEnCours && moisActionnable > 0 ? moisActionnable : -1
  const colHighlightTrim = annee === anneeEnCours && trimActionnable > 0 ? trimActionnable : -1

  function ligneClientHtml(c, cells) {
    const assignes = Array.isArray(c.assignes) && c.assignes.length ? c.assignes : (c.assigne_a ? [c.assigne_a] : [])
    const assigneEl = assignes.length ? `<div style="font-size:10px;color:var(--muted);margin-top:2px;white-space:normal;">👤 ${assignes.join(', ')}</div>` : ''
    return `<tr>
      <td style="padding:8px 12px;border:1px solid var(--border-soft);white-space:nowrap;cursor:pointer;position:sticky;left:0;z-index:2;background:var(--surface);min-width:170px;" onclick="ouvrirHistoriqueContrat('${c.id}')">
        <div style="font-weight:600;font-size:13px;color:var(--brand);">${c.client}${c.numero_machine ? `<span style="font-size:10px;color:var(--muted);font-weight:400;margin-left:5px;">#${c.numero_machine}</span>` : ''}</div>
        <div style="font-size:10.5px;color:var(--muted);">${typeLabel(c.type_prestation)}</div>
        ${assigneEl}
      </td>
      ${cells}
    </tr>`
  }

  // Section mensuel
  let htmlMensuel = ''
  if (mensuel.length > 0) {
    const mensuelFiltres = showAll ? mensuel : mensuel.filter(c => contratAActionnable(c))
    const nbCaches = mensuel.length - mensuelFiltres.length
    const entetes = moisNomsCourt.map((m, i) => {
      const isCur = (i + 1) === colHighlightMois
      return `<th style="padding:7px 4px;font-size:11px;font-weight:${isCur?'700':'600'};color:${isCur?'#d97706':'var(--muted)'};text-align:center;min-width:44px;border:1px solid var(--border-soft);background:${isCur?'#fef9c3':'var(--surface-alt)'};">${m}</th>`
    }).join('')
    const lignes = mensuelFiltres.map(c => {
      const cells = Array.from({length:12}, (_,i) => cellule(c, periodeMensuelle(annee, i+1), (i+1) === colHighlightMois)).join('')
      return ligneClientHtml(c, cells)
    }).join('')
    const hiddenInfo = nbCaches > 0 ? `<span style="font-size:11px;color:var(--muted);">(${nbCaches} client${nbCaches>1?'s':''} à jour masqué${nbCaches>1?'s':''})</span>` : ''
    htmlMensuel = `
      <div style="margin-bottom:28px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
          <span style="font-size:13px;font-weight:700;color:var(--ink);">📅 Mensuel</span>
          <span style="font-size:11px;color:var(--muted);background:var(--surface-alt);padding:2px 8px;border-radius:10px;">${mensuelFiltres.length}/${mensuel.length} affiché${mensuelFiltres.length>1?'s':''}</span>
          ${hiddenInfo}
        </div>
        <div style="overflow-x:auto;border-radius:8px;border:1px solid var(--border-soft);">
          <table style="border-collapse:collapse;width:100%;">
            <thead><tr>
              <th style="padding:8px 12px;font-size:11px;font-weight:600;color:var(--muted);text-align:left;border:1px solid var(--border-soft);background:var(--surface-alt);min-width:170px;position:sticky;left:0;z-index:3;">Client</th>
              ${entetes}
            </tr></thead>
            <tbody>${lignes || `<tr><td colspan="13" style="text-align:center;padding:20px;color:var(--muted);font-size:12px;">✅ Tous les clients sont à jour ce mois-ci</td></tr>`}</tbody>
          </table>
        </div>
      </div>`
  }

  // Section trimestriel
  let htmlTrimest = ''
  if (trimest.length > 0) {
    const trimestFiltres = showAll ? trimest : trimest.filter(c => contratAActionnable(c))
    const nbCachesT = trimest.length - trimestFiltres.length
    const entetesTrim = ['T1','T2','T3','T4'].map((t, i) => {
      const isCur = (i + 1) === colHighlightTrim
      return `<th style="padding:7px 12px;font-size:11px;font-weight:${isCur?'700':'600'};color:${isCur?'#d97706':'var(--muted)'};text-align:center;min-width:80px;border:1px solid var(--border-soft);background:${isCur?'#fef9c3':'var(--surface-alt)'};">${t}</th>`
    }).join('')
    const lignes = trimestFiltres.map(c => {
      const cells = [1,2,3,4].map(t => cellule(c, periodeTrimestrielle(annee, t), t === colHighlightTrim)).join('')
      return ligneClientHtml(c, cells)
    }).join('')
    const hiddenInfoT = nbCachesT > 0 ? `<span style="font-size:11px;color:var(--muted);">(${nbCachesT} client${nbCachesT>1?'s':''} à jour masqué${nbCachesT>1?'s':''})</span>` : ''
    htmlTrimest = `
      <div style="margin-bottom:28px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
          <span style="font-size:13px;font-weight:700;color:var(--ink);">🗓 Trimestriel</span>
          <span style="font-size:11px;color:var(--muted);background:var(--surface-alt);padding:2px 8px;border-radius:10px;">${trimestFiltres.length}/${trimest.length} affiché${trimestFiltres.length>1?'s':''}</span>
          ${hiddenInfoT}
        </div>
        <div style="overflow-x:auto;border-radius:8px;border:1px solid var(--border-soft);">
          <table style="border-collapse:collapse;width:100%;">
            <thead><tr>
              <th style="padding:8px 12px;font-size:11px;font-weight:600;color:var(--muted);text-align:left;border:1px solid var(--border-soft);background:var(--surface-alt);min-width:170px;position:sticky;left:0;z-index:3;">Client</th>
              ${entetesTrim}
            </tr></thead>
            <tbody>${lignes || `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--muted);font-size:12px;">✅ Tous les clients sont à jour ce trimestre</td></tr>`}</tbody>
          </table>
        </div>
      </div>`
  }

  // Barre de contrôle grille (filtre + légende)
  const filtreBtn = `<button onclick="toggleFiltreRecurrents()"
    style="background:${showAll?'var(--surface-alt)':'var(--brand)'};color:${showAll?'var(--ink)':'#fff'};border:1px solid ${showAll?'var(--border)':'var(--brand)'};border-radius:6px;padding:5px 12px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;">
    ${showAll ? '👁 Tout afficher' : '🎯 Seulement à traiter'}
  </button>`

  const legende = `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;font-size:11px;color:var(--muted);align-items:center;justify-content:space-between;">
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
      <span style="font-size:11px;font-weight:600;color:var(--ink);">Légende :</span>
      <span style="display:flex;align-items:center;gap:4px;"><span style="color:var(--success);font-size:14px;font-weight:700;">✓</span> Traité</span>
      <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#f97316;"></span> En attente</span>
      <span style="display:flex;align-items:center;gap:4px;"><span style="color:#ef4444;font-size:12px;">●</span> En retard</span>
      <span style="display:flex;align-items:center;gap:4px;"><span style="color:#f59e0b;font-size:12px;">⚠</span> À faire maintenant</span>
    </div>
    ${filtreBtn}
  </div>`

  el.innerHTML = contrats.length === 0
    ? `<div style="text-align:center;padding:60px 20px;color:var(--muted);">
        <div style="font-size:40px;margin-bottom:12px;">📋</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:8px;">Aucun contrat récurrent</div>
        <div style="font-size:13px;">Cliquez sur <b>+ Nouveau contrat</b> pour commencer.</div>
      </div>`
    : htmlPriorite + legende + htmlMensuel + htmlTrimest
}

// ── Modal Nouveau/Édition contrat ─────────────────────────

async function ouvrirModalContratRecurrent(id = null) {
  fermerModals()
  window._contratEditionId = id || null
  const modal = document.getElementById('modal-contrat-recurrent')
  const titre = document.getElementById('modal-contrat-recurrent-titre')
  titre.textContent = id ? 'Modifier le contrat' : 'Nouveau contrat'

  // Remplir les cases à cocher des employés
  const { data: employes } = await db.from('employes').select('id,nom,email').order('nom')
  const assignesList = document.getElementById('cr-assignes-list')
  assignesList.innerHTML = ''
  ;(employes || []).forEach(e => {
    const label = document.createElement('label')
    label.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;padding:3px 6px;border-radius:6px;'
    label.onmouseover = () => label.style.background = 'var(--surface-alt)'
    label.onmouseout  = () => label.style.background = ''
    label.innerHTML = `<input type="checkbox" value="${e.nom}" style="accent-color:var(--brand);width:14px;height:14px;"> ${e.nom}`
    assignesList.appendChild(label)
  })

  // Vider le formulaire
  document.getElementById('cr-client').value    = ''
  document.getElementById('cr-machine').value   = ''
  document.getElementById('cr-type').value      = 'location_fontaine'
  document.getElementById('cr-prix-fixe').value = ''
  document.getElementById('cr-prix-unite').value= ''
  document.getElementById('cr-notes').value     = ''
  document.querySelector('input[name="cr-frequence"][value="mensuelle"]').checked = true
  document.getElementById('cr-compteurs-list').innerHTML = ''
  // Décocher tous les assignés
  document.querySelectorAll('#cr-assignes-list input[type="checkbox"]').forEach(cb => cb.checked = false)

  if (id) {
    // Charger les données existantes
    const { data: contrat } = await db.from('contrats_recurrents').select('*').eq('id', id).single()
    if (contrat) {
      document.getElementById('cr-client').value    = contrat.client || ''
      document.getElementById('cr-machine').value   = contrat.numero_machine || ''
      document.getElementById('cr-type').value      = contrat.type_prestation || 'location_fontaine'
      document.getElementById('cr-prix-fixe').value = contrat.prix_fixe ?? ''
      document.getElementById('cr-prix-unite').value= contrat.prix_unite ?? ''
      document.getElementById('cr-notes').value     = contrat.notes || ''
      const radioFreq = document.querySelector(`input[name="cr-frequence"][value="${contrat.frequence}"]`)
      if (radioFreq) radioFreq.checked = true
      ;(contrat.compteurs || []).forEach(cpt => ajouterLigneCompteur(cpt.nom, cpt.prix))
      // Cocher les assignés
      const assignes = Array.isArray(contrat.assignes) ? contrat.assignes : (contrat.assigne_a ? [contrat.assigne_a] : [])
      document.querySelectorAll('#cr-assignes-list input[type="checkbox"]').forEach(cb => {
        if (assignes.includes(cb.value)) cb.checked = true
      })
    }
  }

  modal.classList.remove('hidden')
  modal.querySelector('.modal-box').scrollTop = 0
}

function ajouterLigneCompteur(nom = '', prix = '') {
  const list = document.getElementById('cr-compteurs-list')
  const div = document.createElement('div')
  div.style.cssText = 'display:flex;gap:8px;align-items:center;'
  div.innerHTML = `
    <input type="text" placeholder="Nom du compteur (ex: Boisson longue)" value="${nom}"
      style="flex:2;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit;background:var(--surface);">
    <input type="number" placeholder="€/unité" value="${prix}" step="0.001" min="0"
      style="flex:1;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit;background:var(--surface);">
    <button type="button" onclick="this.parentElement.remove()"
      style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px;padding:0;line-height:1;">✕</button>
  `
  list.appendChild(div)
}

async function sauvegarderContratRecurrent() {
  const client = document.getElementById('cr-client').value.trim()
  if (!client) { alert('Le nom du client est obligatoire.'); return }

  const frequence = document.querySelector('input[name="cr-frequence"]:checked')?.value || 'mensuelle'

  // Récupérer les compteurs
  const lignesCompteurs = document.querySelectorAll('#cr-compteurs-list > div')
  const compteurs = []
  lignesCompteurs.forEach(div => {
    const inputs = div.querySelectorAll('input')
    const nom  = inputs[0].value.trim()
    const prix = parseFloat(inputs[1].value) || 0
    if (nom) compteurs.push({ nom, prix })
  })

  // Récupérer les assignés cochés
  const assignes = Array.from(document.querySelectorAll('#cr-assignes-list input[type="checkbox"]:checked')).map(cb => cb.value)

  const payload = {
    client,
    numero_machine:   document.getElementById('cr-machine').value.trim() || null,
    type_prestation:  document.getElementById('cr-type').value,
    frequence,
    prix_fixe:        parseFloat(document.getElementById('cr-prix-fixe').value) || null,
    prix_unite:       parseFloat(document.getElementById('cr-prix-unite').value) || null,
    compteurs,
    assignes,
    assigne_a:        assignes[0] || null,  // compat. ascendante
    notes:            document.getElementById('cr-notes').value.trim() || null,
  }

  let error
  if (window._contratEditionId) {
    ;({ error } = await db.from('contrats_recurrents').update(payload).eq('id', window._contratEditionId))
  } else {
    ;({ error } = await db.from('contrats_recurrents').insert(payload))
  }

  if (error) { alert('Erreur : ' + error.message); return }
  fermerModals()
  chargerRecurrents()
}

// ── Modal Relevé ──────────────────────────────────────────

async function ouvrirModalReleve(contratId, periode) {
  fermerModals()
  const { data: contrat } = await db.from('contrats_recurrents').select('*').eq('id', contratId).single()
  if (!contrat) return

  window._releveEnCours = { contratId, periode, contrat }

  // Charger le relevé existant si présent
  const { data: releve } = await db.from('releves_recurrents').select('*')
    .eq('contrat_id', contratId).eq('periode', periode).maybeSingle()

  const modal = document.getElementById('modal-releve-recurrent')
  document.getElementById('releve-modal-titre').textContent = `${contrat.client} - ${periodeLabel(periode)}`

  // Infos contrat
  const infoEl = document.getElementById('releve-info-contrat')
  const prixInfo = contrat.prix_fixe ? `${contrat.prix_fixe} €/période` : ''
  const unitInfo = contrat.prix_unite ? `${contrat.prix_unite} €/unité` : ''
  infoEl.innerHTML = `
    <span style="font-weight:600;">${typeLabel(contrat.type_prestation)}</span>
    ${contrat.numero_machine ? `· N° <b>${contrat.numero_machine}</b>` : ''}
    ${prixInfo ? `· ${prixInfo}` : ''}
    ${unitInfo ? `· ${unitInfo}` : ''}
    ${contrat.assigne_a ? `<span style="margin-left:6px;color:var(--muted);">👤 ${contrat.assigne_a}</span>` : ''}
  `

  // Champs compteurs
  const champsEl = document.getElementById('releve-compteurs-fields')
  champsEl.innerHTML = ''
  const valeursExist = releve?.valeurs || {}

  if (contrat.compteurs && contrat.compteurs.length > 0) {
    contrat.compteurs.forEach(cpt => {
      const val = valeursExist[cpt.nom] ?? ''
      const div = document.createElement('div')
      div.className = 'form-group'
      div.innerHTML = `
        <label style="display:flex;justify-content:space-between;align-items:center;">
          <span>${cpt.nom}</span>
          ${cpt.prix ? `<span style="font-size:11px;color:var(--muted);">${cpt.prix} €/unité</span>` : ''}
        </label>
        <input type="number" data-compteur="${cpt.nom}" value="${val}" placeholder="Valeur relevée"
          step="1" min="0" style="width:100%;box-sizing:border-box;">
      `
      champsEl.appendChild(div)
    })
  }

  // Date et commentaire
  document.getElementById('releve-date').value = releve?.date_traitement || new Date().toISOString().split('T')[0]
  document.getElementById('releve-commentaire').value = releve?.commentaire || ''
  document.getElementById('releve-fait').checked = releve?.fait || false
  document.getElementById('releve-en-attente').checked = (releve?.en_attente && !releve?.fait) || false

  modal.classList.remove('hidden')
}

async function sauvegarderReleve() {
  if (!window._releveEnCours) return
  const { contratId, periode, contrat } = window._releveEnCours

  // Récupérer les valeurs des compteurs
  const valeurs = {}
  document.querySelectorAll('#releve-compteurs-fields input[data-compteur]').forEach(input => {
    const nom = input.getAttribute('data-compteur')
    const val = parseFloat(input.value)
    if (!isNaN(val)) valeurs[nom] = val
  })

  const fait       = document.getElementById('releve-fait').checked
  const enAttente  = document.getElementById('releve-en-attente').checked && !fait

  const payload = {
    contrat_id:      contratId,
    periode,
    fait,
    en_attente:      enAttente,
    date_traitement: document.getElementById('releve-date').value || null,
    valeurs,
    commentaire:     document.getElementById('releve-commentaire').value.trim() || null,
  }

  const { error } = await db.from('releves_recurrents').upsert(payload, { onConflict: 'contrat_id,periode' })
  if (error) { alert('Erreur : ' + error.message); return }

  fermerModals()
  chargerRecurrents()
}

// ── Modal Historique contrat ──────────────────────────────

async function ouvrirHistoriqueContrat(id) {
  window._historiqueContratId = id

  const [{ data: contrat }, { data: releves }] = await Promise.all([
    db.from('contrats_recurrents').select('*').eq('id', id).single(),
    db.from('releves_recurrents').select('*').eq('contrat_id', id).order('periode', { ascending: false })
  ])

  if (!contrat) return

  const modal = document.getElementById('modal-historique-contrat')
  document.getElementById('historique-contrat-titre').textContent = contrat.client

  // Infos contrat
  const infoEl = document.getElementById('historique-contrat-infos')
  const compteursList = (contrat.compteurs || []).map(c => `${c.nom}${c.prix ? ` (${c.prix}€)` : ''}`).join(', ')
  infoEl.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:12px;">
      <div><span style="color:var(--muted);">Type :</span> <b>${typeLabel(contrat.type_prestation)}</b></div>
      <div><span style="color:var(--muted);">Fréquence :</span> <b>${contrat.frequence === 'mensuelle' ? 'Mensuelle' : 'Trimestrielle'}</b></div>
      ${contrat.numero_machine ? `<div><span style="color:var(--muted);">Machine :</span> <b>#${contrat.numero_machine}</b></div>` : ''}
      ${contrat.prix_fixe ? `<div><span style="color:var(--muted);">Prix fixe :</span> <b>${contrat.prix_fixe} €</b></div>` : ''}
      ${contrat.prix_unite ? `<div><span style="color:var(--muted);">Prix unité :</span> <b>${contrat.prix_unite} €</b></div>` : ''}
      ${(Array.isArray(contrat.assignes) && contrat.assignes.length ? contrat.assignes : (contrat.assigne_a ? [contrat.assigne_a] : [])).length ? `<div><span style="color:var(--muted);">Assigné(s) :</span> <b>${(Array.isArray(contrat.assignes) && contrat.assignes.length ? contrat.assignes : [contrat.assigne_a]).join(', ')}</b></div>` : ''}
    </div>
    ${compteursList ? `<div style="margin-top:8px;font-size:12px;color:var(--muted);">Compteurs : ${compteursList}</div>` : ''}
    ${contrat.notes ? `<div style="margin-top:8px;font-size:12px;color:var(--ink-soft);">${contrat.notes}</div>` : ''}
  `

  // Liste des relevés
  const listeEl = document.getElementById('historique-contrat-liste')
  if (!releves || releves.length === 0) {
    listeEl.innerHTML = `<div style="text-align:center;padding:30px;color:var(--muted);font-size:13px;">Aucun relevé enregistré pour ce contrat.</div>`
  } else {
    listeEl.innerHTML = releves.map(r => {
      const statutStr = r.fait
        ? `<span style="color:var(--success);font-weight:700;">✓ Traité</span>${r.date_traitement ? ` <span style="font-size:11px;color:var(--muted);">le ${formatDate(r.date_traitement)}</span>` : ''}`
        : r.en_attente
          ? `<span style="display:inline-flex;align-items:center;gap:5px;color:#c2410c;font-weight:600;"><span style="width:8px;height:8px;border-radius:50%;background:#f97316;display:inline-block;"></span>En attente</span>`
          : `<span style="color:var(--danger);">✗ Non traité</span>`
      const valeursStr = r.valeurs && Object.keys(r.valeurs).length
        ? `<div style="font-size:11.5px;color:var(--ink-soft);margin-top:4px;">${Object.entries(r.valeurs).map(([k,v]) => `${k}: <b>${v}</b>`).join(' · ')}</div>`
        : ''
      const commentStr = r.commentaire
        ? `<div style="font-size:11.5px;color:var(--muted);margin-top:2px;font-style:italic;">${r.commentaire}</div>`
        : ''
      return `<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:10px 12px;border-bottom:1px solid var(--border-soft);">
        <div>
          <span style="font-size:13px;font-weight:600;color:var(--ink);">${periodeLabel(r.periode)}</span>
          ${valeursStr}${commentStr}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
          ${statutStr}
          <button onclick="ouvrirModalReleve('${contrat.id}','${r.periode}')" style="font-size:11px;padding:2px 8px;background:var(--surface-alt);border:1px solid var(--border);border-radius:4px;cursor:pointer;font-family:inherit;color:var(--ink);">Modifier</button>
        </div>
      </div>`
    }).join('')
  }

  modal.classList.remove('hidden')
}

// ── Archiver un contrat ───────────────────────────────────

async function archiverContrat(id) {
  if (!confirm('Archiver ce contrat ? Il n\'apparaîtra plus dans la grille.')) return
  await db.from('contrats_recurrents').update({ actif: false }).eq('id', id)
  fermerModals()
  chargerRecurrents()
}