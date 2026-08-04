import { mulberry32, pick, seededInt, shuffle } from "./prng";
import type {
  ActividadReciente,
  Consorcio,
  EstadoPago,
  MovimientoCuenta,
  ReglaConciliacion,
  SugerenciaMatch,
  TransaccionBancaria,
  UnidadFuncional,
} from "./types";

const rng = mulberry32(20260802);

const NOMBRES = [
  "Roberto Carlos Giménez",
  "María Eugenia Sosa",
  "Federico Álvarez",
  "Juan Ignacio Pérez",
  "Lucía Fernández",
  "Marcelo Daniel Torres",
  "Ana Belén Rodríguez",
  "Nicolás Ezequiel Vera",
  "Silvia Graciela Beltrán",
  "Gustavo Adrián Molina",
  "Carla Estefanía Núñez",
  "Diego Martín Acosta",
  "Valeria Soledad Ibáñez",
  "Pablo Ernesto Cabrera",
  "Florencia Ayelén Domínguez",
  "Sergio Hernán Paz",
  "Camila Antonella Ríos",
  "Alejandro José Medina",
  "Natalia Verónica Suárez",
  "Rodrigo Ezequiel Herrera",
  "Mariana Elizabeth Castro",
  "Emiliano David Ledesma",
  "Yamila Rocío Aguirre",
  "Cristian Fabián Ponce",
  "Agustina Belén Godoy",
  "Leandro Nahuel Villalba",
  "Verónica Andrea Correa",
  "Matías Ariel Benítez",
  "Sabrina Micaela Ojeda",
  "Hernán Gabriel Moyano",
  "Julieta Ivana Peralta",
  "Ricardo Fabián Juárez",
  "Daniela Soledad Luna",
  "Facundo Tomás Bravo",
  "Romina Alejandra Quiroga",
  "Ignacio Ariel Funes",
  "Paula Antonella Rey",
  "Maximiliano José Barrios",
  "Cecilia Noemí Salinas",
  "Andrés Felipe Escobar",
  "Melina Soledad Chávez",
  "Franco Nicolás Miranda",
  "Guadalupe Rosario Vega",
  "Tomás Agustín Ferreyra",
  "Antonella Micaela Ortega",
  "Ezequiel Damián Reinoso",
  "Brenda Milagros Toledo",
  "Walter Osvaldo Campos",
  "Ornella Belén Sánchez",
  "Gonzalo Emanuel Farías",
];

const BANCOS = [
  "Banco Galicia",
  "Banco Santander Río",
  "BBVA",
  "Banco Nación",
  "Banco Macro",
  "Banco Ciudad",
  "ICBC",
  "Mercado Pago",
  "Ualá",
] as const;

interface ConsorcioSeed {
  nombre: string;
  direccion: string;
  barrio: string;
  pisos: number;
  deptosPorPiso: number;
  baseExpensa: number;
  administrador: string;
}

