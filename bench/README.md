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

Autres outils (tous sous le verrou machine) :

- `bun run.ts --targets sparkus-pipeline-bun,sparkus-pipeline-node --scenarios pipe-none,pipe-guard,...` : coût des guards et intercepteurs sur les vrais moteurs. `error-404` et `error-400` (floods de requêtes en erreur) marchent sur toutes les cibles. `list` (`GET /users`, 10 enregistrements réduits à 4 de leurs 6 champs par le schéma `response`) ne vise que les cibles Sparkus. Ces cibles et scénarios ne tournent que si on les nomme.
- `bun run.ts --targets sparkus-bun,sparkus-prod-bun,fastify,fastify-logger ...` : coût des options de production. `sparkus-prod-*` est la même app avec logs de requêtes (vers stdout, ignoré par le harnais), headers de sécurité, request id, CORS et health ; `fastify-logger` est Fastify avec pino. Puis `bun compare.ts results/<session>.json sparkus-prod-bun:sparkus-bun fastify-logger:fastify` donne les ratios appariés round par round, avec les mêmes verdicts que l'A/B.
- `bun startup.ts [--runs 10] [--routes 100,1000]` : démarrage à froid (spawn → première réponse 200) et RSS, petites apps et apps générées de N routes (`targets/large/`).
- `bun with-lock.ts -- bun micro/pipeline.js [coreDist]`, `... micro/validator.js`, `... micro/serializer.js` (ou `node` à la place de `bun`) : micro-benchs en process du pipeline compilé, de la validation (contre TypeBox et ajv) et de la sérialisation des réponses (JSON natif, sérialiseur compilé, projection ; sous Bun, avec la construction de la `Response`). Ils refusent de tourner sans le verrou.

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

Ce qui reste une hypothèse : que **chaque** chute des anciennes sessions vienne d'un voisin SMT (le placement des threads n'était pas tracé). Le mécanisme et l'amplitude sont prouvés, pas l'attribution de chaque chute passée.

### Validation de la méthode (machine de dev, 17/10/2026)

- **Test A/A** : `--targets sparkus-node --scenarios hello,params-query --baseline HEAD --rounds 5 --duration 5` (le même code des deux côtés) donne **≈** sur les deux scénarios, débit et efficacité CPU : pas de faux positif. Étendue des ratios appariés : −3,4 % à +9,5 %.
- **Résolution pratique** : avec 5 rounds de 5 s, une mesure isolée bouge de ±5 % ; un gain de 2 – 3 % ne sera « prouvé » que s'il est régulier. Pour un écart plus fin : plus de rounds (le verdict exige alors que **tous** soient du même côté, ce qui reste strict), pas des mesures plus longues.
- **Épinglé vs non épinglé** (node-raw, sparkus-node, fastify, 4 rounds chacun, même session) : étendues comparables (2 – 7 %) ; la machine était calme (CPU des autres process : médiane 14 – 31 % d'un cœur) et aucun « mode lent » ne s'est produit sans épinglage. L'épinglage supprime le mécanisme prouvé, il n'a pas de coût mesurable (node-raw 63,3k épinglé, 63,1k non épinglé).
- Le « CPU des autres process » est une estimation (charge totale échantillonnée chaque seconde moins les compteurs des process du bench) : ±70 % d'un cœur, d'où des valeurs parfois négatives et le seuil « bruité » à 150 %.

Remèdes, dans l'ordre : épinglage (par défaut), rounds entrelacés et ratios appariés, contexte machine sur chaque mesure, et **une machine calme** : pas de build, de tests ou de jeu pendant un bench (l'épinglage ne peut pas empêcher un autre process d'utiliser le frère SMT du serveur).

## Équité

Chaque framework est écrit **de façon idiomatique**, avec sa configuration recommandée :

| Cible | Validation | Particularités |
|---|---|---|
| `bun-raw`, `node-raw` | à la main | plafonds, sans framework |
| Sparkus | schéma compilé (`t.*`) | décorateurs TC39, `inject()`, paquet `sparkus` (v1) ; schémas `response` (champs non déclarés retirés, D12), comme Fastify |
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

## Session de référence

[`reference/2026-10-17-windows.md`](reference/2026-10-17-windows.md) (+ JSON brut) : 8 cibles × 3 scénarios × 5 rounds, épinglé, Windows (non publiable, D8). À relancer sous Linux pour publier. Constats « prouvés » (5 rounds sur 5 du même côté) :

- `sparkus-bun` est au plafond sur `hello` et `params-query` (≈ bun-raw), mais à **95 %** sur `post-validate` (bun-raw +5,2 %, et spike-bun devant lui).
- `sparkus-node` est au plafond sur `hello`, à **91 %** sur `params-query` et **97 %** sur `post-validate` (node-raw devant, prouvé).
- `spike-node` dépasse `node-raw` sur `hello` (103 %) et `sparkus-node` de 2,8 % (prouvé) : `node-raw` n'est pas un vrai plafond sous Node, et le moteur Node v1 a régressé sur `hello` par rapport au prototype.
- Sparkus devance Elysia (+6,4 % sur `post-validate`, ≈ ailleurs) et Fastify (+14 % sur `hello`, +6,2 % sur `params-query`, +19,8 % sur `post-validate`).
