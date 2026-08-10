# syntax=docker/dockerfile:1
#
# Image de l'application, LS-74.
#
# CE QU'ELLE EST : l'artefact deploye en phase 6, taggue par identifiant de
# commit. Elle ne contient QUE de quoi servir l'application.
#
# CE QU'ELLE N'EST PAS : la base de developpement, decrite par
# `docker-compose.yml`, ni le VPS, qui appartient a la phase 6. Cette story
# prouve que l'application EST deployable, elle ne la deploie pas.
#
# TROIS ETAPES, et la derniere ne recoit que des fichiers choisis un par un.
#
# CE N'EST PAS CE DECOUPAGE QUI PROTEGE LES SECRETS, contrairement a ce qu'on
# croit en le lisant. `next build` RECOPIE le `.env` du contexte dans
# `.next/standalone/.env`, mesure sur ce depot le 10 aout 2026 : le
# `COPY --from=builder /app/.next/standalone ./` de l'etape 3 le ferait donc
# entrer dans l'image sans qu'aucun `COPY . .` soit en cause.
#
# `.dockerignore` est le seul mecanisme qui ferme ce chemin, en empechant le
# `.env` d'entrer dans le contexte de construction. Ne jamais l'alleger en se
# disant que les copies nommees suffisent. Invariant 9, le depot est public et
# l'image part sur un registre.

# ---------------------------------------------------------------------------
# Version de base, alignee sur .nvmrc et sur `engines` du package.json.
# ---------------------------------------------------------------------------
#
# 22.23.2 EXACTEMENT, pas `22` ni `lts`. Prisma 7 refuse les versions impaires
# de Node et `engine-strict=true` rend `engines` bloquant : un tag mouvant
# ferait un jour entrer une version que `npm ci` refuse, et l'echec surviendrait
# a la construction d'une image sans rapport avec le changement.
#
# `-slim` et non `-alpine` : l'image alpine est en musl, quand les binaires
# precompiles de Prisma et de sharp visent la glibc de Debian. Le gain de taille
# ne vaut pas le risque d'un moteur qui ne se charge pas a l'execution.
ARG NODE_VERSION=22.23.2

# ===========================================================================
# Etape 1, dependances. Isolee pour que le cache survive a une modification
# du code source : seuls package.json, le verrou et .npmrc l'invalident.
# ===========================================================================
FROM node:${NODE_VERSION}-slim AS deps

WORKDIR /app

# `.npmrc` fait partie du contrat d'installation, il porte `engine-strict=true`.
# L'omettre ferait passer `npm ci` sous une version de Node non supportee avec
# un simple avertissement, exactement ce que ce reglage existe pour empecher.
COPY package.json package-lock.json .npmrc ./

# `npm ci` et non `npm install` : il installe le verrou a la lettre et echoue si
# `package.json` et `package-lock.json` divergent, au lieu de resoudre.
RUN npm ci

