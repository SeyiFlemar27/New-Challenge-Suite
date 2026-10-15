"use client";
import { createContext, useContext } from "react";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Plus, Trash2 } from "lucide-react";
import { MediaUploadField, type MediaUploadStage, type UploadMetadata } from "@/components/media-upload-field";
import { Button, Field, LinkButton, inputClass, textareaClass } from "@/components/ui";
import { CHALLENGE_TIME_ZONE_OPTIONS, challengeDateTimeForStorage, formatChallengeLocalDateTime } from "@/lib/challenge-date-time";
import { NORMAL_FRONTEND_STEPS, normalStepIndex, type CreatorBasePrizeFunding } from "@/lib/normal-challenge-frontend";
import { calculateNormalWinnerAmountsCents, NORMAL_CHALLENGE_CATEGORIES } from "@/lib/normal-challenge-config";
import type { NormalChallengeForm, NormalMedia } from "@/lib/normal-challenge-builder-model";
import { validateNormalChallengeImage, validateNormalChallengeVideo } from "@/lib/normal-challenge-media";
import { challengeDraftMediaPath } from "@/lib/media-upload-paths";
import type { NormalChallengeReadiness } from "@/lib/normal-challenge-readiness";

type Props = {
  step: number;
  visibleStep?: number;
  stepCount?: number;
  form: NormalChallengeForm;
  update: <K extends keyof NormalChallengeForm>(key: K, value: NormalChallengeForm[K]) => void;
  userId: string;
  mediaDisabled: boolean;
  track: (key: string) => (value: MediaUploadStage) => void;
  readiness: NormalChallengeReadiness;
  edit: (step: number) => void;
  plan: string;
  showErrors?: boolean;
  draftId?: string;
  funding: CreatorBasePrizeFunding;
  fundBasePrize: () => void;
  refreshFunding: () => void;
  fundingBusy: boolean;
};

const StepPresentation = createContext<{ visibleStep?: number; stepCount?: number }>({});
function Heading({ step }: { step: number }) {
  const presentation = useContext(StepPresentation);
  const definition = NORMAL_FRONTEND_STEPS[step] ?? NORMAL_FRONTEND_STEPS[0];
  return <div className="max-w-2xl"><p className="text-xs font-black uppercase tracking-[0.14em] text-amber-700">Step {(presentation.visibleStep ?? step) + 1} of {presentation.stepCount ?? NORMAL_FRONTEND_STEPS.length}</p><h2 data-normal-step-heading tabIndex={-1} className="mt-2 text-3xl font-black tracking-normal text-slate-950 sm:text-4xl">{definition.title}</h2><p className="mt-3 text-base leading-7 text-slate-600">{definition.description}</p></div>;
}

function SelectField({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]>; disabled?: boolean }) {
  return <Field label={label}><select aria-label={label} className={inputClass} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></Field>;
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex min-h-11 items-start gap-3 text-sm font-bold leading-6 text-slate-700"><input className="mt-1 size-4 accent-amber-600" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label}><input className={inputClass} type="datetime-local" value={value} onChange={(event) => onChange(event.target.value)} /></Field>;
}

