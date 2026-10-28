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

      <Section title="2. Anmeldung mit Google oder X">
        <p>
          Du meldest dich über „Weiter mit Google“ oder „Weiter mit X“ an. Die Anmeldung läuft über den
          Anmeldedienst der Grok-Plattform (auth.grok.me, betrieben von xAI), der dich an Google bzw. X
          weiterleitet. Dabei erhalten wir eine Nutzerkennung, deinen Namen und deine E-Mail-Adresse
          (bei X ggf. eine Ersatzadresse). Passwörter für Google oder X sehen wir nie. Für die Anmeldung
          gelten zusätzlich die Datenschutzbestimmungen von Google, X und xAI.
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

      <Section title="6. Speicherung im Browser">
        <p>
          Im Browser speichern wir nur technisch notwendige Daten: das Sitzungs-Cookie bzw. -Token und
          lokale Einstellungen (z. B. welche Nachrichten du gesehen hast). Wir verwenden keine Tracking-
          oder Werbe-Cookies und keine Analysedienste.
        </p>
      </Section>

      <Section title="7. Hosting und Empfänger">
        <p>
          Die App wird bei Vercel Inc. (USA) gehostet; die Datenbank liegt bei {OPERATOR.database}.
          Diese Anbieter verarbeiten Daten in unserem Auftrag (Art. 28 DSGVO). Bei Übermittlungen in die
          USA stützen wir uns auf das EU-US Data Privacy Framework bzw. Standardvertragsklauseln. Für die
          Anmeldung werden Daten an xAI, Google bzw. X übermittelt (siehe Punkt 2). Eine Weitergabe an
          sonstige Dritte oder ein Verkauf deiner Daten findet nicht statt.
        </p>
      </Section>

      <Section title="8. Speicherdauer">
        <p>
          Profil, Swipes, Matches und Nachrichten speichern wir, solange dein Profil besteht. Löschst du
          dein Profil (Ich → „Profil löschen“), werden Profil, Foto, Swipes, deine Blockierungen und alle
          Nachrichten, an denen du beteiligt warst, sofort gelöscht. Meldungen bewahren wir zum Schutz
          anderer bis zu [Frist, z. B. 12 Monate] auf. Dein Anmeldekonto löschen wir auf Anfrage an{" "}
          {OPERATOR.email} vollständig. Server-Protokolle des Hosters werden nach kurzer Zeit automatisch
          gelöscht.
        </p>
      </Section>

      <Section title="9. Deine Rechte">
        <p>
          Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17),
          Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch
          (Art. 21 DSGVO). Eine erteilte Einwilligung kannst du jederzeit mit Wirkung für die Zukunft
          widerrufen. Schreib dazu an {OPERATOR.email}.
        </p>
        <p>
          Du kannst dich außerdem bei der österreichischen Datenschutzbehörde beschweren:
          Österreichische Datenschutzbehörde, Barichgasse 40–42, 1030 Wien, dsb@dsb.gv.at, www.dsb.gv.at.
        </p>
      </Section>

      <Section title="10. Open Source">
        <p>
          Der Code von Vela ist öffentlich (github.com/TAesthetics/vela). Du kannst nachlesen, welche Daten
          gespeichert werden und wie der Schleier funktioniert.
        </p>
      </Section>
    </LegalPage>
  );
}
