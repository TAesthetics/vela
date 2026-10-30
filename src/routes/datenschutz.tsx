import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, OPERATOR, Section } from "@/components/vela/legal";

export const Route = createFileRoute("/datenschutz")({
  head: () => ({ meta: [{ title: "Datenschutzerklärung – Vela" }] }),
  component: Datenschutz,
});

function Datenschutz() {
  return (
    <LegalPage title="Datenschutzerklärung">
      <p className="text-muted">Stand: {OPERATOR.updated}</p>

      <Section title="1. Verantwortlicher">
        <p>
          {OPERATOR.name}, {OPERATOR.address}, E-Mail: {OPERATOR.email}. Bei Fragen zum Datenschutz
          erreichst du uns unter dieser Adresse.
        </p>
      </Section>

      <Section title="2. Anmeldung mit E-Mail und Passwort">
        <p>
          Du registrierst dich mit deiner E-Mail-Adresse und einem Passwort und bestätigst, dass du mindestens 18
          Jahre alt bist. Wir speichern deine E-Mail-Adresse, eine Nutzerkennung und dein Passwort nur als
          nicht umkehrbaren Hash (wir kennen dein Passwort nie). Es gibt keine Anmeldung über Google, X oder
          andere Dritte, und wir schicken keine Werbe- oder Bestätigungsmails. Passwort vergessen? Schreib uns
          an {OPERATOR.email}.
        </p>
        <p>
          Rechtsgrundlage: Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO). Nach der Anmeldung setzen
          wir ein technisch notwendiges Sitzungs-Cookie bzw. speichern ein Sitzungstoken im Browser.
        </p>
      </Section>

      <Section title="3. Profildaten">
        <p>
          Für dein Profil speichern wir: Vorname bzw. Anzeigename, Alter, Stadt, deinen „Orbit“ (was du
          suchst), drei Werte, zwei Antworten auf Fragen und optional ein Porträtfoto. Dein Foto wird
          anderen erst gezeigt, wenn ihr beide genug Nachrichten geschrieben habt („Schleier“).
        </p>
        <p>
          Die Nutzung einer Dating-App und deine Angaben können Rückschlüsse auf dein Sexualleben oder
          deine sexuelle Orientierung zulassen. Das sind besondere Kategorien personenbezogener Daten
          (Art. 9 DSGVO). Wir verarbeiten sie nur auf Grundlage deiner ausdrücklichen Einwilligung
          (Art. 9 Abs. 2 lit. a DSGVO), die du mit dem Anlegen deines Profils erteilst und jederzeit durch
          Löschen deines Profils widerrufen kannst. Vela ist nur für Personen ab 18 Jahren.
        </p>
      </Section>

      <Section title="4. Swipes, Matches und Nachrichten">
        <p>
          Wir speichern, wem du einen Funken geschickt oder wen du übersprungen hast, eure Matches und
          die Nachrichten zwischen euch, damit die App funktioniert (Art. 6 Abs. 1 lit. b DSGVO).
          Nachrichten sind nur für dich und dein Match sichtbar. Wir lesen sie nicht routinemäßig mit,
          können sie aber prüfen, wenn sie gemeldet werden.
        </p>
      </Section>

      <Section title="5. Blockieren und Melden">
        <p>
          Wenn du jemanden blockierst oder meldest, speichern wir das (wer, wen, Zeitpunkt, Grund und
          optionaler Text). Zweck ist der Schutz der Nutzerinnen und Nutzer und die Verhinderung von
          Missbrauch (berechtigtes Interesse, Art. 6 Abs. 1 lit. f DSGVO). Gemeldete Personen erfahren
          nicht, wer sie gemeldet hat.
        </p>
      </Section>

      <Section title="6. Altersprüfung nach Meldungen">
        <p>
          Vela ist nur für Erwachsene. Es gibt keine automatische Prüfung und keine KI. Wenn dich jemand als
          „Minderjährig“ meldet, prüft der Betreiber die Meldung selbst. Besteht nach dieser menschlichen Prüfung der
          Verdacht, dass du jünger als 18 bist, sperren wir dein Konto vorübergehend: Du bist dann für niemanden
          sichtbar und kannst nicht swipen oder schreiben.
        </p>
        <p>
          Gegen eine Sperre kannst du dich wehren, indem du einen Ausweis hochlädst (Punkt 7) oder an{" "}
          {OPERATOR.email} schreibst. Rechtsgrundlage: berechtigtes Interesse am Schutz Minderjähriger und an einer
          Plattform nur für Erwachsene (Art. 6 Abs. 1 lit. f DSGVO) sowie Vertragserfüllung (Art. 6 Abs. 1 lit. b
          DSGVO). Meldungen und Entscheidungen des Betreibers (Zeitpunkt, Grund, Maßnahme) speichern wir als
          Prüfprotokoll.
        </p>
      </Section>

      <Section title="7. Ausweisprüfung nach einer Sperre">
        <p>
          Wurdest du wegen des Alters gesperrt, kannst du ein Foto eines amtlichen Ausweises hochladen. Das Bild
          wird im Browser neu kodiert (dabei werden Metadaten wie Standort entfernt), nur in unserer Datenbank
          gespeichert und ist ausschließlich für den Betreiber sichtbar, nie für andere Nutzerinnen und Nutzer und
          nie über einen öffentlichen Link. Wir prüfen nur dein Geburtsdatum; du darfst alle anderen Angaben außer
          Foto und Name abdecken.
        </p>
        <p>
          Das Ausweisbild wird sofort gelöscht, sobald wir entschieden haben (Freigabe oder Ablehnung), spätestens
          aber nach 30 Tagen. Gespeichert bleibt nur, dass und wann eine Prüfung stattfand und wie sie ausging.
          Rechtsgrundlage: Art. 6 Abs. 1 lit. b und f DSGVO; der Upload ist freiwillig.
        </p>
      </Section>

      <Section title="8. Vela+ und Zahlungen über Stripe">
        <p>
          Wenn du Vela+ abschließt, läuft die Zahlung über Stripe. Vertragspartner für die Zahlungsabwicklung ist
          Stripe Payments Europe, Ltd., 1 Grand Canal Street Lower, Grand Canal Dock, Dublin, D02 H210, Irland.
          Deine Zahlungsdaten (z. B. Karte, Apple Pay oder Google Pay) gibst du direkt auf der Bezahlseite von
          Stripe ein; wir sehen und speichern sie nie. Stripe verarbeitet sie als eigener Verantwortlicher bzw. als
          Zahlungsdienstleister nach seiner Datenschutzerklärung (stripe.com/at/privacy). Stripe kann Daten auch in
          die USA übermitteln; dafür gelten das EU-US Data Privacy Framework bzw. Standardvertragsklauseln.
        </p>
        <p>
          Wir übermitteln an Stripe deine E-Mail-Adresse und deine Nutzerkennung, damit die Zahlung deinem Konto
          zugeordnet werden kann. Von Stripe erhalten und speichern wir nur: eine Kunden- und Abo-Kennung, den
          Abo-Status (z. B. aktiv, gekündigt, Zahlung fehlgeschlagen) und das Ende des bezahlten Zeitraums.
          Rechtsgrundlage: Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO) sowie unsere gesetzlichen
          Aufbewahrungspflichten (Art. 6 Abs. 1 lit. c DSGVO).
        </p>
        <p>
          Rechnungen und Zahlungsbelege werden bei Stripe gespeichert und aus steuerrechtlichen Gründen 7 Jahre
          aufbewahrt (§ 132 BAO). Löschst du dein Konto, beenden wir ein laufendes Abo sofort und löschen die
          Abo-Daten in unserer Datenbank; die Belege bei Stripe bleiben bis zum Ablauf dieser Frist erhalten.
        </p>
      </Section>

      <Section title="9. Speicherung im Browser">
        <p>
          Im Browser speichern wir nur technisch notwendige Daten: das Sitzungs-Cookie bzw. -Token und
          lokale Einstellungen (z. B. welche Nachrichten du gesehen hast). Wir verwenden keine Tracking-
          oder Werbe-Cookies und keine Analysedienste.
        </p>
        <p>
          Stürzt die App ab, sendet sie einen anonymen Fehlerbericht an unseren eigenen Server: Fehlermeldung,
          technischer Ablauf (Stack), aufgerufene Seite ohne Parameter, Plattform (Web, iOS, Android) und
          App-Version. Wir speichern dabei weder deine Nutzer-ID noch deine IP-Adresse; E-Mail-Adressen und
          lange Kennungen werden vorher entfernt. Zweck ist, Fehler zu finden und zu beheben (berechtigtes
          Interesse, Art. 6 Abs. 1 lit. f DSGVO). Es wird kein externer Dienst eingebunden.
        </p>
      </Section>

      <Section title="10. Hosting und Empfänger">
        <p>
          Die App wird bei Vercel Inc. (USA) gehostet; die Datenbank liegt bei {OPERATOR.database}.
          Diese Anbieter verarbeiten Daten in unserem Auftrag (Art. 28 DSGVO). Bei Übermittlungen in die
          USA stützen wir uns auf das EU-US Data Privacy Framework bzw. Standardvertragsklauseln. Für Zahlungen bei
          Vela+ siehe Punkt 8 (Stripe). Eine Weitergabe an sonstige Dritte oder ein Verkauf deiner Daten findet nicht statt.
        </p>
      </Section>

      <Section title="11. Speicherdauer">
        <p>
          Profil, Swipes, Matches und Nachrichten speichern wir, solange dein Konto besteht. Löschst du dein
          Konto (Ich → „Konto löschen“), löschen wir sofort und vollständig (Art. 17 DSGVO): Profil, Foto, Swipes,
          Blockierungen, alle Nachrichten, an denen du beteiligt warst, sowie dein Login (Benutzerkonto,
          E-Mail-Adresse, Passwort-Hash und alle Sitzungen). Meldungen bewahren wir zum Schutz anderer bis
          zu 12 Monate auf; danach werden sie automatisch gelöscht. Ausweisbilder löschen wir nach der
          Entscheidung, spätestens nach 30 Tagen. Anonyme Fehlerberichte löschen wir 30 Tage nach dem letzten Auftreten. Das Prüfprotokoll der Altersprüfung und das Ergebnis einer
          Ausweisprüfung bewahren wir auf, solange eine Sperre besteht, und danach bis zu 12 Monate. Löschst du
          dein Konto während einer offenen Alterssperre, behalten wir zusätzlich nur einen nicht umkehrbaren
          Prüfwert (Hash) deiner Anmeldekennung, höchstens 12 Monate lang, damit die Sperre nicht durch eine neue
          Anmeldung umgangen werden kann; Name, E-Mail-Adresse und Profildaten sind darin nicht enthalten.
          Abo-Daten und Rechnungen bei Vela+ siehe Punkt 8. Server-Protokolle des Hosters werden nach kurzer Zeit automatisch gelöscht.
        </p>
      </Section>

      <Section title="12. Deine Rechte">
        <p>
          Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17),
          Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch
          (Art. 21 DSGVO). Eine erteilte Einwilligung kannst du jederzeit mit Wirkung für die Zukunft
          widerrufen. Schreib dazu an {OPERATOR.email}.
        </p>
        <p>
          Eine Kopie deiner Daten (Konto, Profil, Foto, deine Swipes, deine gesendeten Nachrichten, Blockierungen,
          deine Meldungen, Abo-Status, Altersprüfung und Sitzungen) kannst du jederzeit selbst herunterladen:
          Ich → „Meine Daten herunterladen“. Du bekommst sie als JSON-Datei, einem gängigen, maschinenlesbaren
          Format (Art. 20 DSGVO). Andere Personen erscheinen darin nur als ID.
        </p>
        <p>
          Du kannst dich außerdem bei der österreichischen Datenschutzbehörde beschweren:
          Österreichische Datenschutzbehörde, Barichgasse 40–42, 1030 Wien, dsb@dsb.gv.at, www.dsb.gv.at.
        </p>
      </Section>

      <Section title="13. Open Source">
        <p>
          Der Code von Vela ist öffentlich (github.com/TAesthetics/vela). Du kannst nachlesen, welche Daten
          gespeichert werden und wie der Schleier funktioniert.
        </p>
      </Section>
    </LegalPage>
  );
}
