const SUPABASE_URL = 'https://guzbikygjwsvztlthmnr.supabase.co'
const SUPABASE_KEY = 'sb_publishable_BqknWAgxurkaidzDdyQ60g_GnlnIcYk'
// Client créé dans index.html (il porte la session de connexion)
const db = window.db || supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

// En-têtes pour appeler une fonction serveur au nom de la personne connectée
async function enteteSession() {
  const { data } = await db.auth.getSession()
  const jeton = data.session?.access_token
  return { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, ...(jeton ? { 'Authorization': `Bearer ${jeton}` } : {}) }
}

// ── OUTILS COMMUNS ───────────────────────────────────────
// Date du jour au format AAAA-MM-JJ, à l'heure française (toISOString donne
// l'heure UTC : entre minuit et 1-2 h du matin, on obtenait la veille, et les
// cases des calendriers affichaient les données du jour précédent).
function dateLocaleISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function aujourdhuiISO() { return dateLocaleISO(new Date()) }

// Le serveur ne renvoie jamais plus de 5 000 lignes par requête : au-delà, les
// lignes manquantes disparaissaient sans erreur. On lit donc par pages de 1 000,
// triées par id en dernier critère pour qu'aucune ligne ne saute d'une page à l'autre.
async function toutesLesLignes(construireRequete, taillePage = 1000) {
  const lignes = []
  for (let debut = 0; ; debut += taillePage) {
    const { data, error } = await construireRequete().order('id').range(debut, debut + taillePage - 1)
    if (error) return { data: null, error }
    lignes.push(...(data || []))
    if (!data || data.length < taillePage) return { data: lignes, error: null }
  }
}

// ── FENÊTRES AU STYLE DU SITE (remplacent les boîtes grises du navigateur) ──
// confirmer('…') → Promise<true|false> ; demander('…', valeur) → Promise<texte|null>
function boiteDialogue({ titre = '', message = '', champ = null, ok = 'OK', annuler = 'Annuler', danger = false }) {
  return new Promise(resolve => {
    const fond = document.createElement('div')
    fond.className = 'modal-overlay'
    fond.style.zIndex = '10001'
    const boite = document.createElement('div')
    boite.className = 'modal-box'
    boite.style.maxWidth = '420px'
    boite.innerHTML = `
      ${titre ? `<h2 style="margin-bottom:8px;">${esc(titre)}</h2>` : ''}
      <div style="font-size:13.5px;color:var(--ink-soft);line-height:1.55;white-space:pre-line;">${esc(message)}</div>
      ${champ ? `<input class="dlg-champ" type="${champ.type || 'text'}" inputmode="${champ.inputmode || ''}" value="${esc(champ.valeur ?? '')}" placeholder="${esc(champ.placeholder || '')}"
        style="margin-top:12px;width:100%;padding:9px 11px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;" />` : ''}
      <div class="modal-actions">
        ${annuler ? `<button class="btn btn-secondary dlg-non">${esc(annuler)}</button>` : ''}
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} dlg-oui">${esc(ok)}</button>
      </div>`
    fond.appendChild(boite)
    document.body.appendChild(fond)
    const input = boite.querySelector('.dlg-champ')
    const fermer = v => { fond.remove(); document.removeEventListener('keydown', clavier, true); resolve(v) }
    const valider = () => fermer(champ ? input.value : true)
    const refuser = () => fermer(champ ? null : false)
    const clavier = e => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); annuler ? refuser() : valider() }
      if (e.key === 'Enter' && (!input || document.activeElement === input || document.activeElement === document.body)) { e.preventDefault(); valider() }
    }
    document.addEventListener('keydown', clavier, true)
    boite.querySelector('.dlg-oui').onclick = valider
    boite.querySelector('.dlg-non')?.addEventListener('click', refuser)
    fond.addEventListener('click', e => { if (e.target === fond) refuser() })
    setTimeout(() => (input || boite.querySelector('.dlg-oui')).focus(), 30)
    if (input) input.select()
  })
}
function confirmer(message, options = {}) {
  const danger = options.danger ?? /^(⚠️ )?(Supprimer|Retirer|Archiver|Annuler l'import|Dernière confirmation)/.test(message)
  return boiteDialogue({ message, ok: options.ok || (danger ? 'Confirmer' : 'OK'), danger, titre: options.titre })
}
function demander(message, valeur = '', options = {}) {
  return boiteDialogue({ message, champ: { valeur, ...options }, ok: options.ok || 'Valider' })
}
// Les messages simples (alert) utilisent aussi la fenêtre du site
window.alert = message => { boiteDialogue({ message: String(message ?? ''), annuler: null }) }

// ── SQUELETTES DE CHARGEMENT ──
// Blocs gris animés pendant le premier chargement d'une page (au lieu de « Chargement… »)
function squelette(type = 'liste', n = 6) {
  const b = (w, h = 12, extra = '') => `<div class="sq" style="width:${w};height:${h}px;${extra}"></div>`
  if (type === 'cartes') return `<div style="grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">${
    Array.from({ length: n }, () => `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px;">${b('40%', 10)}${b('70%', 22)}${b('55%', 10)}</div>`).join('')}</div>`
  if (type === 'colonnes') return Array.from({ length: 5 }, (_, i) => `<div class="tr-col">${b('50%', 10, 'margin:4px 4px 12px;')}${
    Array.from({ length: 3 + (i % 2) }, () => `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:6px;display:flex;flex-direction:column;gap:7px;">${b('80%')}${b('45%', 9)}${b('35%', 14)}</div>`).join('')}</div>`).join('')
  return `<div style="grid-column:1/-1;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:6px 16px;">${
    Array.from({ length: n }, (_, i) => `<div style="display:flex;gap:14px;align-items:center;padding:13px 0;${i < n - 1 ? 'border-bottom:1px solid var(--border-soft);' : ''}">${b('18%')}${b((40 + (i * 13) % 30) + '%')}<div style="flex:1;"></div>${b('70px')}</div>`).join('')}</div>`
}
function afficherSquelette(el, type, n) {
  if (typeof el === 'string') el = document.getElementById(el)
  if (el && !el.innerHTML.trim()) el.innerHTML = squelette(type, n)
}

// Échappe un texte avant de l'insérer dans du HTML
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// ── RECHERCHE GLOBALE ────────────────────────────────────
let _searchTimeout = null
let _searchSeq = 0   // numéro de la dernière recherche lancée (ignore les réponses périmées)

// Masque la liste de résultats SANS toucher au texte tapé (contrairement à
// fermerRecherche, qui vide aussi le champ — à n'utiliser qu'après un choix/Échap).
function masquerResultatsRecherche() {
  const el = document.getElementById('search-results')
  if (el) el.style.display = 'none'
}

function afficherMessageRecherche(texte) {
  const el = document.getElementById('search-results')
  if (!el) return
  el.innerHTML = `<div style="padding:12px 14px;color:var(--muted);font-size:12.5px;">${texte}</div>`
  el.style.display = 'block'
}

function onSearchInput(val) {
  clearTimeout(_searchTimeout)
  const q = (val || '').trim()
  if (q.length < 2) { _searchSeq++; masquerResultatsRecherche(); return }
  _searchTimeout = setTimeout(() => lancerRecherche(q), 220)
}

async function lancerRecherche(query) {
  const q = query.toLowerCase().trim()
  if (!q) return
  const seq = ++_searchSeq
  afficherMessageRecherche('Recherche…')
  const [r1, r2, r3] = await Promise.all([
    db.from('projets').select('id,nom,client').eq('archive', false),
    db.from('taches').select('id,description,statut,projets(nom)').eq('archive', false),
    utilisateurAccesFactures
      ? (() => {
          // Recherche côté serveur (sur toutes les factures, pas seulement les 5 000 premières)
          const motif = q.replace(/[,()*%\\]/g, ' ').trim()
          return motif
            ? db.from('factures').select('id,numero,client,montant,solde').or(`numero.ilike.*${motif}*,client.ilike.*${motif}*`).limit(8)
            : Promise.resolve({ data: [] })
        })()
      : Promise.resolve({ data: [] })
  ])
  if (seq !== _searchSeq) return   // une recherche plus récente a été lancée entre-temps
  if (r1.error || r2.error) {
    console.error('Recherche :', r1.error || r2.error)
    afficherMessageRecherche('Recherche indisponible, réessaie dans un instant.')
    return
  }
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
let utilisateurRole          = localStorage.getItem('suivi_user_role')        || 'operationnel'  // 'admin' | 'commercial' | 'operationnel'

function estAdmin()        { return utilisateurRole === 'admin' }
function estCommercial()   { return utilisateurRole === 'commercial' || utilisateurRole === 'admin' }
function estOperationnel() { return utilisateurRole === 'operationnel' || estCommercial() }

async function deconnexion() {
  try { await db.auth.signOut() } catch (e) { console.error(e) }
  if (window.effacerProfilLocal) window.effacerProfilLocal()
  window.location.reload()
}

// Sauvegarde automatique du dimanche (8 dernières gardées) : téléchargement par un admin
async function telechargerSauvegarde() {
  afficherToast('Préparation de la sauvegarde…')
  const { data, error } = await db.from('sauvegardes').select('created_at, nb_lignes, contenu').order('created_at', { ascending: false }).limit(1)
  if (error || !data?.length) { afficherToast('Aucune sauvegarde disponible.', true); return }
  const s = data[0]
  const blob = new Blob([JSON.stringify(s.contenu)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `sauvegarde-suivipro-${dateLocaleISO(new Date(s.created_at))}.json`
  document.body.appendChild(a); a.click()
  setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href) }, 200)
  afficherToast(`Sauvegarde du ${new Date(s.created_at).toLocaleDateString('fr-FR')} téléchargée (${s.nb_lignes} lignes)`)
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
  document.querySelectorAll('.nav-item').forEach(n => { n.title = _sidebarCollapsed ? (n.dataset.label || '') : '' })
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
// ── FIL D'ARIANE ET RETOUR ──────────────────────────────────
// On mémorise la page quittée (et sa position) pour pouvoir y revenir exactement.
const LIBELLES_PAGES = { dashboard: 'Tableau de bord', projets: 'Projets', detail: 'Projet', taches: 'Tâches', employes: 'Équipe',
  clients: 'Clients', calendrier: 'Calendrier', recurrents: 'Récurrents', tournees: 'Tournées', factures: 'Factures',
  recouvrement: 'Recouvrement', archives: 'Archives' }
let _pageCourante = null
let _historiqueNav = []
let _retourEnCours = false

function retourPagePrecedente() {
  const e = _historiqueNav.pop()
  if (!e) return
  _retourEnCours = true
  if (e.page === 'clients') clSelection = e.client || null
  if (e.page === 'detail' && e.projet) ouvrirDetailProjet(e.projet)
  else showPage(e.page)
  _retourEnCours = false
  // Les pages se chargent en arrière-plan : on remet la position une fois le contenu arrivé
  ;[250, 800, 1600].forEach(t => setTimeout(() => window.scrollTo(0, e.scroll || 0), t))
  majFilAriane()
}

function majFilAriane() {
  const el = document.getElementById('fil-ariane')
  if (!el) return
  const page = _pageCourante
  const precedent = _historiqueNav[_historiqueNav.length - 1]
  const elements = []
  if (page === 'detail' && projetActif) elements.push([`showPage('projets')`, 'Projets'], [null, projetActif.nom])
  else if (page === 'clients' && clSelection) {
    const c = (typeof clListe !== 'undefined' ? clListe : []).find(x => x.id === clSelection)
    if (c) elements.push([`clSelection=null;chargerClients()`, 'Clients'], [null, c.nom])
  }
  if (!precedent && elements.length < 2) { el.style.display = 'none'; el.innerHTML = ''; return }
  const libellePrecedent = precedent ? (precedent.page === 'detail' && precedent.projet ? precedent.projet.nom : LIBELLES_PAGES[precedent.page] || precedent.page) : ''
  el.innerHTML = (precedent ? `<button class="fil-retour" onclick="retourPagePrecedente()" title="Revenir où tu étais (même liste, même position)">← ${esc(libellePrecedent)}</button>` : '')
    + (elements.length > 1 ? elements.map(([action, libelle], i) => i < elements.length - 1
        ? `<button onclick="${action}">${esc(libelle)}</button><span aria-hidden="true">›</span>`
        : `<span class="fil-actuel">${esc(libelle)}</span>`).join('') : '')
  el.style.display = 'flex'
}

function showPage(page) {
  // Mémoriser la page quittée pour le bouton Retour (pas quand on revient en arrière)
  if (!_retourEnCours && _pageCourante && (_pageCourante !== page || page === 'detail')) {
    _historiqueNav.push({ page: _pageCourante, scroll: window.scrollY, projet: _pageCourante === 'detail' ? projetActif : null,
      client: _pageCourante === 'clients' ? (typeof clSelection !== 'undefined' ? clSelection : null) : null })
    if (_historiqueNav.length > 20) _historiqueNav.shift()
  }
  _pageCourante = page
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  document.getElementById('page-' + page).classList.add('active')
  const navMap = { dashboard: 'dashboard', projets: 'projet', taches: 'tâche', employes: 'équipe', archives: 'archive', calendrier: 'calendrier', factures: 'factures', recouvrement: 'recouvrement', recurrents: 'récurrents', tournees: 'tournées', clients: 'clients' }
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
  if (page === 'tournees') chargerTournees()
  if (page === 'clients') chargerClients()
  // Mémoriser l'onglet courant pour le restaurer au rechargement
  // On exclut les sous-pages sans état propre (detail = vue d'un projet spécifique)
  if (page !== 'detail') localStorage.setItem('suivi_current_page', page)
  window.scrollTo(0, 0)
  majFilAriane()
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
  const btnSauv = document.getElementById('menu-sauvegarde')
  if (btnSauv) btnSauv.style.display = estAdmin() ? 'block' : 'none'
  // Afficher/masquer l'onglet Factures selon les droits
  const navFinance  = document.getElementById('nav-finance')
  const navSectionF = document.getElementById('nav-section-finance')
  const show = utilisateurAccesFactures ? 'block' : 'none'
  if (navFinance)  navFinance.style.display  = show
  if (navSectionF) navSectionF.style.display = show
}

async function ouvrirSelecteurUtilisateur() {
  // Changer de profil donnait les droits du profil choisi (ex. accès aux factures)
  // à n'importe qui : réservé aux administrateurs depuis l'arrivée des codes personnels.
  if (!estAdmin()) { alert('Pour utiliser un autre profil, déconnecte-toi puis entre le code de cette personne.'); return }
  document.getElementById('modal-selecteur-user').classList.remove('hidden')
  const { data } = await db.from('employes').select('id,nom,equipe,email,telephone,role,acces_factures,pin_a_changer,a_un_code').order('nom')
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
  chargerResumeJour()
  afficherSquelette('dashboard-projets-prioritaires', 'liste', 5)
  afficherSquelette('dashboard-mes-taches', 'liste', 5)
  const aujourd_hui = aujourdhuiISO()

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
    const six = projets.slice(0, 6)
    const av = await avancementProjets(six.map(p => p.id))
    const avecPct = six.map(p => ({ ...p, pct: av[p.id].pct }))

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
        <div style="font-size:28px;margin-bottom:8px;"><i class="ico ico-user"></i></div>
        <div style="font-weight:700;color:var(--ink);margin-bottom:4px;">Personnalisez votre dashboard</div>
        <div style="font-size:12.5px;color:var(--muted);margin-bottom:14px;">Sélectionnez votre profil pour voir vos tâches assignées</div>
        <button onclick="ouvrirSelecteurUtilisateur()" class="btn btn-primary" style="font-size:12.5px;">Choisir mon profil</button>
      </div>`
  }

  // ── Tâches en retard (globales) ──────────────────────────────
  const { data: retardBrut } = await db.from('taches')
    .select('*, projets(nom)')
    .lt('date_fin_prevue', aujourd_hui)
    .neq('statut', 'fait')
    .eq('archive', false)
    .order('date_fin_prevue', { ascending: true })

  const containerR = document.getElementById('dashboard-retard')
  const retard = retardBrut || []

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
      toutesLesLignes(() => db.from('factures').select('id,client,montant,solde,date_echeance').eq('solde', false)),
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

// ── RÉSUMÉ DU JOUR (haut du tableau de bord) ─────────────────
// Trois cartes : tournées du jour, récurrents à facturer, relances à faire.
async function chargerResumeJour() {
  const el = document.getElementById('dashboard-jour')
  if (!el) return
  afficherSquelette(el, 'cartes', utilisateurAccesFactures ? 3 : 2)
  const [tournees, recurrents, relances] = await Promise.all([
    resumeTourneesDuJour().catch(e => { console.error(e); return null }),
    resumeRecurrents().catch(e => { console.error(e); return null }),
    utilisateurAccesFactures ? resumeRelances().catch(e => { console.error(e); return null }) : Promise.resolve(null),
  ])
  el.innerHTML = [tournees, recurrents, relances].filter(Boolean).join('')
}

async function resumeTourneesDuJour() {
  const now = new Date(), jour = ((now.getDay() + 6) % 7) + 1
  const parite = getNumSemaine(now) % 2 === 0 ? 'paire' : 'impaire'
  const titre = `<div class="dash-carte-titre"><i class="ico ico-truck"></i> Tournées du jour</div>`
  if (jour > 5) return `<div class="dash-carte" onclick="showPage('tournees')">${titre}<div class="dash-carte-chiffre">—</div><div class="dash-carte-sous">Pas de tournée le week-end</div></div>`
  const [{ data: passages }, { data: ops }] = await Promise.all([
    db.from('tournee_passages').select('id,operateur_id,semaine,machines,tournee_clients(nom)').eq('jour', jour).in('semaine', ['toutes', parite]),
    db.from('tournee_operateurs').select('id,nom,couleur,ordre').order('ordre'),
  ])
  const liste = passages || []
  const parOp = (ops || []).map(o => ({ o, n: liste.filter(p => p.operateur_id === o.id).length })).filter(x => x.n)
  const nbMachines = liste.reduce((s, p) => s + (p.machines || []).length, 0)
  return `<div class="dash-carte" onclick="showPage('tournees')">
    ${titre}
    <div class="dash-carte-chiffre">${liste.length}</div>
    <div class="dash-carte-sous">passage${liste.length > 1 ? 's' : ''} · ${nbMachines} machine${nbMachines > 1 ? 's' : ''} · ${TR_JOURS[jour - 1].toLowerCase()} (semaine ${parite})</div>
    <div class="dash-carte-liste" style="display:flex;flex-wrap:wrap;gap:4px;">${parOp.map(({ o, n }) => { const k = TR_COULEURS[o.couleur] || TR_COULEURS.gray; return `<span class="tr-pill" style="background:${k[0]};color:${k[1]};">${esc(o.nom)} · ${n}</span>` }).join('') || '<span>Aucun passage prévu</span>'}</div>
  </div>`
}

async function resumeRecurrents() {
  const pm = periodeActionnable('mensuelle'), pt = periodeActionnable('trimestrielle')
  const perM = periodeMensuelle(pm.annee, pm.num), perT = periodeTrimestrielle(pt.annee, pt.num)
  const { data: contrats } = await db.from('contrats_recurrents').select('id,client,frequence,date_debut,date_fin').eq('actif', true)
  const ids = (contrats || []).map(c => c.id)
  const { data: rel } = ids.length ? await db.from('releves_recurrents').select('contrat_id,periode,fait').in('periode', [perM, perT]).in('contrat_id', ids) : { data: [] }
  const fait = new Set((rel || []).filter(r => r.fait).map(r => r.contrat_id + '|' + r.periode))
  const aFaire = (contrats || []).map(c => ({ c, p: c.frequence === 'mensuelle' ? perM : perT }))
    .filter(({ c, p }) => contratCouvrePeriode(c, p) && !fait.has(c.id + '|' + p))
  const nbM = aFaire.filter(x => x.p === perM).length, nbT = aFaire.length - nbM
  return `<div class="dash-carte" onclick="showPage('recurrents')">
    <div class="dash-carte-titre"><i class="ico ico-repeat"></i> Récurrents à facturer</div>
    <div class="dash-carte-chiffre" style="color:${aFaire.length ? 'var(--warn)' : 'var(--success)'};">${aFaire.length}</div>
    <div class="dash-carte-sous">${aFaire.length ? `${nbM} pour ${periodeLabel(perM)} · ${nbT} pour ${periodeLabel(perT)}` : `Tout est traité pour ${periodeLabel(perM)} et ${periodeLabel(perT)}`}</div>
    ${aFaire.length ? `<div class="dash-carte-liste">${aFaire.slice(0, 4).map(x => esc(x.c.client)).join(' · ')}${aFaire.length > 4 ? ` · +${aFaire.length - 4}` : ''}</div>` : ''}
  </div>`
}

async function resumeRelances() {
  const auj = aujourdhuiISO()
  const [{ data: exclus }, { data: factures }] = await Promise.all([
    db.from('clients_exclus').select('nom'),
    toutesLesLignes(() => db.from('factures').select('id,client,montant,montant_paye,date_echeance,date_relance,date_relance_r2,date_appel,moyen_paiement').eq('solde', false).eq('litige', false).lt('date_echeance', auj)),
  ])
  const nomsExclus = new Set((exclus || []).map(e => e.nom))
  const parClient = {}
  for (const f of factures || []) if (!nomsExclus.has(f.client)) (parClient[f.client] = parClient[f.client] || []).push(f)
  let r1 = 0, r2 = 0, montant = 0
  for (const facts of Object.values(parClient)) {
    const modes = {}; facts.forEach(f => { const m = (f.moyen_paiement || '').toLowerCase().trim(); if (m) modes[m] = (modes[m] || 0) + 1 })
    const dominant = Object.entries(modes).sort((a, b) => b[1] - a[1])[0]?.[0]
    if (dominant === 'espèce' || dominant === 'prélèvement') continue   // en attente de lettrage, pas de relance
    const r1Date = facts.find(f => f.date_relance)?.date_relance
    const aR2 = facts.some(f => f.date_relance_r2), appel = facts.some(f => f.date_appel)
    if (!r1Date) { r1++; montant += facts.reduce((s, f) => s + soldeRestant(f), 0) }
    else if (!aR2 && !appel && (new Date(auj) - new Date(r1Date)) / 86400000 >= 15) { r2++; montant += facts.reduce((s, f) => s + soldeRestant(f), 0) }
  }
  const total = r1 + r2
  return `<div class="dash-carte" onclick="showPage('recouvrement')">
    <div class="dash-carte-titre"><i class="ico ico-send"></i> Relances à faire</div>
    <div class="dash-carte-chiffre" style="color:${total ? 'var(--danger)' : 'var(--success)'};">${total}</div>
    <div class="dash-carte-sous">${total ? `client${total > 1 ? 's' : ''} · ${montant.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} € en jeu` : 'Aucune relance en attente'}</div>
    ${total ? `<div class="dash-carte-liste">${r1} à relancer (R1)${r2 ? ` · <b style="color:var(--danger);">${r2} R2 urgente${r2 > 1 ? 's' : ''}</b>` : ''}</div>` : ''}
  </div>`
}

// --- PROJETS ---
// Avancement de plusieurs projets en UNE requête (avant : 2 requêtes par projet)
async function avancementProjets(projetIds) {
  const res = {}
  projetIds.forEach(id => { res[id] = { total: 0, faites: 0, pct: 0 } })
  if (!projetIds.length) return res
  const { data } = await db.from('taches').select('projet_id,statut').in('projet_id', projetIds).eq('archive', false)
  for (const t of data || []) {
    const r = res[t.projet_id]; if (!r) continue
    r.total++; if (t.statut === 'fait') r.faites++
  }
  for (const r of Object.values(res)) r.pct = r.total ? Math.round((r.faites / r.total) * 100) : 0
  return res
}

function renderTabsProjet(counts) {
  const tabs = [
    { val: 'tous',       label: 'Tous',        count: counts.tous },
    { val: 'en cours',   label: 'Actifs',       count: counts['en cours'] },
    { val: 'en attente', label: 'En attente',   count: counts['en attente'] },
    { val: 'fait',       label: 'Terminés',     count: counts['fait'] },
  ]
  const equipes = [
    { val: 'tous',         label: 'Toutes les équipes' },
    { val: 'technique',    label: '<i class="ico ico-tool"></i> Technique' },
    { val: 'operationnel', label: '<i class="ico ico-settings"></i> Opérationnel' },
    { val: 'commercial',   label: '<i class="ico ico-briefcase"></i> Commercial' },
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
  afficherSquelette('liste-projets', 'liste', 6)
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
  const av = await avancementProjets(filtered.map(p => p.id))
  const projetsAvecPct = filtered.map(projet => ({ ...projet, ...av[projet.id] }))

  const aujourd_hui = aujourdhuiISO()

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
              const prefixe = enRetardProjet ? '⚑ ' : bientot ? '<i class="ico ico-alert"></i> ' : ''
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

// --- CORBEILLE (30 jours) ---
// La suppression et la restauration sont faites par le serveur, en une seule opération,
// avec tout ce qui dépend de l'élément (tâches d'un projet, assignés, commentaires, pièces jointes).
async function mettreALaCorbeille(type, id, message, rafraichir) {
  const { data: cid, error } = await db.rpc('mettre_a_la_corbeille', { p_type: type, p_id: id })
  if (error) { alert('Suppression impossible : ' + error.message); return false }
  afficherToast(message, false, async () => {
    const { error: e } = await db.rpc('restaurer_corbeille', { p_id: cid })
    if (e) throw e
    afficherToast('Élément restauré')
    if (rafraichir) rafraichir()
  })
  return true
}

async function chargerCorbeille() {
  const el = document.getElementById('liste-corbeille')
  if (!el) return
  const { data, error } = await db.from('corbeille').select('id,type,libelle,supprime_par,created_at').order('created_at', { ascending: false })
  if (error) { el.innerHTML = `<p style="color:var(--danger);">Corbeille indisponible : ${esc(error.message)}</p>`; return }
  if (!data.length) { el.innerHTML = '<p style="color:var(--text-muted);">La corbeille est vide.</p>'; return }
  const icone = { tache: 'check', projet: 'folder', employe: 'user', passage: 'truck' }
  el.innerHTML = data.map(c => {
    const restant = Math.max(0, 30 - Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000))
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface);">
      <div style="min-width:0;">
        <div style="font-weight:600;font-size:13px;color:var(--ink);"><i class="ico ico-${icone[c.type] || 'trash'}" style="color:var(--muted);"></i> ${esc(c.libelle)}</div>
        <div style="font-size:11px;color:var(--muted);">Supprimé le ${new Date(c.created_at).toLocaleDateString('fr-FR')}${c.supprime_par ? ` par ${esc(c.supprime_par)}` : ''} · ${restant > 0 ? `effacé définitivement dans ${restant} jour${restant > 1 ? 's' : ''}` : 'effacé cette nuit'}</div>
      </div>
      <button class="btn btn-secondary" style="font-size:12px;white-space:nowrap;" onclick="restaurerDepuisCorbeille(${c.id})">Restaurer</button>
    </div>`
  }).join('')
}

async function restaurerDepuisCorbeille(id) {
  const { data: libelle, error } = await db.rpc('restaurer_corbeille', { p_id: id })
  if (error) { alert('Restauration impossible : ' + error.message); return }
  afficherToast(`${libelle} restauré`)
  chargerArchives()
}

// --- ARCHIVES ---
async function chargerContratsArchives() {
  const el = document.getElementById('liste-contrats-archives')
  if (!el) return
  const { data } = await db.from('contrats_recurrents').select('id,client,numero_machine,type_prestation,frequence').eq('actif', false).order('client')
  if (!data || !data.length) { el.innerHTML = '<p style="color:var(--text-muted);">Aucun contrat récurrent archivé.</p>'; return }
  el.innerHTML = data.map(c => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface);opacity:0.85;">
      <div>
        <div style="font-weight:600;font-size:13px;">${c.client}${c.numero_machine ? `<span style="font-size:11px;color:var(--muted);font-weight:400;margin-left:6px;">#${c.numero_machine}</span>` : ''}</div>
        <div style="font-size:11px;color:var(--muted);">${typeLabel(c.type_prestation)} · ${c.frequence}</div>
      </div>
      <button class="btn btn-secondary" style="font-size:0.8rem;white-space:nowrap;" onclick="restaurerContrat('${c.id}')">↩ Restaurer</button>
    </div>`).join('')
}

async function chargerArchives() {
  chargerContratsArchives()
  chargerCorbeille()
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
        <button class="btn btn-danger" style="font-size:0.8rem; padding:0.4rem 0.8rem;" onclick="event.stopPropagation(); supprimerProjetDefinitif('${projet.id}', '${projet.nom.replace(/'/g, "\\'")}')" title="Supprimer définitivement"><i class="ico ico-trash"></i></button>
      </div>
    `
    card.addEventListener('click', () => ouvrirDetailProjet(projet))
    container.appendChild(card)
  }
}

