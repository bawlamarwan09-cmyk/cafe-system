# cafe-system

Application de gestion de café, avec une interface crème, blanche et or. Le catalogue et le stock initiaux sont des exemples ; aucune vente ou dépense historique n'est importée depuis Excel.

## Démarrer sur Mac

Node.js 22.13 ou plus récent et une base PostgreSQL sont nécessaires. Dans `.env`, configurez `DATABASE_URL` avec la chaîne de connexion PostgreSQL.

```sh
npm ci
npm run db:migrate
npm run dev
```

Ouvrir http://localhost:3007.

Comptes de démonstration :

| Identifiant | Code | Accès |
| --- | --- | --- |
| manager | 2026 | Gestion complète |
| caisse | 1234 | Caisse, ventes, tableau de bord, clients |

Pour une base neuve, définir `MONALISA_MANAGER_PIN` et `MONALISA_CASHIER_PIN` dans `.env.local` avant le premier démarrage. Ces valeurs initialisent les comptes une seule fois. Chaque compte est lié à un café côté serveur ; un manager peut créer d'autres comptes pour son propre café dans les paramètres.

## العربية / Français

العربية متاحة افتراضياً مع اتجاه من اليمين إلى اليسار. استعمل زر العربية / FR في صفحة الدخول أو أعلى التطبيق لتبديل اللغة؛ الاختيار كيتحفظ في المتصفح. القوائم، النماذج، رسائل الأخطاء، تواريخ العرض والوصولات كيتبدلو حسب اللغة. أسماء وقيم البيانات المخزنة، الأثمنة، الصلاحيات وحسابات المخزون ما كيتبدلوش. المنتجات التجريبية عندها أسماء عرض عربية، ويمكن البحث عليها بالعربية أو الفرنسية.

## Parcours à essayer

1. Se connecter en manager et ouvrir une khncha depuis le tableau de bord.
2. Ouvrir la caisse, choisir les produits, puis confirmer la commande.
3. Le ticket s'ouvre : imprimer les deux copies depuis le navigateur. L'enregistrement de la vente ne dépend pas du succès de l'impression ; l'historique permet de réimprimer sans recréer une vente.
4. Vérifier les ventes, la consommation de stock et les équivalents de la khncha.
5. Enregistrer les achats de café par khncha de 1 kg ou par lot de 6 khnchas (6 kg). Le module crédit a été retiré ; les ventes se paient en espèces ou par carte.
6. Enregistrer achats, dépenses, présences et avances. Un achat de carton doit être saisi dans l'unité de stock : 24 bouteilles, et non 1 carton.
7. Depuis Rapports, exporter les journaux CSV compatibles avec Excel et compter la caisse. La clôture verrouille la journée.

## Règles de gestion

- Les montants sont stockés en centimes entiers. Transactions PostgreSQL via Prisma pour commande, stock et khncha ; clé de requête unique pour éviter la double vente en cas de nouvelle tentative.
- Confirmation = vente enregistrée et stock consommé. Le paiement est explicitement espèces ou carte ; les nouvelles ventes à crédit et les remboursements de crédit sont refusés par le serveur.
- Café noir : 1 équivalent ; café au lait : 0,5 ; double : 2. Recettes et prix modifiables dans Paramètres. Les recettes d'exemple de sucre, lait et thé sont à valider avec le café.
- Une seule khncha active par café, ouverte et clôturée par le manager. Elle couvre plusieurs jours. Chaque nouvelle khncha contient 1 kg : la référence est de 65 équivalents. Un lot d’achat de 6 kg contient 6 khnchas de 1 kg. Le poids restant est une estimation, jamais une mesure physique. Une clôture anticipée n'affiche pas de rendement final.
- Reste du jour = ventes − dépenses − salaires/avances payés. Les achats de marchandises sont affichés séparément.
- Reste de gestion mensuel = ventes − achats − dépenses − salaires/avances. Ce calcul suit la gestion de trésorerie du fichier Excel ; il n'est pas présenté comme un bénéfice comptable.
- Le salaire acquis est calculé sur les présences. Un versement d'avance est déduit une seule fois du solde employé et de la trésorerie. Lors du paiement final, saisir uniquement le complément réellement payé, pas une deuxième fois le salaire brut.
- Les charges mensuelles sont saisies une fois à leur date, avec leur catégorie. Pas de prorata journalier automatique ni de prélèvement récurrent automatique dans cette version.
- Caisse attendue = fond initial + ventes espèces − sorties espèces (achats, dépenses, salaires, avances, retraits). Les cartes et crédits ne sont pas des espèces.
- Annulation manager avec motif : à utiliser uniquement si les produits ne sont pas préparés/consommés, car elle réintègre le stock. Impossible après clôture de la journée ou de la khncha liée. Un produit préparé puis perdu doit être enregistré comme perte de stock.
- Les commandes et mouvements sont attribués à l'utilisateur connecté. Les comptes ont un seul café ; aucune sélection de café n'est exposée au caissier.

## Données et sauvegarde

