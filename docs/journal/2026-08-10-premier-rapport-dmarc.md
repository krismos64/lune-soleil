# 10 août 2026, note courte, premier rapport DMARC agrégé

Pas une story, une observation reçue par mail entre deux sessions. Aucun code
touché, aucun ticket avancé.

## Ce qui est arrivé

Google a envoyé sur `contact@lune-soleil.fr` le premier rapport DMARC agrégé du
domaine, un ZIP contenant du XML. Il couvre la journée du 8 août 2026
(`1786233600` à `1786319999` en temps Unix), celle où SPF, DKIM et DMARC ont été
posés dans la zone OVH.

## Ce que le rapport dit

Google relit correctement la politique publiée : `p=none`, `sp=none`,
`pct=100`, alignement relâché sur les deux volets (`adkim=r`, `aspf=r`). C'est
exactement ce qui a été posé.

Un seul flux observé, un seul message :

| Élément | Valeur |
|---|---|
| IP source | `51.210.91.53`, plage OVH, le relais MX Plan légitime |
| Volume | 1 message |
| SPF | `pass`, aligné sur `lune-soleil.fr` |
| DKIM | `pass`, sélecteur `ovhmo-selector-1`, aligné sur `lune-soleil.fr` |
| Disposition | `none`, aucun rejet ni quarantaine |

Message pleinement authentifié, sur les deux mécanismes à la fois. Aucune
anomalie, aucune action corrective.

## Ce qui n'est pas conclu pour autant

**Un rapport à un seul message ne justifie pas de durcir la politique.** Le site
n'émet encore rien en production : l'envoi transactionnel de LS-82 n'est pas
branché, le formulaire de contact non plus. Les émetteurs légitimes futurs ne
figurent donc dans aucun rapport. Passer à `p=quarantine` sur cette seule
observation reviendrait à décider à l'aveugle sur des flux jamais mesurés, et un
message légitime disparaîtrait sans signal.

C'est le même motif que la mémoire déjà écrite le 8 août : une configuration
publiée n'est pas une configuration qui fonctionne, et ici une configuration
vérifiée sur un message n'est pas une configuration vérifiée sur le trafic réel.

## Prochaine étape

Rien à faire pour l'instant. Deux signaux à guetter dans les rapports suivants :

- une IP inconnue avec SPF ou DKIM en `fail` : usurpation, ou émetteur légitime
  oublié dans la zone
- un `fail` sur l'IP OVH elle-même : rotation de clé DKIM non répercutée

Le durcissement vers `p=quarantine` se décidera après LS-82, quand plusieurs
rapports consécutifs couvriront le trafic transactionnel réel.

## État des tickets

Inchangé. LS-73, LS-31 et LS-74 sont faites, la prochaine action reste **LS-79**.
LS-82 garde ses critères 5, 6 et 7 remplis depuis le 8 août.
