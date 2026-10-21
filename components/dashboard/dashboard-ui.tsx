import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, BarChart3, CalendarDays, CircleAlert } from 'lucide-react';
import { DashboardCover } from './dashboard-cover';
import { dashboardChallengeAction, dashboardCount, dashboardMoney, dashboardStatus, type DashboardRecord } from '@/lib/dashboard-presentation';
import { formatChallengeDateTime } from '@/lib/challenge-date-time';

export function DashboardHeader({title,subtitle,action}: {title:string;subtitle:string;action?:ReactNode}) {
  return <header className="dashboard-header"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</header>;
}
export function DashboardPanel({title,description,href,linkLabel='View all',children,className=''}:{title:string;description?:string;href?:string;linkLabel?:string;children:ReactNode;className?:string}) {
  return <section className={'dashboard-panel '+className}><div className="dashboard-panel-heading"><div><h2>{title}</h2>{description?<p>{description}</p>:null}</div>{href?<Link href={href} className="dashboard-text-link">{linkLabel}<ArrowRight size={14}/></Link>:null}</div>{children}</section>;
}
export function DashboardMetric({label,value,detail,icon,tone='gold',href}:{label:string;value:ReactNode;detail?:string;icon?:ReactNode;tone?:'gold'|'blue'|'green'|'rose';href?:string}) {
  const content=<><span className={'dashboard-metric-icon tone-'+tone}>{icon??<BarChart3 size={20}/>}</span><div><p className="dashboard-metric-label">{label}</p><p className="dashboard-metric-value">{value??'—'}</p>{detail?<p className="dashboard-metric-detail">{detail}</p>:null}</div></>;
  return href?<Link className={'dashboard-metric metric-'+tone} href={href}>{content}</Link>:<div className={'dashboard-metric metric-'+tone}>{content}</div>;
}
export type DashboardAction={label:string;description:string;href:string;icon?:ReactNode};
export function DashboardQuickActions({actions}:{actions:DashboardAction[]}) {
  return <div className="dashboard-actions">{actions.map((action,index)=><Link key={action.href+action.label} href={action.href} className={index===0?'dashboard-action dashboard-action-primary':'dashboard-action'}><span className="dashboard-action-icon">{action.icon??<ArrowRight size={21}/>}</span><b>{action.label}</b><small>{action.description}</small></Link>)}</div>;
}
export type DashboardAttentionItem={title:string;body?:string;href:string};
export function DashboardAttention({items,empty='Nothing needs your attention right now.'}:{items:DashboardAttentionItem[];empty?:string}) {
  return items.length?<ul className="dashboard-list">{items.slice(0,4).map((item,index)=><li key={item.href+index}><Link href={item.href}><span className="dashboard-list-icon"><CircleAlert size={18}/></span><span><b>{item.title}</b>{item.body?<small>{item.body}</small>:null}</span><ArrowRight size={15}/></Link></li>)}</ul>:<DashboardEmpty title="You’re all caught up" body={empty}/>;
}
export function DashboardEmpty({title,body}:{title:string;body:string}) {return <div className="dashboard-empty"><span><BarChart3 size={22}/></span><h3>{title}</h3><p>{body}</p></div>;}
export function DashboardPerformance({items,description}:{items:{label:string;value:number|null}[];description:string}) {
  const max=Math.max(1,...items.map(item=>item.value??0));
  return <div><p className="dashboard-caption">{description}</p>{items.some(item=>(item.value??0)>0)?<div className="dashboard-bars" role="img" aria-label={items.map(item=>`${item.label}: ${item.value??'not recorded'}`).join(', ')}>{items.map((item,index)=><div key={item.label}><span>{item.label}</span><div className="dashboard-bar-track"><span style={{width:`${((item.value??0)/max)*100}%`,background:['#f0c400','#2793e8','#18a56c'][index%3]}}/></div><b>{item.value===null?'—':item.value.toLocaleString()}</b></div>)}</div>:<DashboardEmpty title="Your activity will appear here" body="There is no recorded activity to chart yet."/>}<p className="dashboard-footnote">Current recorded counts · no historical trend is implied.</p></div>;
}
export function DashboardEarnings({available,pending,locked}:{available:unknown;pending:unknown;locked?:unknown}) {
  return <div><div className="dashboard-balance"><small>Available earnings</small><strong>{dashboardMoney(available)}</strong><span>Recorded cash wallet balance</span></div><dl className="dashboard-breakdown"><div><dt>Pending</dt><dd>{dashboardMoney(pending)}</dd></div>{locked!==undefined?<div><dt>Locked / reserved</dt><dd>{dashboardMoney(locked)}</dd></div>:null}</dl><Link href="/earnings" className="dashboard-button-secondary">View Earnings <ArrowRight size={15}/></Link><p className="dashboard-footnote">Processing and withdrawn totals are not provided in this snapshot. See Earnings for history. Withdrawal eligibility and provider availability are checked separately.</p></div>;
}
export function DashboardAllowance({label,used,limit,remaining,detail}:{label:string;used?:number;limit:number|null;remaining?:number;detail?:string}) {
  return <div className="dashboard-allowance"><div><b>{label}</b><span>{used===undefined?limit===null?'No fixed limit':`${limit} allowed`:`${used} of ${limit??'unlimited'} used`}</span></div>{limit!==null&&used!==undefined?<progress value={Math.min(used,limit)} max={Math.max(1,limit)} aria-label={label}/>:null}{remaining!==undefined?<small>{remaining} remaining</small>:null}{detail?<p>{detail}</p>:null}</div>;
}
export function DashboardChallengePreview({row,participant=false}:{row:DashboardRecord;participant?:boolean}) {
  const action=participant?{label:'View Challenge',href:`/challenges/${encodeURIComponent(row.id)}`} : dashboardChallengeAction(row);
  const image=typeof row.coverImageUrl==='string'?row.coverImageUrl:null;
  const deadline=row.submissionDeadline??row.endsAt??row.votingDeadline;
  return <article className="dashboard-preview" data-dashboard-preview><div className="dashboard-preview-image">{<DashboardCover src={image} title={String(row.title??row.challengeTitle??'Challenge')}/> }<span>{dashboardStatus(row).replaceAll('_',' ')}</span></div><div className="dashboard-preview-content"><h3>{String(row.title??row.challengeTitle??'Untitled challenge')}</h3><div className="dashboard-preview-counts">{participant?<span>Participation</span>:<><span>{dashboardCount(row.participantCount)?.toLocaleString()??'—'} participants</span><span>{dashboardCount(row.submissionCount)?.toLocaleString()??'—'} entries</span></>}</div>{deadline?<p className="dashboard-caption"><CalendarDays size={14}/>{formatChallengeDateTime(deadline,row)??'Schedule available in details'}</p>:<p className="dashboard-caption">{dashboardStatus(row)==='draft'?'Not published yet':'Schedule in challenge details'}</p>}<Link href={action.href} className="dashboard-button-secondary">{action.label}<ArrowRight size={14}/></Link></div></article>;
}
