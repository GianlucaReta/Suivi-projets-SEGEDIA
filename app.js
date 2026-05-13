const SUPABASE_URL = 'https://guzbikygjwsvztlthmnr.supabase.co'
const SUPABASE_KEY = 'sb_publishable_BqknWAgxurkaidzDdyQ60g_GnlnIcYk'

const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

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
      <button class="btn btn-secondary" style="margin-top:0.8rem; width:100%; font-size:0.8rem;" onclick="event.stopPropagation(); desarchiverProjet('${projet.id}')">↩ Désarchiver</button>
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
  await db.from('taches').update({ statut: nouveauStatut }).eq('id', id)
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
// --- FACTURES ---
// ═══════════════════════════════════════════════════════

async function chargerFactures() {
  if (!utilisateurAccesFactures) {
    document.getElementById('liste-factures').innerHTML = '<p style="color:var(--muted);">Accès restreint.</p>'
    return
  }
  const aujourd_hui = new Date().toISOString().split('T')[0]
  const { data: factures } = await db.from('factures').select('*').order('date_echeance', { ascending: true })

  const toutes   = factures || []
  const nonSolde = toutes.filter(f => !f.solde)
  const enRetard = nonSolde.filter(f => f.date_echeance && f.date_echeance < aujourd_hui)
  const montantTotal  = nonSolde.reduce((s, f) => s + (parseFloat(f.montant) || 0), 0)
  const montantRetard = enRetard.reduce((s, f) => s + (parseFloat(f.montant) || 0), 0)

  // Stats bar
  const statsEl = document.getElementById('factures-stats-bar')
  if (statsEl) statsEl.innerHTML = `
    <span>${nonSolde.length} en attente · </span>
    <span style="color:${enRetard.length > 0 ? 'var(--danger)' : 'var(--success)'};">${enRetard.length} en retard</span>
    <span> · Total à encaisser : <b style="font-family:'IBM Plex Mono',monospace;">${montantTotal.toLocaleString('fr-FR', {minimumFractionDigits:2})} €</b></span>
    ${enRetard.length > 0 ? ` · <span style="color:var(--danger);">Retards : <b style="font-family:'IBM Plex Mono',monospace;">${montantRetard.toLocaleString('fr-FR', {minimumFractionDigits:2})} €</b></span>` : ''}
  `

  // Filtres
  const filtres = [
    { val:'toutes',  label:'Toutes' },
    { val:'attente', label:'En attente' },
    { val:'retard',  label:'En retard' },
    { val:'soldees', label:'Soldées' }
  ]
  const filtresEl = document.getElementById('filtres-factures')
  if (filtresEl) filtresEl.innerHTML = filtres.map(f => `
    <button onclick="setFiltreFactures('${f.val}')" style="
      background:${filtreFactures===f.val ? 'var(--ink)' : 'var(--surface)'};
      color:${filtreFactures===f.val ? '#fff' : 'var(--muted)'};
      border:1px solid ${filtreFactures===f.val ? 'var(--ink)' : 'var(--border)'};
      cursor:pointer; padding:4px 14px; border-radius:20px; font-size:12px;
      font-weight:${filtreFactures===f.val ? '600' : '400'}; font-family:inherit; white-space:nowrap;
    ">${f.label}</button>
  `).join('')

  // Filtrer
  const filtered = toutes.filter(f => {
    const retard = !f.solde && f.date_echeance && f.date_echeance < aujourd_hui
    if (filtreFactures === 'attente') return !f.solde && !retard
    if (filtreFactures === 'retard')  return retard
    if (filtreFactures === 'soldees') return f.solde
    return true
  })

  const listeEl = document.getElementById('liste-factures')
  if (!filtered.length) {
    listeEl.innerHTML = '<p style="color:var(--muted); padding:20px;">Aucune facture pour ce filtre.</p>'
    return
  }

  listeEl.innerHTML = `
    <div style="background:var(--surface); border:1px solid var(--border); border-radius:12px; overflow:hidden;">
      <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
        <thead>
          <tr style="background:var(--surface-alt); border-bottom:1px solid var(--border);">
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600;">N° Facture</th>
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600;">Client</th>
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600;">Ville</th>
            <th style="padding:10px 16px; text-align:right; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600;">Montant</th>
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600;">Émission</th>
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600;">Échéance</th>
            <th style="padding:10px 16px; text-align:left; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600;">Statut</th>
            <th style="padding:10px 16px; text-align:center; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; font-weight:600;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(f => {
            const enRetard = !f.solde && f.date_echeance && f.date_echeance < aujourd_hui
            const joursRetard = enRetard ? Math.floor((new Date(aujourd_hui) - new Date(f.date_echeance)) / 86400000) : 0
            const statutHtml = f.solde
              ? `<span style="color:var(--success); font-weight:600; font-size:11px;">Soldée</span>`
              : enRetard
              ? `<span style="color:var(--danger); font-weight:600; font-size:11px;">+${joursRetard}j retard</span>`
              : `<span style="color:var(--warn); font-weight:500; font-size:11px;">En attente</span>`
            return `
              <tr style="border-bottom:1px solid var(--border-soft);" onmouseover="this.style.background='var(--surface-alt)'" onmouseout="this.style.background=''">
                <td style="padding:10px 16px; font-family:'IBM Plex Mono',monospace; font-size:11.5px; color:var(--ink-soft);">${f.numero}</td>
                <td style="padding:10px 16px; font-weight:600; color:var(--ink);">${f.client}</td>
                <td style="padding:10px 16px; color:var(--ink-soft); font-size:12px;">${f.ville || '—'}</td>
                <td style="padding:10px 16px; text-align:right; font-family:'IBM Plex Mono',monospace; font-weight:600; color:${enRetard ? 'var(--danger)' : 'var(--ink)'};">${parseFloat(f.montant).toLocaleString('fr-FR', {minimumFractionDigits:2})} €</td>
                <td style="padding:10px 16px; color:var(--ink-soft); font-size:12px;">${f.date_emission ? formatDate(f.date_emission) : '—'}</td>
                <td style="padding:10px 16px; color:${enRetard ? 'var(--danger)' : 'var(--ink-soft)'}; font-weight:${enRetard ? '600' : '400'}; font-size:12px;">${f.date_echeance ? formatDate(f.date_echeance) : '—'}</td>
                <td style="padding:10px 16px;">${statutHtml}</td>
                <td style="padding:10px 16px; text-align:center;">
                  ${!f.solde ? `<button onclick="marquerFactureSoldee('${f.id}')" style="font-size:11px; padding:3px 10px; border-radius:5px; background:var(--success); color:#fff; border:none; cursor:pointer; font-family:inherit;">✓ Soldée</button>` : `<button onclick="marquerFactureNonSoldee('${f.id}')" style="font-size:11px; padding:3px 10px; border-radius:5px; background:var(--surface-alt); color:var(--muted); border:1px solid var(--border); cursor:pointer; font-family:inherit;">Annuler</button>`}
                </td>
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

async function marquerFactureSoldee(id) {
  await db.from('factures').update({ solde: true }).eq('id', id)
  chargerFactures()
}

async function marquerFactureNonSoldee(id) {
  await db.from('factures').update({ solde: false }).eq('id', id)
  chargerFactures()
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

  // Ignorer la ligne header
  const dataRows = rows.slice(1).filter(r => r[5] && r[5].trim())

  const factures = dataRows.map(cols => {
    const numero        = cols[5]?.trim() || null
    const client        = cols[0]?.trim() || 'Client inconnu'
    const montantStr    = (cols[4] || '0').trim().replace(',', '.')
    const montant       = parseFloat(montantStr) || 0
    const date_emission = parseDateEmissionDL(cols[1])
    const date_echeance = parseDateEcheanceDL(cols[11])
    const solde         = (cols[6] || '').trim() === 'Oui'
    const ville         = cols[7]?.trim() || null
    const commentaire   = cols[3]?.trim().slice(0, 500) || null
    if (!numero) return null
    return { numero, client, montant, date_emission, date_echeance, solde, ville, commentaire }
  }).filter(Boolean)

  if (!factures.length) { alert('Aucune facture valide trouvée dans le fichier.'); return }

  // Upsert (update si existe, insert sinon)
  const { error } = await db.from('factures').upsert(factures, { onConflict: 'numero', ignoreDuplicates: false })
  if (error) { console.error(error); alert('Erreur import : ' + error.message); return }

  // Réinitialiser l'input file
  document.getElementById('input-csv-factures').value = ''
  chargerFactures()
}
}