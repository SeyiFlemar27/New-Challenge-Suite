import assert from 'node:assert/strict';
import { generateTournamentBracket, seedParticipants, resolveTournamentSubmissionDeadline } from '../lib/server/tournament-operations.ts';
import { INDIVIDUAL_TOURNAMENT_POLICY } from '../lib/individual-tournament-policy.ts';
let assertions=0;const check=(condition,label)=>{assert.ok(condition,label);assertions++;};
for(const capacity of [4,8,16,32]) for(const format of ['single_elimination','double_elimination']) {
  const id=`matrix_${capacity}_${format}`;
  const tournament={id,hostId:'host',configVersion:4,productPolicyVersion:INDIVIDUAL_TOURNAMENT_POLICY,participationMode:'individual',participantCapacity:capacity,participantCount:capacity,status:'registration_open',format,resultMethod:'votes',thirdPlaceMethod:'third_place_match',seedingMethod:'random',tieBreaker:'pre_recorded_priority'};
  const participants=Array.from({length:capacity},(_,index)=>({id:id+'_p'+index,tournamentId:id,userId:'u'+index,status:'registered',seed:index+1,createdAt:new Date(index).toISOString()}));
  const result=generateTournamentBracket({tournament,participants,existingMatches:[]});
  check(result.created,`${id}: complete bracket`);
  const ids=new Set(result.matches.map(match=>match.id));
  check(ids.size===result.matches.length,`${id}: unique match identities`);
  const first=result.matches.filter(match=>match.roundNumber===1&&match.bracket==='winners');
  const assigned=first.flatMap(match=>[match.participantAId,match.participantBId]);
  check(first.length===capacity/2&&assigned.length===capacity&&new Set(assigned).size===capacity,`${id}: each confirmed entrant assigned exactly once`);
  check(assigned.every(value=>participants.some(participant=>participant.id===value)),`${id}: no invented entrants`);
  for(const match of result.matches){
    check(!match.winnerParticipantId&&!match.loserParticipantId,`${id}: no preselected result`);
    for(const field of ['nextMatchId','loserNextMatchId','resetMatchId'])if(match[field])check(match[field]!==match.id&&ids.has(match[field]),`${id}: valid ${field}`);
  }
  if(format==='single_elimination'){
    check(result.matches.length===capacity,`${id}: championship matches plus bronze`);
    const bronze=result.matches.find(match=>match.bracket==='bronze');
    check(Boolean(bronze),`${id}: mandatory bronze`);
    check(result.matches.filter(match=>match.loserNextMatchId===bronze.id).length===2,`${id}: both legitimate semifinal losers feed bronze`);
  } else {
    const finals=result.matches.filter(match=>match.bracket==='grand_final');
    check(finals.length===2,`${id}: Grand Final and conditional reset`);
    check(finals.some(match=>match.resetMatchId&&ids.has(match.resetMatchId)),`${id}: reset dependency recorded`);
  }
  check(generateTournamentBracket({tournament,participants:participants.slice(1),existingMatches:[]}).created===false,`${id}: incomplete capacity blocked`);
  check(generateTournamentBracket({tournament,participants,existingMatches:result.matches}).created===false,`${id}: duplicate generation blocked`);
  const shuffled=seedParticipants(participants,'random',id);
  check(shuffled.length===capacity&&new Set(shuffled.map(item=>item.id)).size===capacity,`${id}: server random seeding conserves entrants`);
}
const deadline='2026-10-27T12:00:00Z';
for(const [a,b] of [['approved',null],[null,null],['approved','approved']]){
  check(resolveTournamentSubmissionDeadline({participantAStatus:a,participantBStatus:b,extensionAlreadyUsed:true,submissionDeadlineAt:deadline,now:new Date('2026-10-27T11:59:59.999Z')}).action==='waiting','entire extension stays open regardless of entries');
}
console.log(`Individual Tournament bracket matrix: ${assertions} assertions passed across 4/8/16/32 × SE/DE. This does not verify exceptional recovery or automatic settlement.`);
