# FFXIV Achievement Tracker

Application desktop **Electron** (100 % locale) pour suivre tes hauts faits Final Fantasy XIV,
gérer des priorités, une liste « focus », des notes/tags, et obtenir des suggestions de
« à faire ensuite ». Synchronisation à la demande depuis le **Lodestone**.

## Installation (Windows)

L'app n'a pas de dépendance native : il suffit de l'installer une fois.

1. Récupère le dépôt et installe les dépendances, puis génère l'installeur :
   ```bash
   git clone https://github.com/tristan-spinnewyn/Achievment-tracker.git
   cd Achievment-tracker
   npm install
   npm run dist
   ```
2. Les artefacts apparaissent dans le dossier **`release/`** :
   - `FFXIV Achievement Tracker Setup x.y.z.exe` — **installeur** (NSIS) : double-clique, choisis le
     dossier d'installation, et l'app est ajoutée au menu Démarrer.
   - `FFXIV Achievement Tracker x.y.z.exe` — version **portable** (aucune installation, lance le `.exe`).

> Mise à jour de l'app : relance `git pull && npm install && npm run dist`, puis réinstalle avec le
> nouvel installeur. Tes données (progression, priorités, notes…) sont conservées — elles vivent dans
> `%APPDATA%\ffxiv-achievement-tracker\` (voir [Stockage local](#stockage-local)), pas dans le dossier
> d'installation.

## Fonctionnalités

- **Catalogue complet** des hauts faits (issu de XIVAPI v2, ~3900 entrées), mis en cache localement.
- **Synchro Lodestone à la demande** : récupère automatiquement tes hauts faits *obtenus* (+ dates)
  depuis ta page publique du Lodestone. Correction manuelle toujours possible.
- **Table maîtresse** : recherche, filtres (type, catégorie, statut, points, obtenable, note),
  tri multi-critères, virtualisation (fluide sur des milliers de lignes).
- **Priorités** (aucune / basse / moyenne / haute) et **liste Focus** réordonnable (glisser-déposer).
- **Notes**, **tags** et **échéances** par haut fait (panneau de détail).
- **Score de difficulté** : chaque haut fait reçoit un score (modèle additif borné : points + palier
  Ultime/Sadique/Extrême + grind + défi + contexte + récence + saisonnier), affiché en badge, filtrable
  et triable. Répartition et « plus durs encore à faire » sur le tableau de bord.
- **Tableau de bord** : progression par type et par catégorie, points, derniers obtenus, difficulté.
- **Suggestions** : moteur heuristique réglable (priorité, points, proximité de catégorie).
- **Tâches récurrentes** : checklist avec reset automatique — quotidien (15 h UTC = 17 h Paris l'été),
  hebdomadaire (mardi 8 h UTC = 10 h) et **missions de ravitaillement** de grande compagnie
  (20 h UTC = 22 h Paris l'été). Compte à rebours, **séries (streaks)**, alerte au lancement et
  **notifications planifiées à chaque reset**.

## Prérequis à la synchro Lodestone

1. Sur le Lodestone, rends tes hauts faits **publics**
   (Profil du personnage → Paramètres de confidentialité).
2. Dans l'app : **Paramètres** → renseigne la **région** et ton **ID Lodestone**
   (ou colle l'URL de ton personnage) → **Synchroniser**.

> Le Lodestone n'expose que les hauts faits **obtenus** (pas la progression partielle type « 47/50 »).
> L'app détecte donc automatiquement ce qui est *fait* ; le « reste à faire » est priorisé manuellement
> ou via les suggestions.

## Développement

```bash
npm install          # installe les dépendances
npm run dev          # lance l'app en mode développement (HMR)
npm run typecheck    # vérification TypeScript (main + renderer)
npm test             # tests unitaires (Vitest : resets, difficulté, recherche)
npm run build        # build de production (sans empaquetage)
```

> Note : si Electron ne se lance pas après l'install (« Electron uninstall »), exécute une fois
> `node node_modules/electron/install.js` (le binaire n'avait pas été téléchargé).

## Empaquetage (.exe Windows)

```bash
npm run dist         # installeur NSIS + version portable -> dossier release/
npm run dist:dir     # app décompressée (plus rapide, pour tester) -> release/win-unpacked/
```

## Mise à jour du catalogue

Nouveau patch FFXIV ? **Paramètres → Mettre à jour depuis XIVAPI**, ou en ligne de commande :

```bash
npm run build:catalog   # régénère resources/catalog-snapshot.json
```

## Stockage local

Tout est stocké en JSON dans le dossier `userData` d'Electron
(`%APPDATA%\ffxiv-achievement-tracker\` sous Windows) :

- `catalog.json` — le catalogue des hauts faits (cache).
- `userdata.json` — tes données : complétions, priorités, focus, notes, tags, paramètres, journal de
  synchro. **C'est le fichier à sauvegarder** pour conserver ta progression.

## Pile technique

Electron 42 · React 18 · Vite 7 · TypeScript · Tailwind CSS · Zustand · TanStack Virtual · dnd-kit.
Stockage JSON local (pas de base native → aucun outil de compilation requis).
