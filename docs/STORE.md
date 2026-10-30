# VELA im App Store und bei Google Play

Diese Anleitung bringt VELA als iOS- und Android-App in die Stores. Stand: Oktober 2026. Preise und Regeln der Stores ändern sich gelegentlich; im Zweifel gilt, was Apple bzw. Google gerade anzeigen.

## 1. Wie die App gebaut ist

- **Capacitor 8** (iOS + Android). App-ID / Bundle-ID: **`at.vela.app`**, App-Name: **VELA**.
- VELA braucht seinen Server (Anmeldung, Datenbank, Serverfunktionen). Die Store-App ist deshalb eine native Hülle, die die **veröffentlichte Web-App von `VELA_APP_URL` lädt**. Jede Änderung, die du auf `main` veröffentlichst, ist sofort auch in den Apps. Ein neuer Store-Upload ist nur bei nativen Änderungen nötig (Icon, Plugins, Berechtigungen).
- **Anmeldung:** Google und X blockieren die Anmeldung in eingebetteten Webviews. In der App öffnet sich deshalb der **System-Browser** (`/auth/native`). Danach kommt die Sitzung über den Deep Link **`vela://auth`** in die App zurück. Der Weg ist doppelt abgesichert: Die App schickt nur den Hash eines geheimen Prüfwerts mit, der Rückweg trägt einen Einmal-Code, und beides ist nur 5 Minuten gültig. Auf der Website ändert sich nichts.
- **Native Extras (gegen Apple-Regel 4.2):**
  - Splash-Screen und dunkle Statusleiste;
  - Haptik beim Match;
  - Android-Zurück-Taste;
  - eigener Offline-Bildschirm (`native/www/offline.html`) mit „Erneut versuchen“.
- **Push-Benachrichtigungen** sind vorbereitet (`src/lib/native.ts`), aber nicht aktiv; siehe Abschnitt 6.
- **Icons und Splash** werden per Code aus `resources/*.svg` erzeugt (`scripts/native-assets.mjs`). Das Logo ist der VELA-Schriftzug in Fraunces mit dem orangen Funken. `scripts/native-brand-svg.py` baut die SVGs neu, falls sich die Marke ändert.
- Die Ordner `ios/` und `android/` sind **nicht im Repo**. Sie entstehen reproduzierbar mit einem Befehl (siehe unten). Wenn du sie lieber versionierst, lösch die zwei Zeilen in `.gitignore`.

### Test-APK ohne eigenen Rechner (GitHub Actions)

Bei jedem Push auf `main` baut `.github/workflows/ci.yml` eine installierbare Android-Test-App (debug-signiert, lädt `https://vela-sable-six.vercel.app`). Download: GitHub → Actions → neuester „CI“-Lauf → Artifacts → `vela-android-debug` (ZIP mit der APK, 14 Tage verfügbar). Für Google Play braucht es später ein signiertes Release-Bundle (`.aab`) mit eigenem Upload-Schlüssel.

### Einmal einrichten

1. **Produktions-URL:** die öffentliche Adresse von VELA, z. B. `https://vela-xxxx.vercel.app` (siehe `docs/VERCEL.md`) oder deine eigene Domain. Sie muss mit `https://` beginnen, darf keinen Pfad haben und muss **dieselbe** sein wie `BETTER_AUTH_URL`.
2. Node 22 oder neuer, dann:
   ```bash
   npm ci
   VELA_APP_URL=https://vela-xxxx.vercel.app npm run native:setup
   ```
   Das legt `ios/` und `android/` an, erzeugt Icons und Splash-Screens, trägt den Deep Link `vela://auth` ein, setzt die Texte für Kamera und Fotos sowie „nur Hochformat“ (iPhone) und synchronisiert alles. Du kannst den Befehl beliebig oft wiederholen.
3. Öffnen: `npm run native:ios` (Xcode, nur auf dem Mac) bzw. `npm run native:android` (Android Studio).

Für die Anmeldung musst du nichts extra einrichten: Die App nutzt dieselbe Google/X-Rückleitung wie die Website (`/api/auth/oauth2/callback/grok-google` bzw. `grok-x`, siehe `docs/VERCEL.md`, Schritt 4). Wichtig ist nur, dass `BETTER_AUTH_URL` im Hosting dieselbe Domain ist wie `VELA_APP_URL`.