const CONSORCIO_SEEDS: ConsorcioSeed[] = [
  {
    nombre: "Consorcio Av. Cabildo 2450",
    direccion: "Av. Cabildo 2450",
    barrio: "Belgrano, CABA",
    pisos: 8,
    deptosPorPiso: 3,
    baseExpensa: 180_000,
    administrador: "Estudio Fernández Administraciones",
  },
  {
    nombre: "Edificio Torres del Yacht",
    direccion: "Av. Alicia Moreau de Justo 1780",
    barrio: "Puerto Madero, CABA",
    pisos: 16,
    deptosPorPiso: 3,
    baseExpensa: 300_000,
    administrador: "Estudio Fernández Administraciones",
  },
  {
    nombre: "Consorcio Libertador 3800",
    direccion: "Av. del Libertador 3800",
    barrio: "Palermo, CABA",
    pisos: 8,
    deptosPorPiso: 4,
    baseExpensa: 200_000,
    administrador: "Estudio Fernández Administraciones",
  },
  {
    nombre: "Consorcio Rivadavia 5200",
    direccion: "Av. Rivadavia 5200",
    barrio: "Caballito, CABA",
    pisos: 6,
    deptosPorPiso: 3,
    baseExpensa: 160_000,
    administrador: "Estudio Fernández Administraciones",
  },
  {
    nombre: "Edificio Malabia 1200",
    direccion: "Malabia 1200",
    barrio: "Villa Crespo, CABA",
    pisos: 4,
    deptosPorPiso: 3,
    baseExpensa: 145_000,
    administrador: "Estudio Fernández Administraciones",
  },
  {
    nombre: "Consorcio Scalabrini Ortiz 1450",
    direccion: "Av. Scalabrini Ortiz 1450",
    barrio: "Palermo, CABA",
    pisos: 7,
    deptosPorPiso: 2,
    baseExpensa: 195_000,
    administrador: "Estudio Fernández Administraciones",
  },
  {
    nombre: "Edificio Figueroa Alcorta 3200",
    direccion: "Av. Figueroa Alcorta 3200",
    barrio: "Núñez, CABA",
    pisos: 10,
    deptosPorPiso: 2,
    baseExpensa: 260_000,
    administrador: "Estudio Fernández Administraciones",
  },
  {
    nombre: "Consorcio Corrientes 4800",
    direccion: "Av. Corrientes 4800",
    barrio: "Almagro, CABA",
    pisos: 9,
    deptosPorPiso: 4,
    baseExpensa: 150_000,
    administrador: "Estudio Fernández Administraciones",
  },
  {
    nombre: "Edificio Santa Fe 3900",
    direccion: "Av. Santa Fe 3900",
    barrio: "Palermo, CABA",
    pisos: 12,
    deptosPorPiso: 2,
    baseExpensa: 220_000,
    administrador: "Estudio Fernández Administraciones",
  },
  {
    nombre: "Consorcio Directorio 2100",
    direccion: "Av. Directorio 2100",
    barrio: "Caballito, CABA",
    pisos: 5,
    deptosPorPiso: 4,
    baseExpensa: 135_000,
    administrador: "Estudio Fernández Administraciones",
  },
];

const LETRAS_DEPTO = ["A", "B", "C", "D", "E"];
const DAILY_INTEREST_RATE = 0.0015;

function generarCuit(rng: () => number): string {
  const prefijo = pick(rng, ["20", "23", "24", "27"]);
  const cuerpo = Array.from({ length: 8 }, () => seededInt(rng, 0, 9)).join("");
  const verificador = seededInt(rng, 0, 9);
  return `${prefijo}-${cuerpo}-${verificador}`;
}

function generarTelefono(rng: () => number): string {
  const linea = Array.from({ length: 4 }, () => seededInt(rng, 0, 9)).join("");
  const final = Array.from({ length: 4 }, () => seededInt(rng, 0, 9)).join("");
  return `+54 9 11 ${linea}-${final}`;
}

