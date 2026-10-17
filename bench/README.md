# Sparkus bench

Harnais reproductible qui compare Sparkus à NestJS, Fastify, Express, Elysia et Hono, avec le serveur brut de chaque runtime comme plafond (100 %).

## Lancer

```bash
bun install
```

```bash
bun run bench
```

`bun run bench` compile tout (paquets, spike, cibles) puis lance `run.ts`. Pour relancer sans recompiler : `bun run.ts [options]` depuis `bench/`.

| Option | Défaut | Rôle |
|---|---|---|
| `--targets a,b` | toutes | cibles (`targets.ts`) |
| `--scenarios a,b` | tous | scénarios (`scenarios.ts`) |
| `--rounds N` | 3 (5 avec `--baseline`) | nombre de rounds ; `--runs` est un alias |
| `--duration S` | 10 | secondes mesurées par (cible, scénario, round) |
| `--warmup S` | 3 | secondes de warm-up avant chaque mesure |
| `--cooldown S` | 0 | pause avant chaque mesure (sans effet mesurable sur cette machine, voir plus bas) |
| `--connections N` | 100 | connexions autocannon |
| `--workers N` | 4 | threads autocannon (un seul thread plafonne avant `bun-raw`) |
| `--pin 0\|1` | 1 | épinglage CPU, voir « Méthode » |
| `--baseline <ref git>` | – | mode A/B, voir plus bas |
| `--label nom` | – | écrit aussi `results/<nom>.md` (sessions enchaînées) |

`NODE_BIN` choisit le binaire Node des cibles Node et d'autocannon (par défaut `node` du PATH ; il faut Node 22+).

Les résultats vont dans `results/` : un JSON brut par session (chaque mesure, avec son contexte machine) et `latest.md` (tableaux).

## Prouver un gain (A/B)

Pour toute PR qui touche au chemin d'une requête :

```bash
bun run bench --targets sparkus-bun,sparkus-node --scenarios hello,params-query,post-validate --baseline main --rounds 5 --duration 5 --warmup 2
```

