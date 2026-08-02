import type {Metadata} from "next";import {PublicHome} from "@/components/public-site/public-home";
export const metadata:Metadata={title:"Challenge Suite",description:"Discover and create structured competitions.",alternates:{canonical:"/"}};
export default function LandingPage(){return <PublicHome/>}
