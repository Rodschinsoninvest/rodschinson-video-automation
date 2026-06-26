# Rodschinson Content Studio — Guide utilisateur détaillé

Plateforme interne qui transforme des briefs et des données immobilières (Odoo, documents, photos) en supports prêts à publier — **teasers, valorisations, portefeuilles, listes d'acquéreurs, posts, carrousels, vidéos** — et qui permet de les **relire, approuver, planifier, publier** et **suivre**.

---

## 1. Accès, comptes et rôles

### 1.1 Adresses
| Élément | Adresse |
|---|---|
| **Application (à utiliser)** | **https://rodschinson-content-studio.netlify.app** |
| API (backend) | https://content-studio-production-84de.up.railway.app |
| Dépôt de code | `Rodschinson/rodschinson-video-automation` (déploie depuis `main`) |

### 1.2 Connexion
- Ouvrez l'application → page **Sign in** → identifiant + mot de passe.
- Compte administrateur par défaut : `admin` (mot de passe dans votre gestionnaire de mots de passe — **changez-le** depuis Settings → Users).
- La session dure 7 jours. Bouton clair/sombre en haut à droite.

### 1.3 Rôles (hiérarchiques — chaque niveau inclut les précédents)
| Rôle | Droits |
|---|---|
| **creator** | Créer du contenu, modifier les brouillons, générer |
| **reviewer** | + commenter, passer un élément en *Approved* |
| **publisher** | + planifier (Schedule) et publier (Metricool) |
| **admin** | + gérer les utilisateurs, les marques, la configuration, voir le journal d'audit |

> Un compte par personne (jamais partagé). Donnez le rôle minimal nécessaire ; réservez `admin` à 1–2 personnes.

---

## 2. Stack technique et architecture

```
Navigateur (équipe)
   │  HTTPS
   ▼
Netlify  ── sert le site React ── et relaie /api/* ──►  Railway (backend FastAPI, Docker)
                                                              │
              ┌───────────────────────────────────────────────┼─────────────────────┐
              ▼                  ▼                     ▼                    ▼
         Claude (IA)     Chromium/Puppeteer      FFmpeg+ElevenLabs    Volume /app/output
         texte/extraction  rendu PDF/PNG          vidéo + voix         (données persistées)
              │
   Intégrations : Odoo · Metricool · Canva · Google Sheets · SMTP
```

| Couche | Technologie | Pourquoi |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind | Interface réactive, builds rapides |
| Hébergement frontend | Netlify | Gratuit, HTTPS, CDN mondial |
| Backend | FastAPI (Python 3.11) | API asynchrone, idéale IA + fichiers |
| Hébergement backend | Railway (Docker) | Embarque Chromium + FFmpeg + Node ; disque persistant |
| IA | Anthropic **Claude** | Rédaction (EN/FR/NL), extraction de documents, structuration |
| Rendu documents | **Puppeteer + Chromium** | PDF au pixel près, **éditables dans Canva** |
| Vidéo | **FFmpeg + ElevenLabs** | Montage + voix off IA |
| Persistance | Volume Railway `/app/output` | Teasers, bibliothèque, utilisateurs **conservés entre déploiements** |

Le navigateur ne parle qu'à Netlify, qui **relaie `/api/*`** vers Railway (pas de souci CORS, une seule URL). Les secrets (clés API) restent côté serveur.

---

## 3. Les pages (barre latérale)

| Page | Rôle |
|---|---|
| **New Content** | Générer un post / image / carrousel / reel / texte depuis un brief |
| **Properties** | Importer les biens Odoo et produire les documents immobiliers |
| **Library** | Tous les supports + leur statut (cycle de vie) |
| **Schedule** | Calendrier de publication hebdomadaire multi-plateformes |
| **Analytics** | Vues, engagement, leads (via Metricool) |
| **Strategy** | Aide IA à la planification éditoriale |
| **Brands** | Chartes de marque (couleurs, polices, logo, ton) |
| **Templates** | Modèles visuels réutilisables |
| **Settings** | Comptes utilisateurs, configuration |

---

## 4. Les documents immobiliers (page Properties)

D'abord **Sync from Odoo** pour importer/rafraîchir les biens. Chaque fiche propose 4 boutons + le créateur de teaser multi-actifs.