async function archiverProjet() {
  if (!projetActif) return
  if (!await confirmer(`Archiver le projet "${projetActif.nom}" et toutes ses tâches ?`)) return
  await db.from('projets').update({ archive: true }).eq('id', projetActif.id)
  await db.from('taches').update({ archive: true }).eq('projet_id', projetActif.id)
  showPage('projets')
}

async function supprimerProjetDefinitif(id, nom) {
  if (!await confirmer(`Supprimer le projet « ${nom} » et toutes ses tâches ?\nIls restent récupérables 30 jours dans la Corbeille (ci-dessous).`)) return
  const ok = await mettreALaCorbeille('projet', id, 'Projet supprimé', chargerArchives)
  if (ok) chargerArchives()
}

async function desarchiverProjet(id) {
  await db.from('projets').update({ archive: false }).eq('id', id)
  await db.from('taches').update({ archive: false }).eq('projet_id', id)
  chargerArchives()
}

// --- DETAIL PROJET ---
async function ouvrirDetailProjet(projet) {
  vueProjet = 'liste'
  showPage('detail')        // mémorise d'abord le projet quitté (pour Retour)
  projetActif = projet
  majFilAriane()
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
  let query = db.from('taches').select('*, tache_assignations(employes(nom, equipe))').eq('projet_id', projetActif.id).order('created_at', { ascending: false })
  if (!projetActif.archive) query = query.eq('archive', false)
  const { data } = await query
  const container = document.getElementById('detail-taches')
  const kanbanEl = document.getElementById('detail-kanban')
  const ganttSection = document.getElementById('section-gantt')
  const aujourd_hui = aujourdhuiISO()

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

  const tachesAvecAssignations = data.map(t => ({ ...t, assignations: t.tache_assignations || [] }))

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
  const ancien = document.querySelector(`.kanban-card[data-id="${tacheId}"]`)?.dataset.statut
  if (ancien === nouveauStatut) return
  await changerStatutTacheVers(tacheId, ancien, nouveauStatut)
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
  pjEnAttente = []
  rafraichirPiecesJointesTache()
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
  await changerStatutTacheVers(id, statutActuel, nouveauStatut)
}

// Change le statut d'une tâche, signale une erreur, et propose d'annuler
async function changerStatutTacheVers(id, ancien, nouveau) {
  const recharger = () => projetActif ? chargerTachesDetail() : chargerTachesGlobal()
  const { data: t } = await db.from('taches').select('description').eq('id', id).single()
  const { error } = await db.from('taches').update({ statut: nouveau }).eq('id', id)
  if (error) { console.error(error); afficherToast('Statut non enregistré, réessaie.', true); recharger(); return }
  if (t) logAction('tache_statut', 'taches', id, `"${t.description}" → ${nouveau}`)
  if (ancien && ancien !== nouveau) afficherToast(`Tâche passée « ${nouveau} »`, false, async () => {
    const { error: e } = await db.from('taches').update({ statut: ancien }).eq('id', id)
    if (e) throw e
    afficherToast('Statut rétabli'); recharger()
  })
  recharger()
}

async function supprimerTache() {
  if (!tacheEnEdition) return
  if (!await confirmer('Supprimer cette tâche ?\nElle reste récupérable 30 jours dans Archives → Corbeille.')) return
  const id = tacheEnEdition.id
  const ok = await mettreALaCorbeille('tache', id, 'Tâche supprimée', () => projetActif ? chargerTachesDetail() : chargerTachesGlobal())
  if (!ok) return
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

// ── PIÈCES JOINTES DES TÂCHES (photos, PDF) ──────────────
const PJ_BUCKET     = 'pieces-jointes'
const PJ_TAILLE_MAX = 10 * 1024 * 1024
const PJ_TYPES      = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf']
let pjEnAttente = []   // fichiers choisis pendant la création d'une tâche (envoyés à l'enregistrement)
let pjUrlsTemp  = []   // aperçus temporaires des fichiers en attente (libérés à chaque rafraîchissement)

function echapperHtmlPJ(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function tailleLisiblePJ(octets) {
  if (!octets) return ''
  return octets < 1024 * 1024 ? `${Math.max(1, Math.round(octets / 1024))} Ko` : `${(octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`
}

function typeFichierPJ(f) {
  if (PJ_TYPES.includes(f.type)) return f.type
  const ext = (f.name.split('.').pop() || '').toLowerCase()
  return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf' }[ext] || null
}

// Réduit une photo à 1600 px max en JPEG (une photo de téléphone passe de ~5 Mo à ~0,4 Mo).
// Retourne null si le navigateur ne sait pas la décoder (ex. HEIC) : le fichier d'origine est alors envoyé tel quel.
async function reduireImagePJ(file) {
  try {
    let bmp
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }) }
    catch { bmp = await createImageBitmap(file) }
    const ratio = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const w = Math.round(bmp.width * ratio), h = Math.round(bmp.height * ratio)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bmp, 0, 0, w, h)
    if (bmp.close) bmp.close()
    return await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.82))
  } catch (e) { return null }
}

async function preparerFichierPJ(file) {
  const type = typeFichierPJ(file)
  if (!type) return { erreur: `« ${file.name} » : seuls les photos et les PDF sont acceptés.` }
  let blob = file, nom = file.name, mime = type
  if (type.startsWith('image/') && type !== 'image/gif') {
    const reduit = await reduireImagePJ(file)
    if (reduit && (reduit.size < file.size || file.size > PJ_TAILLE_MAX)) {
      blob = reduit; mime = 'image/jpeg'; nom = nom.replace(/\.[^.]+$/, '') + '.jpg'
    }
  }
  if (blob.size > PJ_TAILLE_MAX) return { erreur: `« ${file.name} » dépasse 10 Mo.` }
  return { blob, nom, type: mime }
}