export function NormalChallengeBuilderStep(props: Props) {
  return <StepPresentation.Provider value={{ visibleStep: props.visibleStep, stepCount: props.stepCount }}><NormalChallengeBuilderStepContent {...props} /></StepPresentation.Provider>;
}
function NormalChallengeBuilderStepContent(props: Props) {
  const { step, form, update, userId, mediaDisabled, track, readiness, edit, plan, showErrors = false, draftId = "", funding, fundBasePrize, refreshFunding, fundingBusy } = props;
  const errors = showErrors ? Object.fromEntries(readiness.issues.filter((item) => item.step === step).map((item) => [item.field, item.message])) : {};
  const error = (field: string) => errors[field] ? <p id={`normal-${field}-error`} role="alert" className="mt-2 text-sm font-bold text-red-700">{errors[field]}</p> : null;
  const validationProps = (field: string) => ({ "aria-invalid": Boolean(errors[field]), "aria-describedby": errors[field] ? `normal-${field}-error` : undefined });
  const category = NORMAL_CHALLENGE_CATEGORIES.find((item) => item.label === form.category);

  if (step === 0) return <><Heading step={step} /><div className="mt-9 grid gap-7">
    <div data-field="title"><Field label="Challenge title *"><input className={inputClass} aria-required="true" {...validationProps("title")} maxLength={120} value={form.title} onChange={(event) => update("title", event.target.value)} /></Field>{error("title")}</div>
    <div className="grid gap-5 sm:grid-cols-2">
      <div data-field="category"><Field label="Category *"><select className={inputClass} aria-label="Category" aria-required="true" {...validationProps("category")} value={form.category} onChange={(event) => { update("category", event.target.value); update("subcategory", ""); }}><option value="">Choose category</option>{NORMAL_CHALLENGE_CATEGORIES.map((item) => <option key={item.label}>{item.label}</option>)}</select></Field>{error("category")}</div>
      <div data-field="subcategory"><Field label="Subcategory *"><select className={inputClass} disabled={!category} aria-label="Subcategory" aria-required="true" {...validationProps("subcategory")} value={form.subcategory} onChange={(event) => update("subcategory", event.target.value)}><option value="">Choose subcategory</option>{category?.subcategories.map((item) => <option key={item}>{item}</option>)}</select></Field>{error("subcategory")}</div>
    </div>
    <div data-field="description"><Field label="Full description *"><textarea className={textareaClass} aria-required="true" {...validationProps("description")} maxLength={1200} rows={8} value={form.description} onChange={(event) => update("description", event.target.value)} /></Field><p className="mt-2 text-xs text-slate-500">{form.description.length}/1,200 characters</p>{error("description")}</div>
    <Repeatable label="Challenge rules" values={form.rules} addLabel="Add Rule" placeholder="Optional rule" update={(values) => update("rules", values)} />
  </div></>;

  if (NORMAL_FRONTEND_STEPS[step]?.key === "monetization") {
    const basePrize = Number(form.basePrizeAmount || 0);
    const preservesLegacyTerms = form.builderVersion === "normal_v2";
    const preservesLegacyTwoWinnerTerms = preservesLegacyTerms && form.numberOfWinners === 2;
    const distribution = preservesLegacyTerms ? form.legacyWinnerPrizeAmountsCents : calculateNormalWinnerAmountsCents(Math.round(basePrize * 100), form.numberOfWinners);
    return <><Heading step={step} /><div className="mt-9 space-y-10">
      <Section label="Prize Pool">
        <div className="max-w-sm"><SelectField disabled={(funding.confirmedCents ?? 0) > 0} label="Number of winners" value={String(form.numberOfWinners)} onChange={(value) => { update("numberOfWinners", Number(value)); update("builderVersion", "normal_v3"); update("locationEligibility", "worldwide"); update("eligibleCountries", []); update("ageRestrictionMode", "none"); update("minimumAge", ""); }} options={[["1", "1 winner"], ...(preservesLegacyTwoWinnerTerms ? [["2", "2 winners (existing draft)"]] as Array<[string, string]> : []), ["3", "3 winners"]]} /></div>
        <div data-field="prizeValue" className="mt-5 max-w-sm"><Field label="Base prize (USD)"><div className="relative"><span className="absolute left-4 top-3.5 font-black text-slate-500">$</span><input aria-label="Base prize (USD)" className={`${inputClass} pl-8`} type="number" min="0" step="0.01" disabled={preservesLegacyTwoWinnerTerms || (funding.confirmedCents ?? 0) > 0} value={form.basePrizeAmount} onChange={(event) => { update("basePrizeAmount", event.target.value); update("builderVersion", "normal_v3"); update("locationEligibility", "worldwide"); update("eligibleCountries", []); update("ageRestrictionMode", "none"); update("minimumAge", ""); }} /></div></Field><p className="mt-2 text-xs text-slate-500">Optional for new unfunded prizes. Existing confirmed guarantees and winner allocations are preserved; contact Support before changing them. Leave blank or enter zero for no new creator Base Prize obligation. A positive amount must be fully confirmed before submission for review.</p>{preservesLegacyTwoWinnerTerms ? <p className="mt-2 text-xs text-slate-500">Choose one or three winners to update this legacy draft using current allocation rules.</p> : null}{error("prizeValue")}</div>
        <div className="mt-5 rounded-[8px] bg-slate-50 p-4"><p className="font-bold text-slate-950">Winner allocation · {preservesLegacyTerms ? `${form.legacyWinnerSplits.join("% / ")}% (existing draft)` : form.numberOfWinners === 1 ? "100%" : "60% / 25% / 15%"}</p><ol className="mt-3 grid gap-2 sm:grid-cols-3">{distribution.map((amount, index) => <li key={index} className="rounded-[8px] bg-white p-3 text-sm"><span className="font-bold text-slate-600">{ordinal(index + 1)} place</span><span className="mt-1 block font-black text-slate-950">{usd(amount / 100)}</span></li>)}</ol></div>
        <div className="mt-5 flex items-center justify-between rounded-[8px] bg-slate-50 px-4 py-4"><span className="text-sm font-bold text-slate-600">Base Prize</span><span className="text-xl font-black text-slate-950">{usd(basePrize)}</span></div>
        <p className="mt-3 text-sm leading-6 text-slate-600">A positive Base Prize is your guaranteed contribution to the winner pool. Sponsor funds, projected entry fees and voting revenue do not satisfy this creator funding obligation.</p>
        <BasePrizeFunding legacyBlocked={readiness.issues.some((issue) => issue.code.startsWith("LEGACY_"))} funding={funding} hasDraft={Boolean(draftId)} busy={fundingBusy} fund={fundBasePrize} refresh={refreshFunding} />
      </Section>
      {plan === "free" ? <div className="rounded-[8px] border border-amber-200 bg-amber-50 p-4"><p className="font-bold text-amber-950">Free plan</p><p className="mt-1 text-sm leading-6 text-amber-900">Your challenge can use free entry and a creator-funded prize. Paid entry, sponsor opportunities, and DoroCoin voting configuration are available on eligible paid plans.</p></div> : <>
        <p className="text-sm leading-6 text-slate-600">Eligible challenge-generated revenue is shared 65% to winners, 20% to the creator or host, and 15% to Challenge Suite. Confirmed prize-designated sponsor funds go entirely to the winner pool; creator Base Prize funding is separate.</p><Section label="Entry"><div className="grid gap-4 sm:grid-cols-2"><SelectField label="Entry type" value={form.paidEntryEnabled ? "paid" : "free"} onChange={(value) => update("paidEntryEnabled", value === "paid")} options={[["free", "Free Entry"], ["paid", "Paid Entry"]]} />{form.paidEntryEnabled ? <div data-field="entryFeeAmountCents"><Field label="Entry fee (USD)"><div className="relative"><span className="absolute left-4 top-3.5 font-black text-slate-500">$</span><input aria-label="Entry fee (USD)" className={`${inputClass} pl-8`} type="number" min="5" max="100000" step="0.01" value={form.entryFeeAmount} onChange={(event) => update("entryFeeAmount", event.target.value)} /></div></Field>{error("entryFeeAmountCents")}</div> : null}</div></Section>
      <Section label="Sponsorship"><Check label="Open this challenge to sponsors" checked={form.sponsorReady} onChange={(value) => update("sponsorReady", value)} /></Section>
      </>}
    </div></>;
  }

  if (NORMAL_FRONTEND_STEPS[step]?.key === "media") return <><Heading step={step} /><div className="mt-9 space-y-10">
    <Section label="Images"><div className="flex items-start justify-between gap-4"><p className="max-w-2xl text-sm leading-6 text-slate-600">Add a cover image and optional additional images.</p><span className="shrink-0 text-sm font-bold text-slate-500">{form.images.length}/3</span></div><div data-field="challengeImages" className="mt-5 grid gap-5 md:grid-cols-3">{[0, 1, 2].map((index) => { const item = form.images[index]; return <div key={index} className="min-w-0"><div className="mb-3 flex items-center justify-between gap-2"><p className="font-black">Image {index + 1}</p><span className="text-xs font-bold text-slate-500">{index === 0 ? "Required / Cover" : "Optional"}</span></div><MediaUploadField appearance="builder" label={`Image ${index + 1}`} value={item?.url} storagePath={challengeDraftMediaPath(userId, "gallery")} kind="image" maxSizeMb={5} required={index === 0} disabled={mediaDisabled} validateFile={validateNormalChallengeImage} onStatusChange={track(`image-${index}`)} onChange={(url, metadata) => setMediaAt(index, url, metadata, form, update)} />{item ? <div className="mt-3 flex gap-2"><Button variant="ghost" aria-label="Move image left" disabled={index === 0} onClick={() => moveMedia(index, index - 1, form, update)}><ArrowLeft size={16} /></Button><Button variant="ghost" aria-label="Move image right" disabled={index >= form.images.length - 1} onClick={() => moveMedia(index, index + 1, form, update)}><ArrowRight size={16} /></Button><Button variant="ghost" aria-label="Remove image" onClick={() => update("images", form.images.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></Button></div> : null}</div>; })}</div>{error("challengeImages")}</Section>
    <Section label="Video"><p className="mb-5 text-sm leading-6 text-slate-600">Add an optional challenge video.</p><div className="max-w-xl"><MediaUploadField appearance="builder" label="Challenge video" value={form.video?.url} storagePath={challengeDraftMediaPath(userId, "video")} kind="video" maxSizeMb={49} disabled={mediaDisabled} validateFile={validateNormalChallengeVideo} onStatusChange={track("video")} onChange={(url, metadata) => update("video", url && metadata ? mediaRecord("video", url, metadata) : null)} /></div>{error("challengeVideo")}</Section>
  </div></>;

  if (NORMAL_FRONTEND_STEPS[step]?.key === "schedule") return <><Heading step={step} /><div className="mt-9 space-y-8">
    <div data-field="timeZone" className="max-w-md"><Field label="Timezone *"><select aria-label="Timezone" aria-required="true" className={inputClass} value={form.timeZone} onChange={(event) => update("timeZone", event.target.value)}>{CHALLENGE_TIME_ZONE_OPTIONS.map((zone) => <option key={zone.value} value={zone.value}>{zone.label}</option>)}</select></Field><p className="mt-2 text-sm text-slate-600">All challenge times are shown in this timezone.</p>{error("timeZone")}</div>
    <div className="grid grid-cols-4 gap-2" aria-label="Challenge lifecycle">{["Join", "Submit", "Vote", "Results"].map((label, index) => <div key={label} className="relative text-center"><span className="mx-auto grid size-8 place-items-center rounded-full bg-amber-100 text-xs font-black text-amber-900">{index + 1}</span><p className="mt-2 text-xs font-black uppercase tracking-[0.08em] text-slate-600">{label}</p>{index < 3 ? <span className="absolute left-[calc(50%+20px)] right-[calc(-50%+20px)] top-4 h-px bg-amber-200" /> : null}</div>)}</div>
    <Section label="Join"><SelectField label="Join window" value={form.joinWindowMode} onChange={(value) => update("joinWindowMode", value as NormalChallengeForm["joinWindowMode"])} options={[["until_submissions", "Join anytime before submissions start"], ["custom", "Set specific joining dates"]]} />{form.joinWindowMode === "custom" ? <div className="mt-5 grid gap-5 md:grid-cols-2"><DateField label="Join start" value={form.registrationOpensAt} onChange={(value) => update("registrationOpensAt", value)} /><div data-field="registrationDeadline"><DateField label="Join end" value={form.registrationDeadline} onChange={(value) => update("registrationDeadline", value)} />{error("registrationDeadline")}</div></div> : null}</Section>
    <Section label="Submit"><div className="grid gap-5 md:grid-cols-2">{([["submissionStartAt", "Submissions start"], ["submissionDeadline", "Submission deadline"]] as const).map(([field, label]) => <div key={field} data-field={field}><DateField label={`${label} *`} value={form[field]} onChange={(value) => update(field, value)} />{error(field)}</div>)}</div></Section>
    <Section label="Vote"><div className="grid gap-5 md:grid-cols-2">{([["votingStartsAt", "Voting starts"], ["votingDeadline", "Voting ends"]] as const).map(([field, label]) => <div key={field} data-field={field}><DateField label={`${label} *`} value={form[field]} onChange={(value) => update(field, value)} />{error(field)}</div>)}</div><div className="mt-5 grid gap-5 sm:grid-cols-2"><SelectField label="Live Vote Totals" value={form.hideVoteTotals ? "hide" : "show"} onChange={(value) => update("hideVoteTotals", value === "hide")} options={[["show", "Show"], ["hide", "Hide"]]} /><SelectField label="Live Rankings" value={form.hideRankings ? "hide" : "show"} onChange={(value) => update("hideRankings", value === "hide")} options={[["show", "Show"], ["hide", "Hide"]]} /></div></Section>
    <Section label="Results"><div className="max-w-md" data-field="winnerAnnouncementAt"><DateField label="Results / winner announcement *" value={form.winnerAnnouncementAt} onChange={(value) => update("winnerAnnouncementAt", value)} />{error("winnerAnnouncementAt")}</div><p className="mt-3 text-sm leading-6 text-slate-600">Results appear only after this time and after an admin confirms the winners.</p></Section>
  </div></>;

  if (NORMAL_FRONTEND_STEPS[step]?.key === "submission") return <><Heading step={step} /><div className="mt-9 space-y-9">
    <Section label="Submission Type"><SelectField label="Accepted entry" value={form.submissionMode} onChange={(value) => update("submissionMode", value as NormalChallengeForm["submissionMode"])} options={[["image", "Image"], ["video", "Video"], ["both", "Image or Video"]]} /><p className="mt-3 text-sm text-slate-600">One entry is allowed per participant.</p></Section>
    <div data-field="votingSettings"><Section label="Voting"><SelectField disabled={plan === "free" && form.paidVotesEnabled} label="Voting configuration" value={form.paidVotesEnabled ? "dorocoin" : "free"} onChange={(value) => update("paidVotesEnabled", value === "dorocoin")} options={[["free", "Free Vote Only"], ...(plan !== "free" || form.paidVotesEnabled ? [["dorocoin", "Free Vote + DoroCoin Voting"]] as Array<[string, string]> : [])]} /><p className="mt-3 text-sm text-slate-600">One eligible free vote per day. Additional votes cost 5 DoroCoins where enabled by your plan and the server. DoroCoins are not cash prize funding.</p>{plan === "free" ? <div className="mt-2 text-sm text-slate-600"><p>DoroCoin voting configuration requires an eligible paid plan.</p>{form.paidVotesEnabled ? <><p className="mt-2">This existing draft setting is shown read-only. The server checks its current eligibility before publication.</p><Button variant="secondary" className="mt-3" onClick={() => update("paidVotesEnabled", false)}>Use Free Vote Only</Button></> : null}</div> : null}</Section></div>
    <div data-field="submissionInstructionsList"><InstructionList values={form.submissionInstructions} update={(values) => update("submissionInstructions", values)} />{error("submissionInstructionsList")}</div>
  </div></>;

  if (NORMAL_FRONTEND_STEPS[step]?.key === "review") return <Review form={form} readiness={readiness} edit={edit} funding={funding} />;
  if (NORMAL_FRONTEND_STEPS[step]?.key === "publish") return <><Heading step={step} /><div className="mt-9 rounded-[8px] bg-slate-50 p-5 sm:p-6"><h3 className="text-xl font-black text-slate-950">Submit for Review</h3><p className="mt-2 text-sm leading-6 text-slate-600">Your challenge will not go public immediately. Admin review is required before public visibility.</p><PublishBlockers readiness={readiness} edit={edit} /><div data-field="publishConfirmations" className="mt-6 space-y-4"><Check label="I confirm the challenge details are accurate." checked={form.confirmations.accurate} onChange={(value) => update("confirmations", { ...form.confirmations, accurate: value })} /><Check label="I have the rights to publish the content and media." checked={form.confirmations.rights} onChange={(value) => update("confirmations", { ...form.confirmations, rights: value })} /><Check label="I understand editing is unavailable while the challenge is under review." checked={form.confirmations.review} onChange={(value) => update("confirmations", { ...form.confirmations, review: value })} />{error("publishConfirmations")}</div></div></>;
  return null;
}

function Review({ form, readiness, edit, funding }: { form: NormalChallengeForm; readiness: NormalChallengeReadiness; edit: (step: number) => void; funding: CreatorBasePrizeFunding }) {
  const totalPrize = Number(form.basePrizeAmount || 0);
  const when = (value: string) => formatChallengeLocalDateTime(challengeDateTimeForStorage(value, form.timeZone), form.timeZone);
  const cards = [
    ["Overview", `${form.title || "Title missing"}. ${form.category || "Category missing"}${form.subcategory ? ` / ${form.subcategory}` : ""}.\n\n${form.description}\n\nChallenge rules:\n${form.rules.filter((rule) => rule.trim()).map((rule, index) => `${index + 1}. ${rule.trim()}`).join("\n") || "No creator rules added."}`, 0],
    ["Monetization & Prize Pool", `${form.paidEntryEnabled ? `$${form.entryFeeAmount || "0"} USD paid entry` : "Free entry"}. ${form.numberOfWinners} cash placement${form.numberOfWinners === 1 ? "" : "s"}; $${totalPrize.toLocaleString()} USD Base Prize; ${funding.confirmedCents === null ? "confirmed creator funding unavailable" : usd(funding.confirmedCents / 100) + " creator funding confirmed"}. ${form.sponsorReady ? "Open to sponsors." : "Sponsorship is off."}`, normalStepIndex("monetization")],
    ["Media", `${form.images.length} challenge image${form.images.length === 1 ? "" : "s"}${form.video ? " and one video" : ""}. Image 1 is the cover.`, normalStepIndex("media")],
    ["Schedule", `${form.joinWindowMode === "custom" ? `Joining opens ${when(form.registrationOpensAt)} and closes ${when(form.registrationDeadline)}. ` : "Joining closes when submissions begin. "}Submissions open ${when(form.submissionStartAt)}, close ${when(form.submissionDeadline)}, voting opens ${when(form.votingStartsAt)} and closes ${when(form.votingDeadline)}, and results are scheduled for ${when(form.winnerAnnouncementAt)}.`, normalStepIndex("schedule")],
    ["Entry & Submission", `${form.paidVotesEnabled ? "Free Vote + DoroCoin Voting" : "Free Vote Only"}. ${form.submissionMode === "both" ? "Image or Video" : form.submissionMode === "image" ? "Image" : "Video"}; one entry per participant.\n\n${form.submissionInstructions.filter((value) => value.trim()).map((instruction, index) => `${index + 1}. ${instruction.trim()}`).join("\n") || "No optional instructions added."}`, normalStepIndex("submission")]
  ] as const;
  const issues = readiness.issues.filter((item) => item.field !== "publishConfirmations");
  return <><Heading step={normalStepIndex("review")} /><div className="mt-9 divide-y divide-slate-200 border-y border-slate-200">{cards.map(([title, body, target]) => <section key={title} className="flex items-start justify-between gap-5 py-5"><div className="min-w-0 flex-1"><h3 className="font-black text-slate-950">{title}</h3><p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-slate-600">{body}</p></div><Button variant="ghost" className="shrink-0" onClick={() => edit(target)}>Edit</Button></section>)}</div><div className={`mt-6 rounded-[8px] p-5 ${issues.length ? "bg-red-50" : "bg-emerald-50"}`}><h3 className="font-black text-slate-950">{issues.length ? `${issues.length} thing${issues.length === 1 ? "" : "s"} need to be fixed.` : "Ready to submit for review."}</h3>{issues.length ? <ul className="mt-3 space-y-2 text-sm text-red-800">{issues.map((item) => <li key={`${item.code}-${item.field}`} className="flex flex-wrap items-start justify-between gap-2"><span>{item.message}</span>{item.code.startsWith("LEGACY_") ? <LinkButton variant="ghost" href="/support/new">Contact Support</LinkButton> : <Button variant="ghost" onClick={() => edit(item.field === "creatorFunding" || item.field.includes("Prize") || item.field === "winnerPrizeAmountsCents" ? normalStepIndex("monetization") : item.field === "submissionInstructionsList" ? normalStepIndex("submission") : item.step)}>Edit section</Button>}</li>)}</ul> : <p className="mt-2 text-sm text-emerald-800">Your challenge will be reviewed before it goes public. Continue to confirm the submission details.</p>}</div></>;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return <section><h3 className="text-lg font-black text-slate-950">{label}</h3><div className="mt-4">{children}</div></section>;
}

function Repeatable({ label, values, addLabel, placeholder, update }: { label: string; values: string[]; addLabel: string; placeholder: string; update: (values: string[]) => void }) {
  return <Section label={label}><div className="space-y-3">{values.map((value, index) => <div key={index} className="flex gap-2"><input aria-label={`${label} ${index + 1}`} className={inputClass} value={value} placeholder={placeholder} onChange={(event) => update(values.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /><Button variant="ghost" aria-label={`Remove ${label.toLowerCase()} ${index + 1}`} onClick={() => update(values.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></Button></div>)}</div><Button variant="secondary" className="mt-3" onClick={() => update([...values, ""])}><Plus size={16} /> {addLabel}</Button></Section>;
}

function InstructionList({ values, update }: { values: string[]; update: (values: string[]) => void }) {
  const move = (from: number, to: number) => {
    if (to < 0 || to >= values.length) return;
    const next = [...values];
    [next[from], next[to]] = [next[to], next[from]];
    update(next);
  };
  return <Section label="Submission Instructions (optional)"><p className="mb-4 text-sm leading-6 text-slate-600">Add instructions if useful, or leave this list empty. Participants see saved instructions in this order.</p><ol className="space-y-3">{values.map((value, index) => <li key={index} className="flex items-start gap-2"><span className="pt-3 text-sm font-black text-slate-500">{index + 1}.</span><textarea className={textareaClass} rows={3} maxLength={500} aria-label={`Submission instruction ${index + 1}`} value={value} placeholder="Describe one clear submission step" onChange={(event) => update(values.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /><div className="flex flex-col"><Button variant="ghost" aria-label={`Move instruction ${index + 1} up`} disabled={index === 0} onClick={() => move(index, index - 1)}><ArrowUp size={16} /></Button><Button variant="ghost" aria-label={`Move instruction ${index + 1} down`} disabled={index === values.length - 1} onClick={() => move(index, index + 1)}><ArrowDown size={16} /></Button><Button variant="ghost" aria-label={`Remove instruction ${index + 1}`} onClick={() => update(values.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></Button></div></li>)}</ol><Button variant="secondary" className="mt-3" onClick={() => update([...values, ""])}><Plus size={16} /> Add Instruction</Button></Section>;
}

function ordinal(value: number) { return value === 1 ? "1st" : value === 2 ? "2nd" : "3rd"; }
function usd(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number.isFinite(value) ? value : 0); }
function mediaRecord(id: string, url: string, metadata: UploadMetadata): NormalMedia { return { id, url, path: metadata.path, fileName: metadata.fileName, contentType: metadata.contentType, size: metadata.size, width: metadata.width, height: metadata.height, durationSeconds: metadata.durationSeconds, moderationStatus: "pending" }; }
function setMediaAt(index: number, url: string, metadata: UploadMetadata | undefined, form: NormalChallengeForm, update: Props["update"]) { const images = [...form.images]; if (!url || !metadata) images.splice(index, 1); else images[index] = mediaRecord(`image-${index + 1}`, url, metadata); update("images", images.filter(Boolean).slice(0, 3)); }
function moveMedia(from: number, to: number, form: NormalChallengeForm, update: Props["update"]) { if (to < 0 || to >= form.images.length) return; const images = [...form.images]; [images[from], images[to]] = [images[to], images[from]]; update("images", images); }

function BasePrizeFunding({ funding, hasDraft, busy, fund, refresh, legacyBlocked }: { legacyBlocked: boolean; funding: CreatorBasePrizeFunding; hasDraft: boolean; busy: boolean; fund: () => void; refresh: () => void }) {
  const labels = { none: "No Base Prize funding required", unknown: "Funding status unavailable", pending: "Payment pending confirmation", failed: "Funding failed or cancelled", partial: "Partially funded", funded: "Fully creator-funded", required: "Creator funding required" };
  return <div data-field="creatorFunding" className="mt-5 rounded-lg border border-slate-200 p-4" role="status"><h4 className="font-bold">{labels[funding.status]}</h4>{funding.requiredCents > 0 ? <><dl className="mt-3 space-y-1 text-sm"><div>Entered Base Prize: {usd(funding.enteredCents / 100)}</div>{funding.requiredCents > funding.enteredCents ? <div>Existing server-recorded obligation: {usd(funding.requiredCents / 100)}. Clearing this form does not cancel it.</div> : null}<div>Confirmed creator funding: {funding.confirmedCents === null ? "Unavailable — refresh required" : usd(funding.confirmedCents / 100)}</div><div>Outstanding: {funding.confirmedCents === null ? "Not yet verified" : usd(funding.outstandingCents / 100)}</div></dl>{legacyBlocked ? <p className="mt-3 text-sm text-amber-800">Resolve the preserved legacy settings with Support before starting new Base Prize funding. <LinkButton variant="ghost" href="/support/new">Contact Support</LinkButton></p> : null}<p className="mt-3 text-sm text-slate-600">Complete the existing funding journey, then refresh confirmation. Returning from checkout does not confirm payment.</p>{funding.status === "partial" ? <p className="mt-2 text-sm text-amber-800">The current funding service does not support another checkout after a contribution is confirmed. Contact Support to resolve the outstanding obligation; submission remains blocked.</p> : null}<div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" disabled={!hasDraft || busy || funding.satisfied || funding.status === "partial" || legacyBlocked} onClick={fund}>Fund Base Prize</Button><Button variant="ghost" disabled={!hasDraft || busy} onClick={refresh}>Refresh funding status</Button>{funding.status === "partial" ? <LinkButton variant="ghost" href="/support/new">Contact Support</LinkButton> : null}</div></> : <p className="mt-2 text-sm text-slate-600">No creator-funded guarantee is selected. Potential sponsor contributions and future revenue are not confirmed prize money. Submission for review still requires all other challenge settings to be complete.</p>}</div>;
}
function PublishBlockers({ readiness, edit }: { readiness: NormalChallengeReadiness; edit: (step: number) => void }) {
  const issues = readiness.issues.filter((issue) => issue.field !== "publishConfirmations");
  return issues.length ? <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4" role="status"><h4 className="font-bold">Before you can submit</h4><ul className="mt-3 space-y-3">{issues.map((issue) => <li key={`${issue.code}-${issue.field}`}><p className="text-sm">{issue.message}</p>{issue.code.startsWith("LEGACY_") ? <LinkButton className="mt-2" variant="ghost" href="/support/new">Contact Support</LinkButton> : <Button className="mt-2" variant="ghost" onClick={() => edit(issue.field === "creatorFunding" || issue.field === "winnerPrizeAmountsCents" ? normalStepIndex("monetization") : issue.field === "submissionInstructionsList" ? normalStepIndex("submission") : issue.step)}>Review section</Button>}</li>)}</ul></div> : null;
}
