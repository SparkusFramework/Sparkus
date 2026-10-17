# Contexte de requête par AsyncLocalStorage (`logger.requestContext`)

Cibles : `sparkus-context-*` (l'option seule) contre `sparkus-*` (aucune option) ; `sparkus-prodctx-*` (profil production + l'option) contre `sparkus-prod-*` (profil production). Le service du bench ne journalise rien : la mesure est celle de `als.run()` autour de chaque requête.

## Micro-bench (`bench/micro/als.js`, sous verrou)

| | Bun 1.4.3 | Node 24.22.0 |
|---|---:|---:|
| handler sync, sans ALS | 2,4 ns | 1,6 ns |
| `als.run(ctx, handler, ctx)`, handler sync | 17,0 ns | 149,7 ns |
| handler async (1 `await`), sans ALS | 97,6 ns | 79,3 ns |
| `als.run`, handler async (1 `await`) | 118,5 ns | 220,9 ns |
| `als.run`, handler async (2 `await`) | 161,6 ns (141,4 sans) | 254,3 ns (112,9 sans) |
| `getStore()` dans `run` | 5,0 ns | 8,1 ns |
| requêtes sans `run()` une fois l'ALS créé, ou après | ≈ | ≈ |

Sous Node 24 (AsyncContextFrame), `run()` passe deux fois par `enterWith`, qui alloue une nouvelle frame (une `Map`) à chaque fois. Le micro-bench sous-estime le coût réel : l'A/B HTTP ci-dessous trouve ~0,7 µs par requête sous Node.

# Résultats du bench

2026-10-17T17:11:02.041Z · win32 · 16 CPU logiques · Bun 1.4.3 · Node v24.22.0 · 5 rounds · 5 s (+2 s de warm-up, 0 s de pause) · 100 connexions · autocannon 4 thread(s) · serveur épinglé sur les CPU 2,3, autocannon sur 8,9,10,11,12,13,14,15

Lecture : req/s = médiane des rounds ; *min – max* = étendue des rounds ; *écart* = (max − min) / médiane. Les ratios (% du plafond, vs suivant) sont calculés **dans chaque round** puis résumés. **≈** : les rounds ne sont pas tous du même côté, la différence est dans le bruit. *indicatif* : tous les rounds sont d'accord, mais moins de 5 rounds.

## hello — GET / returning a small JSON object

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun** | bun | 83 206 | 80 314 – 84 320 | 5 % | – | +1.1 % ≈ | 1 | 101 % | 82 171 | 39 |
| **sparkus-context-bun** | bun | 82 874 | 77 856 – 83 322 | 7 % | – | +18.2 % | 1 | 100 % | 82 991 | 40 |
| **sparkus-prod-bun** | bun | 70 125 | 68 832 – 70 765 | 3 % | – | +0.1 % ≈ | 2 | 101 % | 68 853 | 41 |
| **sparkus-prodctx-bun** | bun | 69 715 | 68 653 – 70 509 | 3 % | – | +10.3 % | 2 | 101 % | 69 278 | 42 |
| **sparkus-node** | node | 62 730 | 61 846 – 64 803 | 5 % | – | +3.9 % | 2 | 101 % | 61 914 | 66 |
| **sparkus-context-node** | node | 60 451 | 60 355 – 61 578 | 2 % | – | +20.4 % | 2 | 100 % | 60 455 | 72 |
| **sparkus-prod-node** | node | 50 224 | 49 104 – 51 690 | 5 % | – | +4.1 % | 2 | 101 % | 49 907 | 91 |
| **sparkus-prodctx-node** | node | 47 760 | 47 152 – 49 078 | 4 % | – |  | 2 | 101 % | 47 172 | 92 |

