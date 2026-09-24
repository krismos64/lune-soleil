#!/usr/bin/env bash
# Controle a sec des expressions de mutation, LS-254.
#
# MOTIF. Les preuves par mutation lourdes ne tournent qu'au nocturne, et une
# expression `mute` que le code a depassee n'y est vue qu'au moment ou
# l'execution l'atteint. Le 24 septembre 2026, trois l'ont ete, chacune apres
# une trentaine de minutes, et chaque fois le nocturne entier etait perdu :
# l'une dormait depuis le 31 aout, LS-126, une autre depuis le 11 septembre,
# LS-98. Ce controle applique chaque expression a son fichier SANS LANCER DE
# TEST, et tourne a chaque pull request en quelques secondes.
#
# CE QU'IL FAIT, pour tout `scripts/*-mutation.sh` qui definit `mute()` :
#
#   - resout la variable qui designe le fichier, `PAIEMENT="src/..."`
#   - lit l'argument comme bash le lirait : morceaux entre apostrophes et entre
#     guillemets, concatenes. Un `$` non echappe entre guillemets rendrait la
#     valeur dependante de l'execution, la ligne est alors declaree NON
#     ANALYSABLE plutot que devinee
#   - applique l'expression EN MEMOIRE, sans rien ecrire sur le disque, dans
#     l'enchainement du vrai script : deux `mute` avant un meme `cas` se
#     cumulent, et chaque `cas` repart du fichier d'origine, comme `restaurer`
#
# LA DECOUVERTE EST GENERIQUE, SANS LISTE ECRITE A LA MAIN : une liste se
# perimerait au premier script ajoute, motif « elargir la source plutot
# qu'exempter ».
#
# CE QU'IL NE FAIT PAS. Il ne dit rien de la DETECTION : une expression qui
# mute bien son fichier peut encore rater son test, et seule la preuve reelle
# le mesure. Il ne voit pas non plus les mutations ecrites autrement qu'avec
# `mute`, `perl -pi` direct dans `verifier-regles-mutation.sh` par exemple.
#
# LE CONTROLE SE GARDE LUI-MEME : aucun script decouvert, un script sans
# aucun appel analyse, ou une ligne non analysable le font echouer. Un
# ancrage casse ne doit pas rendre un OK muet sur zero expression.
#
# Usage : ./scripts/verifier-mutations-a-sec.sh
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

# Boucle et non `mapfile`, absent du bash 3.2 que livre macOS.
SCRIPTS=()
while IFS= read -r script; do
  SCRIPTS+=("$script")
