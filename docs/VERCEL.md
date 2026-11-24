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
| `ADMIN_USER_IDS` | optional: deine Konto-ID(s) (steht unten auf `/admin/age`). Wenn gesetzt, zählt nur sie, `ADMIN_EMAILS` wird ignoriert |
| `CRON_SECRET` | optional, empfohlen: zufällig (`openssl rand -hex 32`); schützt `/api/cron/retention` (siehe Abschnitt 7) |

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

Jede Adresse aus `ADMIN_EMAILS` wird beim ersten Öffnen von `/admin` fest an dieses Konto
gebunden (Tabelle `vela_admin_pins`). Wird das Konto gelöscht und jemand registriert die
Adresse neu, bekommt er keinen Zugriff. Hast du dich selbst neu registriert: neue Konto-ID
als `ADMIN_USER_IDS` eintragen und neu deployen.

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

### Vela+ in der iOS-/Android-App (RevenueCat, vorbereitet)

Der Server kann Käufe aus App Store und Google Play schon annehmen; solange die
Variablen fehlen, antwortet `/api/revenuecat/webhook` mit 400 und nichts ändert sich.
Plus gilt, solange Stripe **oder** der In-App-Kauf aktiv ist. Die App selbst braucht
noch das RevenueCat-SDK mit `Purchases.logIn(<VELA-Konto-ID>)` und einen Kaufknopf.

| Variable | Wert |
| --- | --- |
| `REVENUECAT_WEBHOOK_AUTH` | frei gewählter, langer Zufallswert; derselbe im RevenueCat-Webhook als „Authorization header“ |
| `REVENUECAT_SECRET_KEY` | RevenueCat → Projekt → API-Schlüssel → geheimer Schlüssel (`sk_…`) |
| `REVENUECAT_WEBHOOK_SECRET` | optional: HMAC-Signatur-Geheimnis des Webhooks |
| `REVENUECAT_ENTITLEMENT` | optional, Kennung der Berechtigung; Standard `plus` |

Webhook (RevenueCat → Integrationen → Webhooks): `https://<deine-domain>/api/revenuecat/webhook`,
Produktion und Sandbox (Apple prüft Käufe in der Sandbox). Jedes Ereignis liest den Stand
frisch bei RevenueCat nach, Reihenfolge und Doppelte sind egal. Gespeichert wird nur
Store, Produkt, Ablaufdatum und aktiv ja/nein (Tabelle `vela_store_purchases`), gelöscht
mit dem Konto. In-App-Abos kann VELA nicht selbst kündigen; die App weist beim
Konto-Löschen darauf hin.
Vor dem Einschalten: Datenschutzerklärung um RevenueCat (und Apple/Google als Zahlungsabwickler) ergänzen.

## 7. Täglicher Retention-Cron (DSGVO)

Jeden Tag um 03:15 UTC ruft Vercel `GET /api/cron/retention` auf und löscht abgelaufene
Daten (Ausweis-Bilder nach 30 Tagen, Absturzberichte nach 30 Tagen, Meldungen und
ähnliches nach 12 Monaten — gleiche Fristen wie in `/datenschutz`). Zusätzlich läuft
die Bereinigung weiter beim App-/Admin-Laden als Fallback.

Empfohlen: `CRON_SECRET` setzen (zufällig, z. B. `openssl rand -hex 32`) für Production
und Preview, dann **Redeploy**. Vercel schickt den Wert automatisch als
`Authorization: Bearer …`. Ohne Secret akzeptiert die Route nur Anfragen mit dem
Header `x-vercel-cron: 1` (Hobby-Standard).

## Hinweise

- Hosting Vercel + Datenbank Neon steht so in `/datenschutz` (Punkt 10), Stripe in Punkt 8.
- Für die Handy-App (`docs/STORE.md`) ist `VELA_APP_URL` die gleiche Adresse wie `BETTER_AUTH_URL`.