Les données sont persistées dans PostgreSQL. Gardez `DATABASE_URL` sur le backend et sauvegardez la base avec `pg_dump`.

### Importer les ventes et le stock SQLite existants

1. Arrêtez la saisie sur l'ancienne caisse au moment du transfert. Sur le Mac, créez un fichier de sauvegarde SQLite cohérent.

   ```sh
   sqlite3 -readonly data/monalisa.sqlite ".backup /tmp/monalisa-backup.sqlite"
   ```

2. Transférez cette sauvegarde vers le VPS par SCP. Exécutez `npm run db:migrate` sur une base PostgreSQL dédiée et vide. Configurez `MONALISA_MANAGER_PIN` et `MONALISA_CASHIER_PIN` avec deux codes distincts de 8 à 12 chiffres dans le fichier privé `.env` du backend.
3. Avant le premier démarrage de l'application, lancez `npm run db:import -- /chemin/prive/monalisa-backup.sqlite`. L'import conserve les identifiants, ventes, produits, stocks et mouvements. Il renouvelle les codes des comptes `manager` et `caisse` et laisse les anciennes sessions expirer en demandant une nouvelle connexion. Les anciens sacs historiques gardent leur poids de 6 kg quand le champ de poids était absent. Le stock de ces anciennes bases est converti en unités de 1 kg.
4. Vérifiez les quantités et les totaux sur PostgreSQL avant de basculer les terminaux.

## Déploiement VPS et Vercel

Sur le VPS, installez les dépendances, appliquez les migrations, importez la sauvegarde si nécessaire, puis compilez et démarrez le backend.

```sh
npm ci
npm run db:migrate
npm run build
npm start -- --hostname 127.0.0.1
```

Exécutez le service sous un utilisateur dédié. Configurez le reverse proxy du VPS pour publier le port 3007 sur un domaine HTTPS, par exemple `https://api-cafe.example.com`. Si 3007 est déjà pris, choisissez un port libre avec `npx next start -p PORT --hostname 127.0.0.1`. Gardez PostgreSQL accessible uniquement depuis le backend.