## 2. Vor der Einreichung: offene Punkte

1. **„Mit Apple anmelden“ (Apple-Regel 4.8)** ist derzeit **nicht nötig**: VELA nutzt nur E-Mail und Passwort, keine Google- oder X-Anmeldung. Kommt später ein Social-Login dazu, muss auch „Sign in with Apple“ rein.
2. **Inhalte von Nutzerinnen und Nutzern (Apple 1.2).**
   - VELA hat bereits: Melden, Blockieren, Prüfung durch den Betreiber und eine Kontaktadresse im Impressum.
   - Apple verlangt zusätzlich „eine Methode, anstößige Inhalte zu filtern“. Ein einfacher Wortfilter für Profiltexte und Nachrichten senkt das Risiko.
   - Im Review-Hinweis beschreiben, wie schnell Meldungen bearbeitet werden (Apple erwartet: innerhalb von 24 Stunden).
3. **Vela+ bleibt aus.** Vela+ ist nur in der Vorschau sichtbar. Bezahlfunktionen in der App müssten über Apple- bzw. Google-In-App-Käufe laufen.
4. **Demo-Konto für die Prüfung.** Leg ein eigenes Google-Konto nur für das Review an, ohne 2-Faktor-Abfrage, mit fertigem VELA-Profil. Zugangsdaten in die Review-Hinweise. Am besten gibt es auch ein zweites Testprofil, damit die Prüfer ein Match und den Schleier sehen.
5. **Konto löschen** ist in der App vorhanden: Ich → „Konto löschen“. Das ist für Apple (5.1.1(v)) und Google Pflicht. Für Google zusätzlich eine Web-Adresse angeben: `https://<deine-domain>/datenschutz` (Punkt 10 erklärt die Löschung, dazu die E-Mail-Adresse).

## 3. Apple App Store

### Konto
- **Apple Developer Program:** 99 US-Dollar pro Jahr, developer.apple.com/programs.
- Du musst volljährig sein (18+). Bist du jünger, braucht es das Konto eines Elternteils. Dann steht dessen Name als Anbieter im Store.
- Apple-ID mit Zwei-Faktor-Authentifizierung. Als Privatperson brauchst du keine D-U-N-S-Nummer.
- **EU-Händlerstatus (DSA):** App Store Connect fragt, ob du „Trader“ bist.
  - Ohne Gewerbe und ohne Einnahmen meist: **kein Trader**.
  - Wer Trader angibt, muss Adresse, Telefon und E-Mail öffentlich zeigen.

### Bauen
- **Variante A, mit Mac:**
  1. Xcode (aktuelle Version aus dem App Store) installieren.
  2. `npm run native:setup` ausführen.
  3. `npm run native:ios` öffnen und unter „Signing & Capabilities“ dein Team wählen.
  4. Product → Archive → Distribute App → App Store Connect.
- **Variante B, ohne Mac: Codemagic** (codemagic.io, kostenloses Kontingent an macOS-Minuten):
  1. GitHub-Repo `TAesthetics/vela` verbinden.
  2. In App Store Connect unter Benutzer und Zugriff → Integrationen einen **API-Schlüssel** anlegen und bei Codemagic hinterlegen. Codemagic signiert damit automatisch.
  3. Umgebungsvariable `VELA_APP_URL` setzen.
  4. Beispiel `codemagic.yaml` (im Repo-Root anlegen, ungetestet):
     ```yaml
     workflows:
       ios-release:
         name: VELA iOS
         max_build_duration: 60
         instance_type: mac_mini_m2
         integrations:
           app_store_connect: <Name deines API-Schlüssels in Codemagic>
         environment:
           node: 22
           vars:
             VELA_APP_URL: https://vela-xxxx.vercel.app
           ios_signing:
             distribution_type: app_store
             bundle_identifier: at.vela.app
         scripts:
           - npm ci
           - npm run native:setup
           - xcode-project use-profiles
           - name: Build-Nummer
             script: cd ios/App && agvtool new-version -all $(($BUILD_NUMBER + 1))
           - xcode-project build-ipa --project ios/App/App.xcodeproj --scheme App
         artifacts:
           - build/ios/ipa/*.ipa
         publishing:
           app_store_connect:
             auth: integration
             submit_to_testflight: true
     ```
  5. Build starten. Die App landet in TestFlight.

