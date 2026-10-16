# Spoolman

Suivez vos bobines de filament d'impression 3D dans Gladys grâce à
[Spoolman](https://github.com/Donkie/Spoolman), le gestionnaire de stock de
filament auto-hébergé : poids et longueur restants de chaque bobine, stock de
chaque matériau, consommation d'une impression, et consommation déclarée à la
main. Tout reste sur votre réseau local : Gladys parle directement à Spoolman.

Spoolman met Gladys à jour **en direct** : dès que Klipper (Moonraker),
OctoPrint ou la page web de Spoolman modifie une bobine, ses valeurs bougent
dans Gladys.

Testée contre un vrai Spoolman 0.27.0 (son image Docker officielle). Vos
retours sont les bienvenus sur le forum Gladys.

## Prérequis

- Gladys Assistant 5.2 ou plus récent (le formulaire du widget en a besoin).
- Un serveur Spoolman joignable depuis la machine Gladys, sur le port 7912
  par défaut, ou derrière un proxy inverse.
- Pour suivre les impressions automatiquement : une imprimante qui déclare
  sa consommation à Spoolman, comme Klipper avec la section `[spoolman]` de
  Moonraker, ou OctoPrint avec son extension Spoolman. Sinon, déclarez la
  consommation par l'action de scène ou le widget.

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Dans **Adresse de Spoolman**, saisissez l'adresse IP du serveur, par
   exemple `192.168.1.50` : l'intégration utilise alors le port 7912. Ajoutez
   le port s'il diffère (`192.168.1.50:8000`). Derrière un proxy inverse,
   saisissez l'adresse complète, sous-chemin compris
   (`https://example.org/spoolman`).
3. Spoolman n'a pas d'identifiants. Si votre proxy en demande, remplissez
   **Utilisateur du proxy** et **Mot de passe du proxy** (HTTP Basic), ou un
   **En-tête HTTP supplémentaire** écrit `Nom: valeur` (un jeton).
4. **Un appareil de stock par matériau** (activé par défaut) ajoute un
   appareil par matériau (PLA, PETG…) avec son poids total restant.
5. **Langue des noms et messages** choisit les noms des fonctionnalités
   (fixés à l'ajout de l'appareil) et les textes. Français par défaut.
6. Enregistrez, puis utilisez **Tester la connexion** : elle affiche la
   version de Spoolman, le nombre de bobines en service et l'état des mises à
   jour en direct.
7. Dans l'onglet **Découverte**, ajoutez les bobines et les stocks à suivre.

## Appareils

**Une bobine** (une par bobine en service, nommée d'après son fabricant, son
filament et son matériau, avec son numéro Spoolman :
`Prusament Galaxy Black PLA #1`) :

| Fonctionnalité       | Valeur                                                    |
| -------------------- | --------------------------------------------------------- |
| Poids restant (g)    | grammes de filament restants                              |
| Restant              | pourcentage restant, par rapport au poids initial         |
| Poids utilisé (g)    | grammes consommés depuis l'enregistrement de la bobine    |
| Longueur restante    | mètres de filament restants                               |
| Dernière utilisation | date et heure de la dernière consommation, ou « Jamais »  |
| État                 | « En service », « Archivée » ou « Supprimée de Spoolman » |

L'emplacement, la couleur et le numéro de la bobine sont dans les paramètres
de l'appareil. Une bobine dont le filament n'a pas de poids dans Spoolman ne
publie ni poids restant ni pourcentage : renseignez le poids du filament dans
Spoolman.

**Un stock** (`Stock PLA`) : le poids total restant (g) et le nombre de
bobines en service d'un matériau.

Une bobine archivée quitte l'onglet Découverte ; une fois ajoutée à Gladys,
son appareil reste et affiche « Archivée ». Supprimez-le dans Gladys quand
son historique ne vous sert plus.

## Widget du tableau de bord

**Bobines de filament** : trois tuiles (stock total en kg, nombre de bobines,
nombre de bobines basses), la liste des bobines qui s'épuisent en premier
avec leur poids restant, leur emplacement et leur pourcentage (vert, orange
sous le seuil, rouge sous sa moitié), et un bouton **Consommation** : il
ouvre un formulaire (bobine, quantité, grammes ou mètres) et enregistre la
consommation dans Spoolman.

Réglages : un matériau (`PLA`) et un emplacement Spoolman pour filtrer la
liste, et le pourcentage sous lequel une bobine est basse (20 % par défaut).

## Déclencheurs de scène

- **Filament consommé** : une bobine a perdu du poids dans Spoolman (une
  impression signalée par l'imprimante), une fois la consommation arrêtée
  depuis 2 minutes : une impression entière donne un seul événement. Filtre
  facultatif : la bobine. Variables : nom de la bobine, matériau,
  emplacement, grammes consommés, grammes restants, pourcentage restant. Une
  consommation déclarée par l'intégration elle-même (action de scène,
  widget) ne le déclenche pas.
- **Bobine archivée** : une bobine a été archivée dans Spoolman (en général :
  elle est vide). Filtre facultatif : la bobine. Variables : nom de la
  bobine, matériau, emplacement.

Un seuil (« moins de 100 g ») n'a pas besoin d'un déclencheur particulier :
utilisez le déclencheur standard **Changement d'état de l'appareil** sur le
poids restant ou le pourcentage d'une bobine, ou sur le poids restant d'un
stock.

## Actions de scène

**Déclarer une consommation de filament** : retire une quantité (en grammes
ou en mètres) d'une bobine dans Spoolman, pour une imprimante qui ne la
signale pas (par exemple à la fin d'une impression annoncée par une autre
intégration). Sorties : grammes restants, pourcentage restant.

## Exemples de scènes

- **Commander du filament avant la panne** : déclencheur « Changement d'état
  de l'appareil », poids restant de `Stock PETG` sous 500 → envoyer le
  message « Il reste moins de 500 g de PETG ».
- **Bobine presque vide** : déclencheur « Changement d'état de l'appareil »,
  poids restant d'une bobine sous 100 → message « Bobine presque vide :
  pensez à en commander une ».
- **Bilan d'impression** : déclencheur **Filament consommé** → un message
  construit avec ses variables : grammes consommés, nom de la bobine,
  grammes restants.
- **Une imprimante sans Spoolman** : déclencheur « impression terminée » de
  son intégration → action **Déclarer une consommation de filament** sur la
  bobine chargée.

## Dépannage

- **« Spoolman ne répond pas »** : vérifiez l'adresse et le port (7912 avec
  l'image Docker officielle, 8000 à l'intérieur du conteneur), et que la
  machine Gladys le joint.
