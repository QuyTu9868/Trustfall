import { ComingSoon } from "@/components/coming-soon";

export default function RentalsPage() {
  return (
    <ComingSoon
      title="Rentals"
      checkpoint={6}
      what="Every rental you are part of, on either side, with its state shown as a strip: requested, approved, active, returned, completed. The countdown to the deposit release sits right under it."
    />
  );
}
