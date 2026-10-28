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
| `VELA_SELF_HOSTED` | `1` (Anmeldung mit E-Mail + Passwort statt des Grok-Anmeldedienstes) |
| `ADMIN_EMAILS` | deine E-Mail(s), durch Komma getrennt |

`VITE_AUTH_PROVIDERS`, `GOOGLE_*` und `X_*` werden nicht mehr gebraucht (schaden aber nicht).

Nicht setzen: `NITRO_PRESET` (nur für Railway).
Nach jeder Änderung: **Deployments → … → Redeploy**.

## 4. Anmeldung

E-Mail + Passwort (Better Auth, Passwort mind. 8 Zeichen, nur als Hash gespeichert).
Kein Google, kein X, kein Mail-Dienst: keine Bestätigungs- und keine Reset-Mails.
Passwort vergessen → Mail an den Betreiber.

**Wichtig:** Registriere dich nach dem ersten Deploy sofort selbst mit der Adresse aus
`ADMIN_EMAILS`. E-Mails werden nicht bestätigt, also bekommt Admin-Rechte, wer die
Adresse zuerst registriert.

## 5. Prüfen

- `https://<deine-domain>/healthz` → `ok` (Datenbank erreichbar).
- Startseite öffnen, „Registrieren“, Profil anlegen.
- `/admin` mit der Adresse aus `ADMIN_EMAILS`.

## 6. Vela+ mit Stripe (10 € / Monat)

Stripe Checkout (gehostete Bezahlseite) im Abo-Modus. Karte, Apple Pay und Google Pay
erscheinen dort automatisch, wenn sie in Stripe unter **Einstellungen → Zahlungsmethoden**
aktiv sind. Ohne `STRIPE_SECRET_KEY` zeigt die App „Zahlungen sind noch nicht eingerichtet“.

| Variable | Wert |
| --- | --- |
| `STRIPE_SECRET_KEY` | Stripe → Entwickler → API-Schlüssel → Geheimer Schlüssel (`sk_live_…`, zum Testen `sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | Signatur-Geheimnis (`whsec_…`) des Webhooks unten |
| `STRIPE_PRICE_ID` | optional `price_…`; ohne wird 10 € / Monat direkt im Code angelegt |

Webhook (Stripe → Entwickler → Webhooks → Endpunkt hinzufügen):
`https://<deine-domain>/api/stripe/webhook` mit den Ereignissen
`checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.

„Abo verwalten“ öffnet das Stripe-Kundenportal: einmal unter
**Einstellungen → Billing → Kundenportal** aktivieren (Kündigen erlauben, „zum Ende des
Abrechnungszeitraums“).

## Hinweise

- Hosting Vercel + Datenbank Neon steht so in `/datenschutz` (Punkt 10), Stripe in Punkt 8.
- Für die Handy-App (`docs/STORE.md`) ist `VELA_APP_URL` die gleiche Adresse wie `BETTER_AUTH_URL`.
