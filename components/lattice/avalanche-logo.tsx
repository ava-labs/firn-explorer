export function AvalancheLogo({
  size = 22,
  color = "var(--accent)",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        fill={color}
        d="M10.4253 5.7993a1 1 0 0 0 0-1L8.9427 2.4313a1 1 0 0 0-1.732 0L1.4547 12.2a1 1 0 0 0 .866 1.5h2.9653a1 1 0 0 0 .8667-.5l4.2727-7.4Zm3.4067 7.9013a1 1 0 0 0 .8667-1.5l-2.0894-3.6187a1 1 0 0 0-1.732 0l-2.0893 3.6187a1 1 0 0 0 .866 1.5h4.1787Z"
      />
    </svg>
  );
}
