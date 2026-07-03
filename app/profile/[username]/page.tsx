import { PublicProfileView } from "@/components/social/public-profile";

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <PublicProfileView username={username} />;
}
