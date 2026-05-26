'use client';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  return (
    <div className="mb-8">
      <h1 className="text-4xl font-bold text-white">{title}</h1>
      {subtitle && <p className="text-slate-400 mt-2">{subtitle}</p>}
    </div>
  );
}