- **« Accès refusé (401) » ou « (403) »** : votre proxy refuse les
  identifiants ou l'en-tête. Spoolman lui-même ne répond 403 qu'à une
  requête venue d'un autre site web (un navigateur) : l'intégration n'en
  envoie pas.
- **« Ne répond pas comme Spoolman »** : l'adresse mène à une page de
  connexion ou à un autre service. Avec un sous-chemin, saisissez-le en
  entier.
- **Une bobine n'a pas de poids restant** : son filament n'a pas de poids
  dans Spoolman.
- Plus de détails dans les journaux de l'intégration (`LOG_LEVEL=debug` pour
  chaque mise à jour).

## Limites

- Un seul serveur Spoolman.
- Gladys n'a pas d'unité gramme : les poids portent « (g) » dans leur nom.
- La pièce d'un appareil ne peut pas être choisie par une intégration :
  attribuez-la dans Gladys. L'emplacement Spoolman est dans les paramètres de
  l'appareil et filtre le widget.
- Spoolman réutilise le numéro de la dernière bobine quand elle est
  supprimée (SQLite) : une nouvelle bobine peut alors reprendre son appareil
  Gladys.
- Les mises à jour en direct demandent que le WebSocket passe votre proxy ;
  sinon l'intégration relit Spoolman toutes les 5 minutes.
- Un changement de filament ou de fabricant relit toute la liste (Spoolman
  n'envoie pas de mise à jour des bobines concernées).
