# 27 août 2026, la vérification de couverture du backlog

Christophe a posé la question qu'il fallait après le découpage des trois phases :
« a-t-on tous les tickets nécessaires jusqu'à la fin du développement ? » puis,
dans la foulée, la même question sur le déploiement et la conteneurisation.

La réponse était **non** dans les deux cas. **Huit trous** en sont sortis,
LS-146 à LS-153.

## La méthode, et pourquoi elle n'était pas la lecture des tickets

Deux trous ayant déjà été trouvés dans la journée, répondre de mémoire n'avait
aucune valeur. La vérification a confronté **trois choses au dépôt réel** :

- les routes livrées, par `find src/app -name "page.tsx"`
- les fichiers de convention Next.js attendus et absents, par `find`
- le périmètre annoncé par `CLAUDE.md` et `frontend-design.md`

Chaque manque a été constaté par une commande, jamais supposé.

## Trois trous visibles au Go-Live

**Aucune page 404 habillée.** `notFound()` est appelé sur quatre routes, dont la
fiche produit publique. `find src/app -name "not-found.tsx"` rend zéro. Un client
sur un lien mort voit la page Next.js par défaut, en anglais et sans navigation.
LS-146.

Le piège connu s'y rattache directement : ajouter un `loading.tsx` sur
`produit/[slug]` **annulerait le 404** et ferait indexer une page inexistante en
200. Le critère de mutation de LS-146 le vise nommément.

**Aucun favicon, aucune image de partage.** `public/` ne contient que `habillage`
et `medias`. Sur un site dont la photographie est l'argument de vente, un lien
partagé ne montre rien. LS-147.

**L'assistant IA n'avait aucun ticket.** `CLAUDE.md` le place en V1 cible et
l'architecture lui réserve `integrations/`, qui contient email, médias, Mondial
Relay et Stripe, et **pas d'IA**. Un pan entier du périmètre sans porteur, le
trou le plus large restant. LS-149 le cadre par un ADR, pas par du code.

## Deux sujets ajoutés par Christophe

**Les pages légales étaient déjà couvertes**, vérifié avant de créer quoi que ce
soit : LS-123 porte les trois routes à ancres, dont `/informations-legales` avec
`#mentions`, `#cgv`, `#confidentialite`, `#retractation` et `#accessibilite`, et
LS-28 leurs textes. Aucun doublon créé.

**La bannière cookies n'avait aucun ticket.** LS-148 la porte, en posant la
question dans le bon ordre : établir **si un consentement est dû** avant d'écrire
une bannière. Les quatre cookies actuels sont strictement nécessaires, donc
probablement exemptés ; la réponse dépend de LS-141, qui la bloque. Une bannière
posée sans nécessité dégraderait l'expérience et affaiblirait le consentement là
où il compte.

## Le GEO, un ajout de périmètre assumé

LS-150, priorité basse. Le socle technique est déjà dans LS-137, un JSON-LD
correct servant les moteurs classiques comme les assistants. Ce qui reste est un
arbitrage : `llms.txt`, l'autorisation des robots d'entraînement (décision
commerciale, le contenu est le travail de l'exploitante), et la rédaction pour la
citation.

La story peut légitimement se fermer sur « rien de plus que LS-137 », et son
garde-fou est explicite : **aucune allégation inventée pour plaire à une
machine**, ce qui resterait une pratique commerciale trompeuse.

## Ce qui semblait manquer et n'est pas un oubli

Vérifié avant de proposer quoi que ce soit, plutôt que de créer des tickets pour
des décisions déjà prises :

- **la recherche interne** est **Could, jalon V1.x** dans `frontend-design.md` :
  « quarante références se parcourent à l'œil »
- **la pagination** est écartée par le dimensionnement, 10 à 40 références
- **les moteurs externes et le mégamenu** sont écartés nommément

Distinguer un oubli d'une décision demande de lire la règle, pas seulement de
constater une absence dans le code.

## Preuves

```
find src/app -name "not-found.tsx"    zéro résultat
find src -name "sitemap*|robots*|manifest*|icon*"   zéro résultat
ls src/integrations/                  email, medias, mondial-relay, stripe
recherche Jira sur assistant|IA|404|SEO   zéro ticket
epics et liens des 5 stories          vérifiés un par un, sens correct
```

Aucun test à jouer, cette session ne touche pas au code.

## État des tickets

| Ticket | Objet | Epic |
|---|---|---|
| LS-146 | pages d'erreur publiques, 404 et erreur serveur | LS-3 |
| LS-147 | favicon, manifeste, image Open Graph | LS-3 |
| LS-148 | consentement aux cookies, bloquée par LS-141 | LS-6 |
| LS-149 | assistant IA, cadrage et ADR | LS-8 |
| LS-150 | visibilité dans les moteurs de réponse, bloquée par LS-137 | LS-7 |
| LS-151 | préparation du VPS, accès, Docker, Nginx, DNS, certificat | LS-7 |
| LS-152 | base et composition de production, plus la sauvegarde en routine | LS-7 |
| LS-153 | première mise en ligne et point de non-retour | LS-7 |

## Prochaine étape

Inchangée. **LS-82**, l'envoi réel des emails, reste la story la plus utile à
prendre : priorité haute, aucune dépendance externe, et le client ne reçoit
aujourd'hui aucune confirmation de commande.

Parmi les trous trouvés aujourd'hui, **LS-146** est le plus rentable à traiter
tôt : petit, visible publiquement, et il touche une route déjà indexable.

## Le déploiement, vérifié après coup à la demande de Christophe

Question posée dans la foulée : les tickets couvrent-ils le déploiement après
l'achat d'un VPS, et la conteneurisation ?

**Le socle était plus avancé que LS-138 ne le laissait croire**, ce que je n'avais
pas mesuré en l'écrivant. Existent déjà : le `Dockerfile` multi-étapes, le
workflow `publier-image.yml` qui publie sur GHCR avec ses contrôles de sécurité,
le conteneur de tâches planifiées, `docker/nginx/lune-soleil.conf` versionné avec
ses en-têtes de proxy de LS-91, `verifier-nginx.sh` et `migrate-production.sh`.

**Trois maillons manquaient**, chacun constaté dans le dépôt.

`docker-compose.yml` **ne décrit que la base de développement**, et son propre
en-tête l'écrit : « Ne rien ajouter ici en pensant à la production ». Aucune
composition de production n'existe, et « sa base vit chez l'hébergeur » ne tranche
pas la forme. LS-152.

**LS-138 supposait une machine prête.** Un VPS neuf demande accès, pare-feu,
Docker, Nginx, DNS et premier certificat. LS-151.

**La première mise en ligne n'est pas un déploiement de plus.** Les suivants sont
réversibles par le tag SHA ; celui-là ne l'est pas : une commande réelle, un email
parti, une page indexée ne reviennent pas. LS-153 en écrit l'ordre et le point de
non-retour, l'ouverture à l'indexation.

**Un manque réel s'y est ajouté** : `migrate-production.sh` exige une sauvegarde
vérifiée avant toute migration, et **rien ne la produit périodiquement**. LS-107
portait la politique, aucune story son exécution. C'est dans LS-152.

La chaîne est vérifiée : LS-151 → LS-152 → LS-138 → LS-142 → LS-153, plus LS-18
qui bloque la mise en ligne.
