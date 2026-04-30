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
  if (page === 'taches') chargerTachesGlobal()
  if (page === 'employes') chargerEmployes()
  if (page === 'archives') chargerArchives()
  if (page === 'calendrier') afficherCalendrier()
}

// --- DASHBOARD ---
async function chargerDashboard() {
  const aujourd_hui = new Date().toISOString().split('T')[0]
  const { data: projets } = await db.from('projets').select('*').eq('statut', 'en cours').eq('archive', false)
  const { data: retard } = await db.from('taches').select('*').lt('date_fin_prevue', aujourd_hui).neq('statut', 'fait').eq('archive', false)
  const { data: urgent } = await db.from('taches').select('*').eq('priorite', 'urgent').neq('statut', 'fait').eq('archive', false)
  const { data: fait } = await db.from('taches').select('*').eq('statut', 'fait').eq('archive', false)

  document.getElementById('stat-projets').textContent = projets?.length || 0
  document.getElementById('stat-retard').textContent = retard?.length || 0
  document.getElementById('stat-urgent').textContent = urgent?.length || 0
  document.getElementById('stat-fait').textContent = fait?.length || 0

  const container = document.getElementById('dashboard-retard')
  if (!retard || retard.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">Aucune tâche en retard 🎉</p>'
    return
  }
  container.innerHTML = retard.map(t => `
    <div class="tache-item retard">
      <div class="tache-info">
        <div class="tache-desc">${t.description}</div>
        <div class="tache-meta">Fin prévue : ${formatDate(t.date_fin_prevue)}</div>
      </div>
      <span class="badge retard">Retard</span>
    </div>
  `).join('')
}

// --- PROJETS ---
function renderFiltresProjet() {
  const equipes = [
    { val: 'tous', label: 'Toutes équipes' },
    { val: 'technique', label: 'Technique' },
    { val: 'operationnel', label: 'Opérationnel' },
    { val: 'commercial', label: 'Commercial' }
  ]
  const statuts = [
    { val: 'tous', label: 'Tous statuts' },
    { val: 'en cours', label: 'En cours' },
    { val: 'en attente', label: 'En attente' },
    { val: 'fait', label: 'Fait' }
  ]
  return `<div style="display:flex; gap:0.4rem; flex-wrap:wrap; margin-bottom:1rem; align-items:center;">
    ${equipes.map(e => `<button class="btn ${filtreProjetEquipe === e.val ? 'btn-primary' : 'btn-secondary'}" style="padding:3px 12px; font-size:0.78rem;" onclick="setFiltreProjetEquipe('${e.val}')">${e.label}</button>`).join('')}
    <span style="color:var(--border); margin:0 4px;">|</span>
    ${statuts.map(s => `<button class="btn ${filtreProjetStatut === s.val ? 'btn-primary' : 'btn-secondary'}" style="padding:3px 12px; font-size:0.78rem;" onclick="setFiltreProjetStatut('${s.val}')">${s.label}</button>`).join('')}
  </div>`
}

function setFiltreProjetEquipe(val) { filtreProjetEquipe = val; chargerProjets() }
function setFiltreProjetStatut(val) { filtreProjetStatut = val; chargerProjets() }

