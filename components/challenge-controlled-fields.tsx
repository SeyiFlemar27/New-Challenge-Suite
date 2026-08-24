"use client";

import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api/client";
import { NORMAL_CHALLENGE_CATEGORIES } from "@/lib/normal-challenge-config";
import { Button, Field, inputClass } from "@/components/ui";

export function ChallengeTaxonomyFields({ category, subcategory, onCategory, onSubcategory }: { category: string; subcategory: string; onCategory: (value: string) => void; onSubcategory: (value: string) => void }) {
  const selected = NORMAL_CHALLENGE_CATEGORIES.find((item) => item.label === category);
  const legacyCategory = Boolean(category && !selected);
  const legacySubcategory = Boolean(subcategory && !selected?.subcategories.some((item) => item === subcategory));
  return <>
    <Field label="Category"><select className={inputClass} value={category} onChange={(event) => { onCategory(event.target.value); onSubcategory(""); }}><option value="">Choose category</option>{legacyCategory ? <option value={category} disabled>Legacy value: {category} (choose a replacement)</option> : null}{NORMAL_CHALLENGE_CATEGORIES.map((item) => <option key={item.label} value={item.label}>{item.label}</option>)}</select></Field>
    <Field label="Subcategory"><select className={inputClass} value={subcategory} disabled={!selected} onChange={(event) => onSubcategory(event.target.value)}><option value="">Choose subcategory</option>{legacySubcategory ? <option value={subcategory} disabled>Legacy value: {subcategory} (choose a replacement)</option> : null}{selected?.subcategories.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
  </>;
}

type AccountOption = { id: string; displayName: string; username: string | null };

export function RegisteredAccountPicker({ selectedIds, onChange }: { selectedIds: string[]; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AccountOption[]>([]);
  const [selected, setSelected] = useState<AccountOption[]>([]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (query.trim().length < 2) return setResults([]);
      void apiRequest<{ accounts: AccountOption[] }>(`/api/accounts/search?q=${encodeURIComponent(query.trim())}&purpose=judge`).then((result) => setResults(result.ok ? result.data?.accounts ?? [] : []));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  function add(account: AccountOption) {
    if (selectedSet.has(account.id)) return;
    const ids = [...selectedIds, account.id];
    setSelected((current) => [...current.filter((item) => item.id !== account.id), account]);
    onChange(ids);
    setQuery("");
    setResults([]);
  }
  function remove(id: string) {
    setSelected((current) => current.filter((item) => item.id !== id));
    onChange(selectedIds.filter((item) => item !== id));
  }
  return <Field label="Assigned judges"><div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 text-slate-400" size={17} /><input className={`${inputClass} pl-10`} role="combobox" aria-expanded={results.length > 0} aria-controls="judge-account-results" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search registered accounts" />{results.length ? <div id="judge-account-results" role="listbox" className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-[8px] border border-slate-200 bg-white p-2 shadow-xl">{results.map((account) => <button type="button" role="option" aria-selected={selectedSet.has(account.id)} key={account.id} onClick={() => add(account)} className="flex min-h-11 w-full items-center justify-between rounded-[8px] px-3 text-left text-sm hover:bg-amber-50"><span><b>{account.displayName}</b>{account.username ? <small className="ml-2 text-slate-500">@{account.username}</small> : null}</span></button>)}</div> : null}</div><div className="mt-3 flex flex-wrap gap-2">{selectedIds.map((id) => { const account = selected.find((item) => item.id === id); return <span key={id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold">{account?.displayName ?? "Selected account"}<button type="button" onClick={() => remove(id)} aria-label="Remove selected judge"><X size={14} /></button></span>; })}</div>{selectedIds.length ? <Button type="button" variant="ghost" className="mt-2" onClick={() => { setSelected([]); onChange([]); }}>Clear judges</Button> : null}<p className="mt-2 text-xs text-slate-500">Only registered Challenge Suite accounts can be assigned. Authorization is rechecked server-side.</p></Field>;
}