### 4.1 Teaser court — bouton **Teaser**
Teaser concis généré **depuis Odoo uniquement** (aucun fichier à fournir).
- Cochez les champs à inclure : Nom, Prix, Description, Type ; optionnels : Référence, Agent, Secteurs, Infos NDA, Statut.
- Marque + langue → Générer.
- Idéal pour un teaser **anonymisé** (décochez les champs sensibles, activez NDA).

### 4.2 Valorisation — bouton **Valuation**
Rapport PDF présentant les **méthodes de valorisation** adaptées au type d'actif :
- Immeuble/Bureau : Income Capitalization · Comparable Sales · Cost Approach · Prix/m²
- Hôtel/Resort : DCF · Income Cap · Prix par chambre · RevPAR
- Logistique/Industriel : Income Cap · Prix/m² · Replacement Cost
- Retail, Résidentiel, Terrain, Clinique, Parking… (méthodes spécifiques)

### 4.3 Liste d'acquéreurs — bouton **Buyers** 👥 *(nouveau)*
Pour un actif, génère un **PDF de marque listant les acquéreurs liés** (depuis Odoo).
1. **Properties** → **Buyers** sur la fiche d'un bien.
2. La fenêtre **prévisualise les acquéreurs** tirés d'Odoo (société · contact · étape).
3. Filtrez par **étape** (ex. *Dossier Transmis*, *Stand By*), choisissez marque + langue.
4. **Generate Shortlist PDF** → document avec, par acquéreur : **Société, Contact, Fonction, Email, Téléphone, Localité, Étape** (pastilles colorées par étape).
> Source Odoo : les lignes d'opportunité de l'actif → la fiche **client** de chaque acquéreur.

### 4.4 Teaser long — bouton **Long Teaser** (bien unique, depuis une fiche Odoo)
Dossier PDF complet, **éditable dans Canva** :
- **Photos** (galerie, redimensionnées auto), **Plans** (images ou PDF multi-pages), **Documents source** (Claude en extrait finances, surfaces, baux, fiscalité…).
- Images par rôle (couverture, contact, aérien, cadastre), adresse, conditions de paiement, **lien SharePoint**, lien Expertise, **agent de contact**, marque, langue.
- **Vue aérienne + parcelle cadastrale** récupérées automatiquement depuis l'adresse.

