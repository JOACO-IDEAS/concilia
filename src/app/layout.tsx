import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Sidebar } from "@/components/layout/Sidebar";
import { PageTransition } from "@/components/layout/PageTransition";
import { ChunkErrorRecovery } from "@/components/layout/ChunkErrorRecovery";
import { ToastProvider } from "@/components/ui/Toast";
import { AppStoreProvider } from "@/lib/store";
import { MobileNavProvider } from "@/lib/mobile-nav";
import { AuthenticationError, requireCurrentAdministrator } from "@/lib/auth/session";
import { PRIVATE_ROUTE_HEADER } from "@/lib/auth/private-route";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ConciliIA — Control operativo para Administradores de Consorcios",
  description:
    "ConciliIA es el panel operativo exclusivo para administradores de consorcios: la IA prepara el match de cada pago, vos aprobás en 1 clic. Menos horas de planilla, más control sobre cada edificio y Unidad Funcional.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  if (requestHeaders.get(PRIVATE_ROUTE_HEADER) === "1") {
    try {
      await requireCurrentAdministrator();
    } catch (error) {
      if (error instanceof AuthenticationError) redirect("/acceso");
      throw error;
    }
  }
  return (
    <html
      lang="es-AR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-full min-h-screen overflow-x-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <ChunkErrorRecovery />
        <AppStoreProvider>
          <MobileNavProvider>
            <ToastProvider>
              <Sidebar />
              <div className="flex min-h-screen min-w-0 flex-1 flex-col">
                <PageTransition>{children}</PageTransition>
              </div>
            </ToastProvider>
          </MobileNavProvider>
        </AppStoreProvider>
      </body>
    </html>
  );
}
