import { redirect } from "next/navigation";

/**
 * There is no list here any more. The profile is the list, and this page is now one
 * rental at a time under /rentals/[id].
 *
 * Redirecting rather than deleting, because the address is in muscle memory and in
 * whatever anybody bookmarked, and a 404 for a page that moved is a small betrayal.
 */
export default function RentalsIndex() {
  redirect("/profile");
}
