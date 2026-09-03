# Bouche Cousue

*[English version](README.md)*

Un dessin animé qui ne tourne que si la bouche de l'enfant reste fermée.

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

## Utilisation

| Action | Effet |
| --- | --- |
| **Barre d'espace**, ou **clic sur la vidéo** | Lecture / pause à la main |
| **Bouton ▶ / ⏸** | Idem, depuis la barre de lecture (fichiers locaux) |
| **⛶ Plein écran** | Utiliser *ce* bouton — celui de YouTube casse la détection |
| **FR / EN** | Changer de langue ; le choix est mémorisé |

Une pause manuelle suspend complètement la détection : le film reste arrêté tant
qu'un adulte ne l'a pas relancé, quoi que fassent les lèvres de l'enfant.

### Réglages

| Réglage | Signification |
| --- | --- |
| **Sensibilité** | Ouverture nécessaire pour compter comme « bouche ouverte ». Plus haut = plus strict. |
| **Avertissement** | Durée bouche ouverte avant l'apparition de l'avertissement. |
| **Pause** | Durée de l'avertissement avant la mise en pause réelle. |

Les réglages, ainsi que le volume et la langue, sont mémorisés dans le
navigateur d'une session à l'autre.

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
- Pas de compte, pas de traceur, pas de statistiques, pas de télémétrie.
- Les vidéos locales sont lues directement par le navigateur, jamais envoyées.
- Les seules données conservées sont vos réglages (sensibilité, délais, volume,
  langue), dans le `localStorage` de ce navigateur.
- Une seule exception : choisir une vidéo YouTube la charge depuis
  `youtube-nocookie.com`, qui applique alors ses propres règles.

Il n'y a aucune étape de compilation et rien n'est minifié : tout ce qui
précède se vérifie en lisant le code de ce dépôt.

## Navigateurs

Chrome et Edge sont les plus sûrs (délégation GPU et prise en charge des codecs
la plus large). Tout navigateur Chromium devrait convenir. Firefox et Safari
font tourner la détection mais sont plus restrictifs sur les codecs vidéo.

## Organisation du projet

```
index.html                  balisage seul — aucun style ni script en ligne
css/
  base.css                  variables de design, reset, valeurs par défaut
  layout.css                guirlande, en-tête, colonne principale, pied de page
  components.css            badges, boutons, curseurs, barres de lien, bulle
  stage.css                 surfaces vidéo, accueil, voile, retour caméra
js/
  main.js                   point d'entrée : démarre et relie le tout
  config.js                 constantes — délais, seuils, repères, clés
  dom.js                    tous les éléments, résolus une fois
  storage.js                accès protégé au localStorage
  i18n.js                   chargement des langues, traduction, liaison au DOM
  ui.js                     voile, badge d'état, jauge, récompense, plein écran
  settings.js               les trois curseurs de détection
  detector.js               caméra + MediaPipe ; produit des mesures, rien d'autre
  mouth-monitor.js          la machine à états et la boucle de détection
  player.js                 lecture des fichiers locaux et de YouTube
  playback-controls.js      la barre de lecture
  source-picker.js          accueil, barre rapide, sélecteur de fichier
locales/
  en.json, fr.json          tout le texte visible par l'utilisateur
```

Les dépendances vont dans un seul sens — `config`/`dom`/`storage` → `i18n` →
`ui`/`player`/`detector`/`settings` → `mouth-monitor` → `source-picker` →
`main` — sans aucun cycle. `detector.js` se contente de mesurer,
`mouth-monitor.js` de décider, et `player.js` de lire : c'est cette séparation
qui rend la règle du jeu facile à suivre dans le code.

## Ajouter une langue

1. Copier `locales/fr.json`, le nommer d'après le code de la langue, et
   traduire les valeurs. Toutes les clés doivent être présentes — celles qui
   manquent retombent sur le français.
2. Ajouter le code à `I18N.SUPPORTED` dans `js/config.js`.
3. Ajouter un bouton au sélecteur de langue dans `index.html`, avec l'attribut
   `data-locale` correspondant.

Aucune modification de JavaScript n'est nécessaire : l'interface lit son texte
depuis le JSON. La langue initiale vient des préférences du navigateur, à
défaut le français.

## Contribuer

Les issues et pull requests sont bienvenues. Gardez en tête que l'interface
s'adresse à de jeunes enfants : le texte doit rester court, chaleureux et
rassurant, dans toutes les langues.

## Licence

MIT — voir [LICENSE](LICENSE).
