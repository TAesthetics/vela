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
          kostenlos. Es gelten unsere Regeln für ein respektvolles Miteinander; wer dagegen verstößt, kann gesperrt
          werden (siehe Datenschutzerklärung, Blockieren und Melden).
        </p>
      </Section>

      <Section title="3. Vela+ (Abo)">
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

      <Section title="4. Kündigung">
        <p>
          Du kannst jederzeit kündigen, ohne Frist: in der App unter Vela+ → „Abo verwalten“ oder per E-Mail an{" "}
          {OPERATOR.email}. Die Kündigung wirkt zum Ende des bereits bezahlten Monats; bis dahin bleibt Vela+ aktiv.
          Löschst du dein Konto, endet ein laufendes Abo sofort; bereits bezahlte Zeiträume werden dabei nicht
          anteilig erstattet, außer im Fall eines Widerrufs (Punkt 5).
        </p>
        <p>
          Schlägt eine Zahlung fehl, versucht Stripe sie einige Male erneut. Klappt sie nicht, endet Vela+.
        </p>
      </Section>

      <Section title="5. Widerrufsrecht (Verbraucherinnen und Verbraucher)">
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

      <Section title="6. Preisänderungen">
        <p>
          Preisänderungen kündigen wir mindestens 30 Tage vorher per E-Mail an. Sie gelten erst ab dem nächsten
          Abrechnungsmonat nach Ablauf dieser Frist, und du kannst vorher kündigen.
        </p>
      </Section>

      <Section title="7. Gewährleistung und Verfügbarkeit">
        <p>
          Wir bemühen uns, dass Vela immer erreichbar ist, können das aber nicht garantieren (z. B. bei Wartung oder
          Störungen beim Hoster). Deine gesetzlichen Gewährleistungsrechte bleiben unberührt. Für Inhalte anderer
          Nutzerinnen und Nutzer sind diese selbst verantwortlich.
        </p>
      </Section>

      <Section title="8. Recht und Streitbeilegung">
        <p>
          Es gilt österreichisches Recht; zwingende Verbraucherschutzvorschriften deines Wohnsitzlandes bleiben
          unberührt. Bei Streitigkeiten kannst du dich an die Internet Ombudsstelle (ombudsstelle.at) wenden.
        </p>
      </Section>
    </LegalPage>
  );
}
