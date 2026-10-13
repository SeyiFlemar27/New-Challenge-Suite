"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api/client";
import { SUPPORT_CATEGORIES } from "@/lib/support/catalog";
import { Button, Card } from "@/components/ui";

type Article = { id: string; title: string; slug: string; summary: string; body: string; category: string; status: "draft" | "published" | "archived"; featured?: boolean; sortOrder?: number; updatedAt?: string };
type Draft = Omit<Article, "id" | "status" | "updatedAt"> & { status: "draft" | "published" };
const emptyDraft: Draft = { title: "", slug: "", summary: "", body: "", category: "other", status: "draft", featured: false, sortOrder: 100 };

export function AdminSupportKnowledge() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [selected, setSelected] = useState<Article | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const categories = useMemo(() => Object.entries(SUPPORT_CATEGORIES), []);

  async function load() {
    setLoading(true);
    const result = await apiRequest<{ articles: Article[] }>("/api/admin/help/articles");
    if (result.data) setArticles(result.data.articles);
    else setNotice(result.message);
    setLoading(false);
  }
  useEffect(() => {
    let active = true;
    void apiRequest<{ articles: Article[] }>("/api/admin/help/articles").then((result) => {
      if (!active) return;
      if (result.data) setArticles(result.data.articles);
      else setNotice(result.message);
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setNotice("Help articles could not be loaded.");
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  function edit(article: Article) {
    setSelected(article);
    const { id: _id, updatedAt: _updatedAt, ...content } = article;
    setDraft({ ...content, status: article.status === "published" ? "published" : "draft" });
  }
  function startNew() { setSelected(null); setDraft(emptyDraft); setNotice(""); setChangeReason(""); setConfirmed(false); }
  function update<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft((current) => ({ ...current, [key]: value })); }
  async function save() {
    setBusy(true);
    const response = selected
      ? await apiRequest<{ article: Article }>("/api/admin/help/articles", { method: "PATCH", body: JSON.stringify({ ...draft, articleId: selected.id, expectedUpdatedAt: selected.updatedAt, reason: changeReason.trim(), confirmed }) })
      : await apiRequest<{ article: Article }>("/api/admin/help/articles", { method: "POST", body: JSON.stringify({ ...draft, reason: changeReason.trim(), confirmed }) });
    setNotice(response.message);
    setBusy(false);
    if (response.data?.article) { setSelected(response.data.article); setChangeReason(""); setConfirmed(false); await load(); }
  }
  async function archive(article: Article) {
    if (archiveReason.trim().length < 8 || !window.confirm(`Archive “${article.title}”? The public article will no longer be visible.`)) return;
    setBusy(true);
    const response = await apiRequest("/api/admin/help/articles", { method: "DELETE", body: JSON.stringify({ articleId: article.id, reason: archiveReason.trim(), confirmed: true }) });
    setNotice(response.message); setBusy(false); setArchiveReason("");
    if (response.ok) { if (selected?.id === article.id) startNew(); await load(); }
  }

  return <section aria-labelledby="support-knowledge-title" className="mt-8">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-widest text-[var(--gold)]">Customer Help Center</p><h2 id="support-knowledge-title" className="mt-1 text-2xl font-black">Knowledge articles</h2><p className="mt-1 text-sm text-slate-400">Public articles are published only after an authorized Admin saves them as published.</p></div><Button variant="secondary" onClick={startNew}>New article</Button></div>
    {notice ? <p role="status" className="mb-4 text-sm">{notice}</p> : null}
    <div className="grid gap-5 xl:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.5fr)]">
      <Card className="max-h-[42rem] overflow-y-auto p-3"><h3 className="px-2 py-2 text-sm font-black">Articles</h3>{loading ? <p className="p-3 text-sm text-slate-400">Loading articles…</p> : articles.map((article) => <div key={article.id} className="border-t border-white/10 p-2"><button type="button" onClick={() => edit(article)} className="w-full rounded p-2 text-left hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--gold)]"><span className="block text-xs font-bold uppercase text-[var(--gold)]">{article.status} · {article.category.replaceAll("_", " ")}</span><span className="mt-1 block font-bold">{article.title}</span></button>{article.status !== "archived" ? <div className="px-2 pb-2"><label className="block text-xs text-slate-400">Reason to archive<input value={selected?.id === article.id ? archiveReason : ""} onChange={(event) => setArchiveReason(event.target.value)} className="mt-1 min-h-9 w-full rounded border border-white/10 bg-black/20 px-2" maxLength={500} /></label><button type="button" onClick={() => void archive(article)} disabled={busy || archiveReason.trim().length < 8} className="mt-2 text-xs font-bold text-rose-300 underline disabled:opacity-50">Archive article</button></div> : null}</div>)}{!loading && articles.length === 0 ? <p className="p-3 text-sm text-slate-400">No customer help articles yet.</p> : null}</Card>
      <Card className="space-y-4 p-5"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-black">{selected ? "Edit article" : "Create article"}</h3>{selected ? <span className="text-xs text-slate-400">Version updated {selected.updatedAt ?? ""}</span> : null}</div>
        <label className="block text-sm font-bold">Title<input value={draft.title} onChange={(event) => update("title", event.target.value)} minLength={5} maxLength={180} className="mt-2 min-h-11 w-full rounded border border-white/10 bg-black/20 px-3" /></label>
        <label className="block text-sm font-bold">URL slug<input value={draft.slug} onChange={(event) => update("slug", event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={180} className="mt-2 min-h-11 w-full rounded border border-white/10 bg-black/20 px-3" /></label>
        <label className="block text-sm font-bold">Category<select value={draft.category} onChange={(event) => update("category", event.target.value)} className="mt-2 min-h-11 w-full rounded border border-white/10 bg-black/20 px-3">{categories.map(([id, value]) => <option key={id} value={id}>{value.label}</option>)}</select></label>
        <label className="block text-sm font-bold">Short summary<textarea value={draft.summary} onChange={(event) => update("summary", event.target.value)} minLength={10} maxLength={500} rows={2} className="mt-2 w-full rounded border border-white/10 bg-black/20 p-3" /></label>
        <label className="block text-sm font-bold">Article body<textarea value={draft.body} onChange={(event) => update("body", event.target.value)} minLength={20} maxLength={20_000} rows={12} className="mt-2 w-full rounded border border-white/10 bg-black/20 p-3" /><span className="mt-1 block text-xs font-normal text-slate-400">Plain text with preserved line breaks. Do not include personal or account-specific data.</span></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.featured === true} onChange={(event) => update("featured", event.target.checked)} />Feature on Help Center</label>
        <label className="block text-sm font-bold">Publication<select value={draft.status} onChange={(event) => update("status", event.target.value as Draft["status"])} className="mt-2 min-h-11 w-full rounded border border-white/10 bg-black/20 px-3"><option value="draft">Save as draft</option><option value="published">Publish</option></select></label>
        <label className="block text-sm font-bold">Reason for this content change<textarea value={changeReason} onChange={(event) => setChangeReason(event.target.value)} minLength={8} maxLength={500} rows={2} className="mt-2 w-full rounded border border-white/10 bg-black/20 p-3" /></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I reviewed this content and confirm the requested publication state.</span></label>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={startNew} disabled={busy}>Clear</Button><Button onClick={() => void save()} disabled={busy || !confirmed || changeReason.trim().length < 8 || draft.title.trim().length < 5 || draft.slug.length < 3 || draft.summary.trim().length < 10 || draft.body.trim().length < 20}>{busy ? "Saving…" : selected ? "Save changes" : "Save article"}</Button></div>
      </Card>
    </div>
  </section>;
}
