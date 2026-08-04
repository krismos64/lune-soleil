# app/

Routage Next.js, App Router. **Adaptateurs d'entrée uniquement.**

C'est le dossier où arrivent toutes les entrées non fiables : paramètres d'URL,
`FormData`, cookies, corps de requête, en-têtes. Rien de ce qui arrive ici n'est
digne de confiance avant validation.

## Ce qui entre ici

- les composants serveur de page et de mise en page, serveur par défaut
- les Server Actions, qui **valident avec Zod puis délèguent à `services/`**
- les gestionnaires de route de `api/`, mêmes obligations
- la lecture de `Request`, des cookies et des `FormData`, qui s'arrête ici

## Ce qui n'entre pas

- toute règle de gestion, tout calcul monétaire, toute décision de transaction :
  ils vivent dans `services/`
- l'accès direct à Prisma, qui passe par `repositories/`
- `"use client"` sans interaction réelle qui l'exige

## Deux obligations qui ne se déduisent d'aucun type

**Toute route d'administration appelle `exigerAdministratrice`** dans son
composant serveur, avant tout rendu. Il n'y a délibérément pas de middleware :
celui de Next.js s'exécute sur la périphérie et ne peut pas relire la session en
base, il ne verrait que la présence d'un cookie, ni sa validité ni le rôle.

**Un identifiant reçu ici n'autorise jamais rien**, invariant 2. L'identité vient
de la session, recoupée côté serveur. Un `commandeId` d'URL désigne une ressource,
il ne prouve pas le droit d'y accéder.

## Pourquoi ce fichier existe

Les cinq autres dossiers de `src/` portaient leur garde depuis LS-50, celui-ci
non, alors qu'il est le plus exposé. `CLAUDE.md` affirmait pourtant que « chaque
dossier de `src/` » en portait une : l'affirmation générale masquait le trou.
Trouvé le 4 août 2026 en recomptant, et le contrôle 10 de
`scripts/verifier-config-claude.sh` refuse désormais qu'un dossier reste sans
garde.
