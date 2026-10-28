# VELA auf Vercel betreiben

Kurzanleitung für ein eigenes Vercel-Projekt (Team „taesthetics' projects“, Hobby).
Railway ist weiter möglich (`docs/RAILWAY.md`), Vercel ist aber einfacher: kein Server,
kein Start-Befehl, die Migrationen laufen automatisch beim Build.

## 1. Projekt

- Projekt **vela**, verbunden mit GitHub `TAesthetics/vela`, Branch `main`.
- Framework-Preset: **Other**. Build, Install und Output **nicht** ändern
  (`vercel.json` und `npm run build` erledigen alles, der Build erzeugt `.vercel/output`).
- Node.js-Version: **22.x** (steht auch in `package.json` → `engines`).
- Jeder Push auf `main` wird automatisch live geschaltet.

## 2. Datenbank (Neon)

Im Projekt: **Storage → Create Database → Neon (Serverless Postgres) → Free**,
Region **Frankfurt (eu-central-1)**, mit dem Projekt **vela** verbinden (Production + Preview).
Vercel setzt dann `DATABASE_URL` automatisch. Direktlink:
<https://vercel.com/taesthetics-projects/vela/stores>

Danach einmal neu deployen: Der Build legt alle Tabellen an (`npm run db:migrate`).
Ohne `DATABASE_URL` läuft die App mit einer temporären Datenbank, die bei jedem
Kaltstart leer ist, also nur zum Testen.

## 3. Umgebungsvariablen (Production + Preview)

| Variable | Wert |
|---|---|
| `DATABASE_URL` | kommt von Neon (Schritt 2) |
| `BETTER_AUTH_SECRET` | zufällig, mind. 32 Zeichen (`openssl rand -hex 32`). Nie ändern |
| `BETTER_AUTH_URL` | Produktions-Adresse ohne `/` am Ende, z. B. `https://vela-xxxx.vercel.app` |
| `VELA_SELF_HOSTED` | `1` (eigenes Google/X-Login statt des Grok-Anmeldedienstes) |
| `VITE_AUTH_PROVIDERS` | `google` (oder `google,x`, wenn X eingerichtet ist) |
| `ADMIN_EMAILS` | deine Google-E-Mail(s), durch Komma getrennt |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | aus Schritt 4 |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | optional |

Nicht setzen: `NITRO_PRESET` (nur für Railway).
Nach jeder Änderung: **Deployments → … → Redeploy**.

## 4. Google-Login

1. <https://console.cloud.google.com/apis/credentials> → **Create Credentials → OAuth client ID**
   (vorher ggf. „OAuth consent screen“ ausfüllen: App-Name VELA, deine E-Mail, Status „In production“).
2. Typ **Web application**.
3. Authorized redirect URI:
   `https://<deine-domain>/api/auth/oauth2/callback/grok-google`
4. Client-ID und Secret als `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` eintragen, neu deployen.

X (optional): Redirect-URI `https://<deine-domain>/api/auth/oauth2/callback/grok-x`.

## 5. Prüfen

- `https://<deine-domain>/healthz` → `ok` (Datenbank erreichbar).
- Startseite öffnen, „Weiter mit Google“, Profil anlegen.
- `/admin` mit der Adresse aus `ADMIN_EMAILS`.

## Hinweise

- Hosting Vercel + Datenbank Neon steht so in `/datenschutz` (Punkt 9).
- Für die Handy-App (`docs/STORE.md`) ist `VELA_APP_URL` die gleiche Adresse wie `BETTER_AUTH_URL`.
