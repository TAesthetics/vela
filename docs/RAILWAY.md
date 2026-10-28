# VELA auf Railway betreiben

VELA läuft auf Railway als normaler Node-Server mit eigener Postgres-Datenbank. Das Repo erkennt Railway automatisch (Variable `RAILWAY_ENVIRONMENT_NAME`):

- **Build:** `npm run build` erzeugt einen Node-Server (`.output/`) statt des Vercel-Formats.
- **Start:** `npm start` (`scripts/start.mjs`):
  1. prüft die Variablen;
  2. spielt die Datenbank-Migrationen ein;
  3. startet den Server auf `0.0.0.0:$PORT`.
- **Healthcheck:** `/healthz` antwortet mit 200, sobald die Datenbank erreichbar ist.
- **Fehlt etwas,** stürzt die App nicht ab. Sie zeigt eine Seite „VELA ist noch nicht fertig eingerichtet“ (HTTP 503), und das Deploy-Log nennt genau die fehlenden Variablen.

> **Anmeldung:** Der Grok-Anmeldedienst (auth.grok.me) funktioniert nur für Apps, die auf der Grok-Plattform laufen. Auf Railway meldet sich VELA deshalb **direkt bei Google** (und optional bei X) an, mit deinen eigenen OAuth-Zugangsdaten (siehe Schritt 4).

## 1. Datenbank hinzufügen

1. Im Railway-Projekt: **+ Create → Database → Add PostgreSQL**.
2. Warten, bis der Dienst „Postgres“ läuft.

## 2. Domain erzeugen

1. Den VELA-Dienst öffnen → **Settings → Networking → Generate Domain**.
2. Port: das, was Railway vorschlägt; die App nutzt automatisch `$PORT`.
3. Du bekommst eine Adresse wie `https://vela-production-xxxx.up.railway.app`. Diese Adresse brauchst du in Schritt 4. Railway stellt sie der App automatisch als `RAILWAY_PUBLIC_DOMAIN` bereit.
4. Eigene Domain später unter derselben Stelle (**Custom Domain**). Dann `BETTER_AUTH_URL` auf diese Domain setzen und die Google-Weiterleitung anpassen.

## 3. Einstellungen des Dienstes

Unter **Settings → Deploy**:

| Einstellung | Wert |
|---|---|
| Build Command | leer lassen (Standard `npm run build`) |
| Start Command | leer lassen (Standard `npm start`) |
| Healthcheck Path | `/healthz` |
| Restart Policy | On Failure |

Node 22 oder neuer wird über `engines` in `package.json` gewählt.

Hinweis: Railway liest `railway.json` bei neuen Diensten nicht mehr (Config as Code ist abgekündigt). Deshalb gibt es keine solche Datei; die Standardbefehle reichen.

## 4. Google-Anmeldung einrichten (Pflicht)

1. console.cloud.google.com → Projekt anlegen → **APIs & Dienste → OAuth-Zustimmungsbildschirm**:
   - Typ „Extern“;
   - App-Name VELA, Support-E-Mail;
   - Datenschutz-URL `https://<deine-domain>/datenschutz`;
   - Bereiche `openid`, `email`, `profile`.
   - **Veröffentlichen** (sonst können sich nur eingetragene Testnutzer anmelden).
2. **Anmeldedaten → Anmeldedaten erstellen → OAuth-Client-ID**:
   - Typ „Webanwendung“;
   - Autorisierte JavaScript-Quellen: `https://<deine-domain>`;
   - **Autorisierte Weiterleitungs-URI:** `https://<deine-domain>/api/auth/oauth2/callback/grok-google`
3. Client-ID und Clientschlüssel kopieren (Schritt 5).

**X (optional):**
1. developer.x.com → Projekt/App anlegen → **User authentication settings**: OAuth 2.0, Typ „Web App“ (vertraulicher Client).
2. Callback URI `https://<deine-domain>/api/auth/oauth2/callback/grok-x`, Website-URL `https://<deine-domain>`.
3. Client ID und Client Secret kopieren.