### App Store Connect
1. **Meine Apps → „+“ → Neue App:** Plattform iOS, Name „VELA – Erst kennenlernen“, Primärsprache Deutsch, Bundle-ID `at.vela.app`, SKU z. B. `vela-ios`.
2. **App-Informationen:**
   - Kategorie: **Soziale Netze** (zweite: Lifestyle);
   - Datenschutz-URL: `https://<deine-domain>/datenschutz`;
   - Support-URL: `https://<deine-domain>/impressum`.
3. **Altersfreigabe:** Fragebogen ehrlich ausfüllen (Dating, Inhalte von Nutzern, unbeschränkter Austausch). Ergebnis bzw. Wahl: **18+**; im alten System hieß das 17+. VELA ist nur für Erwachsene.
4. **Datenschutz-Angaben („Privacy Nutrition Labels“)**, passend zu VELA:

   | Apple-Kategorie | Was VELA speichert | Verknüpft mit Person | Tracking | Zweck |
   |---|---|---|---|---|
   | Kontaktinformationen → Name | Name aus Google/X, Vorname im Profil | ja | nein | App-Funktionalität |
   | Kontaktinformationen → E-Mail-Adresse | E-Mail aus Google/X (Login, Admin-Zugang) | ja | nein | App-Funktionalität |
   | Nutzerinhalte → Fotos oder Videos | optionales Porträt; Ausweisfoto nur bei Alterssperre, höchstens 30 Tage | ja | nein | App-Funktionalität |
   | Nutzerinhalte → E-Mails oder Textnachrichten | Chatnachrichten zwischen Matches | ja | nein | App-Funktionalität |
   | Nutzerinhalte → Andere Nutzerinhalte | Profilsätze, Stadt, Alter, Orbit, Werte, Meldungen | ja | nein | App-Funktionalität |
   | Kennungen → Nutzer-ID | interne Konto-ID | ja | nein | App-Funktionalität |
   | Nutzungsdaten → Produktinteraktion | Swipes, Matches, Blockierungen | ja | nein | App-Funktionalität |

   - **Tracking: Nein.** Keine Werbung, keine Analyse-Tools, keine KI.
   - Sitzungen speichern IP-Adresse und Browser-Kennung nur zur Sicherheit der Anmeldung. Gib das unter „Andere Diagnosedaten“ an, wenn du ganz vorsichtig sein willst.
5. **Preis:** kostenlos. **Verfügbarkeit:** z. B. Österreich, Deutschland, Schweiz.
6. **Version:**
   - Screenshots für iPhone 6,9" (1320×2868): mindestens 3, ideal sind Schleier, Chat und Profil. Die App ist nur fürs iPhone eingestellt, also keine iPad-Screenshots nötig.
   - Beschreibung, Untertitel und Keywords aus Abschnitt 5.
7. **App-Review-Informationen:**
   - Demo-Zugang (Google-Konto, siehe Abschnitt 2), Kontakt-E-Mail.
   - Hinweis-Text, z. B.: „Anmeldung über ‚Weiter mit Google‘ mit dem Demo-Konto. Fotos sind verschleiert, bis beide 3 Nachrichten geschrieben haben. Melden/Blockieren im Chat-Menü, Konto löschen unter Ich. Meldungen prüft der Betreiber innerhalb von 24 Stunden.“
8. **Exportkonformität:** Die App nutzt nur Standard-Verschlüsselung (HTTPS). Das ist im Info.plist bereits als `ITSAppUsesNonExemptEncryption = NO` gesetzt.
9. Build auswählen → **Zur Prüfung einreichen**.

## 4. Google Play

### Konto
- **Google Play Console:** einmalig 25 US-Dollar, play.google.com/console.
- Identitätsprüfung mit Ausweis. Volljährigkeit nötig, sonst Konto eines Elternteils.
- **Neue private Konten:** Vor der Veröffentlichung braucht es einen **geschlossenen Test mit mindestens 12 Testerinnen und Testern, die 14 Tage am Stück** dabei sind. Erst danach lässt sich „Zugriff auf Produktion“ beantragen. Am besten früh starten (Freunde, Familie, als Google-Gruppe oder E-Mail-Liste).