done < <(grep -l '^mute() {' scripts/*-mutation.sh 2>/dev/null)

if [ "${#SCRIPTS[@]}" -eq 0 ]; then
  echo "ECHEC aucun script de mutation ne definit mute() : l'ancrage est casse,"
  echo "      et un controle qui n'examine rien ne prouve rien."
  exit 1
fi

perl -e '
use strict;
use warnings;

my $echecs = 0;
my $total = 0;

# Lit un mot bash en tete de $texte. Rend [valeur, variable, reste] : `variable`
# est le nom quand le mot est exactement "$NOM", valeur sinon. undef si le mot
# depend de l execution autrement.
sub lire_mot {
  my ($texte) = @_;
  $texte =~ s/^\s+//;
  return undef if $texte eq "";
  if ($texte =~ s/^"\$([A-Z_][A-Z0-9_]*)"(?=\s|$)//) {
    return [undef, $1, $texte];
  }
  my $valeur = "";
  while (length $texte && $texte !~ /^\s/) {
    if ($texte =~ s/^\x27([^\x27]*)\x27//) {
      $valeur .= $1;
    } elsif ($texte =~ s/^"//) {
      while (1) {
        return undef if $texte eq "";
        if ($texte =~ s/^\\([\\"\$`])//) { $valeur .= $1; next; }
        if ($texte =~ s/^"//) { last; }
        return undef if $texte =~ /^[\$`]/;
        $texte =~ s/^(.)//s;
        $valeur .= $1;
      }
    } elsif ($texte =~ s/^([A-Za-z0-9_.\/:,=+-]+)//) {
      $valeur .= $1;
    } else {
      return undef;
    }
  }
  return [$valeur, undef, $texte];
}

# Lit tous les mots d un appel. undef si l un d eux n est pas analysable.
sub lire_mots {
  my ($texte) = @_;
  my @mots;
  while (1) {
    $texte =~ s/^\s+//;
    last if $texte eq "" || $texte =~ /^#/;
    my $mot = lire_mot($texte) or return undef;
    push @mots, $mot;
    $texte = $mot->[2];
  }
  return \@mots;
}

# Les parametres positionnels declares par `local nom="$N"` ou "${N:-}".
sub parametres {
  my $corps = $_[0] // "";
  my %position;
  while ($corps =~ /\b([a-z_][a-z0-9_]*)="\$\{?([1-9])(?::-)?\}?"/g) {
    $position{$1} = $2;
  }
  return \%position;
}

for my $script (@ARGV) {
  open my $f, "<", $script or die "ECHEC illisible : $script\n";
  my @lignes = <$f>;
  close $f;
  my $texte = join "", @lignes;

  my %variables;
  for (@lignes) {
    $variables{$1} = $2 if /^([A-Z_][A-Z0-9_]*)="([^"\$]*)"\s*$/;
  }

  # Les fonctions definies au premier niveau, et leur corps.
  my %corps;
  while ($texte =~ /^([a-z_][a-z0-9_]*)\(\) \{\n(.*?)^\}/msg) {
    $corps{$1} = $2;
  }

  # La signature de mute : parametres, ou fichier fixe dans le corps.
  my $p = parametres($corps{mute} // "");
  my %porteuses;
  if (exists $p->{expression}) {
    if (exists $p->{fichier}) {
      $porteuses{mute} = [[$p->{fichier}, $p->{expression}]];
    } elsif (($corps{mute} // "") =~ /perl [^\n]*"\$([A-Z_][A-Z0-9_]*)"\s*$/m) {
      $porteuses{mute} = [["=" . $1, $p->{expression}]];
    }
  }

  # Toute autre fonction qui passe ses propres parametres a mute.
  for my $nom (keys %corps) {
    next if $nom eq "mute";
    my $q = parametres($corps{$nom});
    my @paires;
    while ($corps{$nom} =~ /\bmute "\$([a-z_][a-z0-9_]*)" "\$([a-z_][a-z0-9_]*)"/g) {
      push @paires, [$q->{$1}, $q->{$2}] if $q->{$1} && $q->{$2};
    }
    $porteuses{$nom} = \@paires if @paires;
  }

  # Les fonctions qui restaurent les fichiers mutes, `cas` en tete : apres leur
  # appel, le vrai script repart des fichiers d origine, et ce controle aussi.
  # Sans cette remise a zero, les mutations s accumulaient sur tout le script
  # et onze expressions saines passaient pour perimees, mesure du 24 septembre.
  my %restauratrices = map { $_ => 1 }
    grep { $corps{$_} =~ /\b(restaurer|nettoyer)\b|git checkout/ } keys %corps;

  # Les appels de premier niveau, lignes continuees jointes.
  my %courant;
  my ($examinees, $perimees) = (0, 0);
  my $dans_fonction = 0;

  for (my $i = 0; $i <= $#lignes; $i++) {
    my $ligne = $lignes[$i];
    my $numero = $i + 1;
    # Une fonction tenant sur une ligne, `cle() { ...; }`, n ouvre aucun corps :
    # la prendre pour une ouverture faisait sauter tout ce qui suit jusqu a la
    # prochaine accolade fermante, et le script ancien rendait zero appel.
    next if $ligne =~ /^[a-z_][a-z0-9_]*\(\) \{.*\}\s*$/;
    if ($ligne =~ /^[a-z_][a-z0-9_]*\(\) \{/) { $dans_fonction = 1; next; }
    if ($dans_fonction) { $dans_fonction = 0 if $ligne =~ /^\}/; next; }

    my ($fonction) = $ligne =~ /^([a-z_][a-z0-9_]*)\s/;
    next unless defined $fonction;
    if (!$porteuses{$fonction}) {
      %courant = () if $restauratrices{$fonction};
      next;
    }

    my $appel = $ligne;
    while ($appel =~ /\\\n\z/ && $i < $#lignes) {
      $appel =~ s/\\\n\z/ /;
      $appel .= $lignes[++$i];
    }
    $appel =~ s/^\Q$fonction\E//;

    my $mots = lire_mots($appel);
    if (!$mots) {
      print "  NON ANALYSABLE $script:$numero\n";
      $echecs++;
      next;
    }

    for my $paire (@{ $porteuses{$fonction} }) {
      my ($pos_fichier, $pos_expression) = @$paire;
      my $expression_mot = $mots->[$pos_expression - 1];
      next if !$expression_mot && $pos_expression > 2;
      my $variable;
      if ($pos_fichier =~ /^=(.*)/) {
        $variable = $1;
      } else {
        my $mot = $mots->[$pos_fichier - 1];
        next if !$mot && $pos_fichier > 2;
        $variable = $mot ? $mot->[1] : undef;
      }
      my $expression = $expression_mot ? $expression_mot->[0] : undef;
      if (!defined $variable || !defined $expression) {
        print "  NON ANALYSABLE $script:$numero\n";
        $echecs++;
        next;
      }
      my $fichier = $variables{$variable};
      if (!defined $fichier || !-r $fichier) {
        print "  ECHEC $script:$numero : \$$variable ne designe aucun fichier lisible\n";
        $echecs++;
        next;
      }
      if (!exists $courant{$fichier}) {
        open my $g, "<", $fichier or die;
        local $/;
        $courant{$fichier} = <$g>;
        close $g;
      }
      $examinees++;
      local $_ = $courant{$fichier};
      my $avant = $_;
      my $valide = eval "no strict; no warnings; $expression; 1";
      if (!$valide) {
        print "  ECHEC $script:$numero : expression perl invalide, $@";
        $echecs++;
      } elsif ($_ eq $avant) {
        print "  PERIMEE $script:$numero : aucun caractere de $fichier ne change\n";
        $perimees++;
        $echecs++;
      } else {
        $courant{$fichier} = $_;
      }
    }

    %courant = () if $restauratrices{$fonction};
  }

  if ($examinees == 0) {
    print "  ECHEC $script definit mute() sans aucun appel analyse\n";
    $echecs++;
  }
  printf "  %-52s %3d expressions, %d perimee(s)\n", $script, $examinees, $perimees;
  $total += $examinees;
}

print "\n";
if ($echecs > 0) {
  print "ECHEC $echecs defaut(s). Une expression perimee ne se voyait jusqu ici\n";
  print "      qu au nocturne, apres des dizaines de minutes : corriger le\n";
  print "      script de mutation, pas le code, LS-254.\n";
  exit 1;
}
print "OK $total expressions de mutation modifient encore leur fichier, " . scalar(@ARGV) . " scripts\n";
' "${SCRIPTS[@]}"