function generarEmail(nombre: string, rng: () => number): string {
  const partes = nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(" ");
  const dominio = pick(rng, ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com.ar"]);
  const sufijo = seededInt(rng, 1, 98);
  return `${partes[0]}.${partes[partes.length - 1]}${sufijo}@${dominio}`;
}

function mesLabel(fecha: Date): string {
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(fecha);
}

let consorcioCounter = 0;
let unidadCounter = 0;
let movimientoCounter = 0;

function construirConsorcio(seed: ConsorcioSeed): Consorcio {
  consorcioCounter += 1;
  const totalUnidades = seed.pisos * seed.deptosPorPiso;
  return {
    id: `cons-${consorcioCounter}`,
    nombre: seed.nombre,
    direccion: seed.direccion,
    barrio: seed.barrio,
    administrador: seed.administrador,
    cuit: generarCuit(rng),
    unidades: totalUnidades,
    recaudacionEsperada: 0,
    recaudacionEfectiva: 0,
    porcentajeConciliadoAuto: 0,
    estado: "al-dia",
  };
}

function construirUnidad(consorcio: Consorcio, seed: ConsorcioSeed, piso: number, letra: string): UnidadFuncional {
  unidadCounter += 1;
  const id = `uf-${unidadCounter}`;
  const titular = pick(rng, NOMBRES);
  const pesoTamano = 0.7 + rng() * 0.9; // 0.7 - 1.6
  const expensaMensual = Math.round((seed.baseExpensa * pesoTamano) / 1000) * 1000;

  const distribucion = rng();
  let estado: EstadoPago;
  let diasAtraso = 0;
  if (distribucion < 0.62) {
    estado = "pagado";
  } else if (distribucion < 0.8) {
    estado = "pendiente";
    diasAtraso = seededInt(rng, 1, 6);
  } else {
    estado = "vencido";
    diasAtraso = seededInt(rng, 9, 52);
  }

  const interesAcumulado =
    estado === "vencido" ? Math.round(expensaMensual * DAILY_INTEREST_RATE * diasAtraso) : 0;
  const saldoPendiente = estado === "pagado" ? 0 : expensaMensual + interesAcumulado;

  const movimientos: MovimientoCuenta[] = [];
  const hoy = new Date("2026-08-02");
  for (let mesesAtras = 6; mesesAtras >= 0; mesesAtras--) {
    const fechaEmision = new Date(hoy);
    fechaEmision.setMonth(hoy.getMonth() - mesesAtras, 1);
    movimientoCounter += 1;
    movimientos.push({
      id: `mov-${movimientoCounter}`,
      unidadId: id,
      fecha: fechaEmision.toISOString().slice(0, 10),
      tipo: "expensa",
      concepto: `Expensas ${mesLabel(fechaEmision)}`,
      monto: expensaMensual,
    });

    const esUltimoMes = mesesAtras === 0;
    const seCobroEsteMes = esUltimoMes ? estado === "pagado" : rng() > 0.08;

    if (seCobroEsteMes) {
      const fechaPago = new Date(fechaEmision);
      fechaPago.setDate(fechaEmision.getDate() + seededInt(rng, 2, 9));
      movimientoCounter += 1;
      movimientos.push({
        id: `mov-${movimientoCounter}`,
        unidadId: id,
        fecha: fechaPago.toISOString().slice(0, 10),
        tipo: "pago",
        concepto: `Pago recibido — expensas ${mesLabel(fechaEmision)}`,
        monto: -expensaMensual,
      });
    }

    if (rng() < 0.08) {
      const esCredito = rng() < 0.5;
      const montoNota = Math.round((expensaMensual * (0.05 + rng() * 0.2)) / 100) * 100;
      movimientoCounter += 1;
      movimientos.push({
        id: `mov-${movimientoCounter}`,
        unidadId: id,
        fecha: fechaEmision.toISOString().slice(0, 10),
        tipo: esCredito ? "nota_credito" : "nota_debito",
        concepto: esCredito
          ? "Nota de crédito — bonificación por reparación a cargo del propietario"
          : "Nota de débito — gasto extraordinario (ascensor / bomba de agua)",
        monto: esCredito ? -montoNota : montoNota,
      });
    }
  }

  let ultimoPago: string | null = null;
  const pagos = movimientos.filter((m) => m.tipo === "pago");
  if (pagos.length > 0) {
    ultimoPago = pagos[pagos.length - 1].fecha;
  }

  return {
    id,
    consorcioId: consorcio.id,
    unidad: `${piso}° ${letra}`,
    titular,
    cuit: generarCuit(rng),
    tipoOcupante: rng() < 0.65 ? "propietario" : "inquilino",
    coeficiente: 0,
    telefono: generarTelefono(rng),
    email: generarEmail(titular, rng),
    expensaMensual,
    saldoPendiente,
    estado,
    diasAtraso,
    interesAcumulado,
    ultimoPago,
    ultimoRecordatorio: null,
    movimientos,
  };
}

function construirUnidadesDeConsorcio(consorcio: Consorcio, seed: ConsorcioSeed): UnidadFuncional[] {
  const unidades: UnidadFuncional[] = [];
  for (let piso = 1; piso <= seed.pisos; piso++) {
    for (let d = 0; d < seed.deptosPorPiso; d++) {
      unidades.push(construirUnidad(consorcio, seed, piso, LETRAS_DEPTO[d]));
    }
  }

  const pesos = unidades.map(() => 0.6 + rng() * 1.4);
  const sumaPesos = pesos.reduce((a, b) => a + b, 0);
  let coefAsignado = 0;
  unidades.forEach((u, i) => {
    const coef = i === unidades.length - 1
      ? Math.round((100 - coefAsignado) * 1000) / 1000
      : Math.round(((pesos[i] / sumaPesos) * 100) * 1000) / 1000;
    u.coeficiente = coef;
    coefAsignado += coef;
  });

  return unidades;
}

export const consorcios: Consorcio[] = CONSORCIO_SEEDS.map(construirConsorcio);

export const unidades: UnidadFuncional[] = consorcios.flatMap((consorcio, i) =>
  construirUnidadesDeConsorcio(consorcio, CONSORCIO_SEEDS[i])
);

// Recalcular métricas del consorcio a partir de sus unidades
consorcios.forEach((consorcio) => {
  const unidadesDelConsorcio = unidades.filter((u) => u.consorcioId === consorcio.id);
  const esperada = unidadesDelConsorcio.reduce((sum, u) => sum + u.expensaMensual, 0);
  const efectiva = unidadesDelConsorcio.reduce(
    (sum, u) => sum + (u.expensaMensual - (u.estado === "pagado" ? 0 : u.saldoPendiente)),
    0
  );
  consorcio.recaudacionEsperada = esperada;
  consorcio.recaudacionEfectiva = Math.max(0, efectiva);
  const pctPagado = Math.round((efectiva / esperada) * 100);
  consorcio.porcentajeConciliadoAuto = Math.max(35, Math.min(98, pctPagado - seededInt(rng, 0, 6)));
  consorcio.estado = pctPagado >= 90 ? "al-dia" : pctPagado >= 75 ? "con-demoras" : "critico";
});

// ---------------------------------------------------------------------------
// Transacciones bancarias pendientes de conciliar
// ---------------------------------------------------------------------------

let txCounter = 0;
function nuevaTx(base: Omit<TransaccionBancaria, "id" | "aprobado">): TransaccionBancaria {
  txCounter += 1;
  return { ...base, id: `tx-${txCounter}`, aprobado: false };
}

const FECHA_BASE = new Date("2026-08-01");
function fechaHaceDias(dias: number): string {
  const d = new Date(FECHA_BASE);
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

function nombreParaExtracto(nombre: string): string {
  const partes = nombre.split(" ");
  return `${partes[partes.length - 1].toUpperCase()} ${partes[0].toUpperCase()}`;
}

const unidadesElegibles = shuffle(rng, unidades);
let cursor = 0;
function siguienteUnidad(): UnidadFuncional {
  const u = unidadesElegibles[cursor % unidadesElegibles.length];
  cursor += 1;
  return u;
}

const transaccionesGeneradas: TransaccionBancaria[] = [];

// 18 auto-matches de alta confianza (pago completo del mes)
for (let i = 0; i < 18; i++) {
  const unidad = siguienteUnidad();
  const consorcioId = unidad.consorcioId;
  const banco = pick(rng, BANCOS);
  const esMP = banco === "Mercado Pago" || banco === "Ualá";
  transaccionesGeneradas.push(
    nuevaTx({
      fecha: fechaHaceDias(seededInt(rng, 0, 6)),
      banco,
      descripcionCruda: esMP
        ? `PAGO QR ${banco.toUpperCase()} - ${nombreParaExtracto(unidad.titular)} - CVU *${seededInt(rng, 1000, 9999)}`
        : `TRANSFERENCIA RECIBIDA CBU 07${seededInt(rng, 10000000, 99999999)}${seededInt(rng, 100000, 999999)} - ${nombreParaExtracto(unidad.titular)}`,
      monto: unidad.expensaMensual,
      consorcioId,
      unidadSugeridaId: unidad.id,
      confianza: seededInt(rng, 92, 99),
      estadoMatch: "auto",
    })
  );
}

// 5 casos "a revisar" — nombre parcial / confianza media
for (let i = 0; i < 5; i++) {
  const unidad = siguienteUnidad();
  const banco = pick(rng, BANCOS);
  transaccionesGeneradas.push(
    nuevaTx({
      fecha: fechaHaceDias(seededInt(rng, 1, 8)),
      banco,
      descripcionCruda: `TRANSFERENCIA RECIBIDA - ${nombreParaExtracto(unidad.titular).slice(0, 12)}`,
      monto: unidad.expensaMensual,
      consorcioId: unidad.consorcioId,
      unidadSugeridaId: unidad.id,
      confianza: seededInt(rng, 63, 84),
      estadoMatch: "revision",
      motivoAlerta: "Nombre parcial en el extracto, verificar titular antes de aprobar.",
    })
  );
}

// 4 pagos parciales
for (let i = 0; i < 4; i++) {
  const unidad = siguienteUnidad();
  const banco = pick(rng, BANCOS);
  const faltante = Math.round((unidad.expensaMensual * (0.15 + rng() * 0.25)) / 100) * 100;
  const monto = unidad.expensaMensual - faltante;
  transaccionesGeneradas.push(
    nuevaTx({
      fecha: fechaHaceDias(seededInt(rng, 0, 5)),
      banco,
      descripcionCruda: `TRANSFERENCIA RECIBIDA - ${nombreParaExtracto(unidad.titular)}`,
      monto,
      consorcioId: unidad.consorcioId,
      unidadSugeridaId: unidad.id,
      confianza: seededInt(rng, 80, 93),
      estadoMatch: "revision",
      esPagoParcial: true,
      diferenciaMonto: monto - unidad.expensaMensual,
      motivoAlerta: `Pago parcial: faltan $${faltante.toLocaleString("es-AR")} para cubrir la expensa completa.`,
    })
  );
}

// 3 pagos con diferencia por interés (unidades con mora)
const unidadesConMora = unidades.filter((u) => u.estado === "vencido");
for (let i = 0; i < Math.min(3, unidadesConMora.length); i++) {
  const unidad = unidadesConMora[i];
  const banco = pick(rng, BANCOS);
  const monto = unidad.expensaMensual + unidad.interesAcumulado;
  transaccionesGeneradas.push(
    nuevaTx({
      fecha: fechaHaceDias(seededInt(rng, 0, 4)),
      banco,
      descripcionCruda: `TRANSFERENCIA RECIBIDA - ${nombreParaExtracto(unidad.titular)} (INC. INTERES)`,
      monto,
      consorcioId: unidad.consorcioId,
      unidadSugeridaId: unidad.id,
      confianza: seededInt(rng, 88, 96),
      estadoMatch: "revision",
      diferenciaMonto: unidad.interesAcumulado,
      motivoAlerta: `Incluye interés por mora ($${unidad.interesAcumulado.toLocaleString("es-AR")}). Verificar cálculo antes de aprobar.`,
    })
  );
}

// 4 transacciones sin CUIT identificado, con sugerencias alternativas basadas en historial
for (let i = 0; i < 4; i++) {
  const consorcio = pick(rng, consorcios);
  const candidatas = shuffle(
    rng,
    unidades.filter((u) => u.consorcioId === consorcio.id)
  ).slice(0, 3);
  const montoRef = candidatas[0]?.expensaMensual ?? 150_000;
  const sugerencias: SugerenciaMatch[] = candidatas.map((u, idx) => ({
    unidadId: u.id,
    confianza: 75 - idx * 18 + seededInt(rng, -4, 4),
    motivo:
      idx === 0
        ? "Mismo banco y monto que transferencias anteriores de esta unidad"
        : "Monto similar a expensas históricas de esta unidad",
  }));
  transaccionesGeneradas.push(
    nuevaTx({
      fecha: fechaHaceDias(seededInt(rng, 0, 7)),
      banco: pick(rng, BANCOS),
      descripcionCruda: `DEPOSITO TRANSFERENCIA - SIN IDENTIFICAR - SUC ${seededInt(rng, 100, 999)}`,
      monto: montoRef,
      consorcioId: consorcio.id,
      unidadSugeridaId: null,
      confianza: 0,
      estadoMatch: "sin-match",
      sugerenciasAlternativas: sugerencias,
      motivoAlerta: "Sin datos de titular en el extracto. La IA propone posibles unidades según historial.",
    })
  );
}

// 2 posibles duplicados
for (let i = 0; i < 2; i++) {
  const unidad = siguienteUnidad();
  const banco = pick(rng, BANCOS);
  const fecha = fechaHaceDias(seededInt(rng, 0, 3));
  const descripcion = `TRANSFERENCIA RECIBIDA - ${nombreParaExtracto(unidad.titular)}`;
  transaccionesGeneradas.push(
    nuevaTx({
      fecha,
      banco,
      descripcionCruda: descripcion,
      monto: unidad.expensaMensual,
      consorcioId: unidad.consorcioId,
      unidadSugeridaId: unidad.id,
      confianza: seededInt(rng, 90, 97),
      estadoMatch: "auto",
    })
  );
  transaccionesGeneradas.push(
    nuevaTx({
      fecha,
      banco,
      descripcionCruda: descripcion,
      monto: unidad.expensaMensual,
      consorcioId: unidad.consorcioId,
      unidadSugeridaId: unidad.id,
      confianza: seededInt(rng, 90, 97),
      estadoMatch: "duplicado",
      motivoAlerta: "Posible pago duplicado: misma cuenta, monto y fecha que otra transacción.",
    })
  );
}

export const transacciones: TransaccionBancaria[] = shuffle(rng, transaccionesGeneradas);

export const reglasIniciales: ReglaConciliacion[] = [];

export const actividadReciente: ActividadReciente[] = [
  {
    id: "act-1",
    tipo: "pago",
    descripcion: `${unidades[0].titular} (${unidades[0].unidad}) conciliado automáticamente — $${unidades[0].expensaMensual.toLocaleString("es-AR")}`,
    fecha: "2026-08-01T09:14:00",
    consorcioId: unidades[0].consorcioId,
  },
  {
    id: "act-2",
    tipo: "recordatorio",
    descripcion: `WhatsApp con Magic Link enviado a ${unidadesConMora[0]?.titular ?? "un propietario"} (${unidadesConMora[0]?.unidad ?? ""})`,
    fecha: "2026-08-01T08:40:00",
    consorcioId: unidadesConMora[0]?.consorcioId,
  },
  {
    id: "act-3",
    tipo: "alerta",
    descripcion: "Posible pago duplicado detectado en el extracto de Banco Galicia",
    fecha: "2026-07-31T19:02:00",
  },
  {
    id: "act-4",
    tipo: "conciliacion",
    descripcion: "Extracto Banco Galicia (agosto) procesado — 18 transacciones, 15 auto-conciliadas",
    fecha: "2026-07-31T11:20:00",
  },
  {
    id: "act-5",
    tipo: "pago",
    descripcion: `${unidades[1].titular} (${unidades[1].unidad}) conciliado automáticamente — $${unidades[1].expensaMensual.toLocaleString("es-AR")}`,
    fecha: "2026-07-30T17:55:00",
    consorcioId: unidades[1].consorcioId,
  },
];

export const bancosDisponibles = BANCOS;
