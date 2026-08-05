import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Default es 1MB — insuficiente para un PDF de extracto bancario real
    // (ver src/app/conciliacion/statement-actions.ts, ingesta de extractos).
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async redirects() {
    return [
      // La Bandeja de Trabajo es la pantalla principal del Empleado IA (ver
      // PRODUCT_BLUEPRINT.md) — "/" queda como demo mock legacy, alcanzable
      // por URL directa o el logo, pero ya no es la puerta de entrada.
      // `permanent: false` (307) a propósito: es una decisión de producto
      // que puede evolucionar, no queremos que buscadores/navegadores la
      // cacheen para siempre.
      {
        source: "/",
        destination: "/bandeja-de-trabajo",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
