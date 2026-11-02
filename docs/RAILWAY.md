# VELA auf Railway betreiben

VELA läuft auf Railway als normaler Node-Server mit eigener Postgres-Datenbank. Das Repo erkennt Railway automatisch (Variable `RAILWAY_ENVIRONMENT_NAME`):

- **Build:** `npm run build` erzeugt einen Node-Server (`.output/`) statt des Vercel-Formats.
- **Start:** `npm start` (`scripts/start.mjs`):
  1. prüft die Variablen;
  2. spielt die Datenbank-Migrationen ein;
  3. startet den Server auf `0.0.0.0:$PORT`.
- **Healthcheck:** `/healthz` antwortet mit 200, sobald die Datenbank erreichbar ist.
- **Fehlt etwas,** stürzt die App nicht ab. Sie zeigt eine Seite „VELA ist noch nicht fertig eingerichtet“ (HTTP 503), und das Deploy-Log nennt genau die fehlenden Variablen.

> **Anmeldung:** Der Grok-Anmeldedienst (auth.grok.me) funktioniert nur für Apps, die auf der Grok-Plattform laufen. Auf Railway meldet man sich deshalb wie auf Vercel mit **E-Mail + Passwort** an (Better Auth, eigene Datenbank). Google, X oder andere OAuth-Zugangsdaten braucht es nicht.

## 1. Datenbank hinzufügen

1. Im Railway-Projekt: **+ Create → Database → Add PostgreSQL**.
2. Warten, bis der Dienst „Postgres“ läuft.

## 2. Domain erzeugen

1. Den VELA-Dienst öffnen → **Settings → Networking → Generate Domain**.
2. Port: das, was Railway vorschlägt; die App nutzt automatisch `$PORT`.
3. Du bekommst eine Adresse wie `https://vela-production-xxxx.up.railway.app`. Diese Adresse brauchst du für `BETTER_AUTH_URL` (Schritt 4). Railway stellt sie der App automatisch als `RAILWAY_PUBLIC_DOMAIN` bereit.
4. Eigene Domain später unter derselben Stelle (**Custom Domain**). Dann `BETTER_AUTH_URL` auf diese Domain setzen.

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

## 4. Variablen (VELA-Dienst → Variables)

| Variable | Pflicht | Wert |
|---|---|---|
| `DATABASE_URL` | ja | `${{Postgres.DATABASE_URL}}` (genau so eintragen; Railway setzt die Verbindung zur Datenbank ein) |
| `BETTER_AUTH_SECRET` | ja | zufällige Zeichenkette, mind. 32 Zeichen, z. B. mit `openssl rand -hex 32`. Nie ändern, sonst sind alle abgemeldet |
| `BETTER_AUTH_URL` | ja, außer du nutzt nur die Railway-Domain | öffentliche Adresse ohne `/` am Ende, z. B. `https://vela-production-xxxx.up.railway.app` oder deine eigene Domain. Fehlt sie, nimmt die App `https://${RAILWAY_PUBLIC_DOMAIN}` |
| `ADMIN_EMAILS` | empfohlen | deine E-Mail-Adresse(n), durch Komma getrennt. Schaltet `/admin` (Meldungen, Altersprüfung) frei |
| `NITRO_PRESET` | nur bei Problemen | `node-server`, falls der Build doch im Vercel-Format landet (das Log sagt es dann) |

Nicht nötig auf Railway: `GROK_AUTH_*`, `GROK_PROJECT_ID`, `XAI_API_KEY`, `AGE_CHECK_*`, `GOOGLE_*`, `X_*`, `VITE_AUTH_PROVIDERS`. Stripe-Variablen wie in `docs/VERCEL.md`.

**Wichtig:** Registriere dich nach dem ersten Deploy sofort selbst mit der Adresse aus `ADMIN_EMAILS`. E-Mails werden nicht bestätigt, also bekommt Admin-Rechte, wer die Adresse zuerst registriert.

Danach **Deploy** auslösen (passiert bei Variablen-Änderungen automatisch).

## 5. Prüfen

1. Deploy-Log zeigt `[migrate] … applied …` und `[vela] starte auf 0.0.0.0:…`.
2. `https://<deine-domain>/healthz` zeigt `ok`.
3. Startseite öffnen → „Registrieren“ mit E-Mail + Passwort → Profil anlegen.
4. `/admin/age` mit der Adresse aus `ADMIN_EMAILS` öffnen.

## Fehlerbilder

| Log / Anzeige | Ursache | Lösung |
|---|---|---|
| `VELA kann nicht starten … DATABASE_URL fehlt` | keine Datenbank verbunden | Schritt 1 und `DATABASE_URL=${{Postgres.DATABASE_URL}}` |
| `Datenbank-Migration fehlgeschlagen` | Postgres läuft nicht oder falsche URL | Postgres-Dienst prüfen, Variable genau so wie oben |
| `Build hat das Vercel-Format erzeugt` | Railway-Erkennung beim Build fehlgeschlagen | `NITRO_PRESET=node-server` setzen, neu deployen |
| Nach Login wieder Startseite | `BETTER_AUTH_URL` zeigt auf eine andere Domain als die, die du öffnest | gleiche Domain verwenden |

## Hinweise

- Die Grok-Vorschau und das Grok-Deployment funktionieren unverändert weiter. Die Railway-Erkennung greift nur, wenn Railway-Variablen vorhanden sind.
- Bilder (Porträts, Ausweise) liegen in der Datenbank; ein Volume braucht es nicht.
- Datenschutzerklärung: Dort steht Vercel/Neon als Hosting. Beim Umzug auf Railway muss Punkt 9 angepasst werden: Railway Corp. (USA) als Hoster und Datenbank, EU-Region wählbar.
