/* Chaînes d'interface. Le français est la langue par défaut et la référence.
   Ajouter une langue : copier le bloc "fr", traduire, l'ajouter à LANGS. Les clés manquantes retombent sur le français. */
(function () {
  'use strict';
  const LANGS = { fr: 'Français', en: 'English' };
  const D = {
    fr: {
      app: 'PréMatch', sub: 'Bowser', search: 'Adversaire… (ex. pika, peach)', prematch: 'Pré-match',
      prematch_last: 'Pré-match : {name}', prematch_none: 'Choisis un adversaire',
      favorites: 'Favoris', recents: 'Récents', all: 'Tous les matchups (du plus dur au plus simple)',
      difficulty: 'Difficulté', win: 'Comment il gagne', combos: 'Combos clés', setups: 'Situations à reconnaître',
      tips: 'Conseils Bowser', quick: 'Conseil rapide', close: 'Fermer', sources: 'Sources',
      inputs: 'Inputs', cond: 'Conditions', pct: '%', pos: 'Position', di: 'DI', goal: 'But', variants: 'Variantes',
      counters: 'Contre-mesures Bowser', detail: 'Détail', back: 'Retour',
      goal_kill: 'Kill', goal_racking: 'Racking', goal_stage_control: 'Contrôle', goal_setup: 'Setup',
      poppt_ref: 'Référence Poppt1', poppt_import: 'Importer cet exercice Poppt', to_link: 'à lier',
      stub: 'Fiche détaillée pas encore rédigée. La cote et la justification ci-dessus te donnent le plan de jeu de base.',
      stub_create: 'Rédiger cette fiche', reco: 'Reconnaître', answer: 'Réponse',
      nav_home: 'Accueil', nav_drills: 'Drills', nav_flash: 'Révision', nav_admin: 'Admin', nav_settings: 'Réglages',
      drills: 'Drills', start: 'Démarrer', pause: 'Pause', reset: 'Réinitialiser', rep: 'Série', done: 'Terminé !',
      steps: 'Étapes', import_poppt: 'Importer un exercice Poppt', flash: 'Révision rapide', reveal: 'Voir la réponse',
      knew: 'Je savais', again: 'À revoir', flash_q: 'Que fais-tu ?', flash_empty: 'Aucune carte.',
      admin: 'Administration', edit: 'Éditer', save: 'Enregistrer', saved: 'Enregistré', del: 'Supprimer', add: 'Ajouter',
      reset_default: 'Revenir au contenu d’origine', export: 'Exporter (sauvegarde)', import: 'Importer une sauvegarde',
      settings: 'Réglages', lang: 'Langue', theme: 'Thème', theme_auto: 'Automatique', theme_light: 'Clair', theme_dark: 'Sombre tournoi',
      wakelock: 'Garder l’écran allumé sur une fiche', storage: 'Stockage', cache_limit: 'Limite du cache médias (Mo)',
      vault_limit: 'Limite du coffre chiffré (Mo)', used: 'Utilisé', purge: 'Vider le cache médias', offline_dl: 'Télécharger les médias autorisés pour le hors-ligne',
      vault: 'Coffre chiffré (tes propres clips)', vault_create: 'Créer le coffre', vault_unlock: 'Déverrouiller', vault_lock: 'Verrouiller',
      vault_destroy: 'Supprimer le coffre et son contenu', passphrase: 'Phrase secrète (8+ caractères)', vault_locked: 'Verrouillé', vault_open: 'Déverrouillé',
      media_locked: 'Média local chiffré — déverrouille le coffre dans Réglages', media_online: 'Lire l’extrait (en ligne)', media_offline: 'Hors-ligne : ouvre le lien plus tard',
      open_link: 'Ouvrir la source', perm: 'Droits', perm_original: 'Original', perm_lien_seulement: 'Lien seulement', perm_autorise: 'Autorisé par l’auteur',
      perm_perso: 'Clip perso', perm_cc_by_sa: 'CC BY-SA', to_check: 'à vérifier', no_result: 'Aucun résultat',
      sources_title: 'Sources', veille: 'Veille (candidats importés)', veille_import: 'Importer veille.json',
      install_hint: 'Astuce : « Ajouter à l’écran d’accueil » pour l’ouvrir en 1 tap, même hors-ligne.'
    },
    en: {
      app: 'PreMatch', sub: 'Bowser', search: 'Opponent… (e.g. pika, peach)', prematch: 'Pre-match',
      prematch_last: 'Pre-match: {name}', prematch_none: 'Pick an opponent', favorites: 'Favorites', recents: 'Recent',
      all: 'All matchups (hardest to easiest)', difficulty: 'Difficulty', win: 'How they win', combos: 'Key combos',
      setups: 'Situations to recognize', tips: 'Bowser tips', quick: 'Quick tip', close: 'Close', sources: 'Sources',
      inputs: 'Inputs', cond: 'Conditions', pos: 'Position', goal: 'Goal', variants: 'Variants', counters: 'Bowser counterplay',
      detail: 'Details', back: 'Back', nav_home: 'Home', nav_drills: 'Drills', nav_flash: 'Review', nav_admin: 'Admin', nav_settings: 'Settings',
      start: 'Start', pause: 'Pause', reset: 'Reset', reveal: 'Show answer', knew: 'Knew it', again: 'Again', flash_q: 'What do you do?',
      save: 'Save', saved: 'Saved', del: 'Delete', add: 'Add', settings: 'Settings', lang: 'Language', theme: 'Theme',
      theme_auto: 'Auto', theme_light: 'Light', theme_dark: 'Tournament dark', open_link: 'Open source', no_result: 'No result'
    }
  };
  let cur = 'fr';
  self.PMI18n = {
    LANGS,
    set(l) { cur = D[l] ? l : 'fr'; document.documentElement.lang = cur; },
    get: () => cur,
    t(k, vars) {
      let s = (D[cur] && D[cur][k]) || D.fr[k] || k;
      if (vars) for (const v in vars) s = s.replace('{' + v + '}', vars[v]);
      return s;
    }
  };
})();
