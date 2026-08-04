"use client";

import { useState } from "react";
import type { ArchivoParseado, FilaImportacion, MapeoColumnas } from "@/lib/import/types";
import type { ResultadoImportacion } from "@/app/importar/actions";
import { StepIndicator } from "./StepIndicator";
import { StepUpload } from "./StepUpload";
import { StepMapping } from "./StepMapping";
import { StepPreview } from "./StepPreview";
import { StepConfirm } from "./StepConfirm";

type Paso = 1 | 2 | 3 | 4;

export function ImportWizard() {
  const [paso, setPaso] = useState<Paso>(1);
  const [archivo, setArchivo] = useState<ArchivoParseado | null>(null);
  const [mapeo, setMapeo] = useState<MapeoColumnas>({});
  const [filas, setFilas] = useState<FilaImportacion[]>([]);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);

  function reiniciar() {
    setPaso(1);
    setArchivo(null);
    setMapeo({});
    setFilas([]);
    setResultado(null);
  }

  return (
    <div className="space-y-6">
      <StepIndicator pasoActual={paso} />

      {paso === 1 ? (
        <StepUpload
          onArchivoParseado={(archivoParseado, mapeoSugerido) => {
            setArchivo(archivoParseado);
            setMapeo(mapeoSugerido);
            setPaso(2);
          }}
        />
      ) : null}

      {paso === 2 && archivo ? (
        <StepMapping
          archivo={archivo}
          mapeoInicial={mapeo}
          onVolver={() => setPaso(1)}
          onContinuar={(mapeoFinal, filasConstruidas) => {
            setMapeo(mapeoFinal);
            setFilas(filasConstruidas);
            setPaso(3);
          }}
        />
      ) : null}

      {paso === 3 ? (
        <StepPreview
          filas={filas}
          onFilasChange={setFilas}
          onVolver={() => setPaso(2)}
          onContinuar={() => setPaso(4)}
        />
      ) : null}

      {paso === 4 ? (
        <StepConfirm
          filas={filas}
          resultado={resultado}
          onResultado={setResultado}
          onVolver={() => setPaso(3)}
          onReiniciar={reiniciar}
        />
      ) : null}
    </div>
  );
}
