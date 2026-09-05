/**
 * Etat de chargement de l'ecran de creation d'un produit, LS-188.
 *
 * POURQUOI IL N'A PAS D'ARMATURE DE LISTE. L'ecran rend un FORMULAIRE, pas une
 * liste : des lignes empilees y annonceraient un contenu qui n'arrive jamais, et
 * feraient le saut de mise en page que le critere 3 interdit.
 *
 * L'ATTENTE EST POURTANT REELLE, a la difference de la reauthentification : la
 * page lit les categories pour peupler la liste deroulante du formulaire. C'est
 * une lecture en base, derriere une garde de session qui en fait une autre.
 *
 * CET ECRAN EST CELUI QUE LS-188 AVAIT MANQUE. Le ticket comptait quatorze
 * ecrans en `force-dynamic` quand le depot en portait quinze, et c'est
 * `verifier-chargement-administration.sh` qui l'a signale a l'ecriture, pas une
 * relecture. Le controle a donc fait son travail avant meme d'etre commite.
 *
 * IL EST AUTORISE ICI : la page n'appelle pas `notFound()`, C32 ne s'applique
 * pas. Elle redirige vers la connexion quand la session manque, ce qui est une
 * redirection et non un 404.
 */
import styles from "./nouveau-produit.module.css";

export default function ChargementNouveauProduit() {
  return (
    <main className={styles.page}>
      <h1 className={styles.titre}>Nouveau produit</h1>

      {/*
       * `role="status"` pour qu'un lecteur d'ecran apprenne que la page
       * travaille. `aria-live` n'est pas ajoute, `role="status"` le portant
       * implicitement en `polite`.
       */}
      <p className={styles.introduction} role="status">
        Chargement du formulaire…
      </p>
    </main>
  );
}