// Envoie un fichier dans le stockage puis l'enregistre sur la tâche. Retourne un message d'erreur, ou null si tout va bien.
async function televerserPJ(tacheId, fichier) {
  const prep = await preparerFichierPJ(fichier)
  if (prep.erreur) return prep.erreur
  const ext = (prep.nom.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
  const chemin = `${tacheId}/${crypto.randomUUID()}.${ext}`
  const { error } = await db.storage.from(PJ_BUCKET).upload(chemin, prep.blob, { contentType: prep.type, upsert: false })
  if (error) { console.error(error); return `« ${fichier.name} » : envoi impossible.` }
  const { error: e2 } = await db.from('taches_pieces_jointes').insert({
    tache_id: tacheId, nom: prep.nom, chemin, type_mime: prep.type, taille: prep.blob.size, auteur: utilisateurActifNom || 'Anonyme'
  })
  if (e2) {
    console.error(e2)
    await db.storage.from(PJ_BUCKET).remove([chemin])
    return `« ${fichier.name} » : enregistrement impossible.`
  }
  return null
}

function choisirFichiersTache(input) {
  const fichiers = Array.from(input.files || [])
  input.value = ''   // permet de choisir à nouveau le même fichier
  ajouterFichiersTache(fichiers)
}

function deposerFichiersTache(ev) {
  ev.preventDefault()
  ev.currentTarget.style.background = ''
  ajouterFichiersTache(Array.from(ev.dataTransfer?.files || []))
}

async function ajouterFichiersTache(fichiers) {
  if (!fichiers.length) return
  const statut = document.getElementById('pj-tache-statut')
  const erreurs = []

  if (!tacheEnEdition) {
    // Création : on garde les fichiers jusqu'à l'enregistrement de la tâche
    for (const f of fichiers) {
      const type = typeFichierPJ(f)
      if (!type) erreurs.push(`« ${f.name} » : seuls les photos et les PDF sont acceptés.`)
      else if (type === 'application/pdf' && f.size > PJ_TAILLE_MAX) erreurs.push(`« ${f.name} » dépasse 10 Mo.`)
      else pjEnAttente.push(f)
    }
  } else {
    const tacheId = tacheEnEdition.id
    for (let i = 0; i < fichiers.length; i++) {
      if (statut) statut.textContent = `Envoi ${i + 1}/${fichiers.length}…`
      const e = await televerserPJ(tacheId, fichiers[i])
      if (e) erreurs.push(e)
    }
    if (statut) statut.textContent = ''
    if (erreurs.length < fichiers.length) logAction('piece_jointe', 'taches', tacheId, `Pièce jointe ajoutée à "${tacheEnEdition.description}"`)
  }

  await rafraichirPiecesJointesTache()
  if (erreurs.length) alert('Certains fichiers n\'ont pas été joints :\n' + erreurs.join('\n'))
}

async function rafraichirPiecesJointesTache() {
  const liste = document.getElementById('pj-tache-liste')
  if (!liste) return
  pjUrlsTemp.forEach(u => URL.revokeObjectURL(u))
  pjUrlsTemp = []

  let items = []
  if (tacheEnEdition) {
    const { data } = await db.from('taches_pieces_jointes').select('*').eq('tache_id', tacheEnEdition.id).order('created_at')
    // Fichiers privés : liens temporaires (1 h), valables seulement pour une personne connectée
    const chemins = (data || []).map(p => p.chemin)
    const { data: liens } = chemins.length ? await db.storage.from(PJ_BUCKET).createSignedUrls(chemins, 3600) : { data: [] }
    const urlDe = Object.fromEntries((liens || []).map(l => [l.path, l.signedUrl]))
    items = (data || []).map(p => ({
      nom: p.nom, mime: p.type_mime, taille: p.taille,
      url: urlDe[p.chemin] || '#',
      retirer: `supprimerPieceJointe('${p.id}')`
    }))
  } else {
    items = pjEnAttente.map((f, i) => {
      const url = URL.createObjectURL(f); pjUrlsTemp.push(url)
      return { nom: f.name, mime: typeFichierPJ(f), taille: f.size, url, retirer: `retirerPieceEnAttente(${i})` }
    })
  }

  liste.innerHTML = items.map(it => {
    const nom = echapperHtmlPJ(it.nom)
    const estImage = (it.mime || '').startsWith('image/')
    const tuileFixe = 'display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;font-size:22px;gap:2px;'
    const apercu = estImage
      ? `<img src="${it.url}" alt="${nom}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div style="display:none;${tuileFixe}"><i class="ico ico-photo"></i></div>`
      : `<div style="${tuileFixe}"><i class="ico ico-file"></i><span style="font-size:10px;font-weight:700;color:var(--muted);">PDF</span></div>`
    return `<div style="position:relative;width:84px;">
      <a href="${it.url}" target="_blank" rel="noopener" title="${nom}${it.taille ? ' · ' + tailleLisiblePJ(it.taille) : ''}"
         style="display:block;width:84px;height:84px;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--surface-alt);text-decoration:none;color:inherit;">${apercu}</a>
      <button type="button" onclick="${it.retirer}" title="Retirer"
        style="position:absolute;top:-7px;right:-7px;width:20px;height:20px;border-radius:50%;border:1px solid var(--border);background:#fff;cursor:pointer;font-size:13px;line-height:1;padding:0;color:var(--danger);">×</button>
      <div style="font-size:10.5px;color:var(--muted);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${nom}">${nom}</div>
    </div>`
  }).join('')
}

function retirerPieceEnAttente(i) {
  pjEnAttente.splice(i, 1)
  rafraichirPiecesJointesTache()
}

async function supprimerPieceJointe(id) {
  if (!await confirmer('Supprimer cette pièce jointe ?')) return
  const { data: pj } = await db.from('taches_pieces_jointes').select('chemin,nom').eq('id', id).single()
  if (!pj) return
  const { error } = await db.from('taches_pieces_jointes').delete().eq('id', id)
  if (error) { console.error(error); alert('Suppression impossible.'); return }
  await db.storage.from(PJ_BUCKET).remove([pj.chemin])
  if (tacheEnEdition) logAction('piece_jointe', 'taches', tacheEnEdition.id, `Pièce jointe retirée de "${tacheEnEdition.description}"`)
  rafraichirPiecesJointesTache()
}

// Envoie les fichiers choisis à la création, une fois la tâche enregistrée
async function televerserPiecesEnAttente(tacheId) {
  if (!pjEnAttente.length) return
  const fichiers = pjEnAttente.slice()
  pjEnAttente = []
  const btn = document.querySelector('#modal-tache .btn-primary')
  const texte = btn?.textContent
  const erreurs = []
  for (let i = 0; i < fichiers.length; i++) {
    if (btn) { btn.disabled = true; btn.textContent = `Envoi des fichiers (${i + 1}/${fichiers.length})…` }
    const e = await televerserPJ(tacheId, fichiers[i])
    if (e) erreurs.push(e)
  }
  if (btn) { btn.disabled = false; btn.textContent = texte }
  if (erreurs.length < fichiers.length) logAction('piece_jointe', 'taches', tacheId, 'Pièce(s) jointe(s) ajoutée(s) à la création')
  if (erreurs.length) alert('Certains fichiers n\'ont pas été joints :\n' + erreurs.join('\n'))
}

// Supprime les fichiers du stockage quand leurs tâches sont supprimées (les lignes disparaissent d'elles-mêmes)
async function supprimerPiecesJointesDeTaches(tacheIds) {
  if (!tacheIds.length) return
  const { data } = await db.from('taches_pieces_jointes').select('chemin').in('tache_id', tacheIds)
  const chemins = (data || []).map(p => p.chemin)
  if (chemins.length) await db.storage.from(PJ_BUCKET).remove(chemins)
}

// --- TACHES GLOBAL ---
function renderFiltresTache() {
  const statuts = [
    { val: 'tous',       label: 'Tous' },
    { val: 'en cours',   label: 'En cours' },
    { val: 'en attente', label: 'En attente' },
    { val: 'fait',       label: 'Fait' },
    { val: 'urgent',     label: 'Urgentes' },
    { val: 'retard',     label: 'En retard' }
  ]
  const equipes = [
    { val: 'tous',           label: 'Toutes' },
    { val: 'technique',      label: '<i class="ico ico-tool"></i> Technique' },
    { val: 'operationnel',   label: '<i class="ico ico-settings"></i> Opérationnel' },
    { val: 'commercial',     label: '<i class="ico ico-briefcase"></i> Commercial' },
  ]
  const actifS = v => v === 'tous' ? filtresTacheStatut.size === 0 : filtresTacheStatut.has(v)
  const actifE = v => v === 'tous' ? filtresTacheEquipe.size === 0 : filtresTacheEquipe.has(v)
  return `
    <div style="display:flex; gap:0.4rem; flex-wrap:wrap; margin-bottom:0.5rem; align-items:center;">
      ${statuts.map(s => `<button onclick="toggleFiltreTacheStatut('${s.val}')" style="background:${actifS(s.val) ? 'var(--ink)' : 'var(--surface)'};color:${actifS(s.val) ? '#fff' : 'var(--muted)'};border:1px solid ${actifS(s.val) ? 'var(--ink)' : 'var(--border)'};cursor:pointer;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:${actifS(s.val) ? '600' : '400'};font-family:inherit;white-space:nowrap;">${s.label}</button>`).join('')}
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
  afficherSquelette('liste-taches-global', 'liste', 8)
  const aujourd_hui = aujourdhuiISO()

  // Filtre visible uniquement en vue liste
  const filterEl = document.getElementById('filtres-taches')
  if (filterEl) filterEl.style.display = vueTachesGlobal === 'liste' ? 'block' : 'none'
  if (filterEl && vueTachesGlobal === 'liste') filterEl.innerHTML = renderFiltresTache()

  // Basculer les conteneurs
  const listeEl  = document.getElementById('liste-taches-global')
  const kanbanEl = document.getElementById('kanban-taches-global')
  if (listeEl)  listeEl.style.display  = vueTachesGlobal === 'liste'  ? 'block' : 'none'
  if (kanbanEl) kanbanEl.style.display = vueTachesGlobal === 'kanban' ? 'block' : 'none'

  const { data } = await db.from('taches').select('*, projets(nom, equipe), tache_assignations(employes(nom, equipe))').eq('archive', false).order('date_fin_prevue', { ascending: true })
  if (!data || !data.length) {
    if (listeEl) listeEl.innerHTML = '<p style="color:var(--muted);">Aucune tâche.</p>'
    return
  }

  const tachesAvecAssignations = data.map(t => ({ ...t, assignations: t.tache_assignations || [] }))

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
  afficherSquelette('liste-employes', 'cartes', 4)
  const { data } = await db.from('employes').select('id,nom,equipe,email,telephone,role,acces_factures,pin_a_changer,a_un_code').order('nom')
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
          ${estAdmin() ? (e.a_un_code ? `<div style="font-size:0.7rem;color:var(--success);margin-top:4px;"><i class="ico ico-key"></i> Code configuré${e.pin_a_changer ? ' (provisoire)' : ''}</div>` : `<div style="font-size:0.7rem;color:var(--danger);margin-top:4px;">Pas de code : ne peut pas se connecter</div>`) : ''}
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
  if (inputPin)  inputPin.value  = ''
  const etatPin = document.getElementById('employe-pin-etat')
  if (etatPin) etatPin.textContent = e.a_un_code
    ? (e.pin_a_changer ? 'Code provisoire en place : la personne choisira le sien à la connexion.' : 'La personne a son propre code (il n\'est jamais affiché).')
    : 'Aucun code : cette personne ne peut pas se connecter.'

  document.getElementById('modal-employe').classList.remove('hidden')
}

async function supprimerEmploye() {
  const id = document.getElementById('input-employe-id').value
  const nom = document.getElementById('input-employe-nom').value
  if (!await confirmer(`Supprimer ${nom} de l'équipe ?\nRécupérable 30 jours dans Archives → Corbeille (il faudra lui redonner un code).`)) return
  const ok = await mettreALaCorbeille('employe', id, `${nom} retiré de l'équipe`, chargerEmployes)
  if (!ok) return
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
  pjEnAttente = []
  rafraichirPiecesJointesTache()
  document.getElementById('modal-tache').classList.remove('hidden')
}

function ouvrirModalEmploye() {
  document.getElementById('modal-employe-titre').textContent = 'Nouveau membre'
  document.getElementById('input-employe-id').value = ''
  document.getElementById('input-employe-nom').value = ''
  document.getElementById('input-employe-email').value = ''
  document.getElementById('input-employe-telephone').value = ''
  // Sans cette remise à zéro, un nouveau membre héritait du rôle et du code
  // du dernier membre ouvert (et l'enregistrement échouait : « code déjà utilisé »)
  const sectionAdmin = document.getElementById('section-admin-employe')
  if (sectionAdmin) sectionAdmin.style.display = estAdmin() ? 'block' : 'none'
  const inputRole = document.getElementById('input-employe-role')
  const inputPin  = document.getElementById('input-employe-pin')
  if (inputRole) inputRole.value = 'operationnel'
  if (inputPin)  inputPin.value  = ''
  const etatPinN = document.getElementById('employe-pin-etat')
  if (etatPinN) etatPinN.textContent = 'Donne un code provisoire : la personne choisira le sien à sa première connexion.'
  document.getElementById('btn-supprimer-employe').style.display = 'none'
  document.getElementById('modal-employe').classList.remove('hidden')
}

function fermerModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'))
  tacheEnEdition = null
  pjEnAttente = []
  pjUrlsTemp.forEach(u => URL.revokeObjectURL(u))
  pjUrlsTemp = []
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
    ouvrirPalette()
    return
  }

  if (isInput) return

  // / : recherche rapide (quand on n'est pas en train d'écrire)
  if (e.key === '/') { e.preventDefault(); ouvrirPalette(); return }

  // ? : aide
  if (e.key === '?' || (e.shiftKey && e.key === '/')) {
    e.preventDefault()
    afficherAidRaccourcis()
    return
  }

  // N : nouvelle tâche (si l'utilisateur est sur une page où c'est possible)
  if (e.key === 'n' || e.key === 'N') {
    const btnNouv = document.querySelector('.page.active [onclick^="ouvrirModalTache"]')
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

// --- NOTIFICATIONS (création/modification tâche ou projet) ---
// Journalise l'événement (pour le pop-up "nouveautés") et envoie un mail
// aux personnes concernées. N'échoue jamais bruyamment : un souci d'envoi
// ne doit pas empêcher la sauvegarde de la tâche/du projet.
async function notifierChangement(type, action, titre, contexte, destinataires) {
  try {
    await db.from('notifications_activite').insert({
      type, action, titre, contexte: contexte || null, auteur: utilisateurActifNom || null
    })
  } catch (e) { console.error('notifierChangement journal error', e) }

  const emails = [...new Set((destinataires || []).filter(Boolean))]
  if (!emails.length) return

  const typeLabel   = type === 'tache' ? 'Tâche' : 'Projet'
  const masculin    = type === 'projet'
  const actionLabel = action === 'creation' ? (masculin ? 'créé' : 'créée') : (masculin ? 'modifié' : 'modifiée')
  const emoji        = action === 'creation' ? '🆕' : '✏️'
  const subject = `${emoji} ${typeLabel} ${actionLabel} : ${titre}`
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;padding:20px;">
      <div style="border-bottom:2px solid #EE7E24;padding-bottom:10px;margin-bottom:16px;">
        <span style="font-weight:700;font-size:16px;color:#EE7E24;">SuiviPro</span>
      </div>
      <p style="font-size:15px;color:#1a1815;margin:0 0 6px;"><b>${typeLabel} ${actionLabel}</b>${contexte ? ` — ${contexte}` : ''}</p>
      <p style="font-size:14px;color:#3a3733;margin:0 0 16px;">${titre}</p>
      <p style="font-size:12px;color:#7a766f;margin:0;">Par ${utilisateurActifNom || 'un utilisateur'} · ${new Date().toLocaleString('fr-FR')}</p>
      <p style="font-size:11.5px;color:#9ca3af;margin-top:20px;border-top:1px solid #eee;padding-top:12px;">Connectez-vous à SuiviPro pour voir le détail.</p>
    </div>`

  try {
    await fetch(`${SUPABASE_URL}/functions/v1/notifier-equipe`, {
      method: 'POST',
      headers: await enteteSession(),
      body: JSON.stringify({ to: emails, subject, html })
    })
  } catch (e) { console.error('notifierChangement email error', e) }
}

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

  // Notifier l'équipe du projet (pas d'assignation individuelle sur les projets) — en tâche de fond
  db.from('employes').select('email').eq('equipe', payload.equipe).then(({ data: employesEquipe }) => {
    notifierChangement('projet', id ? 'modification' : 'creation', nom, payload.client || null,
      (employesEquipe || []).map(e => e.email))
  })

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
  const idsAssignes = Array.from(checkboxes).map(cb => cb.value)
  if (idsAssignes.length > 0 && tacheId) {
    const assignations = idsAssignes.map(employe_id => ({ tache_id: tacheId, employe_id }))
    await db.from('tache_assignations').insert(assignations)
  }

  // Pièces jointes choisies pendant la création : envoyées maintenant que la tâche existe
  await televerserPiecesEnAttente(tacheId)

  // Notifier les assignés — en tâche de fond, sans ralentir la fermeture du modal.
  // On capture l'action et le projet avant fermerModals() qui réinitialise tacheEnEdition/projetActif.
  const actionTache = tacheEnEdition ? 'modification' : 'creation'
  const nomProjetTache = projetActif?.nom || null
  if (idsAssignes.length > 0) {
    db.from('employes').select('email').in('id', idsAssignes).then(({ data: employesAssignes }) => {
      notifierChangement('tache', actionTache, desc, nomProjetTache, (employesAssignes || []).map(e => e.email))
    })
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
    if (pin && !/^\d{6}$/.test(pin)) { alert('Le code doit faire exactement 6 chiffres.'); return }
  }
  const pin = estAdmin() ? (document.getElementById('input-employe-pin')?.value.trim() || '') : ''

  let res
  if (id) {
    res = await db.from('employes').update(payload).eq('id', id).select('id').single()
  } else {
    res = await db.from('employes').insert(payload).select('id').single()
  }
  if (res.error) {
    alert(res.error.code === '42501' || /row-level security/i.test(res.error.message)
      ? 'Seul un administrateur peut modifier l\'équipe.'
      : 'Erreur : ' + res.error.message)
    return
  }
  // Code provisoire : chiffré et vérifié par le serveur (jamais stocké en clair)
  if (pin) {
    const { error } = await db.rpc('definir_code_employe', { p_employe: res.data.id, p_code: pin })
    if (error) { alert('Membre enregistré, mais le code n\'a pas été accepté : ' + error.message); chargerEmployes(); return }
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

// --- POP-UP NOUVEAUTÉS ---
const CLE_NOTIFS_VUES = 'suivi_dernieres_notifs_vues'

// La cloche du menu montre le nombre de nouveautés (tâches/projets créés ou
// modifiés par les autres) depuis la dernière ouverture du panneau.
let _notifs = []
function notifsNonLues() {
  const vue = localStorage.getItem(CLE_NOTIFS_VUES) || ''
  return _notifs.filter(n => n.created_at > vue && n.auteur !== utilisateurActifNom)
}
async function verifierNouvellesNotifications() {
  const { data, error } = await db.from('notifications_activite').select('*').order('created_at', { ascending: false }).limit(30)
  if (error || !data) return
  _notifs = data
  // Première utilisation sur cet appareil : pas de rattrapage, tout est considéré comme vu
  if (!localStorage.getItem(CLE_NOTIFS_VUES) && data.length) localStorage.setItem(CLE_NOTIFS_VUES, data[0].created_at)
  majCompteurNotifs()
  if (document.getElementById('panneau-notifs')?.style.display === 'block') afficherPanneauNotifs(false)
}
function majCompteurNotifs() {
  const n = notifsNonLues().length
  const c = document.getElementById('cloche-compteur')
  if (!c) return
  c.textContent = n > 9 ? '9+' : n
  c.style.display = n ? 'block' : 'none'
  document.getElementById('cloche-notifs').title = n ? `${n} nouveauté${n > 1 ? 's' : ''}` : 'Nouveautés'
}
function afficherPanneauNotifs(marquerLues = true) {
  const liste = document.getElementById('panneau-notifs-liste')
  const nonLues = new Set(notifsNonLues().map(n => n.id))
  document.getElementById('panneau-notifs-info').textContent = nonLues.size ? `${nonLues.size} nouvelle${nonLues.size > 1 ? 's' : ''}` : 'À jour'
  liste.innerHTML = _notifs.length ? _notifs.map(n => {
    const masc = n.type === 'projet'
    const action = n.action === 'creation' ? (masc ? 'créé' : 'créée') : (masc ? 'modifié' : 'modifiée')
    const quand = new Date(n.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    return `<div class="notif-ligne ${nonLues.has(n.id) ? 'non-lue' : ''}">
      <span style="color:var(--muted);font-size:14px;margin-top:1px;"><i class="ico ico-${n.action === 'creation' ? 'plus' : 'pencil'}"></i></span>
      <div style="min-width:0;">
        <div style="font-size:12px;font-weight:600;color:var(--ink);">${n.type === 'tache' ? 'Tâche' : 'Projet'} ${action}</div>
        <div style="font-size:12px;color:var(--ink-soft);margin-top:1px;">${esc(n.titre)}${n.contexte ? ` <span style="color:var(--muted);">· ${esc(n.contexte)}</span>` : ''}</div>
        <div style="font-size:10.5px;color:var(--muted);margin-top:2px;">${esc([n.auteur, quand].filter(Boolean).join(' · '))}</div>
      </div>
    </div>`
  }).join('') : '<div style="padding:24px 14px;text-align:center;color:var(--muted);font-size:12.5px;">Aucune nouveauté pour l\'instant.</div>'
  if (marquerLues && _notifs.length) { localStorage.setItem(CLE_NOTIFS_VUES, _notifs[0].created_at); majCompteurNotifs() }
}
function basculerPanneauNotifs(e) {
  e?.stopPropagation()
  const p = document.getElementById('panneau-notifs')
  if (p.style.display === 'block') { p.style.display = 'none'; return }
  afficherPanneauNotifs(true)
  p.style.display = 'block'
}
document.addEventListener('click', e => {
  const p = document.getElementById('panneau-notifs')
  if (p && p.style.display === 'block' && !e.target.closest('#panneau-notifs') && !e.target.closest('#cloche-notifs')) p.style.display = 'none'
})
// Vérification légère toutes les 2 minutes et au retour sur l'onglet
setInterval(() => { if (!document.hidden) verifierNouvellesNotifications() }, 2 * 60 * 1000)
document.addEventListener('visibilitychange', () => { if (!document.hidden) verifierNouvellesNotifications() })

// --- INIT --- (lancé tout en bas du fichier, une fois toutes les variables déclarées)
function demarrerApplication() {
  mettreAJourSidebarUser()
  const pageSauvegardee = localStorage.getItem('suivi_current_page')
  if (pageSauvegardee && document.getElementById('page-' + pageSauvegardee)) {
    showPage(pageSauvegardee)
  } else {
    chargerDashboard()
  }
  chargerEmployes()
  verifierNouvellesNotifications()
}
// --- CALENDRIER ---
let calDate = new Date()
let calType = 'projets' // projets ou taches
let calVue = 'mensuelle' // mensuelle ou timeline

function toggleCalType() {
  calType = calType === 'projets' ? 'taches' : 'projets'
  document.getElementById('toggle-cal-type').textContent = calType === 'projets' ? 'Afficher : projets' : 'Afficher : tâches'
  afficherCalendrier()
}

function toggleCalVue() {
  calVue = calVue === 'mensuelle' ? 'timeline' : 'mensuelle'
  document.getElementById('toggle-cal-vue').textContent = calVue === 'mensuelle' ? 'Vue chronologique' : 'Vue mensuelle'
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
    const curStr = dateLocaleISO(cur)
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
    headerJours += `<div style="position:absolute; left:${(i-1)*largeurJour}px; width:${largeurJour}px; text-align:center; font-size:0.65rem; color:${isToday ? 'var(--brand)' : isWeekend ? '#ccc' : 'var(--text-muted)'}; font-weight:${isToday ? '700' : '400'};">${i}</div>`
  }

  // Lignes fond
  let fond = ''
  for (let i = 1; i <= nbJours; i++) {
    const d = new Date(annee, mois, i)
    const isToday = d.getTime() === aujourd_hui.getTime()
    const isWeekend = d.getDay() === 0 || d.getDay() === 6
    if (isWeekend) fond += `<div style="position:absolute; left:${(i-1)*largeurJour}px; top:0; width:${largeurJour}px; height:100%; background:rgba(0,0,0,0.03);"></div>`
    if (isToday) fond += `<div style="position:absolute; left:${(i-1)*largeurJour}px; top:0; width:2px; height:100%; background:var(--brand);"></div>`
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
    commentaire:      '<i class="ico ico-message"></i>',
    projet_statut:    '<i class="ico ico-folder"></i>',
    tournee:          '<i class="ico ico-truck"></i>',
    contrat:          '<i class="ico ico-repeat"></i>',
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
// Tableau des factures : tri, période et colonnes affichées (mémorisés sur cet appareil)
const FAC_COLONNES_OPTION = { contact: 'Contact', emission: 'Émission', paye: 'Payé le', relance: 'Relance', note: 'Note' }
let triFactures = { col: 'echeance', sens: -1 }
let periodeFactures = { type: 'toutes', du: '', au: '' }
let colonnesMasqueesFactures = new Set()
try {
  const pref = JSON.parse(localStorage.getItem('fac_prefs') || '{}')
  if (pref.tri) triFactures = pref.tri
  if (pref.periode) periodeFactures = pref.periode
  if (pref.masquees) colonnesMasqueesFactures = new Set(pref.masquees)
} catch (e) {}
function sauverPrefsFactures() {
  try { localStorage.setItem('fac_prefs', JSON.stringify({ tri: triFactures, periode: periodeFactures, masquees: [...colonnesMasqueesFactures] })) } catch (e) {}
}
function trierFactures(col) {
  triFactures = triFactures.col === col ? { col, sens: -triFactures.sens } : { col, sens: ['client', 'numero'].includes(col) ? 1 : -1 }
  sauverPrefsFactures(); facturesPage = 1; chargerFactures()
}
function changerPeriodeFactures(type) {
  periodeFactures.type = type
  if (type !== 'perso') { periodeFactures.du = ''; periodeFactures.au = '' }
  sauverPrefsFactures(); facturesPage = 1; chargerFactures()
}
function changerDatesPeriodeFactures(champ, valeur) {
  periodeFactures[champ] = valeur; periodeFactures.type = 'perso'
  sauverPrefsFactures(); facturesPage = 1; chargerFactures()
}
function basculerColonneFactures(col) {
  colonnesMasqueesFactures.has(col) ? colonnesMasqueesFactures.delete(col) : colonnesMasqueesFactures.add(col)
  sauverPrefsFactures()
  appliquerColonnesFactures()
}
function appliquerColonnesFactures() {
  let st = document.getElementById('style-colonnes-factures')
  if (!st) { st = document.createElement('style'); st.id = 'style-colonnes-factures'; document.head.appendChild(st) }
  st.textContent = [...colonnesMasqueesFactures].map(c => `#table-factures [data-col="${c}"]{display:none}`).join('')
  document.querySelectorAll('#menu-colonnes-factures input[data-col]').forEach(cb => { cb.checked = !colonnesMasqueesFactures.has(cb.dataset.col) })
}
// Bornes (AAAA-MM-JJ) de la période choisie, sur la date d'émission
function bornesPeriodeFactures() {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth()
  const d = (a, mo, j) => dateLocaleISO(new Date(a, mo, j))
  switch (periodeFactures.type) {
    case 'mois':         return [d(y, m, 1), d(y, m + 1, 0)]
    case 'mois_dernier': return [d(y, m - 1, 1), d(y, m, 0)]
    case '3mois':        return [d(y, m - 2, 1), d(y, m + 1, 0)]
    case 'annee':        return [`${y}-01-01`, `${y}-12-31`]
    case 'annee_derniere': return [`${y - 1}-01-01`, `${y - 1}-12-31`]
    case 'perso':        return [periodeFactures.du || '0000-01-01', periodeFactures.au || '9999-12-31']
    default:             return null
  }
}
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
  if (!e.target.closest('#menu-colonnes-factures') && !e.target.closest('[onclick*="menu-colonnes-factures"]')) {
    const m = document.getElementById('menu-colonnes-factures'); if (m) m.style.display = 'none'
  }
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
  const avant = (window._toutesFactures || []).find(f => f.id === id)?.[champ] ?? null
  if (val === avant) { chargerFactures(); return }
  const { error } = await db.from('factures').update({ [champ]: val }).eq('id', id)
  if (error) { afficherToast('Contact non enregistré, réessaie.', true); return }
  journalFactures([id], 'facture_contact', `${champ === 'email_client' ? 'Mail' : 'Téléphone'} : ${avant || '—'} → ${val || '—'}`)
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
  afficherSquelette('liste-factures', 'liste', 10)
  if (!utilisateurAccesFactures) {
    document.getElementById('liste-factures').innerHTML = '<p style="color:var(--muted);">Accès restreint.</p>'
    return
  }
  // Charger la liste d'exclusion ET le panel en parallèle
  const [{ data: exclusData }, { data: factures }] = await Promise.all([
    db.from('clients_exclus').select('nom'),
    toutesLesLignes(() => db.from('factures').select('*').order('date_echeance', { ascending: false }))
  ])
  chargerClientsExclus()

  const nomsExclus = new Set((exclusData || []).map(e => e.nom))
  const aujourd_hui = aujourdhuiISO()

  // Exclure les clients masqués de TOUT l'affichage et des stats
  const toutes   = (factures || []).filter(f => !nomsExclus.has(f.client))
  window._toutesFactures = toutes   // utilisé par ouvrirModalRelance
  const nonSolde = toutes.filter(f => !f.solde)
  // Ne pas compter les factures en litige dans les retards
  const enRetard = nonSolde.filter(f => !f.litige && f.date_echeance && f.date_echeance < aujourd_hui)
  const montantTotal  = nonSolde.reduce((s, f) => s + (parseFloat(f.montant) || 0), 0)
  const montantRetard = enRetard.reduce((s, f) => s + (parseFloat(f.montant) || 0), 0)

  // Bandeau J+3 : factures dont l'échéance était il y a exactement 3 jours et non en litige
  const j3 = new Date(); j3.setDate(j3.getDate() - 3); const hierStr = dateLocaleISO(j3)
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
    { val:'acompte',  label:'<i class="ico ico-coin"></i> Avec acompte' }
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
      <select onchange="changerPeriodeFactures(this.value)" title="Filtrer par date d'émission"
        style="padding:5px 10px;border:1px solid ${periodeFactures.type !== 'toutes' ? 'var(--brand)' : 'var(--border)'};border-radius:20px;font-size:12px;font-family:inherit;background:var(--surface);color:var(--ink);cursor:pointer;">
        ${[['toutes', 'Émises : toutes dates'], ['mois', 'Émises ce mois-ci'], ['mois_dernier', 'Émises le mois dernier'], ['3mois', 'Émises ces 3 derniers mois'], ['annee', 'Émises cette année'], ['annee_derniere', "Émises l'année dernière"], ['perso', 'Émises entre deux dates…']]
          .map(([v, l]) => `<option value="${v}" ${periodeFactures.type === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      ${periodeFactures.type === 'perso' ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--muted);">du <input type="date" value="${periodeFactures.du}" onchange="changerDatesPeriodeFactures('du', this.value)" style="font-size:12px;padding:3px 6px;border:1px solid var(--border);border-radius:6px;font-family:inherit;"> au <input type="date" value="${periodeFactures.au}" onchange="changerDatesPeriodeFactures('au', this.value)" style="font-size:12px;padding:3px 6px;border:1px solid var(--border);border-radius:6px;font-family:inherit;"></span>` : ''}
      <div style="position:relative;">
        <button onclick="const m=document.getElementById('menu-colonnes-factures');m.style.display=m.style.display==='block'?'none':'block'" style="padding:5px 12px;border:1px solid var(--border);border-radius:20px;font-size:12px;font-family:inherit;background:var(--surface);color:var(--muted);cursor:pointer;">☰ Colonnes</button>
        <div id="menu-colonnes-factures" style="display:none;position:absolute;left:0;top:calc(100% + 4px);background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.1);z-index:100;padding:8px 12px;min-width:170px;">
          ${Object.entries(FAC_COLONNES_OPTION).map(([c, l]) => `<label style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12.5px;cursor:pointer;"><input type="checkbox" data-col="${c}" ${colonnesMasqueesFactures.has(c) ? '' : 'checked'} onchange="basculerColonneFactures('${c}')"> ${l}</label>`).join('')}
        </div>
      </div>
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

  // Filtrer (statut multi-select + client + période d'émission)
  const bornesP = bornesPeriodeFactures()
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
    const okPeriode = !bornesP || (f.date_emission && f.date_emission >= bornesP[0] && f.date_emission <= bornesP[1])
    return okStatut && okClient && okPeriode
  })
  // Tri (clic sur un en-tête de colonne) ; à égalité, échéance la plus récente d'abord
  const joursRetardF = f => (!f.solde && f.date_echeance && f.date_echeance < aujourd_hui) ? Math.floor((new Date(aujourd_hui) - new Date(f.date_echeance)) / 86400000) : -1
  const cleTri = {
    numero: f => f.numero || '', client: f => (f.client || '').toLowerCase(), montant: f => parseFloat(f.montant) || 0,
    emission: f => f.date_emission || '', echeance: f => f.date_echeance || '', statut: joursRetardF, paye: f => f.date_paiement || '',
  }[triFactures.col] || (f => f.date_echeance || '')
  filtered.sort((a, b) => {
    const x = cleTri(a), y = cleTri(b)
    const c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'fr')
    return c !== 0 ? c * triFactures.sens : String(b.date_echeance || '').localeCompare(String(a.date_echeance || ''))
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
    <div style="background:var(--surface); border:1px solid var(--border); border-radius:12px; overflow:auto; max-height:calc(100vh - 230px);">
      <table id="table-factures" style="width:100%; border-collapse:separate; border-spacing:0; font-size:12.5px; min-width:1100px;">
        <thead>
          <tr>
            ${(() => {
              const th = 'position:sticky;top:0;z-index:2;background:var(--surface-alt);border-bottom:1px solid var(--border);padding:10px 16px;font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;font-weight:600;white-space:nowrap;'
              const triable = (col, libelle, align = 'left', dataCol = '') => {
                const actif = triFactures.col === col
                return `<th ${dataCol ? `data-col="${dataCol}"` : ''} onclick="trierFactures('${col}')" title="Trier par ${libelle.toLowerCase()}" style="${th}text-align:${align};cursor:pointer;user-select:none;${actif ? 'color:var(--brand-deep);' : ''}">${libelle} <span style="opacity:${actif ? 1 : 0.3};">${actif ? (triFactures.sens > 0 ? '▲' : '▼') : '↕'}</span></th>`
              }
              const simple = (libelle, align = 'left', dataCol = '') => `<th ${dataCol ? `data-col="${dataCol}"` : ''} style="${th}text-align:${align};">${libelle}</th>`
              return `<th style="${th}padding:10px 8px 10px 16px;width:32px;"><input type="checkbox" id="bulk-checkall" onchange="bulkToggleAll(this.checked)" style="cursor:pointer;" /></th>`
                + triable('numero', 'N° Facture') + triable('client', 'Client') + simple('Contact', 'left', 'contact')
                + triable('montant', 'Montant', 'right') + triable('emission', 'Émission', 'left', 'emission') + triable('echeance', 'Échéance')
                + triable('statut', 'Statut') + triable('paye', 'Payé le', 'left', 'paye') + simple('Relance', 'left', 'relance')
                + simple('Note', 'left', 'note') + simple('Action', 'center')
            })()}
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
              statutHtml = `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:2px 7px;border-radius:4px;background:#ede9fe;color:#5b21b6;"><i class="ico ico-alert"></i> Litige</span>`
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
                  ? `<span title="Email ouvert" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--success);margin-left:4px;vertical-align:middle;flex-shrink:0;"></span>`
                  : `<span title="Email envoyé, pas encore ouvert" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--warn);margin-left:4px;vertical-align:middle;flex-shrink:0;"></span>`)
              : ''

            const etapeF = !f.date_relance ? 'r0'
              : f.date_appel ? 'appel'
              : f.date_relance_r2 ? 'r2'
              : 'r1'
            const joursR1 = f.date_relance ? Math.floor((new Date(aujourd_hui) - new Date(f.date_relance)) / 86400000) : 0
            const r2Urgent = etapeF === 'r1' && joursR1 >= 15

            let relanceHtml
            if (etapeF === 'r0') {
              relanceHtml = f.solde ? '' : `<button onclick="ouvrirModalRelance('${f.id}')" style="font-size:10.5px;padding:2px 7px;border-radius:4px;background:var(--brand-soft);color:var(--brand-deep);border:1px solid var(--brand);cursor:pointer;font-family:inherit;font-weight:600;"><i class="ico ico-send"></i> R1</button>`
            } else if (etapeF === 'r1') {
              relanceHtml = `
                <div style="display:flex;align-items:center;gap:2px;margin-bottom:3px;">
                  <span style="font-size:10.5px;color:var(--muted);">R1 · ${formatDate(f.date_relance)}</span>${dot(f.relance_email_id, f.relance_lue)}
                </div>
                <button onclick="ouvrirModalRelanceR2('${f.id}')" style="font-size:10px;padding:2px 7px;border-radius:4px;background:${r2Urgent ? '#fee2e2' : 'var(--surface-alt)'};color:${r2Urgent ? '#991b1b' : 'var(--muted)'};border:1px solid ${r2Urgent ? '#fca5a5' : 'var(--border)'};cursor:pointer;font-family:inherit;font-weight:${r2Urgent ? '700' : '400'};white-space:nowrap;">${r2Urgent ? '<i class="ico ico-alert"></i> R2 urgente' : '<i class="ico ico-send"></i> R2'}</button>`
            } else if (etapeF === 'r2') {
              relanceHtml = `
                <div style="display:flex;align-items:center;gap:2px;margin-bottom:3px;">
                  <span style="font-size:10.5px;color:var(--muted);">R2 · ${formatDate(f.date_relance_r2)}</span>${dot(f.relance_r2_email_id, f.relance_r2_lue)}
                </div>
                <button onclick="ouvrirModalAppel('${f.id}')" style="font-size:10px;padding:2px 7px;border-radius:4px;background:#ede9fe;color:#5b21b6;border:1px solid #c4b5fd;cursor:pointer;font-family:inherit;font-weight:600;white-space:nowrap;"><i class="ico ico-phone"></i> Appel</button>`
            } else {
              relanceHtml = `
                <div style="font-size:10.5px;color:var(--success);font-weight:600;margin-bottom:2px;"><i class="ico ico-phone"></i> ${formatDate(f.date_appel)}</div>
                ${f.note_appel ? `<div style="font-size:10px;color:var(--muted);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(f.note_appel||'').replace(/"/g,'&quot;')}">${f.note_appel}</div>` : ''}
                <button onclick="ouvrirModalAppel('${f.id}')" style="font-size:10px;padding:1px 6px;border-radius:4px;background:var(--surface-alt);color:var(--muted);border:1px solid var(--border);cursor:pointer;font-family:inherit;margin-top:2px;"><i class="ico ico-pencil"></i> Modifier</button>`
            }

            // Payé le éditable
            const payeLe = f.date_paiement
              ? `<span id="paye-${f.id}-view" onclick="editerDatePaiement('${f.id}','${f.date_paiement}')" style="cursor:pointer;font-size:12px;color:var(--success);font-family:'IBM Plex Mono',monospace;" title="Cliquer pour modifier">${formatDate(f.date_paiement)}</span>`
              : `<span id="paye-${f.id}-view" onclick="editerDatePaiement('${f.id}','')" style="cursor:pointer;font-size:11px;color:var(--muted);" title="Cliquer pour saisir la date">+ Ajouter</span>`

            // Boutons action
            // Actions sur une ligne : bouton principal + petites icônes (nom au survol)
            const icoBtn = (onclick, icone, titre, actif = false, couleur = '') => `<button onclick="${onclick}" title="${titre}" aria-label="${titre}" style="width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;border:1px solid ${actif ? 'transparent' : 'var(--border)'};background:${actif ? couleur + '1a' : 'var(--surface)'};color:${actif ? couleur : 'var(--muted)'};cursor:pointer;font-size:14px;"><i class="ico ico-${icone}"></i></button>`
            const actionBtns = `
              <div style="display:flex;gap:4px;align-items:center;justify-content:flex-end;">
                ${!f.solde
                  ? `<button onclick="marquerFactureSoldee('${f.id}')" style="font-size:12px;font-weight:600;padding:6px 10px;border-radius:8px;background:var(--success-bg);color:var(--success);border:none;cursor:pointer;font-family:inherit;white-space:nowrap;">Soldée</button>`
                  : `<button onclick="marquerFactureNonSoldee('${f.id}')" title="Remettre en attente" style="font-size:12px;padding:6px 10px;border-radius:8px;background:var(--surface);color:var(--muted);border:1px solid var(--border);cursor:pointer;font-family:inherit;white-space:nowrap;">Rouvrir</button>`}
                ${!f.solde ? (f.litige ? icoBtn(`annulerLitige('${f.id}')`, 'alert', 'Clore le litige', true, '#5B21B6') : icoBtn(`marquerLitige('${f.id}')`, 'alert', 'Passer en litige')) : ''}
                ${icoBtn(`editerMontantPaye('${f.id}',${montantPaye})`, 'coin', montantPaye > 0 ? 'Acompte : ' + montantPaye.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €' : 'Saisir un acompte', montantPaye > 0, '#B42318')}
                ${icoBtn(`ouvrirHistoriqueFacture('${f.id}')`, 'history', 'Historique de la facture')}
              </div>`

            return `
              <tr data-fid="${f.id}" style="border-bottom:1px solid var(--border-soft);" onmouseover="this.style.background='var(--surface-alt)'" onmouseout="this.style.background=''">
                <td style="padding:10px 8px 10px 16px;width:32px;"><input type="checkbox" class="bulk-fac" value="${f.id}" data-solde="${f.solde}" onchange="bulkUpdateCounter()" style="cursor:pointer;" onclick="event.stopPropagation()" /></td>
                <td style="padding:10px 16px; font-family:'IBM Plex Mono',monospace; font-size:11.5px; color:var(--ink-soft); white-space:nowrap;">${f.numero}</td>
                <td style="padding:10px 16px; font-weight:600; color:var(--ink);"><span onclick="ouvrirFicheClient('${f.client.replace(/'/g,"\\'")}')" style="cursor:pointer;border-bottom:1px dotted var(--muted);" title="Voir la fiche client 360°">${f.client}</span></td>
                <td data-col="contact" style="padding:8px 16px; min-width:150px; max-width:180px;">
                  <div onclick="editerContactFacture('${f.id}','telephone','${(f.telephone||'').replace(/'/g,"\\'").replace(/"/g,'&quot;')}',this)" title="Cliquer pour modifier" style="cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:${f.telephone ? 'var(--ink)' : 'var(--muted)'};padding:2px 0;">${f.telephone ? '<i class="ico ico-phone"></i> ' + formatPhone(f.telephone) : '<span style="font-size:11px;">+ Tél.</span>'}</div>
                  <div onclick="editerContactFacture('${f.id}','email_client','${(f.email_client||'').replace(/'/g,"\\'").replace(/"/g,'&quot;')}',this)" title="Cliquer pour modifier" style="cursor:pointer;font-size:11px;color:${f.email_client ? 'var(--ink-soft)' : 'var(--muted)'};padding:2px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:170px;">${f.email_client ? '<i class="ico ico-mail"></i> ' + f.email_client : '<span>+ Email</span>'}</div>
                </td>
                <td style="padding:10px 16px; text-align:right; font-family:'IBM Plex Mono',monospace; font-weight:600; color:${enRetard ? 'var(--danger)' : 'var(--ink)'}; white-space:nowrap;">${parseFloat(f.montant).toLocaleString('fr-FR', {minimumFractionDigits:2})} €</td>
                <td data-col="emission" style="padding:10px 16px; color:var(--ink-soft); font-size:12px; white-space:nowrap;">${f.date_emission ? formatDate(f.date_emission) : '—'}</td>
                <td style="padding:10px 16px; color:${enRetard ? 'var(--danger)' : 'var(--ink-soft)'}; font-weight:${enRetard ? '600' : '400'}; font-size:12px; white-space:nowrap;">${f.date_echeance ? formatDate(f.date_echeance) : '—'}</td>
                <td style="padding:10px 16px;">${statutHtml}</td>
                <td data-col="paye" style="padding:10px 16px; white-space:nowrap;">
                  ${payeLe}
                  <span id="paye-${f.id}-edit" style="display:none;">
                    <input type="date" id="paye-${f.id}-input" value="${f.date_paiement || ''}" style="font-size:11.5px;padding:3px 6px;border:1px solid var(--brand);border-radius:5px;font-family:inherit;"
                      onblur="sauvegarderDatePaiement('${f.id}',this.value)"
                      onchange="sauvegarderDatePaiement('${f.id}',this.value)" />
                  </span>
                </td>
                <td data-col="relance" style="padding:10px 16px;">${relanceHtml}</td>
                <td data-col="note" style="padding:6px 20px 6px 16px; width:160px; max-width:160px;">
                  <button onclick="ouvrirNoteFacture('${f.id}', \`${(f.note || '').replace(/`/g,'\\`').replace(/\n/g,' ')}\`)" style="font-size:11px;padding:3px 10px;border-radius:5px;border:1px solid var(--border);background:var(--surface-alt);cursor:pointer;color:${f.note ? 'var(--ink-soft)' : 'var(--muted)'};font-family:inherit;width:100%;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;text-align:left;" title="${(f.note||'').replace(/"/g,'&quot;')}">${f.note ? '<i class="ico ico-note"></i> ' + f.note.slice(0,22) + (f.note.length > 22 ? '…' : '') : '+ Note'}</button>
                </td>
                <td style="padding:10px 16px; text-align:center; white-space:nowrap;">${actionBtns}</td>
              </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>
    ${paginationHtml}
  `
  appliquerColonnesFactures()
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
  if (!await confirmer(`Retirer "${nom}" de la liste d'exclusion ?\nSes factures réapparaîtront dans le tableau.`)) return
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
  modal.innerHTML = `<div style="background:var(--surface);border-radius:14px;padding:28px;max-width:900px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,0.2);">${squelette('liste', 6)}</div>`

  const { data: factures } = await db.from('factures').select('*').eq('client', nomClient).order('date_emission', { ascending: false })
  const facs = factures || []
  if (!facs.length) {
    modal.querySelector('div').innerHTML = `<div style="background:var(--surface);border-radius:14px;padding:28px;max-width:600px;width:100%;"><div style="font-weight:700;font-size:18px;margin-bottom:8px;">${nomClient}</div><div style="color:var(--muted);">Aucune facture pour ce client.</div></div>`
    return
  }

  const auj = aujourdhuiISO()
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
    else if (f.litige) statut = `<span style="color:#5b21b6;font-size:11px;font-weight:600;"><i class="ico ico-alert"></i> Litige</span>`
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
          ${email ? `<span><i class="ico ico-mail"></i> ${email}</span>` : `<span style="color:var(--danger);">Pas d'email</span>`}
          ${tel ? `<span><i class="ico ico-phone"></i> ${formatPhone(tel)}</span>` : ''}
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
      <div style="display:flex;gap:6px;align-items:center;">
        <button class="btn btn-secondary" onclick="ouvrirFicheClientUnique('${nomClient.replace(/\\/g,'\\\\').replace(/'/g, "\\'")}')">Fiche client complète</button>
        <button onclick="document.getElementById('modal-fiche-client').remove()" style="background:none;border:none;cursor:pointer;font-size:22px;color:var(--muted);padding:0 6px;">×</button>
      </div>
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
  if (error) { afficherToast('Erreur lors de la sauvegarde', true); return }
  afficherToast(`Moyen de paiement mis à jour pour ${nomClient}`)
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
  if (!ids.length) { alert('Aucune facture non soldée dans la sélection.'); return }
  if (!await confirmer(`Marquer ${ids.length} facture${ids.length>1?'s':''} comme soldée${ids.length>1?'s':''} ?`)) return
  const avant = (window._toutesFactures || []).filter(f => ids.includes(f.id)).map(f => ({ id: f.id, solde: f.solde, date_paiement: f.date_paiement }))
  const ok = await majFactureAvecAnnulation(ids, { solde: true, date_paiement: aujourdhuiISO() },
    `${ids.length} facture${ids.length>1?'s':''} soldée${ids.length>1?'s':''}`, avant)
  if (ok) journalFactures(ids, 'facture_soldee', `Facture soldée (sélection de ${ids.length} facture${ids.length > 1 ? 's' : ''})`)
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
  const today = aujourdhuiISO()
  a.href = url; a.download = `factures_export_${today}.csv`
  document.body.appendChild(a); a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 100)
  afficherToast(`${sel.length} facture${sel.length>1?'s':''} exportée${sel.length>1?'s':''}`)
}

