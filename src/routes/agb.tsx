import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, OPERATOR, Section } from "@/components/vela/legal";
import { PLUS_PRICE_LABEL } from "@/lib/vela/data";

export const Route = createFileRoute("/agb")({
  head: () => ({ meta: [{ title: "AGB und Abo-Bedingungen – Vela" }] }),
  component: Agb,
});

function Agb() {
  return (
    <LegalPage title="AGB und Abo-Bedingungen">
      <p className="text-muted">Stand: {OPERATOR.updated}</p>

      <Section title="1. Anbieter">
        <p>
          Vela wird von {OPERATOR.name}, {OPERATOR.address}, E-Mail: {OPERATOR.email} als Privatperson betrieben
          (siehe Impressum). Vela ist nur für Personen ab 18 Jahren.
        </p>
      </Section>

      <Section title="2. Vela kostenlos">
        <p>
          Die Grundfunktionen von Vela (Profil, Swipes bis zum Tageslimit, Matches, Nachrichten, Schleier) sind
          kostenlos. Für alle gelten die Regeln für ein respektvolles Miteinander (Punkt 3); wer dagegen verstößt,
          wird gesperrt.
        </p>
      </Section>

      <Section title="3. Regeln für ein respektvolles Miteinander" id="regeln">
        <p>
          Wer ein Profil anlegt, akzeptiert diese AGB mit den folgenden Regeln. Für anstößige Inhalte und für
          Personen, die andere beleidigen, belästigen oder bedrohen, gibt es auf Vela keine Toleranz. Nicht erlaubt
          sind in Profilen, Funk-Notizen, Nachrichten und Fotos:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Beleidigungen, Belästigung, Mobbing, Stalking und Drohungen</li>
          <li>Hass oder Hetze gegen Menschen wegen Herkunft, Hautfarbe, Religion, Geschlecht, sexueller Orientierung, Behinderung oder Alter</li>
          <li>Nacktfotos, sexuell explizite Inhalte und das Drängen zu sexuellen Handlungen</li>
          <li>jede Nutzung durch oder mit Bezug zu Personen unter 18 Jahren</li>
          <li>Fake-Profile, fremde Fotos und das Ausgeben als jemand anderes</li>
          <li>Spam, Werbung, Betrug, Geldforderungen und Links zu solchen Angeboten</li>
          <li>das Veröffentlichen privater Daten anderer (z. B. Adresse, Telefonnummer, Fotos)</li>
          <li>Inhalte, die gegen Gesetze verstoßen oder zu Gewalt oder Straftaten aufrufen</li>
        </ul>
        <p>
          Beleidigende und sexuell explizite Begriffe werden schon beim Speichern abgelehnt. Jede Person kann über
          „Blockieren“ und „Melden“ andere sofort blockieren und Verstöße melden; der Betreiber prüft Meldungen
          selbst, in der Regel innerhalb von 24 Stunden. Bei einem Verstoß sperren wir das Konto ohne Vorwarnung;
          gesperrte Konten und ihre Inhalte sind danach für niemanden mehr sichtbar. Fragen oder Meldungen außerhalb
          der App: {OPERATOR.email}.
        </p>
      </Section>

      <Section title="4. Vela+ (Abo)">
        <p>
          Vela+ kostet {PLUS_PRICE_LABEL} pro Monat inklusive aller Abgaben. Es schaltet zusätzliche Funktionen frei:
          unbegrenzte Swipes, sehen, wer schon zurückfunken würde, und die letzte Weiter-Geste rückgängig machen. Den
          Schleier hebt auch Vela+ nicht; Fotos zeigen sich weiterhin erst nach einem Gespräch.
        </p>
        <p>
          Das Abo beginnt mit der erfolgreichen Zahlung und verlängert sich automatisch jeden Monat, bis du es
          kündigst. Bezahlt wird im Voraus für den jeweiligen Monat über unseren Zahlungsdienstleister Stripe (Karte,
          Apple Pay, Google Pay oder andere dort angebotene Zahlungsarten).
        </p>
      </Section>

      <Section title="5. Kündigung">
        <p>
          Du kannst jederzeit kündigen, ohne Frist: in der App unter Vela+ → „Abo verwalten“ oder per E-Mail an{" "}
          {OPERATOR.email}. Die Kündigung wirkt zum Ende des bereits bezahlten Monats; bis dahin bleibt Vela+ aktiv.
          Löschst du dein Konto, endet ein laufendes Abo sofort; bereits bezahlte Zeiträume werden dabei nicht
          anteilig erstattet, außer im Fall eines Widerrufs (Punkt 6).
        </p>
        <p>
          Schlägt eine Zahlung fehl, versucht Stripe sie einige Male erneut. Klappt sie nicht, endet Vela+.
        </p>
      </Section>

      <Section title="6. Widerrufsrecht (Verbraucherinnen und Verbraucher)">
        <p>
          Du kannst den Vertrag über Vela+ innerhalb von 14 Tagen ab Abschluss ohne Angabe von Gründen widerrufen.
          Dafür reicht eine eindeutige Erklärung, z. B. eine E-Mail an {OPERATOR.email} („Ich widerrufe mein Vela+
          Abo“), vor Ablauf der Frist.
        </p>
        <p>
          Mit dem Abschluss verlangst du ausdrücklich, dass Vela+ sofort und noch vor Ablauf der Widerrufsfrist
          startet. Widerrufst du danach, zahlst du nur den anteiligen Betrag für die Tage bis zum Widerruf (§ 16
          FAGG); den Rest erstatten wir innerhalb von 14 Tagen über dieselbe Zahlungsart zurück.
        </p>
      </Section>

      <Section title="7. Preisänderungen">
        <p>
          Preisänderungen kündigen wir mindestens 30 Tage vorher per E-Mail an. Sie gelten erst ab dem nächsten
          Abrechnungsmonat nach Ablauf dieser Frist, und du kannst vorher kündigen.
        </p>
      </Section>

      <Section title="8. Gewährleistung und Verfügbarkeit">
        <p>
          Wir bemühen uns, dass Vela immer erreichbar ist, können das aber nicht garantieren (z. B. bei Wartung oder
          Störungen beim Hoster). Deine gesetzlichen Gewährleistungsrechte bleiben unberührt. Für Inhalte anderer
          Nutzerinnen und Nutzer sind diese selbst verantwortlich.
        </p>
      </Section>

      <Section title="9. Recht und Streitbeilegung">
        <p>
          Es gilt österreichisches Recht; zwingende Verbraucherschutzvorschriften deines Wohnsitzlandes bleiben
          unberührt. Bei Streitigkeiten kannst du dich an die Internet Ombudsstelle (ombudsstelle.at) wenden.
        </p>
      </Section>
    </LegalPage>
  );
}
