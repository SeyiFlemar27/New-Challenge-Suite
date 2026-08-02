import type {Metadata} from "next";import {ForTalentExperience} from "@/components/public-site/for-talent-experience";
export const metadata:Metadata={title:"For Talent",description:"Discover challenges, submit your work and build a public competition record on Challenge Suite.",alternates:{canonical:"/for-talent"},openGraph:{title:"Turn your skills into opportunities worth competing for.",description:"Join Challenge Suite as talent.",url:"/for-talent"}};
export default function ForTalentPage(){return <ForTalentExperience/>}