async function marquerFactureSoldee(id) {
  const { data: f } = await db.from('factures').select('id,numero,client,montant,solde,date_paiement').eq('id', id).single()
  if (!f) { afficherToast('Facture introuvable', true); return }
  const ok = await majFactureAvecAnnulation([id], { solde: true, date_paiement: f.date_paiement || aujourdhuiISO() },
    `Facture ${f.numero} soldée`, [{ id, solde: f.solde, date_paiement: f.date_paiement }])
  if (ok) logAction('facture_soldee', 'factures', id, `Facture ${f.numero} soldée — ${f.client} — ${parseFloat(f.montant).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`)
}

async function marquerFactureNonSoldee(id) {
  const { data: f } = await db.from('factures').select('id,numero,client,solde,date_paiement').eq('id', id).single()
  if (!f) { afficherToast('Facture introuvable', true); return }
  const ok = await majFactureAvecAnnulation([id], { solde: false, date_paiement: null },
    `Facture ${f.numero} remise en attente`, [{ id, solde: f.solde, date_paiement: f.date_paiement }])
  if (ok) logAction('facture_annulee', 'factures', id, `Facture ${f.numero} remise en attente — ${f.client}`)
}

function ouvrirNoteFacture(id, noteActuelle) {
  document.getElementById('modal-note-facture-id').value = id
  document.getElementById('modal-note-facture-textarea').value = noteActuelle || ''
  document.getElementById('modal-note-facture').classList.remove('hidden')
  setTimeout(() => document.getElementById('modal-note-facture-textarea').focus(), 50)
}

async function sauvegarderNoteModalFacture(id) {
  const note = document.getElementById('modal-note-facture-textarea')?.value?.trim() || null
  const { error } = await db.from('factures').update({ note }).eq('id', id)
  if (error) { afficherToast('Note non enregistrée, réessaie.', true); return }
  journalFactures([id], 'facture_note', note ? `Note : ${note.slice(0, 120)}` : 'Note supprimée')
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
  const facture = (window._toutesFactures || []).find(f => f.id === id)
  if (facture && (facture.date_paiement || null) === date_paiement) { chargerFactures(); return }   // appelé 2 fois (change + sortie du champ)
  if (facture) facture.date_paiement = date_paiement
  const { error } = await db.from('factures').update({ date_paiement }).eq('id', id)
  if (error) { afficherToast('Date non enregistrée, réessaie.', true); chargerFactures(); return }
  journalFactures([id], 'facture_paiement', date_paiement ? `Date de paiement : ${formatDate(date_paiement)}` : 'Date de paiement effacée')
  chargerFactures()
}

// ── Acompte / paiement partiel ──────────────────────────
async function editerMontantPaye(id, montantActuel) {
  const val = await demander('Montant déjà réglé (acompte ou avoir), en € :', montantActuel || '0', { inputmode: 'decimal' })
  if (val === null) return
  const montantPaye = parseFloat(val.replace(',', '.')) || 0
  // Récupérer le montant total pour vérifier si soldée
  if (montantPaye < 0) { alert('Le montant ne peut pas être négatif.'); return }
  const { data: f } = await db.from('factures').select('id,numero,montant,montant_paye,solde,date_paiement').eq('id', id).single()
  if (!f) { afficherToast('Facture introuvable', true); return }
  const montantTotal = parseFloat(f.montant) || 0
  const updates = { montant_paye: montantPaye }
  const devientSoldee = montantPaye >= montantTotal && montantTotal > 0 && !f.solde
  if (devientSoldee) { updates.solde = true; updates.date_paiement = f.date_paiement || aujourdhuiISO() }
  const fmt = v => (parseFloat(v) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })
  const ok = await majFactureAvecAnnulation([id], updates,
    devientSoldee ? `Acompte de ${fmt(montantPaye)} € : facture soldée` : `Acompte enregistré : ${fmt(montantPaye)} €`,
    [{ id, montant_paye: f.montant_paye, solde: f.solde, date_paiement: f.date_paiement }])
  if (ok) journalFactures([id], 'facture_acompte', `Acompte / avoir : ${fmt(f.montant_paye)} € → ${fmt(montantPaye)} €${devientSoldee ? ' (facture soldée)' : ''}`)
}

// ── Litige ──────────────────────────────────────────────
async function marquerLitige(id) {
  const ok = await majFactureAvecAnnulation([id], { litige: true }, 'Facture passée en litige', [{ id, litige: false }])
  if (ok) logAction('facture_litige', 'factures', id, `Facture ${(window._toutesFactures || []).find(f => f.id === id)?.numero || ''} en litige`)
}

async function annulerLitige(id) {
  const ok = await majFactureAvecAnnulation([id], { litige: false }, 'Litige clos', [{ id, litige: true }])
  if (ok) logAction('facture_litige', 'factures', id, `Litige clos sur la facture ${(window._toutesFactures || []).find(f => f.id === id)?.numero || ''}`)
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
  const auj = aujourdhuiISO()

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
  // Le titre a pu être remplacé par « Relance R2 » lors d'une ouverture précédente
  const titreR1 = document.querySelector('#modal-relance-email h2')
  if (titreR1) titreR1.innerHTML = `<i class="ico ico-send"></i> Relance — <span id="modal-relance-client"></span>`
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
      headers: await enteteSession(),
      body: JSON.stringify({ to: email, subject: sujet, html, ids, type: window._relanceData?.type || 'r1' }),
    })
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error || 'Erreur serveur')

    journalFactures(ids, 'facture_relance', `Relance ${(window._relanceData?.type || 'r1').toUpperCase()} envoyée à ${email}`)
    fermerModals()
    afficherToast(`Mail envoyé à ${email}`)
    const pageRec = document.getElementById('page-recouvrement')
    if (pageRec && pageRec.classList.contains('active')) chargerRecouvrement()
    else chargerFactures()
    mettreAJourBadgeRecouvrement()
  } catch (e) {
    btn.textContent = 'Envoyer'
    btn.disabled = false
    afficherToast(`Échec de l'envoi : ${e.message}`, true)
  }
}

