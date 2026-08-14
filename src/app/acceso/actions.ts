"use server";

import { redirect } from "next/navigation";
import { bootstrapCredentialsAreValid, clearSession, establishSessionForEmail } from "@/lib/auth/session";

export async function iniciarSesionAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!bootstrapCredentialsAreValid(email, password)) throw new Error("Credenciales inválidas o acceso no configurado.");
  await establishSessionForEmail(email);
  redirect("/");
}

/** UX-2 — logout real, server-side. Destino siempre fijo (nunca derivado de
 * ningún input): no hay forma de convertir esto en un open redirect.
 * Idempotente — clearSession() borra la cookie exista o no, sin error. */
export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/acceso");
}
