"use server";

import { redirect } from "next/navigation";
import { bootstrapCredentialsAreValid, establishSessionForEmail } from "@/lib/auth/session";

export async function iniciarSesionAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!bootstrapCredentialsAreValid(email, password)) throw new Error("Credenciales inválidas o acceso no configurado.");
  await establishSessionForEmail(email);
  redirect("/");
}