// Message en bas à droite. Avec « annulation » (fonction), un bouton Annuler reste 7 s.
function afficherToast(msg, erreur = false, annulation = null) {
  document.querySelectorAll('.toast-suivipro').forEach(x => x.remove())
  const t = document.createElement('div')
  t.className = 'toast-suivipro'
  t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;padding:11px 14px 11px 18px;border-radius:10px;font-size:13px;font-weight:600;font-family:inherit;box-shadow:0 4px 16px rgba(0,0,0,0.15);transition:opacity 0.4s;display:flex;align-items:center;gap:14px;background:${erreur ? '#fee2e2' : '#d1fae5'};color:${erreur ? '#991b1b' : '#166534'};border:1px solid ${erreur ? '#fca5a5' : '#6ee7b7'};`
  const texte = document.createElement('span'); texte.textContent = msg; t.appendChild(texte)
  if (annulation) {
    const b = document.createElement('button')
    b.textContent = 'Annuler'
    b.style.cssText = 'background:#fff;border:1px solid currentColor;color:inherit;border-radius:6px;padding:4px 10px;font-weight:700;cursor:pointer;font-family:inherit;font-size:12px;'
    b.onclick = async () => { t.remove(); try { await annulation() } catch (e) { console.error(e); afficherToast('Annulation impossible', true) } }
    t.appendChild(b)
  }
  document.body.appendChild(t)
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400) }, annulation ? 7000 : 3500)
}

// Historique par facture : une ligne par facture concernée (table historique_actions)
async function journalFactures(ids, type, description) {
  const lignes = (ids || []).filter(Boolean).map(id => ({ type, entite: 'factures', entite_id: id, description, auteur: utilisateurActifNom || 'Anonyme' }))
  if (lignes.length) await db.from('historique_actions').insert(lignes)
}

// Enregistre un changement de facture, affiche l'erreur s'il échoue, et propose de l'annuler
async function majFactureAvecAnnulation(ids, changements, message, anciennes) {
  const { error } = await db.from('factures').update(changements).in('id', ids)
  if (error) { console.error(error); afficherToast('Enregistrement impossible, réessaie.', true); return false }
  afficherToast(message, false, async () => {
    for (const a of anciennes) {
      const { id, ...valeurs } = a
      const { error: e } = await db.from('factures').update(valeurs).eq('id', id)
      if (e) throw e
    }
    afficherToast('Modification annulée')
    rafraichirVueFactures()
  })
  rafraichirVueFactures()
  return true
}
function rafraichirVueFactures() {
  const rec = document.getElementById('page-recouvrement')
  if (rec?.classList.contains('active')) chargerRecouvrement(); else chargerFactures()
  mettreAJourBadgeRecouvrement()
}

// ── Relance R2 ──────────────────────────────────────────
function ouvrirModalRelanceR2(id) {
  const toutes = window._toutesFactures || []
  const facture = toutes.find(f => f.id === id)
  if (!facture) return

  const client = facture.client
  const email = toutes.find(f => f.client === client && f.email_client)?.email_client || null
  const fmt = v => parseFloat(v).toLocaleString('fr-FR', { minimumFractionDigits: 2 })

  const auj2 = aujourdhuiISO()
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
  if (titleEl) titleEl.innerHTML = `<i class="ico ico-send"></i> Relance R2 — <span id="modal-relance-client">${esc(client)}</span>`
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
  const dateExistante = facImpayees.find(f => f.date_appel)?.date_appel || aujourdhuiISO()
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

  const { error } = await db.from('factures').update({ date_appel, note_appel }).in('id', ids)
  if (error) { afficherToast('Appel non enregistré, réessaie.', true); return }
  journalFactures(ids, 'facture_appel', `Appel du ${formatDate(date_appel)}${note_appel ? ` : ${note_appel}` : ''}`)
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
  const auj = aujourdhuiISO()
  const { data: exclusData } = await db.from('clients_exclus').select('nom')
  const { data: factures }   = await toutesLesLignes(() => db.from('factures').select('id,client,date_echeance,date_relance,date_relance_r2,date_appel,solde,litige,moyen_paiement').eq('solde', false).eq('litige', false).order('date_echeance'))
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
  afficherSquelette(liste, 'liste', 6)

  const [{ data: exclusData }, { data: factures }] = await Promise.all([
    db.from('clients_exclus').select('nom'),
    toutesLesLignes(() => db.from('factures').select('*').eq('solde', false).eq('litige', false).not('date_echeance', 'is', null).order('date_echeance', { ascending: true }))
  ])

  const nomsExclus = new Set((exclusData || []).map(e => e.nom))
  const auj = aujourdhuiISO()
  const fmt = v => parseFloat(v).toLocaleString('fr-FR', { minimumFractionDigits: 2 })

  // Rendre les factures accessibles aux modals R1/R2/Appel
  window._toutesFactures = factures || []

  const enRetard = (factures || []).filter(f => !nomsExclus.has(f.client) && f.date_echeance < auj)

  if (!enRetard.length) {
    if (kpis) kpis.innerHTML = ''
    if (stats) stats.innerHTML = ''
    liste.innerHTML = `<div style="text-align:center;padding:60px 0;color:var(--success);font-size:15px;font-weight:600;"><i class="ico ico-check"></i> Aucune facture en retard !</div>`
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
    + (lettrageList.length ? ` &nbsp;·&nbsp; <span style="color:var(--muted);"><i class="ico ico-hourglass"></i> ${lettrageList.length} en attente de lettrage · ${fmt(totalLettrage)} €</span>` : '')
    + ` &nbsp;·&nbsp; <span style="color:var(--muted);">Encours total <b style="font-family:'IBM Plex Mono',monospace;">${fmt(totalEnc)} €</b></span>`

  const kpiData = [
    { label: 'À relancer', count: nbR0,    bg: '#fef2f2', border: '#fecaca', col: '#991b1b', emoji: '<i class="ico ico-alert"></i>' },
    { label: 'R2 urgente',  count: nbR1Urg, bg: '#fff7ed', border: '#fed7aa', col: '#9a3412', emoji: '<i class="ico ico-alert"></i>' },
    { label: 'R1 envoyée',  count: nbR1,    bg: '#fffbeb', border: '#fde68a', col: '#78350f', emoji: '<i class="ico ico-mail"></i>' },
    { label: 'R2 envoyée',  count: nbR2,    bg: '#eff6ff', border: '#bfdbfe', col: '#1e40af', emoji: '<i class="ico ico-mail"></i>' },
    { label: 'Appel fait',  count: nbAppel, bg: '#f0fdf4', border: '#86efac', col: '#166534', emoji: '<i class="ico ico-phone"></i>' },
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
    r1u:   { label: '<i class="ico ico-alert"></i> R2 urgente',    bg: '#fff7ed', border: '#fed7aa', col: '#9a3412', dot: '#f97316' },
    r2:    { label: 'R2 envoyée',       bg: '#eff6ff', border: '#bfdbfe', col: '#1e40af', dot: '#3b82f6' },
    appel: { label: '<i class="ico ico-phone"></i> Appelé',        bg: '#f0fdf4', border: '#86efac', col: '#166534', dot: '#22c55e' },
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
        ${appelFact?.note_appel ? `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:8px 12px;font-size:12px;color:#166534;margin-bottom:12px;"><i class="ico ico-note"></i> Note appel : ${appelFact.note_appel}</div>` : ''}
        <div class="rec-detail" style="display:none;margin-top:4px;">${facLignes}</div>
      </div>`
  }).join('') : `<div style="text-align:center;padding:32px 0;color:var(--success);font-size:14px;font-weight:600;"><i class="ico ico-check"></i> Aucune facture à relancer (virement / non défini)</div>`

  // ── Section "En attente de lettrage" (espèce & prélèvement) ────────
  const lettrageHtml = lettrageList.length ? `
    <div style="margin-top:30px;padding-top:22px;border-top:1px dashed var(--border);">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:4px;">
        <span style="font-size:14px;font-weight:700;color:#1e40af;"><i class="ico ico-hourglass"></i> En attente de lettrage</span>
        <span style="font-size:11px;color:#1e40af;background:#eff6ff;border:1px solid #bfdbfe;padding:2px 9px;border-radius:10px;font-weight:600;">${lettrageList.length} client${lettrageList.length > 1 ? 's' : ''} · ${fmt(totalLettrage)} €</span>
      </div>
      <div style="font-size:11.5px;color:var(--muted);margin-bottom:14px;">Espèce & prélèvement — pas de relance (en attente de validation/lettrage), mais comptés dans l'encours.</div>
      ${lettrageList.map(c => {
        const badge = c.moyen === 'espèce'
          ? `<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:2px 8px;border-radius:10px;background:#fef9c3;color:#854d0e;border:1px solid #fde68a;"><i class="ico ico-cash"></i> Espèce</span>`
          : `<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:2px 8px;border-radius:10px;background:#e0e7ff;color:#3730a3;border:1px solid #c7d2fe;"><i class="ico ico-refresh"></i> Prélèvement</span>`
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
  afficherSquelette(container, 'cartes', 4)

  const { data: exclusData } = await db.from('clients_exclus').select('nom')
  const { data: factures }   = await toutesLesLignes(() => db.from('factures').select('*').eq('solde', false).order('date_echeance', { ascending: true }))

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
      ${kpiCard('retard', '<i class="ico ico-alert"></i>', 'En retard', en_retard, '#fef2f2', '#fecaca', '#991b1b', true)}
      ${kpiCard('semaine', '<i class="ico ico-calendar"></i>', 'Cette semaine', cette_semaine, 'var(--brand-soft)', 'var(--brand)', 'var(--brand-deep)')}
      ${kpiCard('mois', '<i class="ico ico-calendar"></i>', 'Ce mois', ce_mois, 'var(--surface)', 'var(--border)', 'var(--ink)')}
      ${kpiCard('plus', '<i class="ico ico-hourglass"></i>', 'Plus tard', plus_tard, 'var(--surface-alt)', 'var(--border)', 'var(--muted)')}
    </div>

    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:700;color:var(--ink);"><i class="ico ico-calendar"></i> Calendrier des échéances</div>
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
    const curStr = dateLocaleISO(cur)
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
          <div style="flex:1;"><div style="font-weight:600;font-size:12.5px;color:var(--ink);">${f.client}</div><div style="font-size:10.5px;color:var(--muted);">${f.numero}${f.telephone ? ' · <i class="ico ico-phone"></i> ' + formatPhone(f.telephone) : ''}</div></div>
          <div style="font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:12.5px;color:var(--ink);">${fmt(f.montant)} €</div>
        </div>`).join('')}
    </div>`
  container.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

// ── Analytique ───────────────────────────────────────────
async function chargerAnalytique() {
  const container = document.getElementById('contenu-analytique')
  if (!container) return

  afficherSquelette(container, 'cartes', 8)

  try {

  const { data: exclusData, error: errExclus } = await db.from('clients_exclus').select('nom')
  const { data: factures, error: errFact }     = await toutesLesLignes(() => db.from('factures').select('*').order('date_echeance', { ascending: true }))

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
    const auj = aujourdhuiISO()
    return !f.solde && !f.litige && f.date_echeance && f.date_echeance < auj
  })

  const auj = aujourdhuiISO()

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
      const debut = new Date(now); debut.setDate(debut.getDate() - i * 7 - ((debut.getDay() + 6) % 7)); debut.setHours(0,0,0,0)
      const fin   = new Date(debut); fin.setDate(fin.getDate() + 6)
      const debutStr = dateLocaleISO(debut)
      const finStr   = dateLocaleISO(fin)
      const arr = toutes.filter(f => f.date_echeance && f.date_echeance >= debutStr && f.date_echeance <= finStr && !f.solde)
      const montant = arr.reduce((s,f)=>s+(parseFloat(f.montant)||0),0)
      const moisCourts = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc']
      points.push({ label: `${debut.getDate()} ${moisCourts[debut.getMonth()]}`, montant, passe: i > 0 })
    }
  } else if (analytiquePeriode === 'annuel') {
    // 5 dernières années
    for (let i = 4; i >= 0; i--) {
      const annee = now.getFullYear() - i
      const arr = toutes.filter(f => f.date_echeance && f.date_echeance.startsWith(`${annee}`) && !f.solde)
      const montant = arr.reduce((s,f)=>s+(parseFloat(f.montant)||0),0)
      points.push({ label: `${annee}`, montant, passe: i > 0 })
    }
  } else {
    // Mensuel : 12 derniers mois
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const moisStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      const arr = toutes.filter(f => f.date_echeance && f.date_echeance.startsWith(moisStr) && !f.solde)
      const montant = arr.reduce((s,f)=>s+(parseFloat(f.montant)||0),0)
      points.push({ label: moisNoms[d.getMonth()], montant, passe: i > 0 })
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
        <div style="position:relative;height:250px;"><canvas id="graph-encours" role="img" aria-label="Montant non soldé par période d'échéance"></canvas></div>
      </div>

      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;">
        <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:14px;">Clients à risque <span style="font-size:11.5px;font-weight:400;color:var(--muted);margin-left:6px;">reste dû · survol : délai de paiement habituel</span></div>
        ${topClients.length ? `<div style="position:relative;height:${Math.max(180, topClients.length * 34 + 20)}px;"><canvas id="graph-top-clients" role="img" aria-label="Clients qui doivent le plus"></canvas></div>` : '<div style="color:var(--muted);font-size:13px;padding:20px 0;text-align:center;">Aucun encours.</div>'}
      </div>

    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <div style="font-size:13px;font-weight:700;color:var(--ink);">Factures payées à temps <span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px;">par mois d'échéance</span></div>
          <span style="font-size:10.5px;color:var(--success);font-weight:600;background:var(--success-bg);padding:2px 8px;border-radius:10px;">Objectif 80%</span>
        </div>
        <div style="position:relative;height:230px;"><canvas id="graph-taux" role="img" aria-label="Part des factures payées à temps, par mois"></canvas></div>
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
        <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:14px;">Facturé et encaissé par mois <span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px;">12 derniers mois</span></div>
        <div style="position:relative;height:260px;"><canvas id="graph-encaissements" role="img" aria-label="Montants facturés et encaissés par mois"></canvas></div>
      </div>
    </div>`

  dessinerGraphiquesAnalytique({ points, topClients, enRetard, tauxPoints, encaissPoints, toutes, delaiMoyenClient })
  } catch(e) {
    container.innerHTML = `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:20px;color:var(--danger);">
      <b>Erreur dans l'analytique :</b> ${e.message}
      <pre style="font-size:11px;margin-top:8px;white-space:pre-wrap;">${e.stack||''}</pre>
    </div>`
    console.error('chargerAnalytique error:', e)
  }
}

// ── Graphiques de l'analytique (Chart.js, chargé à la demande) ──
let _chargementChartJs = null, _graphiquesAnalytique = []
function chargerChartJs() {
  if (window.Chart) return Promise.resolve()
  if (!_chargementChartJs) _chargementChartJs = new Promise((ok, ko) => {
    const sc = document.createElement('script')
    sc.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
    sc.onload = ok; sc.onerror = () => { _chargementChartJs = null; ko(new Error('Chart.js indisponible')) }
    document.head.appendChild(sc)
  })
  return _chargementChartJs
}

async function dessinerGraphiquesAnalytique(d) {
  try { await chargerChartJs() } catch (e) { console.error(e); return }
  _graphiquesAnalytique.forEach(g => g.destroy()); _graphiquesAnalytique = []
  const C = window.Chart
  C.defaults.font.family = 'Inter, system-ui, sans-serif'; C.defaults.font.size = 12; C.defaults.color = '#6B655D'
  const euros = v => `${Math.round(v).toLocaleString('fr-FR')} €`
  const kEuros = v => v >= 1000 ? `${Math.round(v / 1000).toLocaleString('fr-FR')} k€` : `${v} €`
  const grille = { color: '#F0EDE7' }, sansGrille = { display: false }
  const infobulle = { backgroundColor: '#1C1A17', padding: 10, cornerRadius: 8, titleFont: { weight: '600' }, displayColors: true, boxPadding: 4 }
  const creer = (id, config) => { const el = document.getElementById(id); if (el) _graphiquesAnalytique.push(new C(el, config)) }

  // 1. Encours par période : passé = en retard (rouge), période en cours = à échoir (orange)
  creer('graph-encours', { type: 'bar', data: { labels: d.points.map(p => p.label), datasets: [
      { label: 'En retard', data: d.points.map(p => p.passe ? p.montant : 0), backgroundColor: '#E5867C', borderRadius: 5, stack: 's' },
      { label: 'À échoir', data: d.points.map(p => p.passe ? 0 : p.montant), backgroundColor: '#EE7E24', borderRadius: 5, stack: 's' } ] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 3 } },
      tooltip: { ...infobulle, filter: i => i.raw > 0, callbacks: { label: c => ` ${c.dataset.label} : ${euros(c.raw)}` } } },
      scales: { x: { stacked: true, grid: sansGrille }, y: { stacked: true, grid: grille, border: { display: false }, ticks: { callback: kEuros } } } } })

  // 2. Clients à risque : reste dû, rouge si en retard ; survol = délai habituel
  const enRetard = new Set(d.enRetard.map(f => f.client))
  creer('graph-top-clients', { type: 'bar', data: { labels: d.topClients.map(([n]) => n.length > 26 ? n.slice(0, 25) + '…' : n),
      datasets: [{ label: 'Reste dû', data: d.topClients.map(([, v]) => v), backgroundColor: d.topClients.map(([n]) => enRetard.has(n) ? '#D9534F' : '#EE7E24'), borderRadius: 5, barThickness: 18 }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false },
      tooltip: { ...infobulle, callbacks: { title: i => d.topClients[i[0].dataIndex][0], label: c => {
        const nom = d.topClients[c.dataIndex][0], delai = d.delaiMoyenClient(nom)
        return [` Reste dû : ${euros(c.raw)}`, enRetard.has(nom) ? ' Factures en retard' : ' Pas encore en retard',
          delai === null ? ' Délai habituel : pas d\'historique' : ` Paie en général ${delai <= 0 ? 'à temps' : delai + ' j après l\'échéance'}`] } } } },
      scales: { x: { grid: grille, border: { display: false }, ticks: { callback: kEuros } }, y: { grid: sansGrille } } } })

  // 3. Part des factures payées à temps, avec l'objectif 80 %
  creer('graph-taux', { type: 'line', data: { labels: d.tauxPoints.map(p => p.label), datasets: [
      { label: 'Payées à temps', data: d.tauxPoints.map(p => p.taux), borderColor: '#1E7A46', backgroundColor: 'rgba(30,122,70,0.08)', fill: true, tension: 0.3, spanGaps: true, pointRadius: 3, pointBackgroundColor: '#1E7A46' },
      { label: 'Objectif 80 %', data: d.tauxPoints.map(() => 80), borderColor: '#9A938A', borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0, fill: false } ] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10 } }, tooltip: { ...infobulle, callbacks: { label: c => c.raw === null ? ' Pas de facture' : ` ${c.dataset.label} : ${c.raw} %` } } },
      scales: { x: { grid: sansGrille }, y: { min: 0, max: 100, grid: grille, border: { display: false }, ticks: { callback: v => v + ' %', stepSize: 20 } } } } })

  // 4. Facturé et encaissé par mois
  const facture = d.encaissPoints.map(p => d.toutes.filter(f => f.date_emission && f.date_emission.startsWith(p.mois)).reduce((s, f) => s + (parseFloat(f.montant) || 0), 0))
  creer('graph-encaissements', { type: 'bar', data: { labels: d.encaissPoints.map(p => p.label), datasets: [
      { label: 'Facturé', data: facture, backgroundColor: '#E8E5DF', borderRadius: 5 },
      { label: 'Encaissé', data: d.encaissPoints.map(p => p.montant), backgroundColor: '#1E7A46', borderRadius: 5 } ] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10 } }, tooltip: { ...infobulle, callbacks: { label: c => ` ${c.dataset.label} : ${euros(c.raw)}` } } },
      scales: { x: { grid: sansGrille }, y: { grid: grille, border: { display: false }, ticks: { callback: kEuros } } } } })
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
  // Comparaison sans accents ni ponctuation (« Val. réf. » = « val ref »)
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/[°.]/g, '').replace(/\s+/g, ' ')
  const h = header.map(norm)
  const trouve = (...nomsBruts) => {
    const noms = nomsBruts.map(norm)
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

// ── IMPORT CSV EN 2 TEMPS : APERÇU, PUIS VALIDATION ─────────
// 1. On lit le fichier et on calcule ce qui changerait, SANS rien enregistrer.
// 2. Une fenêtre montre les changements ; rien n'est écrit tant qu'on n'a pas validé.
// 3. L'import est consigné (valeurs d'avant comprises) : il peut être annulé.
const CHAMPS_IMPORT = ['client', 'montant', 'date_emission', 'date_echeance', 'solde', 'ville', 'commentaire', 'date_paiement']
let _importEnAttente = null

function valeursEgales(champ, a, b) {
  if (champ === 'montant') return Math.abs((parseFloat(a) || 0) - (parseFloat(b) || 0)) < 0.005
  return (a ?? null) === (b ?? null) || (a ?? '') === (b ?? '')
}

async function importerCSVFactures(file) {
  if (!file) return
  const input = document.getElementById('input-csv-factures')
  if (input) input.value = ''   // permet de re-choisir le même fichier
  const text = await file.text()
  const rows = parseCSVDISTRILOG(text)
  if (rows.length < 2) { alert('Fichier vide ou format invalide.'); return }

  // Colonnes repérées par leur nom ; sinon, position habituelle de l'export DISTRILOG
  // (signalé dans l'aperçu pour qu'on vérifie les montants avant de valider)
  const col = resoudreColonnesCSV(rows[0])
  const parPosition = [['numero', 'N° pièce'], ['client', 'Tiers'], ['montant', 'Val. réf.']].filter(([k]) => col[k] === -1).map(([, l]) => l)
  const idx = {
    client:          col.client          !== -1 ? col.client          : 0,
    montant:         col.montant         !== -1 ? col.montant         : 4,
    numero:          col.numero          !== -1 ? col.numero          : 5,
    dateEmission:    col.dateEmission    !== -1 ? col.dateEmission    : 1,
    solde:           col.solde           !== -1 ? col.solde           : 6,
    ville:           col.ville           !== -1 ? col.ville           : 7,
    tachesAssociees: col.tachesAssociees !== -1 ? col.tachesAssociees : 3,
    dateEcheance:    col.dateEcheance    !== -1 ? col.dateEcheance    : 11,
    datePaiement:    col.datePaiement    !== -1 ? col.datePaiement    : 12,
  }

  afficherToast('Analyse du fichier…')
  const [{ data: exclus }, { data: existantes, error: errExistantes }] = await Promise.all([
    db.from('clients_exclus').select('nom'),
    toutesLesLignes(() => db.from('factures').select('id, numero, ' + CHAMPS_IMPORT.join(', ')))
  ])
  // Sans la liste COMPLÈTE des factures existantes, une facture soldée à la main
  // serait prise pour une nouvelle et repasserait « non soldée » : on arrête tout.
  if (errExistantes || !existantes) { alert('Import annulé : impossible de lire les factures existantes. Réessaie dans un instant.'); return }
  const nomsExclus = new Set((exclus || []).map(e => e.nom))
  const existantesMap = new Map(existantes.map(f => [f.numero, f]))

  const dataRows = rows.slice(1).filter(r => r[idx.numero] && r[idx.numero].trim())
  const a = { nouvelles: [], soldees: [], montants: [], echeances: [], autres: [], conservees: [], ignoresExclus: 0, ignoresZero: 0, inchangees: 0, doublons: 0, avoirs: 0 }
  const vus = new Set(), aEcrire = [], avant = []

  for (const cols of dataRows) {
    const numero = cols[idx.numero]?.trim()
    const client = cols[idx.client]?.trim() || 'Client inconnu'
    if (nomsExclus.has(client)) { a.ignoresExclus++; continue }
    if (vus.has(numero)) { a.doublons++; continue }
    vus.add(numero)
    const montant = parseFloat((cols[idx.montant] || '0').trim().replace(/\s/g, '').replace(',', '.')) || 0
    // Les factures à 0 € n'ont rien à encaisser ni à relancer : jamais importées
    if (montant === 0) { a.ignoresZero++; continue }
    const commentaire = cols[idx.tachesAssociees]?.trim().slice(0, 500) || null
    const soldeCSV = (cols[idx.solde] || '').trim() === 'Oui'
    // Un avoir dans les tâches associées solde la facture, même sans paiement
    const avoirDetecte = contientAvoir(commentaire)
    if (avoirDetecte) a.avoirs++
    const csv = {
      numero, client, montant,
      date_emission: parseDateEmissionDL(cols[idx.dateEmission]),
      date_echeance: parseDateEcheanceDL(cols[idx.dateEcheance]),
      ville: cols[idx.ville]?.trim() || null,
      commentaire,
      date_paiement: parseDateEcheanceDL(cols[idx.datePaiement]?.trim() || null),
    }
    const ex = existantesMap.get(numero)
    if (!ex) {
      const ligne = { ...csv, solde: soldeCSV || avoirDetecte }
      aEcrire.push(ligne); a.nouvelles.push(ligne)
      continue
    }
    // Règles inchangées : le statut soldé ne recule jamais, la date de paiement saisie à la main est gardée
    const cible = { ...csv, solde: ex.solde || soldeCSV || avoirDetecte, date_paiement: ex.date_paiement ?? csv.date_paiement }
    if (ex.solde && !soldeCSV && !avoirDetecte) a.conservees.push(ex)
    const changes = CHAMPS_IMPORT.filter(c => !valeursEgales(c, ex[c], cible[c]))
    if (!changes.length) { a.inchangees++; continue }
    const ligne = { numero, ...Object.fromEntries(changes.map(c => [c, cible[c]])) }
    aEcrire.push(ligne)
    avant.push({ numero, ...Object.fromEntries(changes.map(c => [c, ex[c]])) })
    const info = { numero, client, avant: ex, apres: cible }
    if (changes.includes('solde') && cible.solde) a.soldees.push(info)
    else if (changes.includes('montant')) a.montants.push(info)
    else if (changes.includes('date_echeance')) a.echeances.push(info)
    else a.autres.push(info)
    if (changes.includes('montant') && !a.montants.includes(info)) a.montants.push(info)
  }

  _importEnAttente = { fichier: file.name, nbLignes: dataRows.length, aEcrire, avant, analyse: a, parPosition }
  afficherApercuImport()
}

function afficherApercuImport() {
  const { fichier, nbLignes, aEcrire, analyse: a, parPosition } = _importEnAttente
  const fmt = v => (parseFloat(v) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })
  const total = arr => arr.reduce((s, x) => s + (parseFloat(x.montant ?? x.apres?.montant) || 0), 0)
  const liste = (arr, rendu, max = 50) => `<div style="max-height:220px;overflow-y:auto;margin-top:6px;border:1px solid var(--border-soft);border-radius:8px;">
      ${arr.slice(0, max).map(x => `<div style="display:flex;gap:10px;padding:6px 10px;border-bottom:1px solid var(--border-soft);font-size:12px;">${rendu(x)}</div>`).join('')}
      ${arr.length > max ? `<div style="padding:6px 10px;font-size:11.5px;color:var(--muted);">… et ${arr.length - max} autre${arr.length - max > 1 ? 's' : ''}</div>` : ''}
    </div>`
  const num = n => `<span style="font-family:'IBM Plex Mono',monospace;color:var(--ink-soft);min-width:84px;">${esc(n)}</span>`
  const bloc = (icone, titre, arr, couleur, rendu, ouvert = false) => !arr.length ? '' : `
    <details ${ouvert ? 'open' : ''} style="margin-bottom:10px;border:1px solid var(--border);border-radius:10px;padding:10px 14px;background:var(--surface);">
      <summary style="cursor:pointer;font-size:13px;font-weight:600;color:${couleur};">${icone} ${titre}</summary>
      ${liste(arr, rendu)}
    </details>`

  const alertes = []
  if (parPosition?.length) alertes.push(`Colonne${parPosition.length > 1 ? 's' : ''} ${parPosition.join(', ')} non trouvée${parPosition.length > 1 ? 's' : ''} par son nom : prise${parPosition.length > 1 ? 's' : ''} à la position habituelle. Vérifie quelques montants et numéros ci-dessous avant de valider.`)
  if (a.montants.length > 20) alertes.push(`${a.montants.length} montants changent : c'est inhabituel. Vérifie que c'est bien le bon export.`)
  if (a.nouvelles.length > 300) alertes.push(`${a.nouvelles.length} nouvelles factures d'un coup : vérifie que ce n'est pas un export d'une autre société ou d'une autre période.`)
  if (a.doublons) alertes.push(`${a.doublons} ligne${a.doublons > 1 ? 's' : ''} en double dans le fichier (même n°) : seule la première est prise.`)
  const rien = !aEcrire.length

  const html = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:6px;">
      <div>
        <h2 style="margin:0;">Aperçu de l'import</h2>
        <div style="font-size:12px;color:var(--muted);margin-top:3px;">« ${esc(fichier)} » · ${nbLignes} lignes lues · <b>rien n'est encore enregistré</b></div>
      </div>
      <button onclick="annulerApercuImport()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted);">×</button>
    </div>
    ${alertes.map(m => `<div style="background:#fef3c7;border:1px solid #fcd34d;color:#78350f;border-radius:8px;padding:9px 12px;font-size:12.5px;margin:10px 0;"><i class="ico ico-alert"></i> ${esc(m)}</div>`).join('')}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin:14px 0;">
      ${[['Nouvelles', a.nouvelles.length, 'var(--success)'], ['Passent soldées', a.soldees.length, 'var(--brand-deep)'], ['Montants modifiés', a.montants.length, a.montants.length ? 'var(--danger)' : 'var(--muted)'], ['Autres mises à jour', a.echeances.length + a.autres.length, 'var(--ink-soft)'], ['Inchangées', a.inchangees, 'var(--muted)']]
        .map(([l, n, c]) => `<div style="background:var(--surface-alt);border-radius:8px;padding:10px 12px;"><div style="font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">${l}</div><div style="font-size:22px;font-weight:700;color:${c};">${n}</div></div>`).join('')}
    </div>
    ${bloc('<i class="ico ico-check"></i>', `${a.nouvelles.length} nouvelle${a.nouvelles.length > 1 ? 's' : ''} facture${a.nouvelles.length > 1 ? 's' : ''} · ${fmt(total(a.nouvelles))} €`, a.nouvelles, 'var(--success)',
      f => `${num(f.numero)}<span style="flex:1;">${esc(f.client)}</span><span style="color:var(--muted);">${f.date_echeance ? formatDate(f.date_echeance) : ''}</span><b style="font-family:'IBM Plex Mono',monospace;">${fmt(f.montant)} €</b>${f.solde ? '<span style="color:var(--success);font-size:11px;">soldée</span>' : ''}`, a.nouvelles.length <= 15)}
    ${bloc('<i class="ico ico-coin"></i>', `${a.soldees.length} facture${a.soldees.length > 1 ? 's' : ''} passe${a.soldees.length > 1 ? 'nt' : ''} « soldée »`, a.soldees, 'var(--brand-deep)',
      x => `${num(x.numero)}<span style="flex:1;">${esc(x.client)}</span><b style="font-family:'IBM Plex Mono',monospace;">${fmt(x.apres.montant)} €</b>`)}
    ${bloc('<i class="ico ico-pencil"></i>', `${a.montants.length} montant${a.montants.length > 1 ? 's' : ''} modifié${a.montants.length > 1 ? 's' : ''}`, a.montants, 'var(--danger)',
      x => `${num(x.numero)}<span style="flex:1;">${esc(x.client)}</span><span style="font-family:'IBM Plex Mono',monospace;">${fmt(x.avant.montant)} € → <b>${fmt(x.apres.montant)} €</b></span>`, true)}
    ${bloc('<i class="ico ico-calendar"></i>', `${a.echeances.length} date${a.echeances.length > 1 ? 's' : ''} d'échéance modifiée${a.echeances.length > 1 ? 's' : ''}`, a.echeances, 'var(--ink-soft)',
      x => `${num(x.numero)}<span style="flex:1;">${esc(x.client)}</span><span>${x.avant.date_echeance ? formatDate(x.avant.date_echeance) : '—'} → <b>${x.apres.date_echeance ? formatDate(x.apres.date_echeance) : '—'}</b></span>`)}
    ${bloc('<i class="ico ico-refresh"></i>', `${a.autres.length} autre${a.autres.length > 1 ? 's' : ''} mise${a.autres.length > 1 ? 's' : ''} à jour (ville, commentaire, date…)`, a.autres, 'var(--ink-soft)',
      x => `${num(x.numero)}<span style="flex:1;">${esc(x.client)}</span>`)}
    ${bloc('<i class="ico ico-shield"></i>', `${a.conservees.length} facture${a.conservees.length > 1 ? 's' : ''} soldée${a.conservees.length > 1 ? 's' : ''} dans le site mais pas dans DISTRILOG : elle${a.conservees.length > 1 ? 's restent' : ' reste'} soldée${a.conservees.length > 1 ? 's' : ''}`, a.conservees, 'var(--muted)',
      f => `${num(f.numero)}<span style="flex:1;">${esc(f.client)}</span><b style="font-family:'IBM Plex Mono',monospace;">${fmt(f.montant)} €</b>`)}
    ${(a.ignoresZero || a.ignoresExclus) ? `<div style="font-size:12px;color:var(--muted);margin:6px 2px 0;">⏭️ Ignorées : ${[a.ignoresZero ? `${a.ignoresZero} à 0 €` : '', a.ignoresExclus ? `${a.ignoresExclus} de clients exclus` : ''].filter(Boolean).join(' · ')}</div>` : ''}
    ${a.avoirs ? `<div style="font-size:12px;color:var(--muted);margin:4px 2px 0;"><i class="ico ico-receipt"></i> ${a.avoirs} avoir${a.avoirs > 1 ? 's' : ''} détecté${a.avoirs > 1 ? 's' : ''} dans les tâches associées (facture soldée automatiquement).</div>` : ''}
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="annulerApercuImport()">Annuler</button>
      <button class="btn btn-primary" id="btn-valider-import" onclick="validerImport()" ${rien ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>${rien ? 'Rien à importer' : `✓ Valider l'import (${aEcrire.length} facture${aEcrire.length > 1 ? 's' : ''})`}</button>
    </div>`

  let modal = document.getElementById('modal-apercu-import')
  if (!modal) {
    modal = document.createElement('div')
    modal.id = 'modal-apercu-import'
    modal.className = 'modal-overlay'
    modal.innerHTML = '<div class="modal-box" style="max-width:720px;"></div>'
    document.body.appendChild(modal)
  }
  modal.querySelector('.modal-box').innerHTML = html
  modal.classList.remove('hidden')
}

function annulerApercuImport() {
  _importEnAttente = null
  document.getElementById('modal-apercu-import')?.classList.add('hidden')
}

async function validerImport() {
  const imp = _importEnAttente
  if (!imp || !imp.aEcrire.length) return
  const btn = document.getElementById('btn-valider-import')
  if (btn) { btn.disabled = true; btn.textContent = 'Import en cours…' }
  const a = imp.analyse
  // On note d'abord ce qui va changer (pour pouvoir annuler), puis on écrit par paquets
  const { data: journal, error: errJ } = await db.from('imports_factures').insert({
    auteur: utilisateurActifNom || null, fichier: imp.fichier, nb_lignes: imp.nbLignes,
    nb_nouvelles: a.nouvelles.length, nb_modifiees: imp.avant.length, nb_soldees: a.soldees.length,
    details: { nouvelles: a.nouvelles.map(f => f.numero), avant: imp.avant },
  }).select('id').single()
  if (errJ) { alert('Import annulé : impossible de créer le journal (' + errJ.message + ').'); if (btn) { btn.disabled = false; btn.textContent = 'Réessayer' }; return }

  const modifiees = new Set(imp.avant.map(av => av.numero))
  for (let k = 0; k < imp.aEcrire.length; k += 500) {
    const paquet = imp.aEcrire.slice(k, k + 500)
    // Nouvelles factures et factures modifiées n'ont pas les mêmes colonnes : deux envois séparés
    const nouvelles = paquet.filter(l => !modifiees.has(l.numero))
    const maj = paquet.filter(l => !nouvelles.includes(l))
    if (nouvelles.length) {
      const { error } = await db.from('factures').insert(nouvelles)
      if (error) return echecImport(error, journal.id)
    }
    for (const l of maj) {
      const { numero, ...champs } = l
      const { error } = await db.from('factures').update(champs).eq('numero', numero)
      if (error) return echecImport(error, journal.id)
    }
  }
  annulerApercuImport()
  logAction('import_factures', 'factures', null, `Import « ${imp.fichier} » : ${a.nouvelles.length} nouvelle(s), ${imp.avant.length} mise(s) à jour, ${a.soldees.length} soldée(s)`)
  afficherToast(`Import terminé : ${a.nouvelles.length} nouvelle${a.nouvelles.length > 1 ? 's' : ''}, ${imp.avant.length} mise${imp.avant.length > 1 ? 's' : ''} à jour`)
  chargerFactures()
}

async function echecImport(error, journalId) {
  console.error(error)
  alert(`L'import s'est interrompu (${error.message}).\nUne partie a pu être enregistrée : ouvre « Historique des imports » pour l'annuler proprement.`)
  annulerApercuImport()
  chargerFactures()
}

// ── Historique d'une facture ──
async function ouvrirHistoriqueFacture(id) {
  const f = (window._toutesFactures || []).find(x => x.id === id)
  const numero = f?.numero || ''
  const [{ data: actions }, { data: imports }] = await Promise.all([
    db.from('historique_actions').select('description,auteur,created_at').eq('entite', 'factures').eq('entite_id', id).order('created_at', { ascending: false }).limit(100),
    numero ? db.from('imports_factures').select('fichier,auteur,created_at,annule,details')
      .or(`details->nouvelles.cs.${JSON.stringify([numero])},details->avant.cs.${JSON.stringify([{ numero }])}`).order('created_at', { ascending: false }).limit(20)
      : Promise.resolve({ data: [] }),
  ])
  const lignes = [
    ...(actions || []).map(a => ({ date: a.created_at, qui: a.auteur, quoi: a.description })),
    ...(imports || []).map(i => {
      const nouvelle = (i.details?.nouvelles || []).includes(numero)
      const av = (i.details?.avant || []).find(x => x.numero === numero)
      const champs = av ? Object.keys(av).filter(k => k !== 'numero').join(', ') : ''
      return { date: i.created_at, qui: i.auteur, quoi: `${nouvelle ? 'Créée' : `Mise à jour (${champs})`} par l'import « ${i.fichier} »${i.annule ? ' — import annulé depuis' : ''}` }
    }),
  ].sort((a, b) => b.date.localeCompare(a.date))
  await boiteDialogue({
    titre: `Historique · facture ${numero}`,
    message: lignes.length
      ? lignes.map(l => `${new Date(l.date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${l.qui || '—'}\n   ${l.quoi}`).join('\n\n')
      : 'Aucune action enregistrée sur cette facture pour l\'instant (l\'historique démarre aujourd\'hui).',
    ok: 'Fermer', annuler: null,
  })
}

// ── Historique des imports et annulation ──
async function ouvrirHistoriqueImports() {
  const { data, error } = await db.from('imports_factures').select('id,created_at,auteur,fichier,nb_lignes,nb_nouvelles,nb_modifiees,nb_soldees,annule,annule_le,annule_par').order('created_at', { ascending: false }).limit(15)
  if (error) { alert('Historique indisponible : ' + error.message); return }
  const dernierActif = (data || []).find(i => !i.annule)
  let modal = document.getElementById('modal-historique-imports')
  if (!modal) {
    modal = document.createElement('div')
    modal.id = 'modal-historique-imports'
    modal.className = 'modal-overlay'
    modal.innerHTML = '<div class="modal-box" style="max-width:640px;"></div>'
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden') })
    document.body.appendChild(modal)
  }
  modal.querySelector('.modal-box').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <h2 style="margin:0;">Historique des imports</h2>
      <button onclick="document.getElementById('modal-historique-imports').classList.add('hidden')" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted);">×</button>
    </div>
    ${(data || []).length ? data.map(i => `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-soft);${i.annule ? 'opacity:0.55;' : ''}">
        <div style="min-width:0;">
          <div style="font-size:13px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(i.fichier || 'Import')}</div>
          <div style="font-size:11.5px;color:var(--muted);">${new Date(i.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${esc(i.auteur || '—')} · ${i.nb_nouvelles} nouvelle(s), ${i.nb_modifiees} mise(s) à jour</div>
          ${i.annule ? `<div style="font-size:11.5px;color:var(--danger);">Annulé le ${new Date(i.annule_le).toLocaleDateString('fr-FR')} par ${esc(i.annule_par || '—')}</div>` : ''}
        </div>
        ${dernierActif && i.id === dernierActif.id ? `<button class="btn btn-danger" style="font-size:12px;white-space:nowrap;" onclick="annulerImport(${i.id})">↩ Annuler cet import</button>` : ''}
      </div>`).join('') : '<p style="color:var(--muted);">Aucun import enregistré pour l\'instant.</p>'}
    <p style="font-size:11.5px;color:var(--muted);margin-top:12px;">Seul le dernier import peut être annulé : les nouvelles factures sont retirées et les factures modifiées retrouvent leurs valeurs d'avant.</p>`
  modal.classList.remove('hidden')
}