### Bauen
1. Android Studio und JDK 21 installieren.
2. `npm run native:setup` ausführen, dann `npm run native:android` öffnen.
3. Build → Generate Signed App Bundle → **Android App Bundle (.aab)**.
4. Einen neuen Upload-Schlüssel anlegen und **sicher aufbewahren**. Play App Signing übernimmt den eigentlichen App-Schlüssel.
5. Codemagic kann Android ebenfalls bauen (Workflow mit `./gradlew bundleRelease` im Ordner `android`).

### Play Console
1. **App erstellen:** Name „VELA – Erst kennenlernen“, Standardsprache Deutsch, App (nicht Spiel), kostenlos.
2. **App-Inhalte:**
   - **Datenschutzerklärung:** `https://<deine-domain>/datenschutz`.
   - **App-Zugriff:** „Einige Funktionen sind eingeschränkt“ → Demo-Google-Konto mit Anleitung.
   - **Werbung:** enthält keine Werbung.
   - **Einstufung des Inhalts (IARC-Fragebogen):** Kategorie „Soziale Netzwerke / Kommunikation“. Angeben: Nutzer können interagieren und Inhalte (Text, Fotos) teilen; keine Gewalt, kein Glücksspiel.
   - **Zielgruppe:** nur **18 Jahre und älter**. Nicht für Kinder; die App spricht keine Kinder an.
   - **Dating:** Bei der App-Kategorie bzw. Richtlinienerklärung angeben, dass es eine Dating-App ist.
   - **Datensicherheit (Data safety):**

     | Datentyp (Google) | Erfasst | Geteilt | Zweck | Optional |
     |---|---|---|---|---|
     | Persönliche Infos → Name | ja | nein | App-Funktionen, Kontoverwaltung | nein |
     | Persönliche Infos → E-Mail-Adresse | ja | nein | Kontoverwaltung | nein |
     | Persönliche Infos → Nutzer-IDs | ja | nein | Kontoverwaltung | nein |
     | Persönliche Infos → Sonstiges (Alter, Stadt) | ja | nein | App-Funktionen | nein |
     | Fotos → Fotos (Porträt; Ausweis nur bei Sperre, max. 30 Tage) | ja | nein | App-Funktionen, Betrugsprävention/Sicherheit | ja |
     | Nachrichten → Andere In-App-Nachrichten | ja | nein | App-Funktionen | nein |
     | App-Aktivitäten → Sonstige nutzergenerierte Inhalte (Profilsätze, Meldungen) | ja | nein | App-Funktionen, Sicherheit | nein |
     | App-Aktivitäten → In-App-Interaktionen (Swipes, Matches, Blockierungen) | ja | nein | App-Funktionen | nein |

     - Daten werden bei der Übertragung **verschlüsselt** (HTTPS): ja.
     - **Löschung möglich:** ja, in der App (Ich → „Konto löschen“) und per Web-Link bzw. E-Mail.
     - Hosting (Vercel) und Datenbank (Neon) sind Auftragsverarbeiter. Das gilt laut Google nicht als „Teilen“.
3. **Store-Eintrag:** Texte aus Abschnitt 5, App-Symbol 512×512 und Vorstellungsgrafik 1024×500. Beide erzeugt `npm run native:assets` im Ordner `store-assets/`. Dazu mindestens 2 Handy-Screenshots.
4. **Test → Geschlossener Test:** AAB hochladen, Tester einladen und 14 Tage laufen lassen, dann Produktion beantragen.

## 5. Store-Texte

