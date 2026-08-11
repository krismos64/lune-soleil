# syntax=docker/dockerfile:1
#
# Conteneur des taches planifiees, LS-72.
#
# CE QU'IL EST : un declencheur. Il appelle les routes internes de
# l'application a l'echeance et ne porte AUCUNE logique metier. Toute la
# mecanique, verrou compris, vit dans l'application.
#
# POURQUOI PAS UN ORDONNANCEUR DANS LE PROCESSUS NEXT.JS. Un `setInterval` dans
# l'application s'executerait UNE FOIS PAR INSTANCE : deux conteneurs
# lanceraient deux fois chaque tache. Le verrou en base rattraperait le coup,
# mais on aurait construit le probleme pour ensuite le rattraper. Un
# declencheur externe unique pose la question au bon endroit.
#
# POURQUOI ALPINE ET NON NODE. Ce conteneur n'execute pas de JavaScript : il
# fait deux requetes HTTP par quart d'heure. `crond` et `wget` sont deja dans
# l'image de base, verifie plutot que suppose, ce qui evite l'ecueil rencontre
# en LS-74 : ni `curl` ni `openssl` dans `node:slim`, et un binaire manquant
# rend une chaine vide au lieu d'echouer.
FROM alpine:3.22

# `crond` et `wget` viennent de BusyBox, present dans l'image de base. Aucun
# `apk add` : chaque paquet ajoute est une surface a suivre pour `npm audit`
# et pour les avis de securite.

# Le script et la table de cron. Les deux sont montes en lecture seule par le
# fichier Compose ; ils sont aussi copies ici pour que l'image soit utilisable
# seule, en preproduction comme en production.
COPY declencher.sh /usr/local/bin/declencher.sh
COPY crontab /etc/crontabs/root

RUN chmod +x /usr/local/bin/declencher.sh

# `-f` garde crond au premier plan, sans quoi le conteneur s'arreterait
# aussitot. `-l 8` journalise a partir du niveau info, ce qui fait apparaitre
# chaque declenchement dans `docker logs`, seule trace disponible cote cron.
# `-d 8` envoie ces lignes sur la sortie standard plutot que dans syslog, qui
# n'existe pas dans ce conteneur.
CMD ["crond", "-f", "-d", "8"]
