import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, OPERATOR, Section } from "@/components/vela/legal";

export const Route = createFileRoute("/impressum")({
  head: () => ({ meta: [{ title: "Impressum – Vela" }] }),
  component: Impressum,
});

function Impressum() {
  return (
    <LegalPage title="Impressum">
      <Section title="Angaben gemäß § 5 ECG und Offenlegung gemäß § 25 MedienG">
        <p>
          Medieninhaber und Diensteanbieter:
          <br />
          {OPERATOR.name}
          <br />
          {OPERATOR.address}
        </p>
        <p>
          E-Mail: {OPERATOR.email}
          <br />
          Telefon: {OPERATOR.phone}
        </p>
        <p>Unternehmensgegenstand: {OPERATOR.purpose}</p>
        <p>
          Firmenbuch: {OPERATOR.register}
          <br />
          UID-Nummer: {OPERATOR.uid}
          <br />
          Aufsichtsbehörde: {OPERATOR.authority}
        </p>
      </Section>
      <Section title="Grundlegende Richtung (§ 25 Abs. 4 MedienG)">
        <p>
          Vela ist eine Dating-App, die Menschen über Texte statt Fotos zusammenbringt. Die App enthält
          Inhalte, die Nutzerinnen und Nutzer selbst einstellen.
        </p>
      </Section>
      <Section title="Haftung für Inhalte">
        <p>
          Für Profiltexte, Fotos und Nachrichten sind die jeweiligen Nutzerinnen und Nutzer selbst
          verantwortlich. Rechtswidrige Inhalte kannst du in der App über „Melden“ oder per E-Mail an{" "}
          {OPERATOR.email} melden; wir entfernen sie nach Kenntnis umgehend.
        </p>
      </Section>
      <Section title="Open Source">
        <p>
          Der Quellcode von Vela ist unter der MIT-Lizenz veröffentlicht:{" "}
          <a className="underline" href="https://github.com/TAesthetics/vela">
            github.com/TAesthetics/vela
          </a>
          .
        </p>
      </Section>
      <Section title="Online-Streitbeilegung">
        <p>
          Verbraucherinnen und Verbraucher können sich bei Streitigkeiten an die Schlichtungsstellen
          in Österreich wenden, z. B. die Internet Ombudsstelle (ombudsstelle.at).
        </p>
      </Section>
    </LegalPage>
  );
}
