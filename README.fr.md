# Bouche Cousue

*[English version](README.md)*

Un dessin animé qui ne tourne que si la bouche de l'enfant reste fermée.

**▶ [Essayer dans le navigateur](https://raphaelapard.github.io/bouche-cousue/)** — rien à installer ; la caméra ne quitte jamais votre machine.

Bouche Cousue transforme la fermeture des lèvres en jeu. Le film joue tant que
les lèvres se touchent ; il prévient doucement, puis met en pause, quand la
bouche s'ouvre. Refermer la bouche relance aussitôt le film, avec un petit
« Bravo ! ».

Tout tourne dans le navigateur, sur la machine devant vous — pas de compilation,
aucune dépendance à installer, pas de serveur, pas de compte, aucune collecte
de données.

## Pourquoi

Les enfants porteurs d'une **hypotonie faciale** (tonus musculaire faible du
visage) gardent souvent la bouche ouverte au repos, parce que maintenir les
lèvres jointes demande un effort constant et conscient. Travailler la fermeture
labiale fait partie des exercices oro-moteurs habituels, mais c'est répétitif et
difficile à tenir avec un jeune enfant.

L'idée est d'en faire quelque chose que l'enfant *a envie* de faire : la
récompense est immédiate, évidente, et entièrement sous son contrôle — son
propre dessin animé continue. L'adulte règle la difficulté et garde la main sur
la mise en pause.

L'app gère aussi ce qui arrive vraiment avec de jeunes enfants : les mains
devant la bouche, la tétine, ou le visage qui s'éloigne de l'écran mettent
également le film en pause.

> **Ce n'est pas un dispositif médical.** C'est une aide ludique, ni une
> thérapie ni un outil de diagnostic, et elle ne prétend à aucun effet clinique.
> Elle vient en complément d'un travail encadré par un·e orthophoniste ou un
> autre professionnel — associez-le à la façon dont l'outil est utilisé, et à
> quelle dose.

## Démarrer

L'accès à la caméra exige un contexte sécurisé, et l'app charge ses traductions
et ses modules par HTTP : ouvrir le fichier directement en `file://` ne
fonctionne pas. Il faut le servir depuis `http://localhost` (ou tout hôte
HTTPS) :

```sh
python3 -m http.server 8000
# puis ouvrir http://localhost:8000/
```

Le premier lancement nécessite internet pour télécharger le moteur MediaPipe et
le modèle de visage depuis un CDN. Ensuite, la détection tourne entièrement en
local, hors ligne.

Il reste à coller un lien YouTube, choisir une vidéo sur l'ordinateur, ou tester
le mode démo sans vidéo.

Le dépôt embarque aussi quelques scripts `pnpm`, dont aucun n'est nécessaire
pour utiliser l'app : `pnpm serve` est la commande ci-dessus, `pnpm check`
lance les vérifications statiques qui tiennent lieu de tests, et `pnpm build`
prépare le site dans `dist/` en vue d'une publication. Il n'y a aucune
dépendance : `pnpm install` n'a rien à télécharger.

## Utilisation

| Action | Effet |
| --- | --- |
| **Barre d'espace**, ou **clic sur la vidéo** | Lecture / pause à la main |
| **Bouton ▶ / ⏸** | Idem, depuis la barre de lecture (fichiers locaux) |
| **⛶ Plein écran** | Utiliser *ce* bouton — celui de YouTube casse la détection |
| **Réglages** | Ouvrir le panneau adulte ; il se referme au second clic, sur Échap, ou sur un clic à l'extérieur |
| **Fermer** | Quitter le film et revenir à l'accueil ; la caméra se ferme avec lui |
| **FR / EN** | Changer de langue ; le choix est mémorisé |

Le sélecteur de langue et le bouton de fermeture partagent une place sur la
barre du haut : la pastille FR / EN cède la sienne à **Fermer** pendant qu'un
film joue, si bien que les deux n'y sont jamais ensemble. Regarder un film est
une entrée d'historique à part entière : le bouton « précédent » du navigateur —
et le balayage qui en tient lieu sur téléphone — ferme donc le film au lieu de
quitter le site.

Une pause manuelle suspend complètement la détection : le film reste arrêté tant
qu'un adulte ne l'a pas relancé, quoi que fassent les lèvres de l'enfant. Cette
pause-là est dessinée sur du papier plutôt que dans le noir — un panneau clair
avec un cadenas — pour qu'un enfant voie d'un coup d'œil qu'elle ne parle pas
de lui.

En plein écran, il ne reste que le film : ni barre du haut, ni miroir, ni barre
de lecture, seulement une grande lampe — verte tant que la bouche est fermée,
ambre sinon — et un bouton nommé pour en sortir.

### Réglages

| Réglage | Signification |
| --- | --- |
| **Sensibilité** | Ouverture nécessaire pour compter comme « bouche ouverte ». Plus haut = plus strict. |
| **Avertissement** | Durée bouche ouverte avant l'apparition de l'avertissement. |
| **Pause** | Durée de l'avertissement avant la mise en pause réelle. |
| **Miroir** | Afficher ou masquer le retour caméra et sa jauge d'ouverture. |