- `--baseline main` clone le dépôt à `main` dans le dossier temporaire du système (`sparkus-bench-baseline/<sha>`, réutilisé ensuite), le compile, et ajoute une cible jumelle `sparkus-bun@main` pour chaque cible Sparkus. N'importe quelle ref marche (`HEAD~1`, un sha, une branche) à partir de la v1. Les modifications **non commitées** sont du côté « arbre de travail ».
- Les deux builds tournent dans la **même session**, en alternance A B, B A, B A, A B… ; le ratio est calculé **round par round**, ce qui annule la dérive lente de la machine.
- Le tableau « A/B » donne le ratio médian (et l'étendue) du débit et de l'efficacité CPU (req par s CPU), avec un verdict :
  - **prouvé** : au moins 5 rounds, **tous** du même côté (test des signes, p ≤ 3 %) ;
  - **indicatif** : tous d'accord, mais moins de 5 rounds ;
  - **≈** : les rounds se contredisent, la différence est dans le bruit. Ne rien revendiquer.
- Un gain n'est revendiqué que **prouvé**, sur le débit ou sur l'efficacité CPU, et sans régression **prouvée** sur un autre scénario. Coller le tableau A/B dans la PR, avec les lignes « Machine pendant la session ».
- Sanity check : `--baseline HEAD` sans modification doit donner **≈** partout (test A/A). Si ce n'est pas le cas, la machine est trop bruitée.

Coût : 2 cibles × 3 scénarios × 5 rounds × ~9 s ≈ 5 min de verrou par moteur. Une seule cible (`--targets sparkus-node`) divise par deux.

## Méthode

- **Rounds entrelacés.** Chaque round mesure chaque (cible, scénario) une fois. L'ordre de base est tiré au hasard, puis tourné et inversé un round sur deux : chaque cible passe tôt et tard aussi souvent que les autres.
- **Ratios appariés.** « % du plafond », « vs suivant » et l'A/B sont calculés dans chaque round (deux mesures proches dans le temps), puis résumés par médiane et étendue (min – max). On n'interprète jamais une différence plus petite que l'étendue.
- Chaque cible tourne **seule**, dans son propre process (un process neuf par round), sur un port neuf.
- Avant toute mesure, la cible est vérifiée contre le **contrat** (`scenarios.ts`) : statut, `content-type` JSON, corps identique, et refus d'un body invalide.
- Warm-up, puis mesure avec autocannon dans un **process séparé**.
- **Épinglage CPU** (`--pin 1`) : le serveur a un cœur physique pour lui seul (ses deux threads SMT, CPU 2 et 3 sur 16 CPU logiques), autocannon tourne sur la moitié haute des cœurs, le cœur 0 reste à l'OS. Windows : `ProcessorAffinity` ; Linux : `taskset`.
- **Contexte machine** : un échantillonneur relève chaque seconde l'horloge effective du CPU et la charge totale. Chaque mesure enregistre le CPU du serveur, celui d'autocannon et celui de **tous les autres process**. Une mesure où les autres process dépassent 150 % d'un cœur est signalée « bruitée ».
- Mémoire : pic de RSS du process serveur, médiane des rounds.
- **Un seul bench à la fois par machine** : `run.ts` prend un verrou dans le dossier temporaire du système (partagé par tous les checkouts et worktrees) et attend s'il est pris, **dans l'ordre d'arrivée** (file `sparkus-bench.queue`). Un verrou laissé par un process mort est repris. Toute mesure ad hoc (profil, sonde, script maison) passe par le même verrou :

  ```bash
  bun with-lock.ts -- node --cpu-prof server.js --- bun run.ts --targets sparkus-node --label a
  ```

  `with-lock.ts` tient le verrou pour toute la chaîne (commandes séparées par `---`) ; un `run.ts` lancé dedans ne l'attend pas. Dans un script, `acquireMachineLock()`, `cpuLayout()` et `setAffinity()` de `system.ts`. Garder chaque prise de verrou courte : les autres attendent.

## La dérive sous Windows : cause trouvée

Symptôme initial (1 run, cibles non épinglées) : jusqu'à −40 % pour une cible selon la session (fastify 53k puis 33k req/s, node-raw 63k puis 42k), et un classement qui dépend de l'ordre de passage.

Mesuré sur la machine de dev (Ryzen 7 7800X3D, 8 cœurs / 16 threads, plan « Haute performance », Windows 11), avec des sondes qui prennent le verrou :

| Hypothèse | Expérience | Résultat | Verdict |
|---|---|---|---|
| Throttling thermique / énergie | node-raw mesuré 24 × 5 s d'affilée dans le même process, horloge relevée chaque seconde | 56k – 62k, aucune tendance (corrélation débit/temps +0,18 sur 34 mesures) ; horloge effective 113 – 116 % du nominal pendant toute la charge | **écarté** |
| Pause entre mesures | 4 mesures précédées de 15 s d'inactivité | 57k – 62k, comme sans pause | **écarté** (d'où `--cooldown 0`) |
| Ports / TIME_WAIT, process neuf | 6 process neufs sur 6 ports neufs | 60,6k – 62,6k ; ≤ 33 sockets en TIME_WAIT | **écarté** |
| Charge des autres process | CPU des autres process relevé pendant chaque mesure | corrélation débit / CPU des autres = **−0,74** (34 mesures node-raw) | **confirmé** (source de bruit) |
| Voisin sur le même cœur physique (SMT) | serveur épinglé sur le CPU 2, voisin épinglé sur son frère SMT (CPU 3) ou sur un autre cœur, 3 rounds alternés | boucle de calcul sur le frère : **−17 %** (49,7k – 50,8k contre 57,5k – 63,6k) ; même boucle sur un autre cœur : pas d'effet ; **serveur HTTP chargé sur le frère : −51 %** (28,1k – 28,9k contre 56,7k – 59,6k) | **prouvé** (mécanisme et amplitude) |

