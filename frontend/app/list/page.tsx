import { ComingSoon } from "@/components/coming-soon";

export default function ListPage() {
  return (
    <ComingSoon
      title="List an item"
      checkpoint={4}
      what="Three steps: describe the item and set the daily price and deposit, upload two photos and wait for the moderation agent, then preview and publish."
    />
  );
}
