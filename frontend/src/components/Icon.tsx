export function Icon({ name, className }: { name: string; className?: string }) {
  const cls = className ? `material-symbols-rounded ${className}` : 'material-symbols-rounded'
  return <span className={cls}>{name}</span>
}