- **VPS** · Définissez `DATABASE_URL`, les deux PIN de production pour une installation neuve, et `MONALISA_ORIGIN=https://cafe.example.com` (l'origine publique de Vercel, sans slash final). Laissez `MONALISA_API_ORIGIN` absent.
- **Vercel** · Importez le même dépôt Next.js. Définissez uniquement `MONALISA_API_ORIGIN=https://api-cafe.example.com` pour le routage de l'API et redéployez. La réécriture envoie `/api/*` vers le VPS tout en gardant la session sur le domaine de la caisse.
- Vérifiez depuis Vercel la connexion, une vente de test, le stock, et l'impression sur le terminal. L'interface affiche uniquement des codes numériques en cas d'erreur.

## État et limites

Next.js / React / TypeScript, API Node et PostgreSQL via Prisma. Le navigateur se connecte au serveur pour chaque opération : aucun fonctionnement offline avec synchronisation n'est inclus.

Avant utilisation en production : remplacer les comptes de démonstration, durcir la gestion des identifiants, configurer HTTPS, accès distant, sauvegardes et supervision. Les anciens enregistrements liés au crédit sont conservés pour ne pas modifier l’historique ; aucune nouvelle opération de crédit n’est possible. Les éventuels soldes antérieurs restent inclus comme ajustement historique dans le bilan. Le dashboard caissier masque la vue hebdomadaire, le suivi de khncha, les alertes stock et le bilan mensuel. Les détails de stock, recettes, khnchas, employés et clôtures sont exclus de sa réponse API ; seules les sommes des mouvements du jour consulté sont transmises pour préserver les cartes quotidiennes. Le manager conserve le suivi complet.

L'impression actuelle utilise le dialogue du navigateur, avec deux copies sur deux pages 80 mm. Pas encore de pilote ESC/POS, file d'impression matérielle, confirmation de livraison ni reprise automatique sur panne imprimante. Il faut sélectionner Windows/Android et le modèle de l'imprimante avant cette intégration. Les boîtes de dialogue peuvent varier selon le navigateur.

Autres éléments restant à intégrer : WhatsApp/n8n, import du classeur original, exports natifs XLSX, contrats/suivi détaillé des fournisseurs, alertes distantes, automatisation des charges récurrentes et déploiement. Les exports actuels sont des fichiers CSV ouvrables dans Excel.

## Vérification

```sh
npm test
npm run typecheck
npm run build
```

Les tests couvrent la vente, le stock, la khncha, le crédit, les remboursements, les avances, la clôture, les permissions, l'isolation des cafés et le parcours d'authentification/API sans serveur réseau. La prévisualisation navigateur n'a pas pu être exécutée dans l'environnement de création car l'ouverture de ports y est interdite.

## Lisibilité

Textes plus foncés et en gras, petits libellés augmentés à 12 px, fonds crème et blanc conservés. Le doré est plus soutenu sur les boutons pour rendre le texte blanc lisible en français et en arabe.

## Suivi du barman et rendement

À l’ouverture, le manager choisit l’employé responsable de la khncha ; son nom est conservé séparément du manager ayant effectué l’ouverture. Une ancienne khncha encore ouverte et sans responsable peut être attribuée sans modifier ses ventes ni son stock. L’historique non attribué n’est pas affecté automatiquement à une personne.

La progression affiche les ventes vers le minimum de 65 et l’objectif excellent de 75 équivalents/kg. Aucun sac encore ouvert n’est classé « mauvais » : l’évaluation attend la confirmation de consommation complète.

| Rendement final | Évaluation |
| --- | --- |
| Moins de 65 éq./kg | À revoir |
| De 65 à 70 inclus | Bon |
| Plus de 70 et moins de 75 | Très bon |
| 75 ou plus | Excellent |

Le tableau des barmans calcule une moyenne pondérée (équivalents / kg réellement déclarés entièrement consommés). Les sacs ouverts, perdus, clôturés trop tôt ou non attribués n’y figurent pas. Une faible valeur signale un écart à examiner, sans conclure à un vol ou à la responsabilité certaine d’un employé. Ces vues restent réservées au manager, en arabe et en français.

## Graphique interactif des khnchas

Le dashboard manager et la page Khnchas affichent un graphique avec le résultat sélectionné juste à côté. Cliquer sur une barre ou choisir une khncha dans la liste change immédiatement son score, son barman et son évaluation. Le mode automatique suit la dernière khncha ouverte et actualise le résultat avec les nouvelles ventes. Une sélection manuelle reste sur l’historique choisi.

Le graphique montre 12 khnchas à la fois ; une ancienne khncha sélectionnée dans la liste est incluse dans ces 12. Les sacs historiques sont normalisés par leur poids initial. Les sacs ouverts utilisent une barre hachurée explicitement provisoire ; les clôtures anticipées n’ont pas de rendement final comparable.

## Confirmation des commandes POS

Le premier clic sur « Confirmer la commande » ouvre un récapitulatif des produits, quantités, total et paiement. Il ne crée aucune vente et ne déduit aucun stock. « Modifier le panier », la croix ou Échap permettent de revenir au panier inchangé. Seul « Confirmer et enregistrer » envoie la commande.

Le récapitulatif fige les éléments vérifiés. Le serveur refuse un total devenu différent après un changement de prix, et le bouton final bloque les clics répétés pendant l’envoi. La clé de requête évite toujours les doublons après une nouvelle tentative.

### Carte visuelle et boissons
- POS et « Menu visuel » : 14 photos locales pour Coca-Cola, Zero, Fanta (orange/citron/pomme), Sprite (original/citron menthe), Hawaï (tropical/ananas), Pom’s, Schweppes (tonic/citron), Ciel et Cappy Orange. Les sources des photos sont dans `public/products/sources.json`. Les autres boissons ont des illustrations distinctes.
- Photos dans le panier, la confirmation et le catalogue manager ; prix et libellés lisibles, commandes tactiles de 48 px.
- Migration sans doublons : les produits Coca-Cola et Hawaï existants conservent leurs prix, recettes et stocks. Les nouveaux produits commencent à **0 en stock** et doivent être approvisionnés dans Achats. Une vente retire une unité de son propre article.
- Prix initiaux modifiables dans Paramètres : sodas 10 DH, Ciel 7 DH, Cappy Orange 15 DH. Les nouveaux coûts d’achat restent à 0 jusqu’à leur saisie réelle. Le conditionnement photographié sert à identifier la marque ; adapter les articles aux formats réellement vendus.

### Jus frais illustrés
Orange, panaché, avocat, banane, pomme et mangue : chaque verre a sa propre couleur et un fruit reconnaissable à côté, en SVG local. Les jus frais restent toujours commandables, sans vérification ni déduction de stock et sans khncha. Le prix et la vente restent comptabilisés normalement. Les anciennes portions sont retirées du stock actif, tout en préservant les achats, mouvements et annulations historiques. Les sodas et jus en bouteille gardent leur suivi de stock.

Les achats se saisissent directement en unités de stock, sans sélecteur de conditionnement ou de paiement. Ils sont enregistrés en espèces. Pour 6 kg de café, saisir 6 khnchas de 1 kg.

### Correction des ventes (manager uniquement)
Dans Ventes ou le ticket, le manager peut modifier les produits, quantités et paiement, avec un motif obligatoire. Le ticket conserve son numéro, sa date et le caissier initial. Les lignes conservées gardent leur prix d’origine ; les produits ajoutés utilisent le prix actuel. La recette actuelle s’applique lors du recalcul de la consommation. La transaction restaure la consommation précédemment enregistrée avant de déduire la nouvelle ; une erreur annule toute la correction. Les équivalents de la khncha et les totaux sont recalculés.
« Supprimer » annule la vente sans effacer son historique, restaure sa consommation nette et retire ses montants des totaux. Les corrections et suppressions conservent qui/quand/pourquoi et les versions avant/après. Les caissiers sont refusés côté serveur. Les journées et khnchas clôturées restent verrouillées ; une révision empêche les modifications concurrentes d’écraser une correction récente.
