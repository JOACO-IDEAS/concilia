export interface Plan {
  id: string;
  nombre: string;
  maxEdificios: number;
  maxUF: number;
  precioMensual: number | null; // null = "a medida"
}

// El pricing de ConciliIA se calcula por edificios y Unidades Funcionales (UF)
// administradas — no por comprobantes o transacciones procesadas.
export const PLANES: Plan[] = [
  { id: "starter", nombre: "Starter", maxEdificios: 5, maxUF: 120, precioMensual: 45_000 },
  { id: "profesional", nombre: "Profesional", maxEdificios: 20, maxUF: 500, precioMensual: 120_000 },
  { id: "enterprise", nombre: "Enterprise", maxEdificios: Infinity, maxUF: Infinity, precioMensual: null },
];

export function planParaUso(edificios: number, uf: number): Plan {
  return (
    PLANES.find((p) => edificios <= p.maxEdificios && uf <= p.maxUF) ??
    PLANES[PLANES.length - 1]
  );
}
