import { redirect } from "next/navigation";

/**
 * Moved onto the profile, which already listed the other half of your things. Two lists
 * of what you own, two clicks apart, was a split nobody could explain.
 *
 * Redirecting rather than deleting: the address was in the navbar for a while and is
 * therefore in somebody's history.
 */
export default function MyListingsMoved() {
  redirect("/profile");
}