### Deutsch
- **Name (≤ 30):** VELA – Erst kennenlernen
- **Untertitel, Apple (≤ 30):** Dating ohne Foto-Urteil
- **Kurzbeschreibung, Google (≤ 80):** Erst kennenlernen, dann sehen: Fotos zeigen sich erst nach echten Nachrichten.
- **Keywords, Apple (≤ 100, ohne Wörter aus Name/Untertitel):** partnersuche,singles,beziehung,chat,match,flirt,slow dating,open source,ohne ki,datenschutz
- **Beschreibung:**

  Erst kennenlernen, dann sehen.

  VELA ist eine Dating-App gegen oberflächliches Swipen. Profilfotos liegen hinter einem Schleier. Er hebt sich erst, wenn ihr beide ein paar echte Nachrichten geschrieben habt. Zuerst zählt, was jemand sagt: zwei Sätze, drei Werte, eine Richtung.

  DER SCHLEIER
  Kein Urteil nach einem einzigen Foto. Ihr schreibt euch, und erst nach drei Nachrichten von beiden Seiten zeigt sich das Gesicht.

  SÄTZE STATT SCORES
  Dein Profil besteht aus deinem Vornamen, deiner Stadt, deinem „Orbit“ (langsam, Abenteuer, Tiefgang, leicht oder echt) und zwei Antworten in deinen eigenen Worten.

  OHNE KI
  Keine Algorithmen, die dich bewerten, keine KI, die mitliest. Menschen lesen Sätze.

  OPEN SOURCE
  Der gesamte Code ist offen (MIT-Lizenz). Jede und jeder kann nachprüfen, wie VELA funktioniert und mit Daten umgeht.

  SICHERHEIT
  • Nur ab 18
  • Melden und Blockieren in jedem Chat
  • Meldungen prüft ein Mensch
  • Konto jederzeit vollständig löschen, direkt in der App

  DATENSCHUTZ ZUERST
  Keine Werbung, kein Tracking, keine Analyse-Tools. Betrieben aus Salzburg, Österreich.

### English
- **Name (≤ 30):** VELA – Words before faces
- **Subtitle, Apple (≤ 30):** Dating without photo judging
- **Short description, Google (≤ 80):** Get to know them first: photos reveal only after a few real messages.
- **Keywords, Apple (≤ 100):** singles,relationship,match,chat,meet,slow dating,open source,no ai,privacy,partner
- **Description:**

  Get to know them first, then see them.

  VELA is a dating app against shallow swiping. Profile photos stay behind a veil. It only lifts once you have both written a few real messages. What someone says comes first: two sentences, three values, one direction.

  THE VEIL
  No judgement based on a single photo. You write to each other, and only after three messages from both sides does the face appear.

  SENTENCES, NOT SCORES
  Your profile is your first name, your city, your "orbit" (slow, adventure, depth, light or real) and two answers in your own words.

  NO AI
  No algorithms rating you, no AI reading along. People read sentences.

  OPEN SOURCE
  All of the code is open (MIT license). Anyone can check how VELA works and how it handles data.

  SAFETY
  • 18+ only
  • Report and block in every chat
  • Reports are reviewed by a human
  • Delete your account completely at any time, right in the app

  PRIVACY FIRST
  No ads, no tracking, no analytics. Run from Salzburg, Austria.

Hinweis: Die App ist derzeit auf Deutsch. Den englischen Eintrag nur aktivieren, wenn du englischsprachige Länder freischaltest, und dort klar sagen, dass die App deutschsprachig ist.

## 6. Später: Push-Benachrichtigungen

Push ist vorbereitet, aber aus (`pushNotificationsEnabled` in `src/lib/native.ts`). So schaltest du es ein:
1. `npm i @capacitor/push-notifications`.
2. Android: Firebase-Projekt anlegen und `google-services.json` nach `android/app/` legen.
3. iOS: Capability „Push Notifications“ aktivieren und einen APNs-Schlüssel anlegen.
4. Serverseitig Gerätetokens speichern und bei neuen Matches oder Nachrichten senden.
5. Danach müssen die Datenschutzerklärung und die Store-Datenschutzangaben ergänzt werden.

## 7. Checkliste

- [ ] Produktions-URL festgelegt, `BETTER_AUTH_URL` zeigt darauf
- [ ] `npm run native:setup` mit `VELA_APP_URL` ausgeführt
- [ ] „Mit Apple anmelden“ ergänzt (sonst Ablehnung nach 4.8 wahrscheinlich)
- [ ] Wortfilter für anstößige Inhalte (Apple 1.2), Meldungen innerhalb von 24 h
- [ ] Demo-Google-Konto mit Profil (plus zweites Testprofil)
- [ ] Datenschutz- und Impressum-URL erreichbar
- [ ] Apple: Altersfreigabe 18+, Datenschutz-Labels, Screenshots, Review-Hinweise
- [ ] Google: geschlossener Test 12 Tester / 14 Tage, Data safety, IARC, Zielgruppe 18+
