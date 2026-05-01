export function TriangleMark({
  size = 22,
  color = "var(--ink)",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <rect width="24" height="24" rx="6" fill={color} />
      <path d="M7.5 17l4.5-8 4.5 8h-2.7L12 13l-2 4H7.5z" fill="var(--bg)" />
    </svg>
  );
}
