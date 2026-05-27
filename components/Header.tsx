'use client';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  return (
    <div className="mb-8">
      <h1 className="text-4xl font-black tracking-tight text-slate-950 dark:text-white">
        {title}
      </h1>

      {subtitle && (
        <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-400 sm:text-base">
          {subtitle}
        </p>
      )}
    </div>
  );
}