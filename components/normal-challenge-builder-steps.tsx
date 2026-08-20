"use client";

import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import { MediaUploadField, type MediaUploadStage, type UploadMetadata } from "@/components/media-upload-field";
import { Button, Card, Field, LinkButton, inputClass, textareaClass } from "@/components/ui";
import { CHALLENGE_TIME_ZONE_OPTIONS, challengeDateTimeForStorage, formatChallengeLocalDateTime } from "@/lib/challenge-date-time";
import { NORMAL_CHALLENGE_STEP_DEFINITIONS } from "@/lib/challenge-builder-foundation";
import { NORMAL_CHALLENGE_CATEGORIES, NORMAL_ELIGIBLE_COUNTRIES, NORMAL_RESUBMIT_WINDOWS } from "@/lib/normal-challenge-config";
import type { NormalChallengeForm, NormalMedia } from "@/lib/normal-challenge-builder-model";
import { validateNormalChallengeImage, validateNormalChallengeVideo } from "@/lib/normal-challenge-media";
import { challengeDraftMediaPath } from "@/lib/media-upload-paths";
import type { NormalChallengeReadiness } from "@/lib/normal-challenge-readiness";

type Props = {
  step: number;
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
};

function Heading({ step }: { step: number }) {
  const definition = NORMAL_CHALLENGE_STEP_DEFINITIONS[step] ?? NORMAL_CHALLENGE_STEP_DEFINITIONS[0];
  return <div className="max-w-2xl"><p className="text-xs font-black uppercase tracking-[0.14em] text-amber-700">Step {step + 1} of 8</p><h2 className="mt-2 text-3xl font-black tracking-normal text-slate-950 sm:text-4xl">{definition.title}</h2><p className="mt-3 text-base leading-7 text-slate-600">{definition.description}</p></div>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <Field label={label}><select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></Field>;
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex min-h-11 items-start gap-3 text-sm font-bold leading-6 text-slate-700"><input className="mt-1 size-4 accent-amber-600" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label}><input className={inputClass} type="datetime-local" value={value} onChange={(event) => onChange(event.target.value)} /></Field>;
}

