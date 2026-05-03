import Link from "next/link";
import { Chip } from "./chip";
import { GENESIS_HREF } from "@/lib/genesis";

export function GenesisChip({ asLink = true }: { asLink?: boolean }) {
  const inner = <Chip tone="steel">Genesis</Chip>;
  if (!asLink) return inner;
  return (
    <Link
      href={GENESIS_HREF}
      onClick={(e) => e.stopPropagation()}
      style={{ textDecoration: "none" }}
    >
      {inner}
    </Link>
  );
}
