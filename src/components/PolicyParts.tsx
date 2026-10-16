import Link from 'next/link';
import type { ReactNode } from 'react';

/** Layout shared by the English and Korean privacy policies. */
export function PolicyPage({
  lang,
  title,
  switchTo,
  children,
}: {
  lang: 'en' | 'ko';
  title: string;
  switchTo: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <main lang={lang} className="mx-auto w-full max-w-2xl px-5 pb-20 pt-10 sm:pt-16">
      <div className="flex items-center justify-between text-sm">
        <Link href="/" className="text-ink-faint hover:text-ink">
          &larr; CalDrop
        </Link>
        <Link href={switchTo.href} className="text-ink-faint hover:text-ink">
          {switchTo.label}
        </Link>
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">{title}</h1>
      {children}
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

export function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-black/[0.06]">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="bg-black/[0.03] text-ink">
          <tr>
            {head.map((cell) => (
              <th key={cell} className="px-3 py-2 font-medium">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]} className="border-t border-black/[0.06] align-top">
              {row.map((cell, index) => (
                <td key={index} className="px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
