# 7 octobre 2026 : LS-286, « l'atelier », et la FAQ en carnet

Suite de `2026-10-07-g`.

## Arbitrages de Christophe

- **Les textes publics parlent de « l'atelier »**, à la troisième personne.
  La règle de `frontend-design.md` disait « première personne du singulier »,
  et une cinquantaine de phrases portaient un « nous ».
- **La FAQ est refaite avec du motion design**, sur une critique et une image
  de Codex, sans maquette.

## Ce qui a été fait

- **LS-286** : une cinquantaine de phrases réécrites sur 17 fichiers, écrans de
  la boutique, pages légales, pages d'erreur et trois emails. Le récit de
  `/atelier` garde son « je », texte de l'exploitante validé en LS-25.
- **Contrôle** : sens 3 de `verifier-redaction-francaise.sh`, boutique,
  composants, emails, factures PDF, métadonnées et mentions de rétractation,
  majuscules comprises. Rejoué sur les sources de `main` avant correction, il
  désigne exactement les 17 fichiers corrigés à la main. Neuf mutations, neuf
  détectées, dont un « nous » en commentaire qui doit passer.
- **FAQ en carnet de l'atelier**, piste recommandée par Codex après sa critique
  (« présentation de centre d'assistance », contact placé avant les réponses) :
  - un groupe par thème, des filets entre les questions ;
  - un dessin par thème tracé par `stroke-dashoffset` sous `data-borne` ;
  - une aquarelle de Codex, table d'atelier à l'aube, en marge à partir de
    1024 px ;
  - l'invitation à écrire après la dernière réponse.

  ADR-045 amendé. Un test du carnet est prouvé par deux mutations, dessin retiré
  et contact replacé avant.
- **Revue `ls-frontend-revue`**, points corrigés :
  - deux pronoms ambigus (« il » renvoyait au colis, « elle » à la page) ;
  - trois rapports de contraste écrits faux, dont un de ma main en LS-26 ;
  - la formule d'excuse de la page d'erreur ;
  - la portée du contrôle ;
  - le README des images.
- **Vérifié** : 784 tests unitaires et composants, 2 595 e2e sur la suite
  complète, rendu à 320, 768 et 1280 px, contrôles de la CI hors les trois échecs
  locaux connus.

## Dérives

- **Mon premier commit LS-286 portait onze erreurs de lint**, apostrophes non
  échappées dans le JSX : `npm run lint | tail -1` rend le code du `tail`, et
  la ligne lue était vide. Vu seulement quand la construction a refusé le
  rendu. Le code de sortie se lit désormais sans tube.
- Une capture a cassé la construction : `reducedMotion` n'est pas une option de
  `test.use`, et `next build` vérifie les types des fichiers de test.
- Le test d'animation de l'aide attend chaque décor jusqu'à `fin`, cinq
  secondes chacun : les cinq dessins l'ont fait dépasser 30 secondes à 320 px,
  délai porté à 120.
- **Ma vérification « sur main » du contrôle ne prouvait rien** au premier
  essai : `git stash` retirait aussi le nouveau sens. Refaite dans un arbre de
  travail séparé.

## Écart signalé, non résolu en silence

L'en-tête de `modeles.ts` portait une consigne de l'exploitante recueillie en
séance, « nous » et jamais « je ». L'arbitrage du 7 octobre la remplace par
« l'atelier », qui respecte toujours « jamais je ». Les deux en-têtes le disent.
**À confirmer auprès de l'exploitante.**

## Tickets

- **LS-286** close à la fusion.
- **LS-287** créée : deux formulations du retour en rétractation à vérifier aux
  sources, et « l'atelier » à définir ou non sur la page légale.
- LS-26 reste en cours, délai d'expédition et validation de l'exploitante.

## Prochaine étape

LS-287, puis les réponses de l'exploitante aux questions 38 à 42.
