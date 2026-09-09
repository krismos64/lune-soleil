# 9 septembre 2026, k : le durcissement SSH qui existait sans s'appliquer

Un trou de sécurité réel, ouvert depuis huit mois derrière un fichier qui
annonçait le contraire. Fermé, prouvé dans les deux sens, et le contrôle éprouvé
sur la configuration défectueuse elle-même.

## Le défaut

**La machine acceptait l'authentification par mot de passe**, sous **11 210
tentatives d'intrusion en vingt-quatre heures**.

```
sudo sshd -T | grep passwordauthentication
passwordauthentication yes
```

Un `/etc/ssh/sshd_config.d/hardening.conf`, écrit en janvier 2026 pour
SmartPlanning, annonçait pourtant `PasswordAuthentication no`.

**SSH retient la première valeur rencontrée**, et `Include sshd_config.d/*.conf`
lit par ordre alphabétique :

```
50-cloud-init.conf        PasswordAuthentication yes    <- gagnait
60-cloudimg-settings.conf PasswordAuthentication no
hardening.conf            PasswordAuthentication no
```

Le fichier de durcissement n'était pas faux, il était **inopérant**. C'est le
motif du garde-fou déclaratif, déjà rencontré ici avec `engines` sans
`engine-strict` : une règle écrite et non vérifiée ne tient pas.

**Ce que cela exposait.** Deux comptes ont un mot de passe utilisable, `ubuntu`
et `deploy`. `deploy` appartient au groupe `docker`, donc **équivalent root** :
un mot de passe deviné donnait la machine entière, SmartPlanning compris. Les
comptes les plus visés étaient `crypto` 223 fois, `admin` 96, `smartplanning` 69.

## Ce qui a rendu la correction sûre, mesuré avant d'être proposé

```
connexions par clé, 7 jours          480    (deploy 458, ls-deploy 23)
connexions par mot de passe, 7 jours   0
```

Les trois comptes qui se connectent ont une clé en place. Le seul cas que la
mesure ne pouvait pas exclure était un accès par mot de passe depuis un autre
poste, et Christophe a confirmé qu'il n'y en a pas. C'est cette réponse qui a
permis de décider.

La leçon de la session i tenait : ne pas recommander sans avoir mesuré. Ici la
recommandation reposait sur un compte de connexions, pas sur un raisonnement
vraisemblable.

## La correction, et ce qui a failli manquer

Les trois fichiers disent désormais `no`, donc l'ordre de lecture n'importe plus.
Défense redondante délibérée.

**Le point qui a failli être raté : cloud-init est actif et réécrit
`50-cloud-init.conf` au démarrage.** Corriger le seul fichier aurait donné un
durcissement valable jusqu'au prochain redémarrage, ce qui est **pire qu'un
durcissement absent** puisqu'il serait cru acquis. C'est exactement le défaut qui
venait d'être trouvé, reproduit sous une autre forme. `ssh_pwauth: false` est
posé dans `/etc/cloud/cloud.cfg.d/99-lune-soleil-ssh.cfg`.

Rechargé par `reload`, qui ne coupe pas les sessions en cours, et vérifié par une
connexion **neuve** dans les deux sens :

```
ssh par clé                                OK, utilisateur deploy
ssh -o PreferredAuthentications=password   Permission denied (publickey)
```

Le refus dit `(publickey)` : le serveur n'offre plus que cette méthode.

## Le contrôle lit l'effectif, jamais les fichiers

`verifier-durcissement-ssh.sh`, neuf sens, sur les valeurs rendues par
`sshd -T`. La distinction n'est pas théorique : c'est précisément elle qui
séparait le fichier correct de la configuration défaillante. Un contrôle qui
aurait grepé `hardening.conf` serait resté vert pendant huit mois.

**Prouvé par quatre mutations**, dont une qui **rejoue la configuration
défectueuse réelle** plutôt qu'une forme fabriquée, motif de la fiche sur la
graphie de marque où quatre mutations réussies masquaient quatre défauts réels :

| Mutation | Effet |
|---|---|
| `50-cloud-init.conf` remis à `yes` | `ECHEC passwordauthentication vaut 'yes'` |
| `ssh_pwauth` retiré | `ECHEC cloud-init est actif SANS ssh_pwauth: false` |
| fail2ban arrêté | `ECHEC fail2ban inactif` |
| `sshd` hors du `PATH` | code 1, ancrage cassé annoncé |

## Le pare-feu n'avait rien à corriger

`deny (incoming)` par défaut, seuls 22, 80 et 443 ouverts, ports applicatifs
publiés sur `127.0.0.1` depuis LS-151 et LS-152. Vérifié plutôt que supposé.

**Ce que le contrôle ne peut pas voir**, et c'est écrit dans le script : `ufw
status` ne montre pas les ports publiés par Docker, qui insère ses règles DNAT
en amont. Seule une mesure **depuis l'extérieur** le révèle, et elle appartient à
LS-151. fail2ban, lui, a banni 2 883 adresses : cela dit l'ampleur du bruit de
fond, pas que la machine est protégée. Il ralentit, il ne ferme pas.

## État des tickets

**LS-139 reste EN COURS**, mais il ne lui reste qu'un point.

Fait : critères 1, 2, 4, 5, 6, 7, les trois incidents, l'alerte de seuil disque,
et le durcissement SSH avec le pare-feu.

Reste : le **critère 3** seul, `npm audit` à zéro, bloqué par LS-210.

## Prochaine étape

LS-210, trois vulnérabilités vitest en dépendance de développement que npm refuse
de résoudre sur un bug reproduit en cinq tentatives. C'est le dernier point de
LS-139, et l'issue est probablement un override justifié par écrit plutôt qu'une
résolution, la fiche sur les avis de sécurité rappelant que suivre un avis à la
lettre a déjà cassé ESLint ici.
