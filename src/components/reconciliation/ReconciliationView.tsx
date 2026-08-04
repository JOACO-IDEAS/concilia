"use client";

import { useState } from "react";
import { UploadDropzone } from "./UploadDropzone";
import { MatchTable } from "./MatchTable";
import { FileCheck2 } from "lucide-react";

export function ReconciliationView() {
  const [showTable, setShowTable] = useState(false);

  return (
    <div className="space-y-6">
      <UploadDropzone onProcessed={() => setShowTable(true)} />

      {showTable ? (
        <MatchTable />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-16 text-center dark:border-slate-800 dark:bg-slate-900">
          <FileCheck2 size={28} className="text-slate-300 dark:text-slate-700" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Subí un extracto bancario: la IA prepara el match y vos aprobás cada pago en 1 clic
          </p>
        </div>
      )}
    </div>
  );
}