Ils sont livrés à une sensibilité de **47** sur le curseur 15–90 (soit un seuil
de `0,048`), **1,5 s** avant l'avertissement et **3,0 s** avant la pause. Tous,
ainsi que le volume, le miroir et la langue, sont mémorisés dans le navigateur
d'une session à l'autre.

Le miroir est le visage de l'enfant, avec la jauge d'ouverture en dessous et un
repère à l'endroit exact où le film s'arrête. Il garde la même taille et le même
coin en bas à droite à toutes les largeurs : une seule forme à reconnaître, quel
que soit l'écran devant lequel l'enfant se trouve.

## Fonctionnement

MediaPipe **FaceLandmarker** analyse chaque image de la caméra. L'ouverture de
la bouche est l'écart vertical des lèvres divisé par la hauteur du visage :

```
ouverture = distance(repère 13, repère 14) / distance(repère 10, repère 152)
```

Diviser par la hauteur du visage rend la mesure indépendante de l'échelle :
l'enfant peut se rapprocher ou s'éloigner sans fausser le résultat.

Deux seuils, et non un seul : la bouche est *ouverte* au-dessus du seuil de
sensibilité, et *fermée* seulement en dessous de 60 % de celui-ci. Entre les
deux, l'état précédent est conservé. Cet écart est volontaire — avec un seuil
unique, le film clignote dès que les lèvres restent pile à la limite.

Des délais décident ensuite de ce qui se passe vraiment, pour qu'un bâillement
ou un mot ne coupe pas le film. Un modèle **HandLandmarker** détecte les mains
sur la bouche, et une heuristique de couleur sur la zone des lèvres repère une
tétine. Si le modèle de mains ne se charge pas, le reste continue de marcher.

## Formats vidéo

Les fichiers locaux passent par les décodeurs du navigateur, plus limités que
ceux de VLC :

- **Idéal :** `.mp4` (vidéo H.264 + audio AAC) ou `.webm`
- **Souvent muet :** `.mkv` — le conteneur passe souvent, mais sa piste audio
  (AC-3, E-AC-3, DTS) n'est pas décodable par un navigateur : l'image s'affiche,
  sans le son

Pour rendre le son au fichier sans ré-encoder la vidéo :

```sh
ffmpeg -i dessin-anime.mkv -c:v copy -c:a aac -b:a 192k dessin-anime.mp4
```

Si l'image manque aussi, la vidéo est probablement en H.265/HEVC et demande un
vrai ré-encodage (`-c:v libx264 -crf 20 -preset fast`).

## Vie privée

- Le flux caméra est analysé image par image dans la page, puis aussitôt oublié.
  **Rien n'est enregistré, aucune image ne quitte la machine.**
- Pas de compte, et rien qui concerne l'enfant — ni visage, ni mesure, ni
  degré d'ouverture, ni titre de vidéo — n'est envoyé où que ce soit.
- Les vidéos locales sont lues directement par le navigateur, jamais envoyées.
- Les seules données conservées sont vos réglages (sensibilité, délais, volume,
  miroir, langue), dans le `localStorage` de ce navigateur.
- Deux choses passent tout de même par le réseau. Des statistiques de
  fréquentation anonymes sont envoyées à un **Matomo auto-hébergé** sur
  `stats.acolad.net` — visites et clics sur les liens, pour savoir si l'outil
  sert à quelque chose ; c'est notre propre instance, pas une régie publicitaire,
  et elle ne reçoit rien de la caméra. Supprimer le bloc `<!-- Matomo -->` en
  haut de `index.html` la désactive ; rien d'autre n'en dépend.
- Et choisir une vidéo YouTube la charge depuis `youtube-nocookie.com`, qui
  applique alors ses propres règles.

Il n'y a aucune étape de compilation et rien n'est minifié : tout ce qui
précède se vérifie en lisant le code de ce dépôt.

## Navigateurs

Chrome et Edge sont les plus sûrs (délégation GPU et prise en charge des codecs
la plus large). Tout navigateur Chromium devrait convenir. Firefox et Safari
font tourner la détection mais sont plus restrictifs sur les codecs vidéo.

## Trois façades

Une seule idée, sous trois formes. La règle est la même partout — mêmes
seuils, mêmes délais, même zone morte — et les phrases que lit l'enfant aussi.
Ce qui change, c'est à qui appartient la vidéo.