## params-query — GET /users/:id?fields= through a service

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-context-bun** | bun | 78 970 | 74 400 – 79 469 | 6 % | – | −0.4 % ≈ | 1 | 100 % | 79 141 | 40 |
| **sparkus-bun** | bun | 78 470 | 76 179 – 79 750 | 5 % | – | +18.2 % | 1 | 100 % | 78 227 | 40 |
| **sparkus-prod-bun** | bun | 66 413 | 65 699 – 67 411 | 3 % | – | +0.9 % | 2 | 102 % | 65 644 | 42 |
| **sparkus-prodctx-bun** | bun | 65 504 | 64 413 – 66 822 | 4 % | – | +8.5 % | 2 | 101 % | 65 298 | 42 |
| **sparkus-node** | node | 60 566 | 58 410 – 61 680 | 5 % | – | +5.0 % | 1 | 100 % | 60 377 | 74 |
| **sparkus-context-node** | node | 58 326 | 56 848 – 58 653 | 3 % | – | +21.0 % | 2 | 100 % | 58 323 | 87 |
| **sparkus-prod-node** | node | 47 888 | 47 190 – 49 142 | 4 % | – | +3.2 % | 2 | 100 % | 47 827 | 120 |
| **sparkus-prodctx-node** | node | 46 435 | 45 251 – 46 493 | 3 % | – |  | 2 | 100 % | 46 290 | 119 |

## post-validate — POST /users with a JSON body validated against a schema, 201

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun** | bun | 67 859 | 66 682 – 68 986 | 3 % | – | +0.8 % | 1 | 101 % | 67 223 | 40 |
| **sparkus-context-bun** | bun | 67 142 | 63 536 – 68 435 | 7 % | – | +13.4 % | 1 | 101 % | 66 716 | 41 |
| **sparkus-prod-bun** | bun | 59 011 | 57 354 – 59 453 | 4 % | – | +0.6 % ≈ | 2 | 101 % | 58 098 | 42 |
| **sparkus-prodctx-bun** | bun | 57 565 | 57 040 – 59 114 | 4 % | – | +23.4 % | 2 | 101 % | 57 387 | 43 |
| **sparkus-node** | node | 47 376 | 46 077 – 47 760 | 4 % | – | +3.3 % | 2 | 100 % | 47 531 | 75 |
| **sparkus-context-node** | node | 45 322 | 44 381 – 46 198 | 4 % | – | +19.6 % | 2 | 101 % | 44 906 | 88 |
| **sparkus-prod-node** | node | 37 558 | 37 130 – 38 698 | 4 % | – | +4.3 % | 3 | 100 % | 37 673 | 122 |
| **sparkus-prodctx-node** | node | 36 368 | 35 453 – 37 091 | 5 % | – |  | 3 | 100 % | 36 249 | 120 |

## Mémoire (pic du process, médiane des rounds)

| Cible | RSS pic (Mo) |
|---|---:|
| sparkus-bun | 51 |
| sparkus-node | 77 |
| sparkus-prod-bun | 53 |
| sparkus-prod-node | 123 |
| sparkus-context-bun | 52 |
| sparkus-prodctx-bun | 54 |
| sparkus-context-node | 90 |
| sparkus-prodctx-node | 122 |

## Machine pendant la session

- Horloge effective : 114 % – 119 % de la fréquence nominale.
- CPU des autres process (hors serveur et autocannon, sampler compris) : médiane 4 %, max 122 % d'un cœur.
- Autocannon : max 206 % d'un cœur (4 thread(s) : s'il approche 400 %, c'est lui le goulot).

## Coût de l'option (bench/compare.ts, ratios appariés)