export function NormalChallengeBuilderStep(props: Props) {
  const { step, form, update, userId, mediaDisabled, track, readiness, edit, plan, showErrors = false, draftId = "" } = props;
  const errors = showErrors ? Object.fromEntries(readiness.issues.filter((item) => item.step === step).map((item) => [item.field, item.message])) : {};
  const error = (field: string) => errors[field] ? <p className="mt-2 text-sm font-bold text-red-700">{errors[field]}</p> : null;
  const category = NORMAL_CHALLENGE_CATEGORIES.find((item) => item.label === form.category);

  if (step === 0) return <><Heading step={step} /><div className="mt-9 grid gap-7">
    <div data-field="title"><Field label="Challenge title *"><input className={inputClass} maxLength={120} value={form.title} onChange={(event) => update("title", event.target.value)} /></Field>{error("title")}</div>
    <div className="grid gap-5 sm:grid-cols-2">
      <div data-field="category"><Field label="Category *"><select className={inputClass} value={form.category} onChange={(event) => { update("category", event.target.value); update("subcategory", ""); }}><option value="">Choose category</option>{NORMAL_CHALLENGE_CATEGORIES.map((item) => <option key={item.label}>{item.label}</option>)}</select></Field>{error("category")}</div>
      <div data-field="subcategory"><Field label="Subcategory *"><select className={inputClass} disabled={!category} value={form.subcategory} onChange={(event) => update("subcategory", event.target.value)}><option value="">Choose subcategory</option>{category?.subcategories.map((item) => <option key={item}>{item}</option>)}</select></Field>{error("subcategory")}</div>
    </div>
    <div data-field="shortDescription"><Field label="Short description *"><textarea className={textareaClass} maxLength={240} rows={3} value={form.shortDescription} onChange={(event) => update("shortDescription", event.target.value)} /></Field><p className="mt-2 text-xs text-slate-500">{form.shortDescription.length}/240 characters</p>{error("shortDescription")}</div>
    <div data-field="description"><Field label="Full description *"><textarea className={textareaClass} maxLength={2000} rows={8} value={form.description} onChange={(event) => update("description", event.target.value)} /></Field>{error("description")}</div>
    <Repeatable label="Challenge rules" values={form.rules} addLabel="Add Rule" placeholder="Optional rule" update={(values) => update("rules", values)} />
  </div></>;

  if (step === 1) return <><Heading step={step} /><div className="mt-9 grid gap-8">
    <Section label="How can people join?"><SelectField label="Join mode" value={form.participationMode} onChange={(value) => update("participationMode", value as NormalChallengeForm["participationMode"])} options={[["open", "Anyone eligible can join"], ["approval", "Creator approval required"]]} /></Section>
    <Section label="Location eligibility"><SelectField label="Country access" value={form.locationEligibility} onChange={(value) => update("locationEligibility", value as NormalChallengeForm["locationEligibility"])} options={[["worldwide", "Worldwide"], ["selected", "Selected countries"]]} />{form.locationEligibility === "selected" ? <div data-field="eligibleCountries" className="mt-4 grid gap-3 sm:grid-cols-2">{NORMAL_ELIGIBLE_COUNTRIES.map(([code, name]) => <Check key={code} label={name} checked={form.eligibleCountries.includes(code)} onChange={(checked) => update("eligibleCountries", checked ? [...form.eligibleCountries, code] : form.eligibleCountries.filter((item) => item !== code))} />)}{error("eligibleCountries")}</div> : null}</Section>
    <Section label="Age"><div className="grid gap-4 sm:grid-cols-2"><SelectField label="Age requirement" value={form.ageRestrictionMode} onChange={(value) => update("ageRestrictionMode", value as NormalChallengeForm["ageRestrictionMode"])} options={[["none", "No age restriction"], ["minimum", "Minimum age"]]} />{form.ageRestrictionMode === "minimum" ? <div data-field="minimumAge"><Field label="Minimum age"><input className={inputClass} type="number" min="13" max="120" value={form.minimumAge} onChange={(event) => update("minimumAge", event.target.value)} /></Field>{error("minimumAge")}</div> : null}</div></Section>
    <Section label="Participant capacity"><div className="grid gap-4 sm:grid-cols-2"><SelectField label="Capacity" value={form.capacityMode} onChange={(value) => update("capacityMode", value as NormalChallengeForm["capacityMode"])} options={[["unlimited", "No fixed capacity"], ["limited", "Set a participant limit"]]} />{form.capacityMode === "limited" ? <div data-field="maxParticipants"><Field label="Maximum participants"><input className={inputClass} type="number" min="2" max="50" value={form.maxParticipants} onChange={(event) => update("maxParticipants", event.target.value)} /></Field>{error("maxParticipants")}</div> : null}</div>{form.capacityMode === "limited" ? <div className="mt-4"><SelectField label="Waitlist" value={form.waitlistEnabled ? "enabled" : "disabled"} onChange={(value) => update("waitlistEnabled", value === "enabled")} options={[["disabled", "Disabled"], ["enabled", "Enable when capacity is reached"]]} /></div> : <p className="mt-3 text-sm text-slate-600">No fixed capacity. Unlimited participation remains subject to eligibility and registration dates.</p>}</Section>
    <Section label="Participant list visibility"><SelectField label="Public participant list" value={form.hideParticipantList ? "hidden" : "visible"} onChange={(value) => update("hideParticipantList", value === "hidden")} options={[["visible", "Visible"], ["hidden", "Hidden"]]} /></Section>
    <p className="rounded-[8px] bg-slate-50 p-4 text-sm leading-6 text-slate-600">Normal Challenges are individual competitions. Creators cannot compete in their own challenge, and sponsor-account restrictions remain enforced.</p>
  </div></>;

  if (step === 2) {
    const basePrize = form.winnerPrizeAmounts.slice(0, form.numberOfWinners).reduce((sum, value) => sum + Number(value || 0), 0);
    return <><Heading step={step} /><div className="mt-9 space-y-10">
      <Section label="Prize Pool">
        <div className="max-w-sm"><SelectField label="Number of winners" value={String(form.numberOfWinners)} onChange={(value) => { const count = Number(value); update("numberOfWinners", count); update("winnerPrizeAmounts", Array.from({ length: count }, (_, index) => form.winnerPrizeAmounts[index] || "")); }} options={[["1", "1 winner"], ["2", "2 winners"], ["3", "3 winners"]]} /></div>
        <div data-field="winnerPrizeAmountsCents" className="mt-5 grid gap-4 sm:grid-cols-3">{form.winnerPrizeAmounts.slice(0, form.numberOfWinners).map((value, index) => <Field key={index} label={`${ordinal(index + 1)} Place`}><div className="relative"><span className="absolute left-4 top-3.5 font-black text-slate-500">$</span><input className={`${inputClass} pl-8`} type="number" min="1" step="0.01" value={value} onChange={(event) => update("winnerPrizeAmounts", form.winnerPrizeAmounts.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /></div></Field>)}</div>{error("winnerPrizeAmountsCents")}
        <div className="mt-5 flex items-center justify-between rounded-[8px] bg-slate-50 px-4 py-4"><span className="text-sm font-bold text-slate-600">Base Prize</span><span className="text-xl font-black text-slate-950">${usd(basePrize)}</span></div>
        <p className="mt-3 text-sm leading-6 text-slate-600">The Base Prize is guaranteed separately from eligible challenge-generated revenue. Partial funding does not block submission for review, but it must be confirmed before voting opens.</p>
        {draftId ? <LinkButton href={`/challenges/${draftId}/prize-funding`} variant="secondary" className="mt-4">Fund Base Prize</LinkButton> : <p className="mt-3 text-xs text-slate-500">Complete Overview to create the draft before funding the Base Prize.</p>}
      </Section>
      <Section label="Entry"><div className="grid gap-4 sm:grid-cols-2"><SelectField label="Entry type" value={form.paidEntryEnabled ? "paid" : "free"} onChange={(value) => update("paidEntryEnabled", value === "paid")} options={[["free", "Free Entry"], ["paid", "Paid Entry"]]} />{form.paidEntryEnabled ? <div data-field="entryFeeAmountCents"><Field label="Entry fee (USD)"><div className="relative"><span className="absolute left-4 top-3.5 font-black text-slate-500">$</span><input className={`${inputClass} pl-8`} type="number" min="5" max="100000" step="0.01" value={form.entryFeeAmount} onChange={(event) => update("entryFeeAmount", event.target.value)} /></div></Field>{error("entryFeeAmountCents")}</div> : null}</div></Section>
      <Section label="Sponsorship">
        <Check label="Open this challenge to sponsors" checked={form.sponsorReady} onChange={(value) => update("sponsorReady", value)} />
        {form.sponsorReady ? <div className="mt-5 grid gap-5"><SelectField label="Sponsorship goal" value={form.sponsorshipGoal} onChange={(value) => update("sponsorshipGoal", value)} options={[["increase_prize_pool", "Increase Prize Pool"], ["support_operations", "Support Challenge Operations"], ["product_sponsorship", "Product Sponsorship"], ["brand_partnership", "Brand Partnership"], ["other", "Other"]]} /><Field label="Preferred sponsor category"><input className={inputClass} value={form.preferredSponsorCategory} onChange={(event) => update("preferredSponsorCategory", event.target.value)} /></Field><Field label="Sponsor note"><textarea className={textareaClass} rows={4} value={form.sponsorNote} onChange={(event) => update("sponsorNote", event.target.value)} /></Field>{plan === "free" ? <p className="text-sm font-bold text-amber-800">Sponsor tools require an eligible creator plan. The base challenge can still be configured.</p> : null}</div> : null}
      </Section>
      <Section label="Paid Votes"><SelectField label="Enable Paid Votes" value={form.paidVotesEnabled ? "enabled" : "disabled"} onChange={(value) => update("paidVotesEnabled", value === "enabled")} options={[["disabled", "Disabled"], ["enabled", "Enabled"]]} /><p className="mt-3 text-sm leading-6 text-slate-600">Free voting remains enabled. Paid Votes, Ads-for-Votes, daily limits, and fraud controls remain server-governed.</p></Section>
      <div className="rounded-[8px] border border-slate-200 bg-slate-50 p-5">
        <h3 className="font-black text-slate-950">Funding / Prize Summary</h3>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2"><SummaryRow label="Base Prize" value={usd(basePrize)} /><SummaryRow label="Confirmed Funding" value="Shown after provider confirmation" /><SummaryRow label="Still Needed" value="Calculated from confirmed funding" /><SummaryRow label="Current Prize Pool" value="Confirmed funds only" /></dl>
        <p className="mt-4 text-xs leading-5 text-slate-500">Eligible confirmed challenge revenue is split 65% to the winner bonus pool, 20% to the creator, and 15% to Challenge Suite. Sponsor and creator direct prize funding remain separate.</p>
      </div>
    </div></>;
  }

  if (step === 3) return <><Heading step={step} /><div className="mt-9 space-y-10">
    <div className="rounded-[8px] bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-950">Use media you own or have permission to publish. An upload is ready only after Challenge Suite storage confirms it. Image 1 is the public cover.</div>
    <Section label="Images"><div className="flex items-start justify-between gap-4"><p className="max-w-2xl text-sm leading-6 text-slate-600">Add one to three images. Image 1 is the cover. JPEG, PNG, or WebP; up to 5MB; 712 x 430 minimum.</p><span className="shrink-0 text-sm font-bold text-slate-500">{form.images.length}/3</span></div><div data-field="challengeImages" className="mt-5 grid gap-5 md:grid-cols-3">{[0, 1, 2].map((index) => { const item = form.images[index]; return <div key={index} className="min-w-0"><div className="mb-3 flex items-center justify-between gap-2"><p className="font-black">Image {index + 1}</p><span className="text-xs font-bold text-slate-500">{index === 0 ? "Required / Cover" : "Optional"}</span></div><MediaUploadField appearance="builder" label={`Image ${index + 1}`} value={item?.url} storagePath={challengeDraftMediaPath(userId, "gallery")} kind="image" maxSizeMb={5} required={index === 0} disabled={mediaDisabled} validateFile={validateNormalChallengeImage} onStatusChange={track(`image-${index}`)} onChange={(url, metadata) => setMediaAt(index, url, metadata, form, update)} />{item ? <div className="mt-3 flex gap-2"><Button variant="ghost" aria-label="Move image left" disabled={index === 0} onClick={() => moveMedia(index, index - 1, form, update)}><ArrowLeft size={16} /></Button><Button variant="ghost" aria-label="Move image right" disabled={index >= form.images.length - 1} onClick={() => moveMedia(index, index + 1, form, update)}><ArrowRight size={16} /></Button><Button variant="ghost" aria-label="Remove image" onClick={() => update("images", form.images.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></Button></div> : null}</div>; })}</div>{error("challengeImages")}</Section>
    <Section label="Video"><p className="mb-5 text-sm leading-6 text-slate-600">Optional MP4 or AVI; up to 50MB; at least 1280 x 720; no longer than 75 seconds.</p><div className="max-w-xl"><MediaUploadField appearance="builder" label="Challenge video" value={form.video?.url} storagePath={challengeDraftMediaPath(userId, "video")} kind="video" maxSizeMb={50} disabled={mediaDisabled} validateFile={validateNormalChallengeVideo} onStatusChange={track("video")} onChange={(url, metadata) => update("video", url && metadata ? mediaRecord("video", url, metadata) : null)} /></div>{error("challengeVideo")}</Section>
  </div></>;

  if (step === 4) return <><Heading step={step} /><div className="mt-9 space-y-8">
    <div data-field="timeZone" className="max-w-md"><Field label="Timezone *"><select className={inputClass} value={form.timeZone} onChange={(event) => update("timeZone", event.target.value)}>{CHALLENGE_TIME_ZONE_OPTIONS.map((zone) => <option key={zone.value} value={zone.value}>{zone.label}</option>)}</select></Field><p className="mt-2 text-sm text-slate-600">All challenge times are shown in this timezone.</p>{error("timeZone")}</div>
    <div className="grid grid-cols-4 gap-2" aria-label="Challenge lifecycle">{["Join", "Submit", "Vote", "Results"].map((label, index) => <div key={label} className="relative text-center"><span className="mx-auto grid size-8 place-items-center rounded-full bg-amber-100 text-xs font-black text-amber-900">{index + 1}</span><p className="mt-2 text-xs font-black uppercase tracking-[0.08em] text-slate-600">{label}</p>{index < 3 ? <span className="absolute left-[calc(50%+20px)] right-[calc(-50%+20px)] top-4 h-px bg-amber-200" /> : null}</div>)}</div>
    <Section label="Join"><SelectField label="Join window" value={form.joinWindowMode} onChange={(value) => update("joinWindowMode", value as NormalChallengeForm["joinWindowMode"])} options={[["until_submissions", "Join anytime before submissions start"], ["custom", "Set specific joining dates"]]} />{form.joinWindowMode === "custom" ? <div className="mt-5 grid gap-5 md:grid-cols-2"><DateField label="Join start" value={form.registrationOpensAt} onChange={(value) => update("registrationOpensAt", value)} /><div data-field="registrationDeadline"><DateField label="Join end" value={form.registrationDeadline} onChange={(value) => update("registrationDeadline", value)} />{error("registrationDeadline")}</div></div> : null}</Section>
    <Section label="Submit"><div className="grid gap-5 md:grid-cols-2">{([["submissionStartAt", "Submissions start"], ["submissionDeadline", "Submission deadline"]] as const).map(([field, label]) => <div key={field} data-field={field}><DateField label={`${label} *`} value={form[field]} onChange={(value) => update(field, value)} />{error(field)}</div>)}</div></Section>
    <Section label="Vote"><div className="grid gap-5 md:grid-cols-2">{([["votingStartsAt", "Voting starts"], ["votingDeadline", "Voting ends"]] as const).map(([field, label]) => <div key={field} data-field={field}><DateField label={`${label} *`} value={form[field]} onChange={(value) => update(field, value)} />{error(field)}</div>)}</div><div className="mt-5 grid gap-5 sm:grid-cols-2"><SelectField label="Live Vote Totals" value={form.hideVoteTotals ? "hide" : "show"} onChange={(value) => update("hideVoteTotals", value === "hide")} options={[["show", "Show"], ["hide", "Hide"]]} /><SelectField label="Live Rankings" value={form.hideRankings ? "hide" : "show"} onChange={(value) => update("hideRankings", value === "hide")} options={[["show", "Show"], ["hide", "Hide"]]} /></div></Section>
    <Section label="Results"><div className="max-w-md" data-field="winnerAnnouncementAt"><DateField label="Results / winner announcement *" value={form.winnerAnnouncementAt} onChange={(value) => update("winnerAnnouncementAt", value)} />{error("winnerAnnouncementAt")}</div><p className="mt-3 text-sm leading-6 text-slate-600">Results appear only after this time and after an admin confirms the winners.</p></Section>
  </div></>;

  if (step === 5) return <><Heading step={step} /><div className="mt-9 space-y-9">
    <Section label="Submission Type"><SelectField label="Accepted entry" value={form.submissionMode} onChange={(value) => update("submissionMode", value as NormalChallengeForm["submissionMode"])} options={[["image", "Image"], ["video", "Video"], ["both", "Image or Video"]]} /><p className="mt-3 text-sm text-slate-600">One entry is allowed per participant.</p></Section>
    <div data-field="challengeGuidelines"><Field label="Submission instructions *"><textarea className={textareaClass} rows={7} value={form.submissionInstructions} onChange={(event) => update("submissionInstructions", event.target.value)} /></Field>{error("challengeGuidelines")}</div>
    <Repeatable label="Additional requirements" values={form.submissionRequirements} addLabel="Add Requirement" placeholder="Optional requirement" update={(values) => update("submissionRequirements", values)} />
    <Section label="Fix & Resubmit"><div className="grid gap-5 sm:grid-cols-2"><SelectField label="Corrections" value={form.fixAndResubmitEnabled ? "enabled" : "disabled"} onChange={(value) => update("fixAndResubmitEnabled", value === "enabled")} options={[["disabled", "Disabled"], ["enabled", "Enabled"]]} />{form.fixAndResubmitEnabled ? <div data-field="fixAndResubmitHours"><SelectField label="Correction Window" value={form.fixAndResubmitHours} onChange={(value) => update("fixAndResubmitHours", value as NormalChallengeForm["fixAndResubmitHours"])} options={NORMAL_RESUBMIT_WINDOWS.map((hours) => [String(hours), `${hours} hours`])} />{error("fixAndResubmitHours")}</div> : null}</div><p className="mt-3 text-xs leading-5 text-slate-600">The window starts only after a creator or admin requests a correction. Participants cannot freely overwrite submitted entries.</p></Section>
  </div></>;

  if (step === 6) return <Review form={form} readiness={readiness} edit={edit} />;
  if (step === 7) return <><Heading step={step} /><div className="mt-9 rounded-[8px] bg-slate-50 p-5 sm:p-6"><h3 className="text-xl font-black text-slate-950">Submit for Review</h3><p className="mt-2 text-sm leading-6 text-slate-600">Your challenge will not go public immediately. Admin review is required before public visibility.</p><div data-field="publishConfirmations" className="mt-6 space-y-4"><Check label="I confirm the challenge details are accurate." checked={form.confirmations.accurate} onChange={(value) => update("confirmations", { ...form.confirmations, accurate: value })} /><Check label="I have the rights to publish the content and media." checked={form.confirmations.rights} onChange={(value) => update("confirmations", { ...form.confirmations, rights: value })} /><Check label="I understand editing is unavailable while the challenge is under review." checked={form.confirmations.review} onChange={(value) => update("confirmations", { ...form.confirmations, review: value })} />{error("publishConfirmations")}</div></div></>;
  return null;
}

function Review({ form, readiness, edit }: { form: NormalChallengeForm; readiness: NormalChallengeReadiness; edit: (step: number) => void }) {
  const totalPrize = form.winnerPrizeAmounts.slice(0, form.numberOfWinners).reduce((sum, value) => sum + Number(value || 0), 0);
  const when = (value: string) => formatChallengeLocalDateTime(challengeDateTimeForStorage(value, form.timeZone), form.timeZone);
  const cards = [
    ["Overview", `${form.title || "Title missing"}. ${form.category || "Category missing"}${form.subcategory ? ` / ${form.subcategory}` : ""}.`, 0],
    ["Eligibility", `${form.participationMode === "approval" ? "Approval is required" : "Anyone eligible can join"}; ${form.locationEligibility === "worldwide" ? "worldwide" : `${form.eligibleCountries.length} selected countries`}; ${form.capacityMode === "unlimited" ? "No fixed capacity." : `Limited to ${form.maxParticipants || "0"} participants. ${form.waitlistEnabled ? "Waitlist is enabled when the limit is reached." : ""}`}`, 1],
    ["Monetization & Prize Pool", `${form.paidEntryEnabled ? `$${form.entryFeeAmount || "0"} USD paid entry` : "Free entry"}. ${form.numberOfWinners} cash placement${form.numberOfWinners === 1 ? "" : "s"}; $${totalPrize.toLocaleString()} USD Base Prize. ${form.sponsorReady ? "Open to sponsors." : "Sponsorship is off."}`, 2],
    ["Media", `${form.images.length} challenge image${form.images.length === 1 ? "" : "s"}${form.video ? " and one video" : ""}. Image 1 is the cover.`, 3],
    ["Schedule", `Submissions open ${when(form.submissionStartAt)}, close ${when(form.submissionDeadline)}, voting opens ${when(form.votingStartsAt)}, and results are scheduled for ${when(form.winnerAnnouncementAt)}.`, 4],
    ["Entry & Submission", `${form.submissionMode === "both" ? "Image or Video" : form.submissionMode === "image" ? "Image" : "Video"}; one entry per participant. ${form.fixAndResubmitEnabled ? `${form.fixAndResubmitHours}-hour correction window after an authorized request.` : "Fix & Resubmit is off."}`, 5]
  ] as const;
  const issues = readiness.issues.filter((item) => item.step < 6);
  return <><Heading step={6} /><div className="mt-9 divide-y divide-slate-200 border-y border-slate-200">{cards.map(([title, body, target]) => <section key={title} className="flex items-start justify-between gap-5 py-5"><div><h3 className="font-black text-slate-950">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{body}</p></div><Button variant="ghost" onClick={() => edit(target)}>Edit</Button></section>)}</div><div className={`mt-6 rounded-[8px] p-5 ${issues.length ? "bg-red-50" : "bg-emerald-50"}`}><h3 className="font-black text-slate-950">{issues.length ? `${issues.length} thing${issues.length === 1 ? "" : "s"} need to be fixed.` : "Ready to submit for review."}</h3>{issues.length ? <ul className="mt-3 space-y-2 text-sm text-red-800">{issues.map((item) => <li key={item.code}>- {item.message}</li>)}</ul> : <p className="mt-2 text-sm text-emerald-800">Your challenge will be reviewed before it goes public. Continue to confirm the submission details.</p>}</div></>;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return <section><h3 className="text-lg font-black text-slate-950">{label}</h3><div className="mt-4">{children}</div></section>;
}

function Repeatable({ label, values, addLabel, placeholder, update }: { label: string; values: string[]; addLabel: string; placeholder: string; update: (values: string[]) => void }) {
  return <Section label={label}><div className="space-y-3">{values.map((value, index) => <div key={index} className="flex gap-2"><input className={inputClass} value={value} placeholder={placeholder} onChange={(event) => update(values.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /><Button variant="ghost" aria-label={`Remove ${label.toLowerCase()} ${index + 1}`} onClick={() => update(values.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></Button></div>)}</div><Button variant="secondary" className="mt-3" onClick={() => update([...values, ""])}><Plus size={16} /> {addLabel}</Button></Section>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 text-sm"><dt className="text-slate-500">{label}</dt><dd className="text-right font-black text-slate-950">{value}</dd></div>;
}

function ordinal(value: number) { return value === 1 ? "1st" : value === 2 ? "2nd" : "3rd"; }
function usd(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number.isFinite(value) ? value : 0); }
function mediaRecord(id: string, url: string, metadata: UploadMetadata): NormalMedia { return { id, url, path: metadata.path, fileName: metadata.fileName, contentType: metadata.contentType, size: metadata.size, width: metadata.width, height: metadata.height, durationSeconds: metadata.durationSeconds, moderationStatus: "pending" }; }
function setMediaAt(index: number, url: string, metadata: UploadMetadata | undefined, form: NormalChallengeForm, update: Props["update"]) { const images = [...form.images]; if (!url || !metadata) images.splice(index, 1); else images[index] = mediaRecord(`image-${index + 1}`, url, metadata); update("images", images.filter(Boolean).slice(0, 3)); }
function moveMedia(from: number, to: number, form: NormalChallengeForm, update: Props["update"]) { if (to < 0 || to >= form.images.length) return; const images = [...form.images]; [images[from], images[to]] = [images[to], images[from]]; update("images", images); }