Wer nur Google einrichtet, setzt zusätzlich `VITE_AUTH_PROVIDERS=google`. Dann zeigt die App nur den Google-Button.

## 5. Variablen (VELA-Dienst → Variables)

| Variable | Pflicht | Wert |
|---|---|---|
| `DATABASE_URL` | ja | `${{Postgres.DATABASE_URL}}` (genau so eintragen; Railway setzt die Verbindung zur Datenbank ein) |
| `BETTER_AUTH_SECRET` | ja | zufällige Zeichenkette, mind. 32 Zeichen, z. B. mit `openssl rand -hex 32`. Nie ändern, sonst sind alle abgemeldet |
| `BETTER_AUTH_URL` | ja, außer du nutzt nur die Railway-Domain | öffentliche Adresse ohne `/` am Ende, z. B. `https://vela-production-xxxx.up.railway.app` oder deine eigene Domain. Fehlt sie, nimmt die App `https://${RAILWAY_PUBLIC_DOMAIN}` |
| `GOOGLE_CLIENT_ID` | ja (oder X) | Client-ID aus Schritt 4 |
| `GOOGLE_CLIENT_SECRET` | ja (oder X) | Clientschlüssel aus Schritt 4 |
| `X_CLIENT_ID` | optional | X Client ID |
| `X_CLIENT_SECRET` | optional | X Client Secret |
| `VITE_AUTH_PROVIDERS` | optional | `google` (nur Google-Button) oder `google,x`. Wird beim Build gelesen, also nach Änderung neu deployen |
| `ADMIN_EMAILS` | empfohlen | deine Google-E-Mail-Adresse(n), durch Komma getrennt. Schaltet `/admin` (Meldungen, Altersprüfung) frei |
| `NITRO_PRESET` | nur bei Problemen | `node-server`, falls der Build doch im Vercel-Format landet (das Log sagt es dann) |

Nicht nötig auf Railway: `GROK_AUTH_*`, `GROK_PROJECT_ID`, `XAI_API_KEY`, `AGE_CHECK_*`.

Danach **Deploy** auslösen (passiert bei Variablen-Änderungen automatisch).

## 6. Prüfen

1. Deploy-Log zeigt `[migrate] … applied …` und `[vela] starte auf 0.0.0.0:…`.
2. `https://<deine-domain>/healthz` zeigt `ok`.
3. Startseite öffnen → „Weiter mit Google“ → zurück in VELA, Profil anlegen.
4. `/admin/age` mit der Adresse aus `ADMIN_EMAILS` öffnen.

## Fehlerbilder

| Log / Anzeige | Ursache | Lösung |
|---|---|---|
| `VELA kann nicht starten … DATABASE_URL fehlt` | keine Datenbank verbunden | Schritt 1 und `DATABASE_URL=${{Postgres.DATABASE_URL}}` |
| `Datenbank-Migration fehlgeschlagen` | Postgres läuft nicht oder falsche URL | Postgres-Dienst prüfen, Variable genau so wie oben |
| Google: „redirect_uri_mismatch“ | Weiterleitungs-URI passt nicht zur Domain | URI aus Schritt 4 exakt mit deiner Domain eintragen, `BETTER_AUTH_URL` prüfen |
| `Build hat das Vercel-Format erzeugt` | Railway-Erkennung beim Build fehlgeschlagen | `NITRO_PRESET=node-server` setzen, neu deployen |
| Nach Login wieder Startseite | `BETTER_AUTH_URL` zeigt auf eine andere Domain als die, die du öffnest | gleiche Domain verwenden |

## Hinweise

- Die Grok-Vorschau und das Grok-Deployment funktionieren unverändert weiter. Die Railway-Erkennung greift nur, wenn Railway-Variablen vorhanden sind.
- Bilder (Porträts, Ausweise) liegen in der Datenbank; ein Volume braucht es nicht.
- Datenschutzerklärung: Dort steht Vercel/Neon als Hosting. Beim Umzug auf Railway muss Punkt 9 angepasst werden: Railway Corp. (USA) als Hoster und Datenbank, EU-Region wählbar.
