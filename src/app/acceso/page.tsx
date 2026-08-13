export default async function AccesoPage({ searchParams }: { searchParams: Promise<{ requested?: string }> }) {
  const requested = (await searchParams).requested === "1";
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center p-6">
      <form action="/api/pilot-access/request" method="post" className="w-full space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div><h1 className="text-xl font-bold">Acceso a ConcilIA</h1><p className="mt-1 text-sm text-slate-600">Ingresá tu email para recibir un enlace de acceso.</p></div>
        <label className="block text-sm font-medium">Email<input required name="email" type="email" autoComplete="email" className="mt-1 w-full rounded border p-2" /></label>
        <button className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white" type="submit">Solicitar acceso</button>
        {requested ? <p className="text-sm text-slate-600">Si el acceso está habilitado, vas a recibir un enlace para ingresar.</p> : null}
      </form>
    </main>
  );
}
