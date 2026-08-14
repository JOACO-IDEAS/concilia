"use client";

import { createContext, useContext, type ReactNode } from "react";

// UX-2 — identidad real del shell. Nunca un valor hardcodeado: RootLayout
// resuelve esto una sola vez por request (reutilizando la misma llamada de
// requireCurrentAdministrator() que ya hace para el gate de acceso) y lo
// pasa acá. `organizations` es la lista completa de membership real — no
// existe hoy el concepto de "organización activa seleccionada", así que el
// Topbar debe degradar honestamente (nombre único si hay una sola, conteo
// si hay varias) en vez de inventar una selección.
export type CurrentAdministratorContextValue = {
  administrator: { name: string; email: string } | null;
  organizations: { id: string; name: string }[];
};

const DEFAULT_VALUE: CurrentAdministratorContextValue = { administrator: null, organizations: [] };

const CurrentAdministratorContext = createContext<CurrentAdministratorContextValue>(DEFAULT_VALUE);

export function CurrentAdministratorProvider({
  value,
  children,
}: {
  value: CurrentAdministratorContextValue;
  children: ReactNode;
}) {
  return <CurrentAdministratorContext.Provider value={value}>{children}</CurrentAdministratorContext.Provider>;
}

export function useCurrentAdministrator(): CurrentAdministratorContextValue {
  return useContext(CurrentAdministratorContext);
}
