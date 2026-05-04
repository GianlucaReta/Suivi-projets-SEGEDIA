// Script d'import des données réelles SEGEDIA
const SUPABASE_URL = 'https://guzbikygjwsvztlthmnr.supabase.co'
const SUPABASE_KEY = 'sb_publishable_BqknWAgxurkaidzDdyQ60g_GnlnIcYk'

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
}

// Conversion date Excel → ISO
function xl(serial) {
  if (!serial || isNaN(Number(serial))) return null
  const s = Number(serial)
  if (s < 40000) return null
  const d = new Date((s - 25569) * 86400 * 1000)
  return d.toISOString().split('T')[0]
}

async function supabase(method, table, data = null, filter = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${filter}`
  const opts = { method, headers }
  if (data) opts.body = JSON.stringify(data)
  const res = await fetch(url, opts)
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`${method} ${table}: ${res.status} ${err}`)
  }
  return res.status === 204 ? null : res.json()
}

async function main() {
  console.log('🗑️  Suppression des données existantes...')

  await supabase('DELETE', 'tache_assignations', null, '?tache_id=gte.00000000-0000-0000-0000-000000000000')
  await supabase('DELETE', 'taches',              null, '?id=gte.00000000-0000-0000-0000-000000000000')
  // commentaires table may not exist yet — skip silently
  try { await supabase('DELETE', 'commentaires', null, '?id=gte.00000000-0000-0000-0000-000000000000') } catch(e) {}
  await supabase('DELETE', 'projets',              null, '?id=gte.00000000-0000-0000-0000-000000000000')
  await supabase('DELETE', 'employes',             null, '?id=gte.00000000-0000-0000-0000-000000000000')
  console.log('   OK')

  // ─── EMPLOYÉS ──────────────────────────────────────────────
  console.log('👥 Création des employés...')
  const employes = await supabase('POST', 'employes', [
    { nom: 'Angelo',     equipe: 'technique',    email: '', telephone: '' },
    { nom: 'Marcello',   equipe: 'commercial',   email: '', telephone: '' },
    { nom: 'Christophe', equipe: 'operationnel', email: '', telephone: '' },
    { nom: 'Sebastien',  equipe: 'operationnel', email: '', telephone: '' },
    { nom: 'Aldo',       equipe: 'operationnel', email: '', telephone: '' },
  ])
  const emp = {}
  employes.forEach(e => { emp[e.nom] = e.id })
  console.log('   Employés créés:', Object.keys(emp).join(', '))

  // Helper : assigner des employés à une tâche
  async function assigner(tacheId, noms) {
    const ids = noms.map(n => emp[n]).filter(Boolean)
    if (!ids.length) return
    await supabase('POST', 'tache_assignations',
      ids.map(employe_id => ({ tache_id: tacheId, employe_id }))
    )
  }

  // ─── PROJETS & TÂCHES ──────────────────────────────────────
  console.log('📁 Création des projets et tâches...')

  // ── 1. INSTALLATIONS CHR ──────────────────────────────────
  const [p1] = await supabase('POST', 'projets', [{
    nom: 'Installations CHR', client: 'Divers clients',
    description: 'Installations de distributeurs automatiques chez les clients CHR',
    equipe: 'technique', statut: 'fait', archive: false
  }])
  const taches1 = await supabase('POST', 'taches', [
    { projet_id: p1.id, description: 'CB Ingenico — Gefco',
      priorite: 'urgent', statut: 'fait', date_debut: xl(46000), date_fin_prevue: xl(46009), archive: false },
    { projet_id: p1.id, description: 'CONTI CC100D 2G — L\'OASIS DES FRUITS',
      priorite: 'normal', statut: 'fait', date_debut: xl(45999), date_fin_prevue: xl(45999), archive: false },
    { projet_id: p1.id, description: 'CONTI CC100 COMPACT — SAS SAFA (Boulangerie Ferrières)',
      priorite: 'normal', statut: 'fait', date_debut: xl(45999), date_fin_prevue: xl(46022), archive: false },
  ])
  await assigner(taches1[0].id, ['Angelo', 'Marcello'])
  await assigner(taches1[2].id, ['Angelo'])

  // ── 2. MAINTENANCE SECTEUR OUEST ──────────────────────────
  const [p2] = await supabase('POST', 'projets', [{
    nom: 'Maintenance Secteur Ouest', client: 'Secteur Ouest',
    description: 'Maintenance et réapprovisionnement des distributeurs',
    equipe: 'operationnel', statut: 'en cours', archive: false
  }])
  const taches2 = await supabase('POST', 'taches', [
    { projet_id: p2.id, description: 'Arret BF33 FAT — Remplissage machines (reste 1 D/A à remplacer : Les Lierres)',
      priorite: 'normal', statut: 'en cours', date_debut: xl(46023), date_fin_prevue: xl(46053), archive: false },
    { projet_id: p2.id, description: 'Audit maintenance — machines en anomalie (en attente devis réparation + achat 2 cubes)',
      priorite: 'urgent', statut: 'en cours', date_debut: xl(45994), date_fin_prevue: xl(46053), archive: false },
  ])
  await assigner(taches2[0].id, ['Angelo'])
  await assigner(taches2[1].id, ['Christophe', 'Angelo'])

  // ── 3. RÉVISION TARIFS ────────────────────────────────────
  const [p3] = await supabase('POST', 'projets', [{
    nom: 'Révision Tarifs', client: 'Région Sud / Vert Pre',
    description: 'Mise à jour et révision des tarifs clients',
    equipe: 'technique', statut: 'fait', archive: false
  }])
  const taches3 = await supabase('POST', 'taches', [
    { projet_id: p3.id, description: 'Variation prix — Tarif Région Sud',
      priorite: 'urgent', statut: 'fait', date_debut: xl(45992), date_fin_prevue: xl(45999), archive: false },
    { projet_id: p3.id, description: 'Révision tarif + formation entretien + BF sans sucre — Vert Pre',
      priorite: 'urgent', statut: 'fait', date_debut: null, date_fin_prevue: null, archive: false },
  ])
  await assigner(taches3[0].id, ['Angelo'])
  await assigner(taches3[1].id, ['Angelo', 'Christophe', 'Marcello'])

  // ── 4. INSTALLATION CGD 13 ────────────────────────────────
  const [p4] = await supabase('POST', 'projets', [{
    nom: 'Installation CGD 13', client: 'CGD 13',
    description: 'Installation en attente — manque badges, mugs, poubelles, habillage',
    equipe: 'technique', statut: 'en cours', archive: false
  }])
  const taches4 = await supabase('POST', 'taches', [
    { projet_id: p4.id, description: 'Installation CGD 13 — manque badges/mug/poubelles/habillage',
      priorite: 'normal', statut: 'en cours', date_debut: null, date_fin_prevue: xl(46022), archive: false },
  ])

  // ── 5. RETRAITS & ARRÊTS ──────────────────────────────────
  const [p5] = await supabase('POST', 'projets', [{
    nom: 'Retraits & Arrêts', client: 'Divers',
    description: 'Retraits de matériel et arrêts de service',
    equipe: 'technique', statut: 'fait', archive: false
  }])
  const taches5 = await supabase('POST', 'taches', [
    { projet_id: p5.id, description: 'Retrait Arrêt Petro (récupérer Brio Blue au restaurant)',
      priorite: 'normal', statut: 'fait', date_debut: xl(45994), date_fin_prevue: xl(46009), archive: false },
    { projet_id: p5.id, description: 'Retrait Interway — retrait matériel',
      priorite: 'normal', statut: 'fait', date_debut: xl(46009), date_fin_prevue: xl(46009), archive: false },
    { projet_id: p5.id, description: 'Retrait Feraud — RDV Étude Lecomte (0619636379)',
      priorite: 'normal', statut: 'fait', date_debut: xl(46009), date_fin_prevue: xl(46043), archive: false },
  ])
  await assigner(taches5[1].id, ['Angelo'])
  await assigner(taches5[2].id, ['Angelo'])

  // ── 6. COMMERCIAL ─────────────────────────────────────────
  const [p6] = await supabase('POST', 'projets', [{
    nom: 'Commercial', client: 'Drugstore / Euridis',
    description: 'Actions commerciales : conventions, promotions, espaces clients',
    equipe: 'commercial', statut: 'fait', archive: false
  }])
  const taches6 = await supabase('POST', 'taches', [
    { projet_id: p6.id, description: 'Brio UP Blue — Drugstore (envoyer/enregistrer convention)',
      priorite: 'normal', statut: 'fait', date_debut: xl(46000), date_fin_prevue: xl(46041), archive: false },
    { projet_id: p6.id, description: 'Promotion / création espace client — Euridis (validation client)',
      priorite: 'urgent', statut: 'fait', date_debut: xl(46000), date_fin_prevue: xl(46053), archive: false },
  ])
  await assigner(taches6[0].id, ['Marcello'])
  await assigner(taches6[1].id, ['Christophe', 'Marcello'])

  // ── 7. ESSAI GOBELET PANEL CLIENTS ────────────────────────
  const [p7] = await supabase('POST', 'projets', [{
    nom: 'Essai Gobelet Panel Clients', client: 'Panel Clients',
    description: 'Sélection de panel D/A pour essai gobelet — tournée Sebastien et Aldo',
    equipe: 'operationnel', statut: 'fait', archive: false
  }])
  const taches7 = await supabase('POST', 'taches', [
    { projet_id: p7.id, description: 'Essai gobelet — sélection panel distributeurs automatiques',
      priorite: 'urgent', statut: 'fait', date_debut: xl(45999), date_fin_prevue: xl(46053), archive: false },
  ])
  await assigner(taches7[0].id, ['Sebastien', 'Aldo'])

  // ── 8. SÉLECTIONS À 1€50 ─────────────────────────────────
  const [p8] = await supabase('POST', 'projets', [{
    nom: 'Sélections à 1€50', client: 'Tous',
    description: 'Mise en place des sélections à 1€50 sur l\'ensemble du parc',
    equipe: 'operationnel', statut: 'en cours', archive: false
  }])
  const taches8 = await supabase('POST', 'taches', [
    { projet_id: p8.id, description: 'Déploiement sélections à 1€50 — tous clients',
      priorite: 'normal', statut: 'en cours', date_debut: xl(45994), date_fin_prevue: xl(46053), archive: false },
  ])
  await assigner(taches8[0].id, ['Christophe', 'Angelo'])

  // ── 9. ENTRETIENS FONTAINES ───────────────────────────────
  const [p9] = await supabase('POST', 'projets', [{
    nom: 'Entretiens Fontaines', client: 'Unapei / AISMT',
    description: 'Entretien et remplacement de filtres fontaines',
    equipe: 'technique', statut: 'fait', archive: false
  }])
  const taches9 = await supabase('POST', 'taches', [
    { projet_id: p9.id, description: 'Entretien fontaine Unapei Le Lilas (fontaine hors contrat)',
      priorite: 'normal', statut: 'fait', date_debut: xl(46000), date_fin_prevue: xl(46022), archive: false },
    { projet_id: p9.id, description: 'Remplacement filtres fontaines — AISMT',
      priorite: 'urgent', statut: 'fait', date_debut: xl(46048), date_fin_prevue: xl(46081), archive: false },
  ])
  await assigner(taches9[0].id, ['Angelo'])
  await assigner(taches9[1].id, ['Angelo'])

  // ── 10. INSTALLATIONS & REMPLACEMENTS ────────────────────
  const [p10] = await supabase('POST', 'projets', [{
    nom: 'Installations & Remplacements', client: 'Divers',
    description: 'Remplacements et installations diverses (fontaines, D/A, carrosseries)',
    equipe: 'technique', statut: 'fait', archive: false
  }])
  const taches10 = await supabase('POST', 'taches', [
    { projet_id: p10.id, description: 'Fontaines/DA/CB — Bimbo (6 fontaines / 2 Robimat / Kikko / vérif produits frais)',
      priorite: 'normal', statut: 'fait', date_debut: xl(46000), date_fin_prevue: null, archive: false },
    { projet_id: p10.id, description: 'Remplacement carrosserie — Carrosserie de la Pomme',
      priorite: 'normal', statut: 'fait', date_debut: xl(46009), date_fin_prevue: xl(46009), archive: false },
    { projet_id: p10.id, description: 'Changement fontaine + réglage café — Auchan Valdonne',
      priorite: 'normal', statut: 'fait', date_debut: xl(46041), date_fin_prevue: xl(46041), archive: false },
    { projet_id: p10.id, description: 'Remplacement Brio 3 laverie — Laverie',
      priorite: 'normal', statut: 'fait', date_debut: xl(46048), date_fin_prevue: xl(46052), archive: false },
    { projet_id: p10.id, description: 'Installation Geoeb — remplacement Royal par Koro',
      priorite: 'normal', statut: 'fait', date_debut: xl(46042), date_fin_prevue: null, archive: false },
    { projet_id: p10.id, description: 'Installation Rmtt — QR Code',
      priorite: 'normal', statut: 'fait', date_debut: null, date_fin_prevue: null, archive: false },
  ])
  await assigner(taches10[0].id, ['Angelo', 'Marcello'])
  await assigner(taches10[1].id, ['Angelo'])
  await assigner(taches10[2].id, ['Angelo'])
  await assigner(taches10[3].id, ['Angelo'])
  await assigner(taches10[4].id, ['Angelo'])
  await assigner(taches10[5].id, ['Angelo', 'Marcello', 'Christophe'])

  // ── 11. NOUVEAUX CLIENTS ──────────────────────────────────
  const [p11] = await supabase('POST', 'projets', [{
    nom: 'Nouveaux Clients', client: 'Auchan / Mbs',
    description: 'Installations pour nouveaux clients (OPERA / TANGO / ROBIMAT / Snakky...)',
    equipe: 'technique', statut: 'en cours', archive: false
  }])
  const taches11 = await supabase('POST', 'taches', [
    { projet_id: p11.id, description: 'Installation Auchan St Loup — OPERA/TANGO/ROBIMAT/Brio Up/MiniSnakky/Kikko Max',
      priorite: 'normal', statut: 'fait', date_debut: null, date_fin_prevue: null, archive: false },
    { projet_id: p11.id, description: 'Installation Auchan La Valentine — OPERA/TANGO (en cours)',
      priorite: 'normal', statut: 'en cours', date_debut: null, date_fin_prevue: null, archive: false },
    { projet_id: p11.id, description: 'Installation Mbs — fontaine à poser + sondage produits',
      priorite: 'normal', statut: 'en cours', date_debut: null, date_fin_prevue: xl(46073), archive: false },
  ])
  await assigner(taches11[0].id, ['Angelo', 'Marcello', 'Christophe'])
  await assigner(taches11[1].id, ['Angelo', 'Marcello', 'Christophe'])
  await assigner(taches11[2].id, ['Angelo', 'Marcello', 'Christophe'])

  // ── 12. DÉGUSTATION ───────────────────────────────────────
  const [p12] = await supabase('POST', 'projets', [{
    nom: 'Dégustation Café Pagliero', client: 'Certicall / Rmtt / Région / Valmante / Laphal / Avia / CMI',
    description: 'Essai café Pagliero et capsules Blue compatibles — panel de clients',
    equipe: 'operationnel', statut: 'en cours', archive: false
  }])
  const taches12 = await supabase('POST', 'taches', [
    { projet_id: p12.id, description: 'Dégustation café Pagliero — Certicall (G et C), Rmtt (G), Région (G), Valmante (C), Laphal (G et C), Avia (G), CMI (G)',
      priorite: 'normal', statut: 'en cours', date_debut: null, date_fin_prevue: null, archive: false },
  ])

  // ── 13. ÉTUDES & PROCESS ──────────────────────────────────
  const [p13] = await supabase('POST', 'projets', [{
    nom: 'Études & Process', client: 'Interne',
    description: 'Études internes et amélioration des processus',
    equipe: 'operationnel', statut: 'en attente', archive: false
  }])
  const taches13 = await supabase('POST', 'taches', [
    { projet_id: p13.id, description: 'Étude process contrôle dosage produits BC',
      priorite: 'normal', statut: 'en attente', date_debut: null, date_fin_prevue: null, archive: false },
  ])

  // ── 14. PROJET TARIFS ─────────────────────────────────────
  const [p14] = await supabase('POST', 'projets', [{
    nom: 'Projet Tarifs', client: 'Tous',
    description: 'Association des tarifs clients — créer tableau des équivalences et définir catégories',
    equipe: 'commercial', statut: 'en attente', archive: false
  }])
  const taches14 = await supabase('POST', 'taches', [
    { projet_id: p14.id, description: 'Créer tableau des équivalences — définir catégories de tarifs',
      priorite: 'normal', statut: 'en attente', date_debut: null, date_fin_prevue: null, archive: false },
  ])
  await assigner(taches14[0].id, ['Marcello', 'Christophe'])

  // ── 15. RECETTES BRIO TOUCH BLUE ─────────────────────────
  const [p15] = await supabase('POST', 'projets', [{
    nom: 'Recettes Brio Touch Blue', client: 'Systra / Région / Maestro Petro',
    description: 'Création et test des nouvelles recettes Brio Touch Blue',
    equipe: 'technique', statut: 'en cours', archive: false
  }])
  const taches15 = await supabase('POST', 'taches', [
    { projet_id: p15.id, description: 'Création recettes Brio Touch Blue — nouvelles recettes en test (Systra / Région / Maestro Petro)',
      priorite: 'normal', statut: 'fait', date_debut: xl(46132), date_fin_prevue: null, archive: false },
    { projet_id: p15.id, description: 'Vérifier dosage café — Maestro Petro, Systra, Région Sud (3 OPERA)',
      priorite: 'normal', statut: 'en cours', date_debut: null, date_fin_prevue: null, archive: false },
  ])
  await assigner(taches15[0].id, ['Angelo'])

  console.log('✅ Import terminé avec succès !')
  console.log(`   15 projets créés`)
  console.log(`   Employés : Angelo, Marcello, Christophe, Sebastien, Aldo`)
}

main().catch(err => {
  console.error('❌ Erreur:', err.message)
  process.exit(1)
})
