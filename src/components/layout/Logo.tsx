import Image from "next/image";
import Link from "next/link";

/** Logo completo (isotipo + wordmark) — usado en el Sidebar / navbar principal. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="ConcilIA — Ir al inicio"
      className={`inline-flex items-center ${className}`}
    >
      <Image
        src="/logo.svg"
        alt="Logo ConcilIA"
        width={168}
        height={48}
        priority
        unoptimized
        className="h-8 w-auto dark:hidden sm:h-9"
      />
      <Image
        src="/logo-dark.svg"
        alt="Logo ConcilIA"
        width={168}
        height={48}
        priority
        unoptimized
        className="hidden h-8 w-auto dark:block sm:h-9"
      />
    </Link>
  );
}

/** Isotipo solo (la "C" azul) — usado en espacios angostos, como el Topbar en mobile. */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="ConcilIA — Ir al inicio"
      className={`inline-flex items-center ${className}`}
    >
      <Image
        src="/logo-mark.svg"
        alt="Logo ConcilIA"
        width={32}
        height={32}
        unoptimized
        className="h-7 w-7"
      />
    </Link>
  );
}