# ===========================================================================
# Etape 2, construction.
# ===========================================================================
FROM node:${NODE_VERSION}-slim AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# LE CLIENT PRISMA S'ENGENDRE ICI, ET NON SUR LE POSTE.
#
# `src/generated/prisma` est git-ignore : le generateur ecrit plusieurs
# centaines de fichiers qu'aucune relecture ne couvre. Sans cette etape, la
# construction echoue sur un import introuvable, comme elle le ferait en
# integration continue, qui porte la meme etape pour la meme raison.
#
# L'engendrer dans l'image plutot que de copier celui du poste evite aussi
# d'embarquer un moteur compile pour macOS dans une image Linux. `.dockerignore`
# exclut `src/generated/` pour que le cas ne puisse pas se produire.
#
# LA CONSTRUCTION N'A BESOIN D'AUCUN SECRET REEL, mais elle exige que les
# variables EXISTENT, et les deux commandes ci-dessous echouent differemment
# sans elles :
#
#   `prisma generate` charge `prisma.config.ts`, dont le `env("DATABASE_URL")`
#   echoue explicitement quand la variable manque. Comportement voulu de LS-66,
#   il vaut mieux qu'une valeur indefinie qui se propage. La generation n'ouvre
#   aucune connexion, la valeur n'a donc pas a etre joignable.
#
#   `next build` evalue le code en NODE_ENV=production et instancie les modules
#   de configuration, dont Better Auth qui exige un secret. Une construction
#   sans lui reussirait en signant avec une cle par defaut, defaut deja
#   rencontre sur ce depot.
#
# Ces valeurs sont des remplissages : ni ecrites dans l'image, ni utilisees a
# l'execution, ou les vraies variables viennent de l'environnement du conteneur.
# Elles sont sur la ligne de commande et non en ARG ou en ENV, pour ne rester
# dans aucune couche et n'apparaitre dans aucun `docker history`.
#
# Le jour ou une etape aurait besoin d'un VRAI secret, employer
# `RUN --mount=type=secret`, qui ne laisse rien dans la couche, et jamais un
# ARG, qu'un `docker history --no-trunc` restitue.
ENV NEXT_TELEMETRY_DISABLED=1
# AUCUNE DES DEUX VALEURS N'EST ECRITE EN CLAIR ICI, et ce n'est pas de la
# coquetterie : l'analyse de secrets du depot bloque le commit sur les deux
# formes, la chaine `utilisateur:motdepasse@hote` et toute valeur de seize
# caracteres derriere `BETTER_AUTH_SECRET=`. Elle a raison de bloquer, elle ne
# peut pas distinguer un remplissage d'une vraie valeur, et l'affaiblir pour ce
# fichier le rendrait aveugle le jour ou un vrai secret y passerait.
#
# Le secret de construction est donc ENGENDRE a chaque construction. Il est plus
# sur qu'une constante ecrite dans le depot public, et il disparait avec la
# couche : la valeur differe a chaque fois et rien ne la lit ensuite.
# L'application recoit son vrai secret par l'environnement du conteneur.
#
# ENGENDRE PAR `node` ET NON PAR `openssl`, QUI EST ABSENT DE L'IMAGE.
# La premiere version employait `openssl rand`. Elle produisait `openssl: not
# found`, donc une chaine VIDE, et la construction se terminait EN VERT en
# signant avec la cle par defaut de Better Auth. L'echec n'apparaissait qu'avec
# `--progress=plain`. Meme famille de defaut que le secret par defaut deja
# rencontre ici, et que le repli invisible au nominal.
#
# La garde `.length !== 48` rend l'echec fatal : une valeur vide ou tronquee
# arrete la construction au lieu de la laisser reussir sans secret.
RUN DATABASE_URL="postgresql://construction@127.0.0.1:5432/construction" \
    BETTER_AUTH_URL="http://localhost:3000" \
    sh -c 'BETTER_AUTH_SECRET="$(node -e "console.log(require(\"crypto\").randomBytes(24).toString(\"hex\"))")" \
        && [ ${#BETTER_AUTH_SECRET} -eq 48 ] \
        && export BETTER_AUTH_SECRET \
        && npx prisma generate \
        && npm run build'

# ===========================================================================
# Etape 3, execution. Ne recoit que des fichiers nommes explicitement.
# ===========================================================================
FROM node:${NODE_VERSION}-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Pose explicitement bien que `server.js` retienne deja 0.0.0.0 par defaut,
# `process.env.HOSTNAME || '0.0.0.0'` dans le gabarit engendre. Renforcement et
# non necessite : devant un refus de connexion reel, chercher du cote du port ou
# du reseau Docker avant cette variable.
ENV HOSTNAME=0.0.0.0

# UTILISATEUR NON PRIVILEGIE.
#
# L'image node fournit deja un utilisateur `node` en uid 1000, inutile d'en
# creer un. Le repertoire de travail lui appartient : `server.js` ecrit le cache
# de prerendu dans `.next` a l'execution, et un `/app` appartenant a root ferait
# echouer cette ecriture a la premiere page rendue, pas au demarrage.
RUN mkdir -p /app/.next && chown -R node:node /app

# LES TROIS COPIES, ET POURQUOI IL EN FAUT TROIS.
#
# `.next/standalone` porte `server.js` et les dependances tracees. Il NE PORTE
# NI `public/` NI `.next/static`, mesure sur ce depot : sans les deux copies
# suivantes, l'application demarre, repond 200, passe son controle de sante, et
# sert toutes ses pages sans styles ni images. Aucun controle automatique ne
# verrait ce defaut.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node

EXPOSE 3000

# CONTROLE DE SANTE PAR `node`, faute de mieux et par choix.
#
# Ni `curl` ni `wget` n'existent dans `node:22.23.2-slim`, verifie en executant
# l'image. Les installer ajouterait un gestionnaire de paquets et une surface
# d'attaque a une image d'execution pour une requete HTTP que Node sait faire.
#
# La sonde applicative appartient a `/api/sante`, LS-73 : elle interroge la base
# et rend 503 quand celle-ci est injoignable. LE CODE HTTP PORTE LA DECISION,
# le corps ne sert qu'au diagnostic humain. Un `exit 1` sur tout code different
# de 200 est donc suffisant et exact.
#
# `start-period` a 15 s couvre le demarrage sans compter les echecs de cette
# fenetre comme des defaillances.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/sante').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"

# `node server.js` et non `next start` : la CLI de Next n'est pas dans la sortie
# autonome. Forme exec, sans shell, pour que le processus recoive SIGTERM
# directement et s'arrete proprement a l'arret du conteneur.
CMD ["node", "server.js"]
