import { PilotAccessRequestForm } from "./PilotAccessRequestForm";

// UX-1 — `invalid-link=1` es el único parámetro que esta página lee, y solo
// para mostrar una alerta genérica: nunca distingue token inexistente,
// vencido, usado o revocado (anti-enumeración, ya auditado en
// PILOT_AUTHENTICATED_ACCESS_STATIC_AUDIT_V1.md). El formulario sigue
// disponible siempre, con o sin el parámetro.
export default async function AccesoPage({
  searchParams,
}: {
  searchParams: Promise<{ "invalid-link"?: string }>;
}) {
  const invalidLink = (await searchParams)["invalid-link"] === "1";
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center p-6">
      <PilotAccessRequestForm invalidLink={invalidLink} />
    </main>
  );
}