| | Où | Ce qui est joué | Installation |
|---|---|---|---|
| **Application web** | ce dossier | un dessin animé que vous lui donnez, par lien ou fichier | rien à installer — [servez-la](#démarrer) |
| **Extension Firefox** | [`firefox-extension/`](firefox-extension/) | une vidéo déjà lancée sur la page de quelqu'un d'autre | [`firefox-extension/README.md`](firefox-extension/README.md) |
| **Extension Chrome** | [`chrome-extension/`](chrome-extension/) | la même chose, dans Chrome | [`chrome-extension/README.md`](chrome-extension/README.md) |

**L'application web** est le cinéma complet : vous lui donnez un lien YouTube
ou un fichier de l'ordinateur, et elle le joue sur une scène à elle, avec une
barre de lecture et un bouton plein écran. C'est celle à utiliser quand il
s'agit de s'installer devant un film choisi.

**Les deux extensions** appliquent la même règle à la page de quelqu'un
d'autre. Vous en activez une, et ce que joue l'onglet — YouTube, un site de
replay, une vidéo intégrée à un blog — ne tourne que si la bouche reste fermée.
Les vidéos de *tous* les onglets ouverts sont surveillées, pas seulement celle
qui est devant.

Les deux extensions sont le même programme : à part `manifest.json` et les
icônes, tous les fichiers sont identiques. Elles diffèrent de l'application web
sur un point visible — la caméra vit dans une petite fenêtre à part, parce
qu'aucun des deux navigateurs n'ouvre une caméra depuis une page d'arrière-plan
ou depuis une popin qui se ferme dès qu'on clique ailleurs.

Une modification de la règle vaut pour les trois.

## Organisation du projet

```
index.html                  balisage seul — aucun style ni script en ligne
css/
  base.css                  variables de design, reset, l'unique point de rupture
  mascot.css                le chat, et laquelle de ses sept têtes s'affiche
  chrome.css                barre du haut, badges, barre rapide, panneau, miroir
  welcome.css               l'écran d'accueil
  stage.css                 surface vidéo, les voiles, le plein écran
js/
  main.js                   point d'entrée : démarre et relie le tout
  config.js                 constantes — délais, seuils, repères, clés
  dom.js                    tous les éléments, résolus une fois
  storage.js                accès protégé au localStorage
  layout.js                 lit le point de rupture, nomme l'état sur <body>
  mascot.js                 duplique le gabarit du chat dans ses emplacements
  range-fill.js             la portion remplie à gauche du curseur
  i18n.js                   chargement des langues, traduction, liaison au DOM
  ui.js                     voile, badge d'état, jauge, récompense, plein écran
  settings.js               le panneau adulte et ses réglages
  detector.js               caméra + MediaPipe ; produit des mesures, rien d'autre
  mouth-monitor.js          la machine à états et la boucle de détection
  player.js                 lecture des fichiers locaux et de YouTube
  playback-controls.js      la barre de lecture
  source-picker.js          accueil, barre rapide, sélecteur de fichier
locales/
  en.json, fr.json          tout le texte visible par l'utilisateur

firefox-extension/          l'extension Firefox — voir son propre README
chrome-extension/           la même extension pour Chrome
```

Les deux dossiers d'extension sont un seul programme en deux paquets : à part
`manifest.json` et les icônes, tous les fichiers sont identiques, et
`lib/api.js` absorbe la différence entre `browser` et `chrome`. Ils embarquent
leurs propres copies des modules de l'application, sous les mêmes noms, parce
qu'une extension ne peut pas importer depuis une page web — la règle vit donc à
trois endroits, et toute modification vaut pour les trois.

Les dépendances vont dans un seul sens — `config`/`dom`/`storage`/`mascot`/
`range-fill`/`layout` → `i18n` → `ui`/`player`/`detector`/`settings` →
`mouth-monitor` → `source-picker` → `main` — sans aucun cycle. `detector.js` se contente de mesurer,
`mouth-monitor.js` de décider, et `player.js` de lire : c'est cette séparation
qui rend la règle du jeu facile à suivre dans le code.

## Ajouter une langue

1. Copier `locales/fr.json`, le nommer d'après le code de la langue, et
   traduire les valeurs. Toutes les clés doivent être présentes — celles qui
   manquent retombent sur le français.
2. Ajouter le code à `I18N.LOCALES` dans `js/config.js`.
3. Ajouter un bouton portant l'attribut `data-locale` correspondant aux **deux**
   sélecteurs de langue de `index.html` — celui de l'accueil et celui de la
   barre du haut.

Aucune modification de JavaScript n'est nécessaire : l'interface lit son texte
depuis le JSON. Chaque langue déclarée est chargée une fois au démarrage, si
bien que changer de langue ne coûte aucune requête. La langue initiale est
celle mémorisée sous `p4l.locale`, à défaut le français.

## Contribuer

Les issues et pull requests sont bienvenues. Gardez en tête que l'interface
s'adresse à de jeunes enfants : le texte doit rester court, chaleureux et
rassurant, dans toutes les langues.

## Contact

Une question, un retour, ou le récit de ce que ça a donné avec votre enfant :
[raphael.apard@acolad.fr](mailto:raphael.apard@acolad.fr).

Les retours d'orthophonistes sont particulièrement bienvenus — la sensibilité
et les délais par défaut ont été réglés à la main, et seul l'usage réel dira
s'ils conviennent à d'autres.

## Licence

MIT — voir [LICENSE](LICENSE).
