"use client";
import { useEffect, useState } from "react";
import { DEFAULT_LANGUAGE, normalizeLanguage, readBrowserLanguagePreference, translate } from "@/lib/i18n/config";
export function useLanguage(){const [language,setLanguage]=useState(DEFAULT_LANGUAGE);useEffect(()=>{setLanguage(readBrowserLanguagePreference());const change=(event:Event)=>setLanguage(normalizeLanguage((event as CustomEvent).detail));window.addEventListener("challenge-suite-language-change",change);return()=>window.removeEventListener("challenge-suite-language-change",change)},[]);return {language,t:(key:Parameters<typeof translate>[1])=>translate(language,key)}}