async function chargerProjets() {
  const { data } = await db.from('projets').select('*').eq('archive', false).order('created_at', { ascending: false })
  const filterEl = document.getElementById('filtres-projets')
  if (filterEl) filterEl.innerHTML = renderFiltresProjet()
  const container = document.getElementById('liste-projets')
  if (!data || !data.length) {
    container.innerHTML = '<p style="color:var(--text-muted);">Aucun projet pour le moment.</p>'
    return
  }
  const filtered = data.filter(p => {
    if (filtreProjetEquipe !== 'tous' && p.equipe !== filtreProjetEquipe) return false
    if (filtreProjetStatut !== 'tous' && p.statut !== filtreProjetStatut) return false
    return true
  })
  container.innerHTML = ''
  if (!filtered.length) {
    container.innerHTML = '<p style="color:var(--text-muted);">Aucun projet pour ces filtres.</p>'
    return
  }
  for (const projet of filtered) {
    const { count: total } = await db.from('taches').select('*', { count: 'exact', head: true }).eq('projet_id', projet.id).eq('archive', false)
    const { count: faites } = await db.from('taches').select('*', { count: 'exact', head: true }).eq('projet_id', projet.id).eq('archive', false).eq('statut', 'fait')
    const pct = (total || 0) > 0 ? Math.round(((faites || 0) / (total || 1)) * 100) : 0
    const card = document.createElement('div')
    card.className = `projet-card ${projet.equipe || 'technique'}`
    card.innerHTML = `
      <h3>${projet.nom}</h3>
      <p class="client">${projet.client || 'Aucun client'}</p>
      ${(total || 0) > 0 ? `
        <div style="margin:0.6rem 0 0.2rem; background:var(--bg); border-radius:4px; height:5px; overflow:hidden;">
          <div style="width:${pct}%; height:100%; background:${pct === 100 ? 'var(--vert)' : 'var(--bleu)'}; border-radius:4px;"></div>
        </div>
        <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:0.3rem;">${faites || 0}/${total} tâches terminées · ${pct}%</div>
      ` : ''}
      <div class="projet-card-footer">
        <span class="badge ${projet.statut.replace(' ', '-')}">${projet.statut}</span>
        <span class="nb-taches">${total || 0} tâche${(total || 0) > 1 ? 's' : ''}</span>
      </div>
    `
    card.addEventListener('click', () => ouvrirDetailProjet(projet))
    container.appendChild(card)
  }
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
  showPage('detail')
  document.getElementById('detail-titre').textContent = projet.nom
  document.getElementById('detail-client').textContent = projet.client || ''
  document.getElementById('detail-badge').innerHTML = `<span class="badge ${projet.statut.replace(' ', '-')}">${projet.statut}</span>`
  chargerTachesDetail()
  chargerCommentaires()
}

async function chargerTachesDetail() {
  if (!projetActif) return
 let query = db.from('taches').select('*').eq('projet_id', projetActif.id).order('created_at', { ascending: false })
if (!projetActif.archive) query = query.eq('archive', false)
const { data } = await query
  const container = document.getElementById('detail-taches')
  const aujourd_hui = new Date().toISOString().split('T')[0]

  if (!data || !data.length) {
    container.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1rem;">Aucune tâche pour ce projet.</p>'
    document.getElementById('detail-gantt').innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">Aucune tâche avec des dates.</p>'
    return
  }

  const tachesAvecAssignations = await Promise.all(data.map(async t => {
    const { data: assignations } = await db.from('tache_assignations').select('employes(nom, equipe)').eq('tache_id', t.id)
    return { ...t, assignations: assignations || [] }
  }))

  container.innerHTML = tachesAvecAssignations.map(t => {
    const enRetard = t.date_fin_prevue && t.date_fin_prevue < aujourd_hui && t.statut !== 'fait'
    const classe = enRetard ? 'retard' : t.priorite
    const membres = t.assignations.map(a => a.employes?.nom).filter(Boolean).join(', ')
    return `
      <div class="tache-item ${classe}">
        <div class="tache-info">
          <div class="tache-desc">${t.description}</div>
          <div class="tache-meta">
            ${membres ? '👤 ' + membres + ' · ' : ''}
            ${t.date_debut ? formatDate(t.date_debut) + ' → ' : ''}
            ${t.date_fin_prevue ? formatDate(t.date_fin_prevue) : ''}
            ${enRetard ? ' · <span style="color:var(--rouge)">⚠ Retard</span>' : ''}
          </div>
        </div>
        <div style="display:flex; gap:0.4rem; flex-wrap:wrap; justify-content:flex-end; align-items:center;">
          <span class="badge ${t.statut.replace(' ', '-')}">${t.statut}</span>
          <span class="badge ${t.priorite}">${t.priorite}</span>
          <button class="btn btn-secondary" style="padding:2px 10px; font-size:0.75rem;" onclick="ouvrirEditionTache('${t.id}')">✏️ Éditer</button>
        </div>
      </div>
    `
  }).join('')

  afficherGantt(tachesAvecAssignations, aujourd_hui)
}