async function annulerImport(id) {
  const { data: imp, error } = await db.from('imports_factures').select('*').eq('id', id).single()
  if (error || !imp || imp.annule) return
  const nouvelles = imp.details?.nouvelles || [], avant = imp.details?.avant || []
  if (!await confirmer(`Annuler l'import « ${imp.fichier} » ?\n\n· ${nouvelles.length} facture(s) ajoutée(s) seront supprimées\n· ${avant.length} facture(s) retrouveront leurs valeurs d'avant\n\nLes relances, notes et acomptes saisis depuis sur ces factures seront perdus pour les factures supprimées.`)) return
  for (let k = 0; k < nouvelles.length; k += 200) {
    const { error: e } = await db.from('factures').delete().in('numero', nouvelles.slice(k, k + 200))
    if (e) { alert('Annulation interrompue : ' + e.message); return }
  }
  for (const av of avant) {
    const { numero, ...champs } = av
    const { error: e } = await db.from('factures').update(champs).eq('numero', numero)
    if (e) { alert('Annulation interrompue : ' + e.message); return }
  }
  await db.from('imports_factures').update({ annule: true, annule_le: new Date().toISOString(), annule_par: utilisateurActifNom || null }).eq('id', id)
  logAction('import_factures', 'factures', null, `Import « ${imp.fichier} » annulé`)
  afficherToast('Import annulé')
  ouvrirHistoriqueImports()
  chargerFactures()
}

// ═══════════════════════════════════════════════════════════
//  FACTURATION RÉCURRENTE (fontaines, compteurs, badges)
// ═══════════════════════════════════════════════════════════

// Dernière période terminée, donc à facturer maintenant : le mois précédent et
// le trimestre précédent — en janvier, c'est décembre (et le T4) de l'année d'avant.
function periodeActionnable(frequence, now = new Date()) {
  if (frequence === 'mensuelle') {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return { annee: d.getFullYear(), num: d.getMonth() + 1 }
  }
  const t = Math.ceil((now.getMonth() + 1) / 3) - 1
  return t > 0 ? { annee: now.getFullYear(), num: t } : { annee: now.getFullYear() - 1, num: 4 }
}
// Nombre de périodes déjà terminées dans l'année affichée (0 à 12 mois, 0 à 4 trimestres)
function nbPeriodesTerminees(frequence, annee) {
  const a = periodeActionnable(frequence)
  if (a.annee === annee) return a.num
  return a.annee > annee ? (frequence === 'mensuelle' ? 12 : 4) : 0
}

// En janvier, on ouvre directement l'année précédente (c'est là qu'est décembre)
window._anneeRecurrents = periodeActionnable('mensuelle').annee
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

// Premier et dernier jour d'une période ('2026-10' ou '2026-Q4') au format AAAA-MM-JJ
function bornesPeriode(periode) {
  const annee = parseInt(periode.slice(0, 4))
  let moisDebut, moisFin
  if (periode.includes('-Q')) {
    const t = parseInt(periode.split('-Q')[1])
    moisDebut = (t - 1) * 3 + 1; moisFin = t * 3
  } else {
    moisDebut = moisFin = parseInt(periode.split('-')[1])
  }
  const dernierJour = new Date(annee, moisFin, 0).getDate()
  const pad = n => String(n).padStart(2, '0')
  return [`${annee}-${pad(moisDebut)}-01`, `${annee}-${pad(moisFin)}-${pad(dernierJour)}`]
}

// Le contrat est-il en vigueur sur cette période ? (date de début / date de fin facultatives)
function contratCouvrePeriode(c, periode) {
  const [debut, fin] = bornesPeriode(periode)
  if (c.date_debut && fin < c.date_debut) return false
  if (c.date_fin && debut > c.date_fin) return false
  return true
}

function statutPeriode(periode, anneeAff) {
  // On facture le mois/trimestre PRÉCÉDENT (le mois en cours n'est pas encore terminé).
  // Ex : en juin → mai ; en T2 → T1 ; en janvier → décembre de l'année d'avant.
  const trimestriel = periode.includes('-Q')
  const num = trimestriel ? parseInt(periode.split('-Q')[1]) : parseInt(periode.split('-')[1])
  const a = periodeActionnable(trimestriel ? 'trimestrielle' : 'mensuelle')
  const cle = anneeAff * 100 + num, cleA = a.annee * 100 + a.num
  return cle < cleA ? 'passe' : cle === cleA ? 'courant' : 'futur'
}

function typeLabel(type) {
  return { location_fontaine: '<i class="ico ico-box"></i> Fontaine', compteur: '<i class="ico ico-hash"></i> Compteur', badge: '<i class="ico ico-tag"></i> Badge', mixte: '<i class="ico ico-box"></i>+<i class="ico ico-hash"></i> Mixte' }[type] || type
}

// ── Chargement principal ──────────────────────────────────

async function chargerRecurrents() {
  afficherSquelette('recurrents-liste', 'liste', 8)
  const annee = window._anneeRecurrents
  document.getElementById('recurrents-annee-label').textContent = annee

  const [{ data: contrats }, { data: employes }] = await Promise.all([
    db.from('contrats_recurrents').select('*').eq('actif', true).order('client'),
    db.from('employes').select('id,nom,email').order('nom')
  ])

  if (!contrats) return
  // En février-mars, le trimestre à facturer (T4) est sur l'année précédente :
  // on le cherche à part pour qu'il apparaisse quand même dans « À traiter » et le badge.
  window._trimPrecedent = { periode: null, aTraiter: [], nonFaits: 0 }
  const pt = periodeActionnable('trimestrielle')
  if (pt.annee < annee && annee === periodeActionnable('mensuelle').annee) {
    const periodeT = periodeTrimestrielle(pt.annee, pt.num)
    const concernes = contrats.filter(c => c.frequence === 'trimestrielle' && contratCouvrePeriode(c, periodeT))
    if (concernes.length) {
      const { data: rel } = await db.from('releves_recurrents').select('contrat_id,fait,en_attente').eq('periode', periodeT).in('contrat_id', concernes.map(c => c.id))
      const parContrat = Object.fromEntries((rel || []).map(r => [r.contrat_id, r]))
      window._trimPrecedent = {
        periode: periodeT,
        aTraiter: concernes.filter(c => !parContrat[c.id]?.fait && !parContrat[c.id]?.en_attente),
        nonFaits: concernes.filter(c => !parContrat[c.id]?.fait).length,
      }
    }
  }
  // Contrats terminés avant l'année affichée ou démarrant après : masqués
  for (let i = contrats.length - 1; i >= 0; i--) {
    const c = contrats[i]
    if ((c.date_fin && c.date_fin < `${annee}-01-01`) || (c.date_debut && c.date_debut > `${annee}-12-31`)) contrats.splice(i, 1)
  }

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
  if (annee !== periodeActionnable('mensuelle').annee && annee !== periodeActionnable('trimestrielle').annee) {
    const badge = document.getElementById('nav-badge-recurrents')
    if (badge) badge.style.display = 'none'
    return
  }
  const moisActionnable = periodeActionnable('mensuelle').annee === annee ? nbPeriodesTerminees('mensuelle', annee) : 0
  const trimActionnable = periodeActionnable('trimestrielle').annee === annee ? nbPeriodesTerminees('trimestrielle', annee) : 0
  let nbRetard = 0
  for (const c of contrats) {
    const periodes = c.frequence === 'mensuelle'
      ? Array.from({length: moisActionnable}, (_, i) => periodeMensuelle(annee, i + 1))
      : Array.from({length: trimActionnable}, (_, i) => periodeTrimestrielle(annee, i + 1))
    for (const p of periodes) {
      if (!contratCouvrePeriode(c, p)) continue
      const releve = relevesMap[c.id]?.[p]
      if (!releve || !releve.fait) nbRetard++
    }
  }
  nbRetard += window._trimPrecedent?.nonFaits || 0   // T4 de l'année précédente (février-mars)
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
  // Année où se trouve la période à traiter maintenant (l'année d'avant en janvier)
  const anneeEnCours = periodeActionnable('mensuelle').annee
  const moisActionnable = nbPeriodesTerminees('mensuelle', annee)       // mois terminés dans l'année affichée
  const trimActionnable = nbPeriodesTerminees('trimestrielle', annee)   // trimestres terminés dans l'année affichée
  const trimDansAnnee   = periodeActionnable('trimestrielle').annee === annee
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
    if (!releve && !contratCouvrePeriode(contrat, periode)) {
      return `<td style="padding:8px 4px;text-align:center;${colBorder}background:var(--surface-alt);min-width:44px;color:var(--muted);font-size:12px;" title="Hors contrat">–</td>`
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
    const icon = isCourantStatut ? '<i class="ico ico-alert"></i>' : '●'
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
      if (!contratCouvrePeriode(c, p)) return false
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
          return contratCouvrePeriode(c, p) && !r?.fait && !r?.en_attente
        })
      : []

    // Contrats trimestriels non traités pour le trimestre actionnable
    const urgentTrimest = trimActionnable > 0 && trimDansAnnee
      ? trimest.filter(c => {
          const p = periodeTrimestrielle(annee, trimActionnable)
          const r = relevesMap[c.id]?.[p]
          return contratCouvrePeriode(c, p) && !r?.fait && !r?.en_attente
        })
      : (window._trimPrecedent?.aTraiter || [])   // février-mars : T4 de l'année précédente
    const periodeTrimUrgente = trimDansAnnee ? periodeTrimestrielle(annee, trimActionnable) : window._trimPrecedent?.periode

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
        if (contratCouvrePeriode(c, p) && !r?.fait && !r?.en_attente) retardItems.push({ contrat: c, periode: p })
      }
    }
    for (const c of trimest) {
      for (let t = 1; t < (trimDansAnnee ? trimActionnable : trimActionnable + 1); t++) {
        const p = periodeTrimestrielle(annee, t)
        const r = relevesMap[c.id]?.[p]
        if (contratCouvrePeriode(c, p) && !r?.fait && !r?.en_attente) retardItems.push({ contrat: c, periode: p })
      }
    }

    const moisLabel = moisActionnable > 0 ? moisNomsCourt[moisActionnable - 1] : ''
    const trimLabel = trimActionnable > 0 && trimDansAnnee ? `T${trimActionnable}` : (periodeTrimUrgente ? periodeLabel(periodeTrimUrgente) : '')

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
          ${assignes.length ? `<div style="font-size:10px;color:var(--muted);margin-top:2px;"><i class="ico ico-user"></i> ${assignes.join(', ')}</div>` : ''}
          <div style="margin-top:6px;font-size:10.5px;font-weight:600;color:#d97706;"><i class="ico ico-alert"></i> ${moisLabel}</div>
        </div>`
      }).join('')
      const cardsT = urgentTrimest.map(c => {
        const assignes = Array.isArray(c.assignes) && c.assignes.length ? c.assignes : (c.assigne_a ? [c.assigne_a] : [])
        return `<div onclick="ouvrirModalReleve('${c.id}','${periodeTrimUrgente}')"
          style="background:white;border:1.5px solid #fbbf24;border-radius:8px;padding:10px 12px;cursor:pointer;min-width:150px;max-width:220px;flex-shrink:0;transition:box-shadow 0.15s;"
          onmouseover="this.style.boxShadow='0 2px 8px rgba(251,191,36,0.35)'" onmouseout="this.style.boxShadow=''">
          <div style="font-weight:600;font-size:12.5px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.client}</div>
          ${c.numero_machine ? `<div style="font-size:10px;color:var(--muted);">#${c.numero_machine}</div>` : ''}
          <div style="font-size:10px;color:var(--muted);margin-top:2px;">${typeLabel(c.type_prestation)}</div>
          ${assignes.length ? `<div style="font-size:10px;color:var(--muted);margin-top:2px;"><i class="ico ico-user"></i> ${assignes.join(', ')}</div>` : ''}
          <div style="margin-top:6px;font-size:10.5px;font-weight:600;color:#d97706;"><i class="ico ico-alert"></i> ${trimLabel}</div>
        </div>`
      }).join('')
      blocksHtml += `
        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:700;color:#d97706;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
            <span style="background:#fef3c7;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;"><i class="ico ico-alert"></i></span>
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
          ${assignes.length ? `<div style="font-size:10px;color:var(--muted);margin-top:2px;"><i class="ico ico-user"></i> ${assignes.join(', ')}</div>` : ''}
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
          <div style="margin-top:6px;font-size:10.5px;font-weight:600;color:#f97316;"><i class="ico ico-hourglass"></i> ${periodesLabel}</div>
        </div>`
      }).join('')
      blocksHtml += `
        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:700;color:#f97316;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
            <span style="background:#fff7ed;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;"><i class="ico ico-hourglass"></i></span>
            En attente <span style="font-weight:400;color:var(--muted);font-size:11px;margin-left:4px;">${Object.keys(grouped).length} contrat${Object.keys(grouped).length>1?'s':''}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">${cards}</div>
        </div>`
    }

    if (totalUrgent === 0 && totalRetard === 0 && totalAttente === 0) {
      blocksHtml = `<div style="display:flex;align-items:center;gap:10px;color:var(--success);font-size:13px;font-weight:600;padding:12px 0;">
        <span style="font-size:20px;"><i class="ico ico-check"></i></span> Tout est à jour ! Aucune action requise.
      </div>`
    }

    htmlPriorite = `
      <div style="background:var(--surface-alt);border:1px solid var(--border-soft);border-radius:12px;padding:16px 20px;margin-bottom:24px;">
        <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:12px;display:flex;align-items:center;gap:8px;">
          <i class="ico ico-target"></i> Actions à faire maintenant
          <span style="font-size:11px;font-weight:400;color:var(--muted);">${new Date().toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}</span>
        </div>
        ${blocksHtml}
      </div>`
  }

  // ── Grille complète (tableau) ─────────────────────────────
  const colHighlightMois = annee === anneeEnCours && moisActionnable > 0 ? moisActionnable : -1
  const colHighlightTrim = trimDansAnnee && trimActionnable > 0 ? trimActionnable : -1

  function ligneClientHtml(c, cells) {
    const assignes = Array.isArray(c.assignes) && c.assignes.length ? c.assignes : (c.assigne_a ? [c.assigne_a] : [])
    const assigneEl = assignes.length ? `<div style="font-size:10px;color:var(--muted);margin-top:2px;white-space:normal;"><i class="ico ico-user"></i> ${assignes.join(', ')}</div>` : ''
    return `<tr>
      <td style="padding:8px 12px;border:1px solid var(--border-soft);white-space:nowrap;cursor:pointer;position:sticky;left:0;z-index:2;background:var(--surface);min-width:170px;" onclick="ouvrirHistoriqueContrat('${c.id}')">
        <div style="font-weight:600;font-size:13px;color:var(--brand);">${c.client}${c.numero_machine ? `<span style="font-size:10px;color:var(--muted);font-weight:400;margin-left:5px;">#${c.numero_machine}</span>` : ''}</div>
        <div style="font-size:10.5px;color:var(--muted);">${typeLabel(c.type_prestation)}</div>
        ${c.date_fin ? `<div style="font-size:10px;color:var(--danger);font-weight:600;margin-top:2px;"><i class="ico ico-stop"></i> Fin le ${formatDate(c.date_fin)}</div>` : ''}
        ${c.date_debut && c.date_debut.slice(0, 4) == annee ? `<div style="font-size:10px;color:var(--success);font-weight:600;margin-top:2px;">▶ Début le ${formatDate(c.date_debut)}</div>` : ''}
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
          <span style="font-size:13px;font-weight:700;color:var(--ink);"><i class="ico ico-calendar"></i> Mensuel</span>
          <span style="font-size:11px;color:var(--muted);background:var(--surface-alt);padding:2px 8px;border-radius:10px;">${mensuelFiltres.length}/${mensuel.length} affiché${mensuelFiltres.length>1?'s':''}</span>
          ${hiddenInfo}
        </div>
        <div style="overflow-x:auto;border-radius:8px;border:1px solid var(--border-soft);">
          <table style="border-collapse:collapse;width:100%;">
            <thead><tr>
              <th style="padding:8px 12px;font-size:11px;font-weight:600;color:var(--muted);text-align:left;border:1px solid var(--border-soft);background:var(--surface-alt);min-width:170px;position:sticky;left:0;z-index:3;">Client</th>
              ${entetes}
            </tr></thead>
            <tbody>${lignes || `<tr><td colspan="13" style="text-align:center;padding:20px;color:var(--muted);font-size:12px;"><i class="ico ico-check"></i> Tous les clients sont à jour ce mois-ci</td></tr>`}</tbody>
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
          <span style="font-size:13px;font-weight:700;color:var(--ink);"><i class="ico ico-calendar"></i> Trimestriel</span>
          <span style="font-size:11px;color:var(--muted);background:var(--surface-alt);padding:2px 8px;border-radius:10px;">${trimestFiltres.length}/${trimest.length} affiché${trimestFiltres.length>1?'s':''}</span>
          ${hiddenInfoT}
        </div>
        <div style="overflow-x:auto;border-radius:8px;border:1px solid var(--border-soft);">
          <table style="border-collapse:collapse;width:100%;">
            <thead><tr>
              <th style="padding:8px 12px;font-size:11px;font-weight:600;color:var(--muted);text-align:left;border:1px solid var(--border-soft);background:var(--surface-alt);min-width:170px;position:sticky;left:0;z-index:3;">Client</th>
              ${entetesTrim}
            </tr></thead>
            <tbody>${lignes || `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--muted);font-size:12px;"><i class="ico ico-check"></i> Tous les clients sont à jour ce trimestre</td></tr>`}</tbody>
          </table>
        </div>
      </div>`
  }

  // Barre de contrôle grille (filtre + légende)
  const filtreBtn = `<button onclick="toggleFiltreRecurrents()"
    style="background:${showAll?'var(--surface-alt)':'var(--brand)'};color:${showAll?'var(--ink)':'#fff'};border:1px solid ${showAll?'var(--border)':'var(--brand)'};border-radius:6px;padding:5px 12px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;">
    ${showAll ? '<i class="ico ico-eye"></i> Tout afficher' : '<i class="ico ico-target"></i> Seulement à traiter'}
  </button>`

  const legende = `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;font-size:11px;color:var(--muted);align-items:center;justify-content:space-between;">
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
      <span style="font-size:11px;font-weight:600;color:var(--ink);">Légende :</span>
      <span style="display:flex;align-items:center;gap:4px;"><span style="color:var(--success);font-size:14px;font-weight:700;">✓</span> Traité</span>
      <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#f97316;"></span> En attente</span>
      <span style="display:flex;align-items:center;gap:4px;"><span style="color:#ef4444;font-size:12px;">●</span> En retard</span>
      <span style="display:flex;align-items:center;gap:4px;"><span style="color:#f59e0b;font-size:12px;"><i class="ico ico-alert"></i></span> À faire maintenant</span>
    </div>
    ${filtreBtn}
  </div>`

  el.innerHTML = contrats.length === 0
    ? `<div style="text-align:center;padding:60px 20px;color:var(--muted);">
        <div style="font-size:40px;margin-bottom:12px;"><i class="ico ico-clipboard"></i></div>
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
  document.getElementById('cr-date-debut').value = ''
  document.getElementById('cr-date-fin').value   = ''
  document.getElementById('cr-btn-archiver').style.display = id ? '' : 'none'
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
      document.getElementById('cr-date-debut').value = contrat.date_debut || ''
      document.getElementById('cr-date-fin').value   = contrat.date_fin || ''
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

  const dateDebut = document.getElementById('cr-date-debut').value || null
  const dateFin   = document.getElementById('cr-date-fin').value || null
  if (dateDebut && dateFin && dateFin < dateDebut) { alert('La date de fin ne peut pas être avant la date de début.'); return }

  const payload = {
    date_debut:       dateDebut,
    date_fin:         dateFin,
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
  logAction('contrat', 'contrats_recurrents', window._contratEditionId || null,
    `${window._contratEditionId ? 'Contrat modifié' : 'Nouveau contrat'} : ${client}${dateFin ? ` (fin le ${formatDate(dateFin)})` : ''}`)
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
    ${contrat.assigne_a ? `<span style="margin-left:6px;color:var(--muted);"><i class="ico ico-user"></i> ${contrat.assigne_a}</span>` : ''}
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
  document.getElementById('releve-date').value = releve?.date_traitement || aujourdhuiISO()
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
  id = id || window._contratEditionId
  if (!id) return
  if (!await confirmer('Archiver ce contrat ? Il disparaît tout de suite de la grille (récupérable dans Archives).\n\nPour un client qui s\'arrête normalement, préfère plutôt une date de fin : les derniers mois restent à facturer.')) return
  const { data: c } = await db.from('contrats_recurrents').select('client').eq('id', id).single()
  await db.from('contrats_recurrents').update({ actif: false }).eq('id', id)
  logAction('contrat', 'contrats_recurrents', id, `Contrat archivé : ${c?.client || ''}`)
  fermerModals()
  chargerRecurrents()
}

