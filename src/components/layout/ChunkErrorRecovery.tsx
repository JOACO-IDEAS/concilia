"use client";

import { useEffect } from "react";

const PATRON_CHUNK_ERROR = /Loading chunk [\d]+ failed|Loading CSS chunk|ChunkLoadError/i;

function esErrorDeChunk(mensaje: string | undefined, nombre: string | undefined): boolean {
  if (nombre === "ChunkLoadError") return true;
  return !!mensaje && PATRON_CHUNK_ERROR.test(mensaje);
}

/**
 * Cada `vercel --prod` cambia el build ID — una pestaña que quedó abierta
 * desde antes del deploy y navega (client-side, vía `<Link>`/`router.push`)
 * a una página que todavía no cargó en esta sesión falla al pedir un chunk
 * JS que ya no existe en el CDN nuevo. Sin esto, eso se ve como "el
 * componente falla y tira un error" al volver a una sección. Se detecta acá
 * (globalmente, una sola vez) y se resuelve con un reload real de la
 * página — trae HTML/JS frescos del deploy actual — en vez de dejar al
 * usuario atascado con una excepción de módulo.
 */
export function ChunkErrorRecovery() {
  useEffect(() => {
    function onError(e: ErrorEvent) {
      if (esErrorDeChunk(e.message, e.error?.name)) window.location.reload();
    }
    function onRejection(e: PromiseRejectionEvent) {
      const razon = e.reason;
      const mensaje = razon instanceof Error ? razon.message : String(razon ?? "");
      const nombre = razon instanceof Error ? razon.name : undefined;
      if (esErrorDeChunk(mensaje, nombre)) window.location.reload();
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