// --- GANTT ---
function afficherGantt(taches, aujourd_hui) {
  const avecDates = taches.filter(t => t.date_debut && t.date_fin_prevue)
  const ganttEl = document.getElementById('detail-gantt')
  if (!avecDates.length) {
    ganttEl.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">Aucune tâche avec des dates.</p>'
    return
  }

  const dates = avecDates.flatMap(t => [new Date(t.date_debut), new Date(t.date_fin_prevue)])
  const minDate = new Date(Math.min(...dates))
  const maxDate = new Date(Math.max(...dates))
  minDate.setDate(minDate.getDate() - 1)
  maxDate.setDate(maxDate.getDate() + 1)
  const totalJours = Math.ceil((maxDate - minDate) / 86400000)
  const largeurJour = 36
  const largeurTotal = totalJours * largeurJour
  const aujourd_huiDate = new Date()
  aujourd_huiDate.setHours(0,0,0,0)

  // Construire les semaines
  let semaines = []
  let cur = new Date(minDate)
  while (cur <= maxDate) {
    const lundi = new Date(cur)
    lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7))
    const already = semaines.find(s => s.lundi.getTime() === lundi.getTime())
    if (!already) {
      const numSem = getNumSemaine(lundi)
      semaines.push({ lundi, num: numSem })
    }
    cur.setDate(cur.getDate() + 1)
  }

  // Header semaines
  let headerSem = ''
  for (const s of semaines) {
    const offsetJours = Math.max(0, Math.ceil((s.lundi - minDate) / 86400000))
    const left = offsetJours * largeurJour
    headerSem += `<div style="position:absolute; left:${left}px; top:0; font-size:0.7rem; font-weight:600; color:var(--text-muted); white-space:nowrap; border-left:1px solid var(--border); padding-left:4px; height:20px; line-height:20px;">S${s.num}</div>`
  }

  // Header jours
  let headerJours = ''
  for (let i = 0; i < totalJours; i++) {
    const d = new Date(minDate)
    d.setDate(d.getDate() + i)
    const isToday = d.getTime() === aujourd_huiDate.getTime()
    const isWeekend = d.getDay() === 0 || d.getDay() === 6
    headerJours += `<div style="position:absolute; left:${i * largeurJour}px; top:0; width:${largeurJour}px; text-align:center; font-size:0.65rem; color:${isToday ? 'var(--bleu)' : isWeekend ? 'var(--text-muted)' : 'var(--text)'}; font-weight:${isToday ? '700' : '400'}; height:20px; line-height:20px;">${d.getDate()}</div>`
  }

  // Lignes fond (weekends + aujourd'hui)
  let fond = ''
  for (let i = 0; i < totalJours; i++) {
    const d = new Date(minDate)
    d.setDate(d.getDate() + i)
    const isToday = d.getTime() === aujourd_huiDate.getTime()
    const isWeekend = d.getDay() === 0 || d.getDay() === 6
    if (isWeekend) fond += `<div style="position:absolute; left:${i*largeurJour}px; top:0; width:${largeurJour}px; height:100%; background:rgba(0,0,0,0.03);"></div>`
    if (isToday) fond += `<div style="position:absolute; left:${i*largeurJour}px; top:0; width:${largeurJour}px; height:100%; background:rgba(59,130,246,0.08); border-left:2px solid var(--bleu);"></div>`
  }

  // Barres tâches
  const rows = avecDates.map(t => {
    const debut = new Date(t.date_debut)
    const fin = new Date(t.date_fin_prevue)
    debut.setHours(0,0,0,0)
    fin.setHours(0,0,0,0)
    const left = Math.ceil((debut - minDate) / 86400000) * largeurJour
    const width = Math.max((Math.ceil((fin - debut) / 86400000) + 1) * largeurJour, largeurJour)
    const enRetard = fin < aujourd_huiDate && t.statut !== 'fait'
    const couleur = enRetard ? 'var(--rouge)' : t.priorite === 'urgent' ? 'var(--orange)' : 'var(--bleu)'
    return `
      <div style="display:flex; align-items:center; margin-bottom:6px; height:28px;">
        <div style="width:150px; flex-shrink:0; font-size:0.78rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding-right:8px; color:var(--text);" title="${t.description}">${t.description}</div>
        <div style="position:relative; width:${largeurTotal}px; height:22px; flex-shrink:0;">
          ${fond}
          <div style="position:absolute; left:${left}px; width:${width}px; height:18px; top:2px; background:${couleur}; border-radius:4px; opacity:0.85; display:flex; align-items:center; padding:0 6px;">
            <span style="font-size:0.65rem; color:white; white-space:nowrap; overflow:hidden;">${t.statut}</span>
          </div>
        </div>
      </div>
    `
  }).join('')

  ganttEl.innerHTML = `
    <div style="overflow-x:auto;">
      <div style="min-width:${150 + largeurTotal}px;">
        <div style="display:flex; margin-bottom:2px;">
          <div style="width:150px; flex-shrink:0;"></div>
          <div style="position:relative; width:${largeurTotal}px; height:20px; flex-shrink:0;">${headerSem}</div>
        </div>
        <div style="display:flex; margin-bottom:6px; border-bottom:1px solid var(--border); padding-bottom:4px;">
          <div style="width:150px; flex-shrink:0;"></div>
          <div style="position:relative; width:${largeurTotal}px; height:20px; flex-shrink:0;">${headerJours}</div>
        </div>
        ${rows}
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
  return `<div style="display:flex; gap:0.4rem; flex-wrap:wrap; margin-bottom:1rem; align-items:center;">
    ${statuts.map(s => `<button class="btn ${filtreTacheStatut === s.val ? 'btn-primary' : 'btn-secondary'}" style="padding:3px 12px; font-size:0.78rem;" onclick="setFiltreTacheStatut('${s.val}')">${s.label}</button>`).join('')}
  </div>`
}

function setFiltreTacheStatut(val) { filtreTacheStatut = val; chargerTachesGlobal() }

async function chargerTachesGlobal() {
  const aujourd_hui = new Date().toISOString().split('T')[0]
  const filterEl = document.getElementById('filtres-taches')
  if (filterEl) filterEl.innerHTML = renderFiltresTache()
  const { data } = await db.from('taches').select('*, projets(nom)').eq('archive', false).order('date_fin_prevue', { ascending: true })
  const container = document.getElementById('liste-taches-global')
  if (!data || !data.length) {
    container.innerHTML = '<p style="color:var(--text-muted);">Aucune tâche.</p>'
    return
  }
  const tachesAvecAssignations = await Promise.all(data.map(async t => {
    const { data: assignations } = await db.from('tache_assignations').select('employes(nom)').eq('tache_id', t.id)
    return { ...t, assignations: assignations || [] }
  }))
  const filtered = tachesAvecAssignations.filter(t => {
    const enRetard = t.date_fin_prevue && t.date_fin_prevue < aujourd_hui && t.statut !== 'fait'
    if (filtreTacheStatut === 'retard') return enRetard
    if (filtreTacheStatut === 'urgent') return t.priorite === 'urgent' && t.statut !== 'fait'
    if (filtreTacheStatut !== 'tous') return t.statut === filtreTacheStatut
    return true
  })
  if (!filtered.length) {
    container.innerHTML = '<p style="color:var(--text-muted);">Aucune tâche pour ce filtre.</p>'
    return
  }
  container.innerHTML = filtered.map(t => {
    const enRetard = t.date_fin_prevue && t.date_fin_prevue < aujourd_hui && t.statut !== 'fait'
    const classe = enRetard ? 'retard' : t.priorite
    const membres = t.assignations.map(a => a.employes?.nom).filter(Boolean).join(', ')
    return `
      <div class="tache-item ${classe}">
        <div class="tache-info">
          <div class="tache-desc">${t.description}</div>
          <div class="tache-meta">
            📁 ${t.projets?.nom || 'Sans projet'} ·
            ${membres ? '👤 ' + membres + ' · ' : ''}
            ${t.date_fin_prevue ? '📅 ' + formatDate(t.date_fin_prevue) : 'Pas de date'}
            ${enRetard ? ' · <span style="color:var(--rouge)">⚠ Retard</span>' : ''}
          </div>
        </div>
        <div style="display:flex; gap:0.4rem; flex-direction:column; align-items:flex-end;">
          <span class="badge ${t.statut.replace(' ', '-')}">${t.statut}</span>
          <span class="badge ${t.priorite}">${t.priorite}</span>
        </div>
      </div>
    `
  }).join('')
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