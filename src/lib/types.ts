export type EstadoConsorcio = "al-dia" | "con-demoras" | "critico";

export interface Consorcio {
  id: string;
  nombre: string;
  direccion: string;
  barrio: string;
  administrador: string;
  cuit: string;
  unidades: number;
  recaudacionEsperada: number;
  recaudacionEfectiva: number;
  porcentajeConciliadoAuto: number;
  estado: EstadoConsorcio;
}

export type EstadoPago = "pagado" | "pendiente" | "vencido";

export type TipoMovimiento =
  | "expensa"
  | "pago"
  | "interes"
  | "nota_credito"
  | "nota_debito";

export interface MovimientoCuenta {
  id: string;
  unidadId: string;
  fecha: string; // ISO date
  tipo: TipoMovimiento;
  concepto: string;
  monto: number; // positivo = cargo (debe), negativo = crédito (haber)
  referenciaTransaccionId?: string;
}

export interface UnidadFuncional {
  id: string;
  consorcioId: string;
  unidad: string; // e.g. "4° B"
  titular: string;
  cuit: string;
  tipoOcupante: "propietario" | "inquilino";
  coeficiente: number; // % de participación en el consorcio
  telefono: string; // +54 9 11 ...
  email: string;
  expensaMensual: number;
  saldoPendiente: number; // deuda total actual (expensas + interés - notas)
  estado: EstadoPago;
  diasAtraso: number;
  interesAcumulado: number;
  ultimoPago: string | null; // ISO date
  ultimoRecordatorio: { fecha: string; canal: "whatsapp" | "email" } | null;
  movimientos: MovimientoCuenta[];
}

export type EstadoMatch = "auto" | "revision" | "sin-match" | "duplicado";

export interface SugerenciaMatch {
  unidadId: string;
  confianza: number;
  motivo: string;
}

export interface TransaccionBancaria {
  id: string;
  fecha: string; // ISO date
  banco: string;
  descripcionCruda: string;
  monto: number;
  consorcioId: string;
  unidadSugeridaId: string | null;
  confianza: number; // 0-100
  estadoMatch: EstadoMatch;
  motivoAlerta?: string;
  aprobado: boolean;
  esPagoParcial?: boolean;
  diferenciaMonto?: number; // monto - deuda esperada (negativo = pago parcial, positivo = pago con interés/exceso)
  sugerenciasAlternativas?: SugerenciaMatch[];
  reglaAplicadaId?: string;
  descartada?: boolean;
}

export interface ReglaConciliacion {
  id: string;
  nombre: string;
  patron: string; // substring a buscar en descripcionCruda (case-insensitive)
  unidadId: string;
  creadaEl: string; // ISO datetime
  vecesAplicada: number;
}

export interface ActividadReciente {
  id: string;
  tipo: "pago" | "recordatorio" | "alerta" | "conciliacion" | "regla";
  descripcion: string;
  fecha: string; // ISO datetime
  consorcioId?: string;
}
