/**
 * L'heure de Paris, décimale : 14 h 30 vaut 14,5. Elle choisit la salutation du
 * tableau de bord, « Bonjour » ou « Bonsoir ».
 *
 * LE FUSEAU EST NOMMÉ, JAMAIS DÉDUIT DU SERVEUR, invariant 8 : le conteneur
 * tourne en UTC, et une heure lue sans fuseau saluerait d'un « Bonjour » à
 * 20 heures en hiver.
 */
export function heureDeParis(instant: Date): number {
  const parties = new Intl.DateTimeFormat("fr-FR", {
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    timeZone: "Europe/Paris",
  }).formatToParts(instant);
  const lire = (type: string): number =>
    Number(parties.find((partie) => partie.type === type)?.value ?? 0);
  return (lire("hour") % 24) + lire("minute") / 60;
}
