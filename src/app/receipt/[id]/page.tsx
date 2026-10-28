import type { Metadata } from "next";
import { ReceiptView } from "@/components/reveal/receipt-view";
import { MinimalShell } from "@/components/site/minimal-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Secret receipt",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <MinimalShell>
      <ReceiptView id={id} />
    </MinimalShell>
  );
}
