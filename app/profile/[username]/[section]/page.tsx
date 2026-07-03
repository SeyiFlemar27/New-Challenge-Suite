import { PublicProfileView } from "@/components/social/public-profile";

export default async function PublicProfileSectionPage({ params }: { params: Promise<{ username: string; section: string }> }) {
  const { username, section } = await params;
  return <PublicProfileView username={username} initialSection={section} />;
}