async function restaurerContrat(id) {
  await db.from('contrats_recurrents').update({ actif: true }).eq('id', id)
  logAction('contrat', 'contrats_recurrents', id, 'Contrat restauré depuis les archives')
  chargerArchives()
}
// ═══════════════════════════════════════════════════════════
//  PLANNING DES TOURNÉES
//  Une « bulle » = un passage : un client, un opérateur, un jour de la semaine,
//  ses machines. Adresse, mail et infos d'accès appartiennent au client (communs
//  à toutes ses bulles). Les déplacements sont enregistrés pour tout le monde.
// ═══════════════════════════════════════════════════════════

const TR_JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']
const TR_COULEURS = {
  teal:   ['#E1F5EE', '#085041', '#1D9E75'],
  purple: ['#EEEDFE', '#3C3489', '#7F77DD'],
  coral:  ['#FAECE7', '#712B13', '#D85A30'],
  pink:   ['#FBEAF0', '#72243E', '#D4537E'],
  amber:  ['#FAEEDA', '#633806', '#BA7517'],
  blue:   ['#E6F1FB', '#0C447C', '#378ADD'],
  green:  ['#EAF3DE', '#27500A', '#639922'],
  gray:   ['#F1EFE8', '#444441', '#888780'],
}
let trOperateurs = [], trClients = [], trPassages = []
let trSemaineOffset = 0          // 0 = cette semaine, -1 = précédente…
let trRecherche = ''
let trSelection = null           // id de la bulle dont la fiche est ouverte
let trPassageEdition = null      // bulle ouverte dans le formulaire (null = création)
// Opérateurs choisis : vide = tous ; sinon seuls ceux cliqués s'affichent (plusieurs possibles)
let trOpsChoisis = new Set()
try { trOpsChoisis = new Set(JSON.parse(localStorage.getItem('tr_ops_choisis') || '[]')); localStorage.removeItem('tr_ops_masques') } catch (e) {}

function trCouleur(op) { return TR_COULEURS[op?.couleur] || TR_COULEURS.gray }
function trOp(id) { return trOperateurs.find(o => o.id === id) || null }
function trClient(id) { return trClients.find(c => c.id === id) || null }
function trNorm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim() }

// Semaine affichée : numéro ISO, parité, lundi
function trSemaine() {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + trSemaineOffset * 7)
  const lundi = new Date(d); lundi.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  const num = getNumSemaine(lundi)
  return { num, parite: num % 2 === 0 ? 'paire' : 'impaire', lundi }
}

async function chargerTournees() {
  const board = document.getElementById('tr-board')
  if (board && !trPassages.length) board.innerHTML = squelette('colonnes')
  const [o, c, p] = await Promise.all([
    db.from('tournee_operateurs').select('*').eq('actif', true).order('ordre'),
    toutesLesLignes(() => db.from('tournee_clients').select('*')),
    toutesLesLignes(() => db.from('tournee_passages').select('*')),
  ])
  if (o.error || c.error || p.error) {
    console.error(o.error || c.error || p.error)
    if (board) board.innerHTML = '<div style="color:var(--danger);padding:20px;">Impossible de charger le planning. Réessaie dans un instant.</div>'
    return
  }
  trOperateurs = o.data || []; trClients = c.data || []; trPassages = p.data || []
  afficherTournees()
}

function changerSemaineTournees(delta) {
  trSemaineOffset = delta === 0 ? 0 : trSemaineOffset + delta
  afficherTournees()
}

function rechercherTournees(val) {
  trRecherche = val || ''
  trSelection = null
  afficherTournees()
}

function basculerOperateurTournee(id) {
  trOpsChoisis.has(id) ? trOpsChoisis.delete(id) : trOpsChoisis.add(id)
  try { localStorage.setItem('tr_ops_choisis', JSON.stringify([...trOpsChoisis])) } catch (e) {}
  afficherTournees()
}
function afficherTousOperateursTournee() {
  trOpsChoisis.clear()
  try { localStorage.setItem('tr_ops_choisis', '[]') } catch (e) {}
  afficherTournees()
}

// Une bulle correspond-elle à la recherche ? Renvoie les machines trouvées (ou true si nom/ville/remarque)
function trCorrespondance(p, q) {
  const qn = trNorm(q), qc = qn.replace(/\s/g, '')
  const machines = (p.machines || []).filter(m => trNorm(m).replace(/\s/g, '').includes(qc))
  if (machines.length) return machines
  const cl = trClient(p.client_id)
  return [cl?.nom, cl?.ville, cl?.adresse, p.note].some(t => trNorm(t).includes(qn)) ? [] : null
}

function afficherTournees() {
  const board = document.getElementById('tr-board')
  if (!board) return
  const sem = trSemaine()
  const recherche = trRecherche.trim()
  const fin = new Date(sem.lundi); fin.setDate(fin.getDate() + 4)
  const fmtJ = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  document.getElementById('tr-semaine-label').textContent = `Semaine ${sem.num} · ${sem.parite} · ${fmtJ(sem.lundi)} – ${fmtJ(fin)}`
  document.getElementById('tr-btn-aujourdhui').style.display = trSemaineOffset === 0 ? 'none' : ''

  // Filtres opérateurs
  const nbParOp = {}
  trPassages.forEach(p => { nbParOp[p.operateur_id] = (nbParOp[p.operateur_id] || 0) + 1 })
  document.getElementById('tr-operateurs').innerHTML = trOperateurs.map(op => {
    const k = trCouleur(op)
    const choisi = trOpsChoisis.has(op.id)
    return `<button class="tr-chip ${trOpsChoisis.size && !choisi ? 'off' : ''}" onclick="basculerOperateurTournee('${op.id}')" aria-pressed="${choisi}"
      title="${choisi ? 'Retirer ' + esc(op.nom) + ' du filtre' : 'Afficher ' + esc(op.nom) + (trOpsChoisis.size ? ' en plus' : ' uniquement')}"
      style="${choisi ? `background:${k[0]};border-color:${k[2]};color:${k[1]};font-weight:600;` : ''}">
      <span class="tr-dot" style="background:${k[2]};"></span>${esc(op.nom)} <span style="color:var(--muted);font-size:11px;">${nbParOp[op.id] || 0}</span></button>`
  }).join('') + (trOpsChoisis.size ? `<button class="tr-chip" onclick="afficherTousOperateursTournee()" style="border-style:dashed;">Tous les opérateurs</button>` : '')

  // Bulles visibles : opérateur affiché + bonne semaine (ou, en recherche, toutes les semaines)
  const trouvees = new Map()
  const visibles = trPassages.filter(p => {
    if (trOpsChoisis.size && !trOpsChoisis.has(p.operateur_id)) return false
    if (recherche) {
      const m = trCorrespondance(p, recherche)
      if (m === null) return false
      trouvees.set(p.id, m)
      return true
    }
    return p.semaine === 'toutes' || p.semaine === sem.parite
  })
  if (recherche && visibles.length === 1) trSelection = visibles[0].id

  const ordreOp = id => trOp(id)?.ordre ?? 99
  const auj = new Date(); const jourAuj = trSemaineOffset === 0 ? ((auj.getDay() + 6) % 7) + 1 : -1
  board.innerHTML = TR_JOURS.map((nomJour, i) => {
    const jour = i + 1
    const duJour = visibles.filter(p => p.jour === jour).sort((a, b) =>
      ordreOp(a.operateur_id) - ordreOp(b.operateur_id)
      || trNorm(trClient(a.client_id)?.ville).localeCompare(trNorm(trClient(b.client_id)?.ville))
      || trNorm(trClient(a.client_id)?.nom).localeCompare(trNorm(trClient(b.client_id)?.nom)))
    const date = new Date(sem.lundi); date.setDate(date.getDate() + i)
    return `<div class="tr-col ${jour === jourAuj ? 'aujourdhui' : ''}" data-jour="${jour}"
        ondragover="trDragOver(event)" ondragleave="trDragLeave(event)" ondrop="trDrop(event)">
      <div class="tr-col-titre"><span>${nomJour} <span style="font-weight:500;letter-spacing:0;text-transform:none;">${date.getDate()}</span></span><span>${duJour.length}</span></div>
      ${duJour.length ? duJour.map(p => trBulleHtml(p, trouvees.get(p.id))).join('') : `<div class="tr-vide">${recherche ? 'Aucun résultat' : 'Glisser une bulle ici'}</div>`}
    </div>`
  }).join('')

  // Statistiques
  const statsEl = document.getElementById('tr-stats')
  if (statsEl) statsEl.innerHTML = recherche
    ? `<b>${visibles.length}</b> bulle${visibles.length > 1 ? 's' : ''} trouvée${visibles.length > 1 ? 's' : ''} pour « ${esc(recherche)} » (toutes semaines confondues)`
    : `${visibles.length} passage${visibles.length > 1 ? 's' : ''} cette semaine-là · ${trClients.length} clients · ${trOperateurs.length} opérateurs`

  afficherFicheTournee()
}

function trBulleHtml(p, machinesTrouvees) {
  const op = trOp(p.operateur_id), cl = trClient(p.client_id), k = trCouleur(op)
  const nbM = (p.machines || []).length
  const semaineTag = p.semaine === 'toutes' ? '' : `<span class="tr-pill" style="background:var(--surface-alt);color:var(--ink-soft);border:1px solid var(--border);">sem. ${p.semaine}s</span>`
  const machinesHtml = machinesTrouvees && machinesTrouvees.length
    ? `<div style="margin-top:6px;">${machinesTrouvees.map(m => `<span class="tr-machine trouve">${esc(m)}</span>`).join('')}</div>` : ''
  return `<div class="tr-bulle ${trSelection === p.id ? 'selection' : ''}" draggable="true" data-id="${p.id}"
      ondragstart="trDragStart(event)" ondragend="trDragEnd(event)" onclick="selectionnerBulleTournee('${p.id}')"
      title="${esc(cl?.nom)} — cliquer pour voir la fiche, glisser pour changer de jour">
    <div class="tr-bulle-nom">${esc(cl?.nom || 'Client inconnu')}</div>
    ${cl?.ville ? `<div class="tr-bulle-ville">${esc(cl.ville)}</div>` : ''}
    <div class="tr-bulle-pied">
      <span class="tr-pill" style="background:${k[0]};color:${k[1]};">${esc(op?.nom || 'Sans opérateur')}</span>
      <span class="tr-mini" title="${nbM} machine${nbM > 1 ? 's' : ''}"><i class="ico ico-coffee"></i> ${nbM}</span>
      ${semaineTag}
      ${cl?.infos ? `<span class="tr-mini" title="${esc(cl.infos)}"><i class="ico ico-key"></i></span>` : ''}
      ${p.note ? `<span class="tr-mini" title="${esc(p.note)}"><i class="ico ico-note"></i></span>` : ''}
    </div>
    ${machinesHtml}
  </div>`
}