### 4.5 Teaser multi-actifs — bouton **＋ New Long Teaser**
Créateur autonome avec sélecteur **Single property / Multiple assets** :
- **Single** : une adresse + une galerie.
- **Multiple** : sélectionnez **un dossier contenant un sous-dossier par bâtiment**. Chaque sous-dossier = la galerie de ce bâtiment ; renseignez **nom + adresse** par bâtiment (l'adresse pilote sa localisation + son aérien).
  ```
  MonDossier/
    Bâtiment A - Avenue Louise 10/   → galerie A
    Bâtiment B - Rue Neuve 22/       → galerie B
    Bâtiment C - …/                  → (3, 4, 5… autant que voulu)
  ```
- Champs partagés : **données Odoo** (titre/prix/référence), documents (Claude répartit les finances par bâtiment), SharePoint, conditions de paiement, agent, marque, langue.
- Résultat : couverture + vue d'ensemble + **une section par bâtiment** (présentation, détails, aérien/cadastre, **galerie propre**) + finances société + contact.

> ⚠️ Ne pas confondre : **Portfolio** (bouton 📋, aperçu de plusieurs biens Odoo) vs **New Long Teaser – Multiple** (dossier détaillé par bâtiment).

---

## 5. Éditer un document — Teaser Editor
Ouvrez un teaser depuis **Library** (3 volets : pages | éditeur | aperçu PDF).
- **Bien unique** : pages Cover, Description, Détails financiers/techniques, Localisation, Aérien, Galerie, Plans, Ventes & Contact. Pour chaque page : textes, images (Remplacer/Effacer), tableaux, et une case **« inclure cette page dans le PDF »**.
  - Localisation : champ **photo Google Maps** séparé du **lien Google Maps** (le lien n'ouvre jamais l'image).
- **Multi-actifs** : la colonne affiche **Cover · Company (partagé) · un bâtiment par entrée · Sales & Contact**. Par bâtiment : sa **galerie** (ajout multiple, réordonner, supprimer), images (présentation, aérien manuel), détails et tableaux. On peut **ajouter / réordonner / supprimer des bâtiments**.
- **Save & Regenerate** régénère le PDF (aperçu à droite) ; **+ PPTX** produit aussi un PowerPoint éditable ; **⬇ Download PDF** télécharge.

---

## 6. Bibliothèque, cycle de vie et suppression
**Statuts :** `Draft → Ready → Approved → Scheduled → Published`
- Faites avancer un élément au fil de la revue (reviewer approuve, publisher planifie/publie).
- Commentaires possibles. Recherche et filtres disponibles.
- **Suppression** : supprimer un élément **efface réellement ses fichiers** (PDF, vignette, assets) — pas seulement la fiche.

---

## 7. Planifier, publier, analyser
- **Schedule** : placez les supports approuvés sur le calendrier hebdomadaire par plateforme ; la diffusion part via **Metricool**.
- **Analytics** : vues / engagement / leads remontés depuis Metricool.

---

## 8. Sécurité
- **Authentification** par jeton signé (7 jours) ; mots de passe **hachés (bcrypt)**.
- **Médias protégés** : les PDF/vidéos/images ne sont accessibles qu'avec une session valide (ou une URL signée à durée limitée pour Metricool) — plus de lien public permanent.
- **Journal d'audit** : connexions, générations, suppressions et changements d'utilisateurs sont tracés (`qui / quand / quoi`). Consultable par un admin via l'API `GET /api/audit`.
- Clés API et secrets stockés côté serveur (variables Railway).

---

## 9. Rétention automatique (nettoyage hebdomadaire)
Pour ne pas accumuler les fichiers générés :
- Un nettoyage **quotidien** supprime les **fichiers** des éléments de plus de **7 jours**, **en gardant la fiche** dans la bibliothèque.
- **Jamais** sur les éléments **Approved / Scheduled / Published** (préservés).
- Paramétrable côté serveur (`RETENTION_DAYS`).

---

## 10. Administration
- **Utilisateurs** : Settings → Users (créer, rôle, mot de passe, supprimer).
- **Marques / Modèles** : pages Brands / Templates (charte appliquée automatiquement).
- **Secrets / config** : tableau de bord Railway → service → *Variables* (Claude, Odoo, Metricool, Canva, ElevenLabs, SMTP, `APP_SECRET`, `RETENTION_DAYS`, `MEDIA_URL_TTL`…).
- **Données** : volume Railway `/app/output` (teasers, `library.json`, `users.json`, `audit.jsonl`) — persistées entre déploiements.

---

## 11. Déploiement (pour info)
- Frontend → **Netlify** (build auto), proxy `/api/*` → Railway.
- Backend → **Railway** (image Docker avec Chromium/FFmpeg), volume persistant, health check `/api/health`.
- Code de référence : branche **`main`**.

---

## 12. Bon à savoir / dépannage
| Situation | Solution |
|---|---|
| **Upload de dossier impossible** | Utilisez **Chrome / Edge / Safari** (Firefox peu fiable) |
| **Un rendu échoue** | Rouvrir l'élément → **Save & Regenerate** |
| **Portfolio « No properties found »** | Lancer **Sync from Odoo** d'abord |
| **Téléchargement « Not authenticated »** | Recharger la page (re-connexion de session) puis réessayer |
| **App injoignable** | Vérifier que le service Railway tourne (statut *healthy*) |
| **Langues** | EN / FR / NL ; chiffres **exacts** (aucun arrondi) |

---

## 13. Glossaire
- **Teaser** : document commercial d'un bien (PDF). *Court* = synthétique (Odoo) ; *Long* = dossier complet.
- **Liste d'acquéreurs** : PDF des acheteurs potentiels liés à un actif (Odoo).
- **Valorisation** : rapport des méthodes d'évaluation par classe d'actif.
- **Portefeuille / Multi-actifs** : plusieurs bâtiments, chacun avec sa section.
- **Volume** : disque persistant des données.
- **Rétention** : purge automatique des fichiers anciens.

---
*Document de référence interne — Rodschinson Content Studio.*
