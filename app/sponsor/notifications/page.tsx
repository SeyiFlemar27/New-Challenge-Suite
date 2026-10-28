import { redirect } from "next/navigation";
/** All authorized workspaces use the person's shared inbox. */
export default function Page() { redirect("/notifications"); }
