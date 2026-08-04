/**
 * Seed script — carga datos ficticios para probar el modelo de
 * Administración / Contactos / Facturación.
 *
 * Uso: npx prisma db seed   (requiere DATABASE_URL configurada en .env —
 * ver .env.example. Sin una base de datos real conectada, este script no
 * tiene contra qué correr todavía.)
 *
 * Usa `upsert` en cada paso para que sea re-ejecutable sin duplicar datos
 * (idempotente), siguiendo las buenas prácticas de seeding de Prisma.
 */
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// `.env.local` (generado por `vercel env pull` / `vercel integration add`)
// pisa a `.env`, igual que en prisma.config.ts.
loadEnv();
loadEnv({ path: ".env.local", override: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL no está definida. Copiá .env.example a .env y completá la conexión antes de seedear."
  );
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  // 1. Administrator — el estudio que gestiona los consorcios.
  const administrador = await prisma.administrator.upsert({
    where: { email: "contacto@estudiofernandez.com.ar" },
    update: {},
    create: {
      name: "Estudio Fernández Administraciones",
      email: "contacto@estudiofernandez.com.ar",
    },
  });

  // 2. Organizations — dos consorcios de ejemplo, ambos gestionados por el
  //    mismo administrador (relación M:N vía OrganizationAdministrator).
  const cabildo = await prisma.organization.upsert({
    where: { taxId: "30-71234567-8" },
    update: {},
    create: {
      name: "Consorcio Av. Cabildo 2450",
      legalName: "Consorcio de Propietarios Av. Cabildo 2450",
      taxId: "30-71234567-8",
      address: "Av. Cabildo 2450, Belgrano, CABA",
      status: "ACTIVE",
      administrators: { create: { administratorId: administrador.id } },
    },
  });

  const yacht = await prisma.organization.upsert({
    where: { taxId: "30-71298765-4" },
    update: {},
    create: {
      name: "Edificio Torres del Yacht",
      legalName: "Consorcio de Propietarios Torres del Yacht",
      taxId: "30-71298765-4",
      address: "Av. Alicia Moreau de Justo 1780, Puerto Madero, CABA",
      status: "ACTIVE",
      administrators: { create: { administratorId: administrador.id } },
    },
  });

  // 3. Contacts — una contadora que atiende los DOS consorcios (demuestra
  //    la relación N:M Contact↔Organization) y un presidente puntual del
  //    segundo. La contadora es contacto primario en Cabildo pero
  //    secundario en Torres del Yacht — esa distinción vive en
  //    ContactOrganization, no en Contact.
  const contadora = await prisma.contact.upsert({
    where: { id: "seed-contact-contadora" },
    update: {},
    create: {
      id: "seed-contact-contadora",
      firstName: "Marina",
      lastName: "Ibarra",
      jobTitle: "Contadora",
      organizations: {
        create: [
          { organizationId: cabildo.id, isPrimaryContact: true },
          { organizationId: yacht.id, isPrimaryContact: false },
        ],
      },
    },
  });

  const presidente = await prisma.contact.upsert({
    where: { id: "seed-contact-presidente" },
    update: {},
    create: {
      id: "seed-contact-presidente",
      firstName: "Julián",
      lastName: "Bertone",
      jobTitle: "Presidente del consorcio",
      organizations: {
        create: [{ organizationId: yacht.id, isPrimaryContact: true }],
      },
    },
  });

  // 4. Contact Channels — cadenas de cobranza/notificación. Incluye un
  //    canal ligado a una persona (contadora) y uno genérico de la
  //    organización (casilla compartida, sin contactId).
  await prisma.contactChannel.upsert({
    where: {
      organizationId_type_value: {
        organizationId: cabildo.id,
        type: "EMAIL",
        value: "marina.ibarra@estudiofernandez.com.ar",
      },
    },
    update: {},
    create: {
      organizationId: cabildo.id,
      contactId: contadora.id,
      type: "EMAIL",
      value: "marina.ibarra@estudiofernandez.com.ar",
      purpose: "BILLING",
      isVerified: true,
    },
  });

  await prisma.contactChannel.upsert({
    where: {
      organizationId_type_value: {
        organizationId: cabildo.id,
        type: "EMAIL",
        value: "facturacion@consorciocabildo.com.ar",
      },
    },
    update: {},
    create: {
      organizationId: cabildo.id,
      contactId: null, // casilla genérica del consorcio, no de una persona
      type: "EMAIL",
      value: "facturacion@consorciocabildo.com.ar",
      purpose: "BILLING",
      isVerified: false,
    },
  });

  await prisma.contactChannel.upsert({
    where: {
      organizationId_type_value: {
        organizationId: yacht.id,
        type: "WHATSAPP",
        value: "+54 9 11 5588-1120",
      },
    },
    update: {},
    create: {
      organizationId: yacht.id,
      contactId: presidente.id,
      type: "WHATSAPP",
      value: "+54 9 11 5588-1120",
      purpose: "NOTIFICATIONS",
      isVerified: true,
    },
  });

  // 5. Billing Profiles — datos fiscales/bancarios por consorcio.
  await prisma.billingProfile.upsert({
    where: { id: "seed-billing-cabildo" },
    update: {},
    create: {
      id: "seed-billing-cabildo",
      organizationId: cabildo.id,
      taxCondition: "Exento",
      bankAccountType: "CBU",
      bankAccountNumber: "0720123888000012345678",
      billingCurrency: "ARS",
      paymentTerms: "30 días",
      isDefault: true,
    },
  });

  await prisma.billingProfile.upsert({
    where: { id: "seed-billing-yacht" },
    update: {},
    create: {
      id: "seed-billing-yacht",
      organizationId: yacht.id,
      taxCondition: "Exento",
      bankAccountType: "ALIAS",
      bankAccountNumber: "torres.yacht.consorcio",
      billingCurrency: "ARS",
      paymentTerms: "15 días",
      isDefault: true,
    },
  });

  console.log("✅ Seed completo:");
  console.log(`   Administrator: ${administrador.name}`);
  console.log(`   Organizations: ${cabildo.name} · ${yacht.name}`);
  console.log(
    `   Contacts: ${contadora.firstName} ${contadora.lastName} (ambos consorcios) · ${presidente.firstName} ${presidente.lastName} (Torres del Yacht)`
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