| A / B | Scénario | req/s | verdict | req par s CPU | verdict |
|---|---|---:|---|---:|---|
| sparkus-context-bun / sparkus-bun | hello | −1.1 % (−3.1 % – +0.9 %) | ≈ | −0.7 % (−2.1 % – +2.4 %) | ≈ |
| sparkus-context-bun / sparkus-bun | params-query | −0.4 % (−2.3 % – +0.7 %) | ≈ | −0.1 % (−2.0 % – +1.9 %) | ≈ |
| sparkus-context-bun / sparkus-bun | post-validate | −0.8 % (−4.7 % – −0.7 %) | prouvé | −1.4 % (−5.3 % – +0.1 %) | ≈ |
| sparkus-prodctx-bun / sparkus-prod-bun | hello | −0.1 % (−2.1 % – +0.1 %) | ≈ | −0.2 % (−0.9 % – +0.6 %) | ≈ |
| sparkus-prodctx-bun / sparkus-prod-bun | params-query | −0.9 % (−2.0 % – −0.1 %) | prouvé | −0.1 % (−2.1 % – +1.3 %) | ≈ |
| sparkus-prodctx-bun / sparkus-prod-bun | post-validate | −0.6 % (−3.3 % – +0.2 %) | ≈ | +0.1 % (−2.4 % – +0.5 %) | ≈ |
| sparkus-context-node / sparkus-node | hello | −3.8 % (−5.4 % – −2.2 %) | prouvé | −2.8 % (−5.3 % – −1.6 %) | prouvé |
| sparkus-context-node / sparkus-node | params-query | −4.7 % (−6.1 % – −0.1 %) | prouvé | −4.5 % (−5.5 % – −0.5 %) | prouvé |
| sparkus-context-node / sparkus-node | post-validate | −3.2 % (−6.3 % – −2.5 %) | prouvé | −3.8 % (−6.9 % – −2.5 %) | prouvé |
| sparkus-prodctx-node / sparkus-prod-node | hello | −4.0 % (−6.4 % – −2.6 %) | prouvé | −3.9 % (−6.4 % – −2.8 %) | prouvé |
| sparkus-prodctx-node / sparkus-prod-node | params-query | −3.1 % (−5.4 % – −2.9 %) | prouvé | −3.9 % (−5.4 % – −2.0 %) | prouvé |
| sparkus-prodctx-node / sparkus-prod-node | post-validate | −4.2 % (−5.6 % – −2.3 %) | prouvé | −4.2 % (−5.6 % – −2.0 %) | prouvé |

## Variante écartée : enterWith au lieu de run (Node, session séparée)

2026-10-17T17:20:05.992Z · win32 · 16 CPU logiques · Bun 1.4.3 · Node v24.22.0 · 5 rounds · 5 s (+2 s de warm-up, 0 s de pause) · 100 connexions · autocannon 4 thread(s) · serveur épinglé sur les CPU 2,3, autocannon sur 8,9,10,11,12,13,14,15

| A / B | Scénario | req/s | verdict | req par s CPU | verdict |
|---|---|---:|---|---:|---|
| sparkus-prodctx-node / sparkus-prod-node | hello | −4.8 % (−8.2 % – −1.6 %) | prouvé | −4.8 % (−8.4 % – −1.6 %) | prouvé |
| sparkus-prodctx-node / sparkus-prod-node | params-query | −4.7 % (−6.4 % – −2.5 %) | prouvé | −5.4 % (−6.5 % – −2.5 %) | prouvé |
| sparkus-prodctx-node / sparkus-prod-node | post-validate | −4.6 % (−8.2 % – −0.7 %) | prouvé | −4.3 % (−8.8 % – −0.4 %) | prouvé |
| sparkus-prodenter-node / sparkus-prod-node | hello | −3.4 % (−8.9 % – −0.6 %) | prouvé | −3.2 % (−8.8 % – −0.9 %) | prouvé |
| sparkus-prodenter-node / sparkus-prod-node | params-query | −3.1 % (−6.5 % – −0.6 %) | prouvé | −2.5 % (−6.0 % – −0.6 %) | prouvé |
| sparkus-prodenter-node / sparkus-prod-node | post-validate | −3.7 % (−5.2 % – +0.2 %) | ≈ | −3.7 % (−5.8 % – +0.9 %) | ≈ |
| sparkus-prodenter-node / sparkus-prodctx-node | hello | +1.0 % (−5.6 % – +5.2 %) | ≈ | +0.7 % (−4.3 % – +6.5 %) | ≈ |
| sparkus-prodenter-node / sparkus-prodctx-node | params-query | +1.7 % (−3.6 % – +3.7 %) | ≈ | +2.8 % (−3.0 % – +3.8 %) | ≈ |
| sparkus-prodenter-node / sparkus-prodctx-node | post-validate | +0.9 % (−4.6 % – +5.1 %) | ≈ | +1.1 % (−5.5 % – +5.4 %) | ≈ |
