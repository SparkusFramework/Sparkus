# Découverte des contrôleurs : coût au démarrage

2026-10-19 · win32 · Bun 1.4.3 · Node v20.17.0 · `bun bench/discovery.ts --runs 15 --controllers 20,100,400` · médianes

App générée : N dossiers de fonctionnalité, chacun avec un contrôleur (5 routes, un schéma `params`) et un service injecté. Deux entrées sur les mêmes fichiers : **listés** (`import` de chaque contrôleur + `controllers: [...]`) et **trouvés** (`createApp()` seul). Chaque mesure est un process neuf qui fait `init()` puis s'arrête. *Prêt* : `performance.now()` après `init()` (depuis le lancement du process). *Process* : du spawn à la sortie, vu par le parent. `dist` : un fichier JS par fichier TS (ce qu'émet `tsc`, ce que charge une app déployée sans bundle). `bundle` : chaque entrée bundlée seule avec `sparkusPlugin()` (`--target node`, comme `sparkus build`), contrôleurs trouvés au build.

| Contrôleurs | Runtime | Sources | Listés : prêt (ms) | Trouvés : prêt (ms) | Écart | Listés : process (ms) | Trouvés : process (ms) |
|---:|---|---|---:|---:|---:|---:|---:|
| 20 | bun | src | 24.0 | 26.2 | +2.2 | 33 | 35 |
| 20 | bun | dist | 27.1 | 29.9 | +2.8 | 36 | 39 |
| 20 | node | dist | 62.3 | 66.9 | +4.5 | 80 | 84 |
| 20 | bun | bundle | 22.6 | 22.7 | +0.0 | 31 | 31 |
| 20 | node | bundle | 31.2 | 31.1 | -0.1 | 49 | 48 |
| 100 | bun | src | 41.1 | 48.8 | +7.7 | 50 | 58 |
| 100 | bun | dist | 61.2 | 70.5 | +9.3 | 71 | 81 |
| 100 | node | dist | 164.3 | 178.2 | +13.8 | 185 | 200 |
| 100 | bun | bundle | 33.6 | 33.8 | +0.3 | 42 | 43 |
| 100 | node | bundle | 41.5 | 42.7 | +1.1 | 60 | 61 |
| 400 | bun | src | 115.5 | 136.0 | +20.5 | 126 | 148 |
| 400 | bun | dist | 182.0 | 219.4 | +37.4 | 193 | 232 |
| 400 | node | dist | 525.5 | 580.6 | +55.1 | 559 | 615 |
| 400 | bun | bundle | 76.8 | 78.3 | +1.5 | 87 | 88 |
| 400 | node | bundle | 82.8 | 82.5 | -0.3 | 113 | 113 |

## Où passe le temps (400 contrôleurs, Bun, sources)

- Lecture des dossiers (`Bun.Glob`, 400 dossiers, 800 fichiers) : **14 à 15 ms** sous Windows, la plus grosse part de l'écart.
- Les `import()` dynamiques en parallèle coûtent autant que le graphe d'imports statique (75 à 100 ms dans les deux cas).

## Pistes mesurées

| Piste | Résultat | Gardée |
|---|---|---|
| `Bun.Glob.scanSync` au lieu d'un parcours `readdirSync` | mêmes fichiers, ≈ 10 % plus rapide (3,2 contre 3,5 ms pour 50 dossiers, 12,5 contre 13,7 ms pour 200) | oui, sous Bun |
| API natives de Bun au lieu de `node:fs`, `node:url`, `node:path` | leur premier chargement coûte 1,8 + 1,0 + 0,6 ms sous Bun | oui : `Bun.Glob`, `Bun.file().exists()`, `Bun.pathToFileURL`, chemins calculés en `URL` |
| `process.getBuiltinModule` au lieu de `import("node:…")` sous Node | 0,03 à 0,24 ms au lieu de 1,3 ms | oui (repli sur `import()` avant Node 20.16) |
| Imports lancés pendant le scan (`Bun.Glob.scan` asynchrone) | 88 à 94 ms contre 90 à 98 ms : dans le bruit | non (plus de code, aucun gain prouvé) |
| Un seul module qui réexporte tous les contrôleurs (URL `data:`) | plus lent sous Node (388 contre 344 ms) | non |
| Build avec `splitting` pour `dist` | biaisé : `listed.js` importe les chunks directement, `found.js` les 400 fichiers d'entrée puis leurs chunks (800 fichiers contre 400) | non, remplacé par un fichier JS par fichier TS |

## Lecture

Sans bundle, le surcoût est la lecture des dossiers : environ 0,035 ms par contrôleur sous Bun et 0,1 ms sous Node, sous Windows où lister un dossier est lent (à remesurer sous Linux, D8). Une app de 20 contrôleurs paie 2 à 4 ms une fois au démarrage, rien par requête.

En bundle (`sparkus build`), les contrôleurs sont trouvés au build et importés statiquement : l'écart tombe dans le bruit (−0,3 à +1,5 ms à 400 contrôleurs). Le bundle démarre aussi bien plus vite que les fichiers séparés, avec ou sans découverte (Node, 400 contrôleurs : 83 ms contre 526 ms ; Bun : 77 contre 182 ms) : c'est la forme à déployer.