Conclusion : un serveur Node ou Bun est mono-thread et sature son cœur (CPU ≈ 100 – 110 %). Quand l'ordonnanceur place sur le **frère SMT** de ce cœur un thread chargé (un worker autocannon, un autre serveur, un `tsc` d'une session voisine…), le coût CPU de chaque requête augmente de 17 à 51 %, alors que le CPU consommé reste à 100 % : c'est exactement la signature des anciennes sessions (CPU constant à 110 %, débit −40 %, y compris entre deux scénarios d'un même process, quand autocannon redémarre et que ses workers atterrissent ailleurs). Ce n'est pas une dérive dans le temps : c'est un tirage au sort du placement, à chaque process et à chaque lancement d'autocannon.

Ce qui reste une hypothèse : que **chaque** chute des anciennes sessions vienne d'un voisin SMT (le placement des threads n'était pas tracé). Le mécanisme et l'amplitude sont prouvés ; la validation A/A ci-dessous montre l'effet de l'épinglage sur l'étendue.

Remèdes, dans l'ordre : épinglage (par défaut), rounds entrelacés et ratios appariés, contexte machine sur chaque mesure, et **une machine calme** : pas de build, de tests ou de jeu pendant un bench (l'épinglage ne peut pas empêcher un autre process d'utiliser le frère SMT du serveur).

## Équité

Chaque framework est écrit **de façon idiomatique**, avec sa configuration recommandée :

| Cible | Validation | Particularités |
|---|---|---|
| `bun-raw`, `node-raw` | à la main | plafonds, sans framework |
| Sparkus | schéma compilé (`t.*`) | décorateurs TC39, `inject()`, paquet `sparkus` (v1) |
| `spike-bun`, `spike-node` | schéma compilé (`t.*`) | prototype de la phase 0, référence anti-régression (temporaire) |
| Elysia | TypeBox (`t.*`) | répond 422 sur body invalide |
| Hono | Zod (`@hono/zod-validator`) | |
| Fastify | JSON Schema (ajv) | schémas de réponse (fast-json-stringify) |
| Express 5 | Zod | réglages par défaut |
| NestJS (Express / Fastify) | class-validator + `ValidationPipe` | module + service injecté |

## Limites

- Sous Windows, le plafond mesuré est celui de la pile réseau Windows : **les chiffres publiables doivent venir de Linux** (D8). Les sessions Windows servent aux comparaisons A/B et aux classements relatifs.
- Générateur de charge et serveur partagent la même machine (sur des cœurs distincts avec `--pin 1`).
- Avec 3 rounds, « tous d'accord » arrive par hasard une fois sur quatre : c'est pourquoi le verdict reste *indicatif* sous 5 rounds.

## Linux (D8)

État de la machine de dev : WSL 3.0.3 (noyau 6.18) est installé et l'hyperviseur est actif, mais **aucune distribution n'est installée** ; Docker est absent.

Pour des chiffres publiables, par ordre de préférence :

1. **Machine Linux dédiée** (ou VM cloud à cœurs dédiés, ex. instance « dedicated » / « metal »), Ubuntu 24.04, gouverneur CPU `performance`, SMT laissé actif mais `--pin 1` (lit la topologie dans `/sys`), rien d'autre qui tourne. Installer Bun 1.4.x, Node 24 (`NODE_BIN`), cloner, `bun install`, `bun run bench --rounds 5`.
2. **WSL 2** sur la machine de dev pour une première comparaison sous noyau Linux : `wsl --install -d Ubuntu-24.04` (installation par l'utilisateur, à faire soi-même), puis Bun, Node 24, `taskset` (paquet `util-linux`, présent par défaut). C'est une VM Hyper-V partageant le CPU avec Windows : utile pour vérifier que les écarts tiennent sous Linux, pas pour publier.

Publier avec le JSON brut, la sortie de `lscpu`, `uname -a` et les versions (Bun, Node), comme le fait déjà l'en-tête de `latest.md`.