function selectionnerBulleTournee(id) {
  trSelection = trSelection === id ? null : id
  document.querySelectorAll('#tr-board .tr-bulle').forEach(b => b.classList.toggle('selection', b.dataset.id === trSelection))
  afficherFicheTournee()
  if (trSelection) document.getElementById('tr-fiche')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

function afficherFicheTournee() {
  const el = document.getElementById('tr-fiche')
  if (!el) return
  const p = trPassages.find(x => x.id === trSelection)
  if (!p) { el.innerHTML = ''; return }
  const cl = trClient(p.client_id), op = trOp(p.operateur_id), k = trCouleur(op)
  const aCompleter = '<span style="color:var(--muted-soft);">à compléter</span>'
  const freq = p.semaine === 'toutes' ? 'toutes les semaines' : `semaines ${p.semaine}s`
  const autres = trPassages.filter(x => x.client_id === p.client_id && x.id !== p.id)
    .sort((a, b) => a.jour - b.jour)
    .map(x => `${TR_JOURS[x.jour - 1]} · ${esc(trOp(x.operateur_id)?.nom || '—')}${x.semaine !== 'toutes' ? ` (sem. ${x.semaine}s)` : ''} · ${(x.machines || []).length} machine${(x.machines || []).length > 1 ? 's' : ''}`)
  const recherche = trRecherche.trim()
  const trouvees = recherche ? (trCorrespondance(p, recherche) || []) : []
  el.innerHTML = `<div class="tr-fiche">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
      <div>
        <div style="font-size:16px;font-weight:700;color:var(--ink);">${esc(cl?.nom)}</div>
        <div style="font-size:12.5px;color:var(--muted);margin-top:3px;">${TR_JOURS[p.jour - 1]} · <span class="tr-pill" style="background:${k[0]};color:${k[1]};">${esc(op?.nom || 'Sans opérateur')}</span> · ${freq}</div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-secondary" onclick="ouvrirFicheClientUnique('${esc((cl?.nom || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"))}')">Fiche client</button>
        <button class="btn btn-secondary" onclick="ouvrirModalPassage('${p.id}')"><i class="ico ico-pencil"></i> Modifier</button>
        <button class="btn btn-secondary" onclick="selectionnerBulleTournee('${p.id}')" title="Fermer la fiche">✕</button>
      </div>
    </div>
    <table>
      <tr><td><i class="ico ico-pin"></i> Adresse</td><td>${cl?.adresse ? esc(cl.adresse) : aCompleter}${cl?.ville ? ` <span style="color:var(--muted);">· ${esc(cl.ville)}</span>` : ''}</td></tr>
      <tr><td><i class="ico ico-mail"></i> Mail</td><td>${cl?.email ? `<a href="mailto:${esc(cl.email)}" style="color:var(--brand-deep);">${esc(cl.email)}</a>` : aCompleter}</td></tr>
      <tr><td><i class="ico ico-key"></i> Accès</td><td>${cl?.infos ? esc(cl.infos) : '<span style="color:var(--muted-soft);">aucune info</span>'}</td></tr>
      ${p.note ? `<tr><td><i class="ico ico-note"></i> Remarque</td><td>${esc(p.note)}</td></tr>` : ''}
      <tr><td><i class="ico ico-coffee"></i> Machines</td><td>${(p.machines || []).length ? p.machines.map(m => `<span class="tr-machine ${trouvees.includes(m) ? 'trouve' : ''}">${esc(m)}</span>`).join('') : aCompleter}</td></tr>
      ${autres.length ? `<tr><td><i class="ico ico-calendar"></i> Autres passages</td><td>${autres.join('<br>')}</td></tr>` : ''}
    </table>
  </div>`
}

// ── Glisser-déposer d'un jour à l'autre ──
function trDragStart(ev) {
  ev.dataTransfer.setData('text/plain', ev.currentTarget.dataset.id)
  ev.dataTransfer.effectAllowed = 'move'
  const el = ev.currentTarget
  setTimeout(() => el.classList.add('dragging'), 0)
}
function trDragEnd(ev) {
  ev.currentTarget.classList.remove('dragging')
  document.querySelectorAll('.tr-col').forEach(c => c.classList.remove('drag-over'))
}
function trDragOver(ev) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; ev.currentTarget.classList.add('drag-over') }
function trDragLeave(ev) { if (!ev.currentTarget.contains(ev.relatedTarget)) ev.currentTarget.classList.remove('drag-over') }
async function trDrop(ev) {
  ev.preventDefault()
  ev.currentTarget.classList.remove('drag-over')
  const id = ev.dataTransfer.getData('text/plain')
  const jour = parseInt(ev.currentTarget.dataset.jour)
  const p = trPassages.find(x => x.id === id)
  if (!p || !jour || p.jour === jour) return
  const ancien = p.jour
  p.jour = jour                       // affichage immédiat, annulé si l'enregistrement échoue
  afficherTournees()
  const { error } = await db.from('tournee_passages').update({ jour, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) {
    console.error(error)
    p.jour = ancien; afficherTournees()
    afficherToast('Déplacement non enregistré, réessaie.', true)
    return
  }
  const nom = trClient(p.client_id)?.nom || ''
  afficherToast(`${nom} : ${TR_JOURS[ancien - 1]} → ${TR_JOURS[jour - 1]}`, false, async () => {
    const { error: e } = await db.from('tournee_passages').update({ jour: ancien, updated_at: new Date().toISOString() }).eq('id', id)
    if (e) throw e
    p.jour = ancien; afficherTournees()
    logAction('tournee', 'tournee_passages', id, `Tournée : déplacement de ${nom} annulé (retour au ${TR_JOURS[ancien - 1].toLowerCase()})`)
    afficherToast('Déplacement annulé')
  })
  logAction('tournee', 'tournee_passages', id, `Tournée : ${nom} déplacé du ${TR_JOURS[ancien - 1].toLowerCase()} au ${TR_JOURS[jour - 1].toLowerCase()}`)
}

// ── Formulaire de bulle ──
function remplirListeOperateursTournee(selectionId) {
  const sel = document.getElementById('mp-operateur')
  sel.innerHTML = `<option value="">— Choisir —</option>` +
    trOperateurs.map(o => `<option value="${o.id}">${esc(o.nom)}</option>`).join('') +
    `<option value="__nouveau__">+ Nouvel opérateur…</option>`
  sel.value = selectionId || ''
}

function ouvrirModalPassage(id = null) {
  fermerModals()
  const p = id ? trPassages.find(x => x.id === id) : null
  trPassageEdition = p
  const cl = p ? trClient(p.client_id) : null
  document.getElementById('modal-passage-titre').textContent = p ? `Modifier la bulle — ${cl?.nom || ''}` : 'Nouvelle bulle'
  document.getElementById('mp-clients-liste').innerHTML = [...new Set(trClients.map(c => c.nom))].sort()
    .map(n => `<option value="${esc(n)}"></option>`).join('')
  document.getElementById('mp-client').value  = cl?.nom || ''
  document.getElementById('mp-ville').value   = cl?.ville || ''
  document.getElementById('mp-adresse').value = cl?.adresse || ''
  document.getElementById('mp-email').value   = cl?.email || ''
  document.getElementById('mp-infos').value   = cl?.infos || ''
  remplirListeOperateursTournee(p?.operateur_id || (trOperateurs.length === 1 ? trOperateurs[0].id : ''))
  document.getElementById('mp-jour').value     = String(p?.jour || 1)
  document.getElementById('mp-semaine').value  = p?.semaine || 'toutes'
  document.getElementById('mp-machines').value = (p?.machines || []).join('\n')
  document.getElementById('mp-note').value     = p?.note || ''
  document.getElementById('mp-erreur').style.display = 'none'
  document.getElementById('mp-btn-supprimer').style.display = p ? '' : 'none'
  document.getElementById('modal-passage').classList.remove('hidden')
  setTimeout(() => document.getElementById(p ? 'mp-machines' : 'mp-client').focus(), 50)
}

// Création : si le nom tapé est un client existant, on reprend ses coordonnées
function remplirClientExistant() {
  if (trPassageEdition) return
  const nom = trNorm(document.getElementById('mp-client').value)
  const memes = trClients.filter(c => trNorm(c.nom) === nom)
  if (memes.length !== 1) return
  const c = memes[0]
  const champ = (id, v) => { const el = document.getElementById(id); if (!el.value) el.value = v || '' }
  champ('mp-ville', c.ville); champ('mp-adresse', c.adresse); champ('mp-email', c.email); champ('mp-infos', c.infos)
}

async function ajouterOperateurTournee() {
  const sel = document.getElementById('mp-operateur')
  const nom = ((await demander('Nom du nouvel opérateur :', '', { placeholder: 'Ex : Karim' })) || '').trim()
  if (!nom) { sel.value = ''; return }
  const existe = trOperateurs.find(o => trNorm(o.nom) === trNorm(nom))
  if (existe) { remplirListeOperateursTournee(existe.id); return }
  const pris = new Set(trOperateurs.map(o => o.couleur))
  const couleur = Object.keys(TR_COULEURS).find(c => !pris.has(c)) || 'gray'
  const ordre = Math.max(-1, ...trOperateurs.map(o => o.ordre)) + 1
  const { data, error } = await db.from('tournee_operateurs').insert({ nom, couleur, ordre }).select().single()
  if (error) { alert('Impossible de créer cet opérateur : ' + error.message); sel.value = ''; return }
  trOperateurs.push(data)
  remplirListeOperateursTournee(data.id)
}

async function sauvegarderPassage() {
  const err = document.getElementById('mp-erreur')
  const montrer = m => { err.textContent = m; err.style.display = 'block' }
  const nom     = document.getElementById('mp-client').value.trim()
  const ville   = document.getElementById('mp-ville').value.trim() || null
  const adresse = document.getElementById('mp-adresse').value.trim() || null
  const email   = document.getElementById('mp-email').value.trim() || null
  const infos   = document.getElementById('mp-infos').value.trim() || null
  const operateur_id = document.getElementById('mp-operateur').value
  const jour    = parseInt(document.getElementById('mp-jour').value)
  const semaine = document.getElementById('mp-semaine').value
  const note    = document.getElementById('mp-note').value.trim() || null
  const machines = [...new Set(document.getElementById('mp-machines').value.split(/[\n\/;]+/).map(m => m.trim()).filter(Boolean))]
  if (!nom) return montrer('Le nom du client est obligatoire.')
  if (!operateur_id || operateur_id === '__nouveau__') return montrer('Choisis un opérateur.')
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return montrer('Adresse mail invalide.')

  const btn = document.getElementById('mp-btn-enregistrer')
  btn.disabled = true
  try {
    const maintenant = new Date().toISOString()
    const coord = { nom, ville, adresse, email, infos, updated_at: maintenant }
    let clientId
    if (trPassageEdition) {
      clientId = trPassageEdition.client_id
      const { error } = await db.from('tournee_clients').update(coord).eq('id', clientId)
      if (error) throw error
    } else {
      // Client existant (même nom et même ville) → on le réutilise, sinon on le crée
      const existant = trClients.find(c => trNorm(c.nom) === trNorm(nom) && trNorm(c.ville) === trNorm(ville))
      if (existant) {
        clientId = existant.id
        const { error } = await db.from('tournee_clients').update(coord).eq('id', clientId)
        if (error) throw error
      } else {
        const { data, error } = await db.from('tournee_clients').insert(coord).select().single()
        if (error) throw error
        clientId = data.id
      }
    }
    const passage = { client_id: clientId, operateur_id, jour, semaine, machines, note, updated_at: maintenant }
    if (trPassageEdition) {
      const { error } = await db.from('tournee_passages').update(passage).eq('id', trPassageEdition.id)
      if (error) throw error
      logAction('tournee', 'tournee_passages', trPassageEdition.id, `Tournée : bulle « ${nom} » modifiée (${TR_JOURS[jour - 1].toLowerCase()}, ${trOp(operateur_id)?.nom || ''})`)
    } else {
      const { data, error } = await db.from('tournee_passages').insert(passage).select().single()
      if (error) throw error
      trSelection = data.id
      // On vide la recherche pour que la nouvelle bulle soit visible sur le planning
      trRecherche = ''
      const champ = document.getElementById('tr-recherche'); if (champ) champ.value = ''
      logAction('tournee', 'tournee_passages', data.id, `Tournée : nouvelle bulle « ${nom} » (${TR_JOURS[jour - 1].toLowerCase()}, ${trOp(operateur_id)?.nom || ''})`)
    }
    btn.disabled = false
    fermerModals()
    afficherToast('Bulle enregistrée')
    chargerTournees()
  } catch (e) {
    console.error(e)
    btn.disabled = false
    montrer('Enregistrement impossible, réessaie dans un instant.')
  }
}

async function supprimerPassage() {
  const p = trPassageEdition
  if (!p) return
  const nom = trClient(p.client_id)?.nom || ''
  if (!await confirmer(`Supprimer la bulle « ${nom} » du ${TR_JOURS[p.jour - 1].toLowerCase()} ?\nRécupérable 30 jours dans Archives → Corbeille.`)) return
  const ok = await mettreALaCorbeille('passage', p.id, 'Bulle supprimée', chargerTournees)
  if (!ok) return
  logAction('tournee', 'tournee_passages', p.id, `Tournée : bulle « ${nom} » du ${TR_JOURS[p.jour - 1].toLowerCase()} supprimée`)
  if (trSelection === p.id) trSelection = null
  fermerModals()
  chargerTournees()
}

// ── MISE À JOUR AUTOMATIQUE ────────────────────────────────
// Chaque publication change le numéro de version de app.js dans index.html.
// Toutes les 5 minutes, on compare avec la version chargée : si elle a changé,
// un bandeau propose de recharger (fini le Cmd+Maj+R).
function versionChargee() {
  const src = document.getElementById('script-app')?.getAttribute('src') || ''
  return (src.match(/[?&]v=([^&]+)/) || [])[1] || null
}
async function verifierNouvelleVersion() {
  const actuelle = versionChargee()
  if (!actuelle || document.getElementById('bandeau-maj')) return
  try {
    const html = await (await fetch(`index.html?t=${Date.now()}`, { cache: 'no-store' })).text()
    const enLigne = (html.match(/app\.js\?v=([^"&]+)/) || [])[1]
    if (enLigne && enLigne !== actuelle) {
      const b = document.createElement('div')
      b.id = 'bandeau-maj'
      b.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:9997;background:var(--ink);color:#fff;padding:10px 14px 10px 18px;border-radius:10px;font-size:13px;display:flex;align-items:center;gap:12px;box-shadow:0 6px 24px rgba(0,0,0,0.2);'
      b.innerHTML = `Une nouvelle version de SuiviPro est disponible.
        <button onclick="location.reload()" style="background:var(--brand);color:#fff;border:none;border-radius:6px;padding:6px 12px;font-weight:600;cursor:pointer;font-family:inherit;">Mettre à jour</button>`
      document.body.appendChild(b)
    }
  } catch (e) { /* hors ligne : on réessaiera */ }
}
setInterval(verifierNouvelleVersion, 5 * 60 * 1000)
document.addEventListener('visibilitychange', () => { if (!document.hidden) verifierNouvelleVersion() })



// ═══════════════════════════════════════════════════════════
//  FICHE CLIENT UNIQUE
//  Un client peut apparaître sous plusieurs noms (factures, contrats, tournées).
//  Tous ses noms sont rattachés à une seule fiche (tables clients_fiches / clients_noms).
// ═══════════════════════════════════════════════════════════
let clListe = [], clSelection = null, clRecherche = '', clFiltre = 'tous'

async function chargerClients() {
  afficherSquelette('cl-liste', 'liste', 10)
  await db.rpc('synchroniser_clients')   // ajoute les nouveaux noms (imports, nouveaux contrats…)
  const { data, error } = await db.rpc('liste_clients')
  if (error) { document.getElementById('cl-liste').innerHTML = `<p style="padding:14px;color:var(--danger);">Liste indisponible : ${esc(error.message)}</p>`; return }
  clListe = data || []
  afficherListeClients()
  if (clSelection && clListe.some(c => c.id === clSelection)) afficherFicheClientUnique(clSelection)
  else document.getElementById('cl-fiche').innerHTML = `<div class="cl-carte" style="color:var(--muted);text-align:center;padding:40px;">Choisis un client dans la liste.</div>`
}

function afficherListeClients() {
  const fmt = v => (parseFloat(v) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })
  const factures = utilisateurAccesFactures
  const filtres = [['tous', 'Tous'], ...(factures ? [['impayes', 'Avec impayés']] : []), ['tournees', 'En tournée'], ['contrats', 'Avec contrat']]
  document.getElementById('cl-filtres').innerHTML = filtres.map(([v, l]) =>
    `<button class="tr-chip ${clFiltre === v ? '' : 'off'}" style="${clFiltre === v ? 'border-color:var(--ink);' : ''}" onclick="clFiltre='${v}';afficherListeClients()">${l}</button>`).join('')
  const q = trNorm(clRecherche)
  let liste = clListe.filter(c => !q || c.noms.some(n => trNorm(n).includes(q)) || trNorm(c.nom).includes(q))
  if (clFiltre === 'impayes') liste = liste.filter(c => c.nb_impayees > 0).sort((a, b) => b.montant_impaye - a.montant_impaye)
  if (clFiltre === 'tournees') liste = liste.filter(c => c.nb_passages > 0)
  if (clFiltre === 'contrats') liste = liste.filter(c => c.nb_contrats > 0)
  document.getElementById('cl-stats').textContent = `${liste.length} client${liste.length > 1 ? 's' : ''}${q || clFiltre !== 'tous' ? ` sur ${clListe.length}` : ''} · factures, contrats récurrents et tournées réunis`
  const el = document.getElementById('cl-liste')
  el.innerHTML = liste.length ? liste.slice(0, 400).map(c => `
    <div class="cl-ligne ${clSelection === c.id ? 'active' : ''}" onclick="afficherFicheClientUnique('${c.id}')">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;">
        <span style="font-weight:600;font-size:12.5px;color:var(--ink);">${esc(c.nom)}</span>
        ${factures && c.montant_impaye > 0 ? `<span style="font-family:'IBM Plex Mono',monospace;font-size:11.5px;font-weight:700;color:${c.nb_retard ? 'var(--danger)' : 'var(--warn)'};white-space:nowrap;">${fmt(c.montant_impaye)} €</span>` : ''}
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px;display:flex;gap:10px;flex-wrap:wrap;">
        ${c.nb_passages ? `<span><i class="ico ico-truck"></i> ${c.nb_passages} passage${c.nb_passages > 1 ? 's' : ''}</span>` : ''}
        ${c.nb_contrats ? `<span><i class="ico ico-repeat"></i> ${c.nb_contrats} contrat${c.nb_contrats > 1 ? 's' : ''}</span>` : ''}
        ${factures && c.nb_factures ? `<span><i class="ico ico-file"></i> ${c.nb_factures} facture${c.nb_factures > 1 ? 's' : ''}</span>` : ''}
        ${c.noms.length > 1 ? `<span>${c.noms.length} noms</span>` : ''}
      </div>
    </div>`).join('') : '<p style="padding:14px;color:var(--muted);">Aucun client trouvé.</p>'
}

// Ouvre la fiche à partir d'un nom (depuis une facture, un contrat, une bulle…)
async function ouvrirFicheClientUnique(nom) {
  document.getElementById('modal-fiche-client')?.remove()
  // On cherche la fiche AVANT d'ouvrir la page, pour qu'elle s'affiche dès le chargement
  await db.rpc('synchroniser_clients')
  const { data } = await db.from('clients_noms').select('client_id').eq('nom', nom).maybeSingle()
  if (data?.client_id) clSelection = data.client_id
  else { document.getElementById('cl-recherche').value = nom; clRecherche = nom }
  showPage('clients')
}

async function afficherFicheClientUnique(id) {
  clSelection = id
  majFilAriane()
  document.querySelectorAll('.cl-ligne').forEach(l => l.classList.toggle('active', l.getAttribute('onclick').includes(id)))
  const c = clListe.find(x => x.id === id)
  const el = document.getElementById('cl-fiche')
  if (!c) return
  el.innerHTML = squelette('cartes', 3)
  const noms = c.noms
  const [{ data: fiche }, { data: contrats }, { data: tclients }, facturesRes] = await Promise.all([
    db.from('clients_fiches').select('notes').eq('id', id).single(),
    db.from('contrats_recurrents').select('id,client,numero_machine,type_prestation,frequence,actif,date_debut,date_fin').in('client', noms),
    db.from('tournee_clients').select('id,nom,ville,adresse,email,infos').in('nom', noms),
    utilisateurAccesFactures
      ? toutesLesLignes(() => db.from('factures').select('id,numero,client,montant,montant_paye,solde,litige,date_emission,date_echeance,date_paiement,email_client,telephone,ville,moyen_paiement').in('client', noms).order('date_emission', { ascending: false }))
      : Promise.resolve({ data: null }),
  ])
  if (clSelection !== id) return   // un autre client a été choisi entre-temps
  const tcIds = (tclients || []).map(t => t.id)
  const { data: passages } = tcIds.length ? await db.from('tournee_passages').select('id,client_id,jour,semaine,machines,operateur_id,note').in('client_id', tcIds) : { data: [] }
  const { data: ops } = (passages || []).length ? await db.from('tournee_operateurs').select('id,nom,couleur') : { data: [] }
  const factures = facturesRes.data
  const fmt = v => (parseFloat(v) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })
  const auj = aujourdhuiISO()
  const uniques = arr => [...new Set(arr.filter(Boolean).map(x => String(x).trim()))]
  const emails = uniques([...(tclients || []).map(t => t.email), ...(factures || []).map(f => f.email_client)])
  const tels = uniques((factures || []).map(f => f.telephone))
  const adresses = uniques((tclients || []).map(t => [t.adresse, t.ville].filter(Boolean).join(' · ')))
  const infos = uniques((tclients || []).map(t => t.infos))
  const nomsJs = s => esc(String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"))

  // Factures
  let blocFactures = ''
  if (factures) {
    const impayees = factures.filter(f => !f.solde && !f.litige)
    const retard = impayees.filter(f => f.date_echeance && f.date_echeance < auj)
    const reste = arr => arr.reduce((s, f) => s + soldeRestant(f), 0)
    const payees = factures.filter(f => f.solde && f.date_paiement && f.date_echeance)
    const delai = payees.length ? Math.round(payees.reduce((s, f) => s + (new Date(f.date_paiement) - new Date(f.date_echeance)) / 86400000, 0) / payees.length) : null
    blocFactures = `<div class="cl-carte">
      <h3><i class="ico ico-file"></i> Factures</h3>
      ${factures.length ? `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:12px;">
        <div class="cl-kpi"><div>Facturé (total)</div><div>${fmt(factures.reduce((s, f) => s + (parseFloat(f.montant) || 0), 0))} €</div></div>
        <div class="cl-kpi"><div>Reste à payer</div><div style="color:${impayees.length ? 'var(--warn)' : 'var(--success)'};">${fmt(reste(impayees))} €</div></div>
        <div class="cl-kpi"><div>Dont en retard</div><div style="color:${retard.length ? 'var(--danger)' : 'var(--ink)'};">${fmt(reste(retard))} €</div></div>
        <div class="cl-kpi"><div>Paie en moyenne</div><div>${delai === null ? '—' : delai <= 0 ? 'à temps' : `+${delai} j`}</div></div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        ${factures.slice(0, 8).map(f => {
          const enRetard = !f.solde && !f.litige && f.date_echeance && f.date_echeance < auj
          const statut = f.solde ? '<span style="color:var(--success);">Soldée</span>' : f.litige ? '<span style="color:#5b21b6;">Litige</span>' : enRetard ? '<span style="color:var(--danger);font-weight:600;">En retard</span>' : '<span style="color:var(--warn);">En attente</span>'
          return `<tr style="border-top:1px solid var(--border-soft);"><td style="padding:6px 0;font-family:'IBM Plex Mono',monospace;color:var(--ink-soft);">${esc(f.numero)}</td><td style="color:var(--muted);">${f.date_emission ? formatDate(f.date_emission) : ''}</td><td style="text-align:right;font-family:'IBM Plex Mono',monospace;font-weight:600;">${fmt(f.montant)} €</td><td style="text-align:right;">${statut}</td></tr>`
        }).join('')}
      </table>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
        <button class="btn btn-secondary" onclick="ouvrirFicheClient('${nomsJs(factures[0].client)}')">Paiements et relances</button>
        <button class="btn btn-secondary" onclick="showPage('factures');setFiltreFacturesClient('${nomsJs(factures[0].client)}')">Voir ses ${factures.length} facture${factures.length > 1 ? 's' : ''}</button>
      </div>` : '<p style="color:var(--muted);font-size:12.5px;">Aucune facture sous ces noms.</p>'}
    </div>`
  }

  // Contrats récurrents
  const blocContrats = `<div class="cl-carte">
    <h3><i class="ico ico-repeat"></i> Contrats récurrents</h3>
    ${(contrats || []).length ? contrats.map(ct => `
      <div onclick="ouvrirHistoriqueContrat('${ct.id}')" style="cursor:pointer;display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid var(--border-soft);font-size:12.5px;${ct.actif ? '' : 'opacity:0.55;'}">
        <span>${typeLabel(ct.type_prestation)}${ct.numero_machine ? ` <span style="color:var(--muted);">#${esc(ct.numero_machine)}</span>` : ''}</span>
        <span style="color:var(--muted);">${ct.frequence}${ct.date_fin ? ` · fin le ${formatDate(ct.date_fin)}` : ''}${ct.actif ? '' : ' · archivé'}</span>
      </div>`).join('') : '<p style="color:var(--muted);font-size:12.5px;">Aucun contrat récurrent.</p>'}
  </div>`

  // Tournées
  const opNom = idOp => (ops || []).find(o => o.id === idOp)?.nom || '—'
  const blocTournees = `<div class="cl-carte">
    <h3><i class="ico ico-truck"></i> Tournées</h3>
    ${(passages || []).length ? passages.sort((a, b) => a.jour - b.jour).map(p => `
      <div style="padding:7px 0;border-top:1px solid var(--border-soft);font-size:12.5px;">
        <div style="display:flex;justify-content:space-between;gap:10px;"><b>${TR_JOURS[p.jour - 1]}</b><span style="color:var(--muted);">${esc(opNom(p.operateur_id))}${p.semaine !== 'toutes' ? ` · semaines ${p.semaine}s` : ''}</span></div>
        ${(p.machines || []).length ? `<div style="margin-top:4px;">${p.machines.map(m => `<span class="tr-machine">${esc(m)}</span>`).join('')}</div>` : ''}
        ${p.note ? `<div style="font-size:11.5px;color:var(--muted);">${esc(p.note)}</div>` : ''}
      </div>`).join('') + `<button class="btn btn-secondary" style="margin-top:8px;" onclick="showPage('tournees');setTimeout(()=>{const i=document.getElementById('tr-recherche');i.value='${nomsJs((tclients || [])[0]?.nom || c.nom)}';rechercherTournees(i.value)},300)">Voir sur le planning</button>`
      : '<p style="color:var(--muted);font-size:12.5px;">Pas de passage en tournée.</p>'}
  </div>`

  el.innerHTML = `
    <div class="cl-carte">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
        <div style="font-size:19px;font-weight:700;color:var(--ink);">${esc(c.nom)}</div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-secondary" onclick="renommerClient('${id}')">Renommer</button>
          <button class="btn btn-secondary" onclick="fusionnerClient('${id}')">Fusionner avec…</button>
        </div>
      </div>
      <div style="margin-top:8px;">
        <span style="font-size:11px;color:var(--muted);margin-right:6px;">Noms utilisés :</span>
        ${c.noms.map(n => `<span class="cl-nom-chip">${esc(n)}${c.noms.length > 1 ? `<button onclick="detacherNomClient('${nomsJs(n)}')" title="Ce nom n'est pas ce client : le séparer" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:0;font-size:13px;line-height:1;">×</button>` : ''}</span>`).join('')}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-top:10px;">
        <tr><td style="color:var(--muted);width:110px;padding:4px 0;"><i class="ico ico-mail"></i> Mail</td><td>${emails.length ? emails.map(e => `<a href="mailto:${esc(e)}" style="color:var(--brand-deep);">${esc(e)}</a>`).join(', ') : '<span style="color:var(--muted-soft);">aucun</span>'}</td></tr>
        <tr><td style="color:var(--muted);padding:4px 0;"><i class="ico ico-phone"></i> Téléphone</td><td>${tels.length ? tels.map(t => esc(formatPhone(t))).join(', ') : '<span style="color:var(--muted-soft);">aucun</span>'}</td></tr>
        <tr><td style="color:var(--muted);padding:4px 0;"><i class="ico ico-pin"></i> Adresse</td><td>${adresses.length ? adresses.map(esc).join('<br>') : '<span style="color:var(--muted-soft);">à compléter (dans la bulle de tournée)</span>'}</td></tr>
        ${infos.length ? `<tr><td style="color:var(--muted);padding:4px 0;"><i class="ico ico-key"></i> Accès</td><td>${infos.map(esc).join('<br>')}</td></tr>` : ''}
      </table>
    </div>
    ${blocFactures}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;">${blocContrats}${blocTournees}</div>
    <div class="cl-carte">
      <h3><i class="ico ico-note"></i> Notes sur le client</h3>
      <textarea id="cl-notes" rows="3" placeholder="Interlocuteur, habitudes, points d'attention…" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px;resize:vertical;">${esc(fiche?.notes || '')}</textarea>
      <button class="btn btn-secondary" style="margin-top:6px;" onclick="sauverNotesClient('${id}')">Enregistrer la note</button>
    </div>`
}

async function sauverNotesClient(id) {
  const notes = document.getElementById('cl-notes').value.trim() || null
  const { error } = await db.from('clients_fiches').update({ notes }).eq('id', id)
  afficherToast(error ? 'Note non enregistrée, réessaie.' : 'Note enregistrée', !!error)
}

async function renommerClient(id) {
  const c = clListe.find(x => x.id === id)
  const nom = ((await demander('Nom affiché pour ce client :', c?.nom || '')) || '').trim()
  if (!nom || nom === c?.nom) return
  const { error } = await db.from('clients_fiches').update({ nom }).eq('id', id)
  if (error) { afficherToast('Renommage impossible', true); return }
  c.nom = nom; afficherListeClients(); afficherFicheClientUnique(id)
}

async function fusionnerClient(id) {
  const c = clListe.find(x => x.id === id)
  const saisie = ((await demander(`Fusionner « ${c.nom} » avec quel client ?\nTape une partie de son nom (ex. MBS).`, '')) || '').trim()
  if (!saisie) return
  const q = trNorm(saisie)
  const cands = clListe.filter(x => x.id !== id && (trNorm(x.nom).includes(q) || x.noms.some(n => trNorm(n).includes(q))))
  if (!cands.length) { alert(`Aucun autre client ne correspond à « ${saisie} ».`); return }
  if (cands.length > 1) { alert(`${cands.length} clients correspondent, précise :\n\n${cands.slice(0, 10).map(x => '· ' + x.nom).join('\n')}${cands.length > 10 ? '\n…' : ''}`); return }
  const autre = cands[0]
  if (!await confirmer(`Réunir « ${autre.nom} » dans la fiche « ${c.nom} » ?\n\nSes noms (${autre.noms.join(', ')}), ses factures, contrats et tournées seront rattachés à cette fiche. Un nom rattaché par erreur peut être séparé ensuite (×).`, { ok: 'Fusionner' })) return
  const { error } = await db.rpc('fusionner_clients', { p_garder: id, p_absorber: autre.id })
  if (error) { alert('Fusion impossible : ' + error.message); return }
  logAction('client', 'clients_fiches', id, `Clients fusionnés : « ${autre.nom} » rattaché à « ${c.nom} »`)
  afficherToast('Clients fusionnés')
  chargerClients()
}

async function detacherNomClient(nom) {
  if (!await confirmer(`Séparer « ${nom} » de cette fiche ?\nIl aura sa propre fiche client.`, { ok: 'Séparer' })) return
  const { data: nid, error } = await db.rpc('detacher_nom_client', { p_nom: nom })
  if (error) { alert(error.message); return }
  afficherToast('Nom séparé')
  chargerClients()
}

// ═══════════════════════════════════════════════════════════
//  PALETTE DE RECHERCHE (⌘K / Ctrl+K ou /)
//  Clients, factures, projets, tâches et pages, au clavier.
// ═══════════════════════════════════════════════════════════
let _paletteResultats = [], _paletteIndex = 0, _paletteTimer = null, _paletteSeq = 0

function ouvrirPalette() {
  if (document.getElementById('palette-fond')) { document.getElementById('palette-champ').focus(); return }
  const fond = document.createElement('div')
  fond.id = 'palette-fond'
  fond.innerHTML = `<div id="palette-boite" role="dialog" aria-label="Recherche rapide">
      <input id="palette-champ" type="text" autocomplete="off" spellcheck="false" placeholder="Rechercher un client, une facture, un projet, une page…" aria-label="Rechercher">
      <div id="palette-resultats" role="listbox"></div>
      <div class="palette-pied"><span><kbd>↑</kbd> <kbd>↓</kbd> naviguer</span><span><kbd>Entrée</kbd> ouvrir</span><span><kbd>Échap</kbd> fermer</span></div>
    </div>`
  fond.addEventListener('mousedown', e => { if (e.target === fond) fermerPalette() })
  document.body.appendChild(fond)
  const champ = document.getElementById('palette-champ')
  champ.addEventListener('input', () => { clearTimeout(_paletteTimer); _paletteTimer = setTimeout(() => chercherPalette(champ.value), 160) })
  champ.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermerPalette() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); selectionPalette(_paletteIndex + 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selectionPalette(_paletteIndex - 1) }
    else if (e.key === 'Enter') { e.preventDefault(); executerPalette(_paletteIndex) }
  })
  champ.focus()
  chercherPalette('')
}

function fermerPalette() { document.getElementById('palette-fond')?.remove() }

function pagesPalette(q) {
  const pages = Object.entries(LIBELLES_PAGES).filter(([p]) => p !== 'detail' && (utilisateurAccesFactures || !['factures', 'recouvrement'].includes(p)))
  return pages.filter(([, l]) => !q || trNorm(l).includes(q)).map(([p, l]) => ({ groupe: 'Aller à', libelle: l, action: () => showPage(p) }))
}

async function chercherPalette(texte) {
  const seq = ++_paletteSeq
  const q = trNorm(texte)
  const res = document.getElementById('palette-resultats')
  if (!res) return
  if (q.length < 2) { afficherPalette(pagesPalette(q)); return }
  const motif = texte.trim().replace(/[,()*%\\]/g, ' ').trim()
  const [cl, fa, pr, ta] = await Promise.all([
    db.from('clients_noms').select('nom, client_id, clients_fiches(nom)').ilike('nom', `%${motif}%`).limit(12),
    utilisateurAccesFactures ? db.from('factures').select('id,numero,client,montant,solde,date_echeance').or(`numero.ilike.*${motif}*,client.ilike.*${motif}*`).order('date_emission', { ascending: false }).limit(6) : Promise.resolve({ data: [] }),
    db.from('projets').select('id,nom,client').eq('archive', false).or(`nom.ilike.*${motif}*,client.ilike.*${motif}*`).limit(4),
    db.from('taches').select('id,description,projets(nom)').eq('archive', false).ilike('description', `%${motif}%`).limit(4),
  ])
  if (seq !== _paletteSeq) return
  const items = []
  const vus = new Set()
  for (const c of cl.data || []) {
    if (vus.has(c.client_id)) continue
    vus.add(c.client_id)
    const nomFiche = c.clients_fiches?.nom || c.nom
    items.push({ groupe: 'Clients', icone: 'user', libelle: nomFiche, sous: nomFiche !== c.nom ? c.nom : '', action: () => ouvrirFicheClientUnique(c.nom) })
  }
  const fmt = v => (parseFloat(v) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })
  const auj = aujourdhuiISO()
  for (const f of fa.data || []) items.push({ groupe: 'Factures', icone: 'file', libelle: `${f.numero} · ${f.client}`,
    sous: `${fmt(f.montant)} € · ${f.solde ? 'soldée' : f.date_echeance && f.date_echeance < auj ? 'en retard' : 'en attente'}`,
    action: () => { showPage('factures'); setFiltreFacturesClient(f.client) } })
  for (const p of pr.data || []) items.push({ groupe: 'Projets', icone: 'folder', libelle: p.nom, sous: p.client || '', action: () => ouvrirDetailProjetId(p.id) })
  for (const t of ta.data || []) items.push({ groupe: 'Tâches', icone: 'check', libelle: t.description, sous: t.projets?.nom || 'Sans projet', action: () => ouvrirEditionTache(t.id) })
  items.push(...pagesPalette(q))
  afficherPalette(items)
}

function afficherPalette(items) {
  _paletteResultats = items
  _paletteIndex = 0
  const res = document.getElementById('palette-resultats')
  if (!res) return
  if (!items.length) { res.innerHTML = '<div style="padding:22px;text-align:center;color:var(--muted);font-size:13px;">Aucun résultat.</div>'; return }
  let groupe = null
  res.innerHTML = items.map((it, i) => {
    const titre = it.groupe !== groupe ? `<div class="palette-groupe">${esc(it.groupe)}</div>` : ''
    groupe = it.groupe
    return `${titre}<div class="palette-item ${i === 0 ? 'actif' : ''}" role="option" data-i="${i}" onmousemove="selectionPalette(${i}, false)" onclick="executerPalette(${i})">
      <i class="ico ico-${it.icone || 'send'}" style="color:var(--muted);"></i><span>${esc(it.libelle)}</span>${it.sous ? `<span class="sous">${esc(it.sous)}</span>` : ''}</div>`
  }).join('')
}

function selectionPalette(i, defiler = true) {
  if (!_paletteResultats.length) return
  _paletteIndex = (i + _paletteResultats.length) % _paletteResultats.length
  document.querySelectorAll('.palette-item').forEach(el => el.classList.toggle('actif', +el.dataset.i === _paletteIndex))
  if (defiler) document.querySelector(`.palette-item[data-i="${_paletteIndex}"]`)?.scrollIntoView({ block: 'nearest' })
}

function executerPalette(i) {
  const it = _paletteResultats[i]
  if (!it) return
  fermerPalette()
  it.action()
}

// Démarrage (en dernier : toutes les fonctions et variables existent)
demarrerApplication()
