# Digrain et coutelas

Les deux jeux sont livrés ensemble. Un clic sur l'arme de la dernière rencontre lance son mini-jeu. La sandale conserve son comportement. CAPES reste une image.

## Jeux

- Digrain : vagues de scolos, déplacement horizontal et pulvérisation maintenue. La réserve baisse pendant le tir, remonte au repos et exige un relâchement après épuisement. Trois vies, difficulté croissante, trois minutes maximum. Le classement compte les scolos éliminés, puis départage par durée croissante.
- Au coutelas, la flèche balaie le terrain de gauche à droite puis revient. Un premier appui bloque la direction. La puissance monte puis redescend. Un deuxième appui la bloque et lance le coutelas. Après le premier appui, un décompte laisse 6 secondes à 0 point, 4,5 secondes à 1 500 et 3 secondes à partir de 3 000. À son expiration, le coutelas part à la puissance du moment. La pause suspend le décompte. Un viseur et des pointillés indiquent le point de chute pendant les deux premiers lancers de la partie. Dès le troisième, le joueur estime la distance avec la jauge de puissance. Le joueur peut cliquer ou toucher directement le terrain, ou utiliser le clavier. Seul un atterrissage dans le cercle du scolo compte. Chaque cible touchée accélère le balayage et la variation de puissance. Les impacts ratés restent visibles sur le terrain jusqu'au changement de cible. Une réussite rapporte 300, 200 ou 100 points au premier, deuxième ou troisième essai. Trois échecs sur la même cible ou trois minutes terminent la partie. Le terrain affiche « Perdu » et le score pendant deux secondes, puis le classement s’ouvre automatiquement. Le classement trie les points, puis la durée croissante.
- Les jeux se mettent en pause quand l'onglet devient invisible ou perd le focus. Échap met une partie en pause, puis ferme la modale au deuxième appui.

Chaque jeu utilise la même chaîne de sauvegarde, reprise après connexion, classement et partage que la sandale, avec des cookies et files d'attente distincts. Les identifiants publics sont `?classement=1` pour la sandale, `2` pour Digrain et `3` pour le coutelas. La consultation des records reste publique et ne crédite rien.

## Intégrité et gains

La seed est émise par le serveur. Digrain et coutelas utilisent une simulation déterministe en pas de 20 ms. Le serveur rejoue les commandes avant d'enregistrer le score : aucun score fourni par le navigateur n'est accepté. Les déplacements redondants sont regroupés par tick, mais les transitions de tir sont conservées. L'origine, la session, le propriétaire du reçu et la version du jeu restent vérifiés.

Chaque podium crédite 1, 2 ou 3 Zikak, uniquement par différence positive et avec un plafond de 3 par compte et par jeu sur sa durée de vie. Les crédits existants de la sandale ne sont pas réinitialisés. Les trois plafonds sont indépendants ; changer de version ne réinitialise pas les gains.

## Migration et livraison

La migration additive `2026-11-07-arcade-weapons-v7` ajoute `points INTEGER NOT NULL DEFAULT 0` aux parties et records existants, ainsi que `scolo_arcade_game_rewards` pour les deux nouveaux plafonds. Les lignes, identifiants et relations historiques restent inchangés. La table historique des récompenses sandale continue d'être utilisée.

Avant livraison DEV : sauvegarde SQLite cohérente avec comparaison de toutes les tables, répétition de la migration sur une copie, puis seconde application pour contrôler l'idempotence. La préparation compare toutes les colonnes historiques, même lorsqu'une nouvelle colonne est ajoutée. Le runtime hébergé Turso exige une préparation explicite ; cette livraison DEV n'autorise pas une migration ni une promotion PROD.

Vérifications locales : moteurs, rejouabilité, cibles atteignables, refus de résultats impossibles et d'association à un autre compte, isolation des jeux, plafonds de gains et retry, préservation des données historiques, types et lint. Parcours HTTP locaux à 1440 et 390 px : lancement, commandes, pause/reprise, lancer raté, fermeture et focus, accès aux classements sans débordement ni erreur JavaScript. Les données locales sont des fixtures jetables, isolées de DEV et PROD.
