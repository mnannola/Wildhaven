import type {Species} from './sim';

export type Population=Record<Species,number>;
export type DeathCause='predation'|'combat'|'hunger'|'thirst'|'oldAge'|'other';
export type EcosystemSample={time:number;population:Population;grass:number;grassCapacity:number;fish:number;fishCapacity:number;meat:number;hungry:number;thirsty:number;exhausted:number};
export type EcosystemStats={startedAt:number;samples:EcosystemSample[];added:Population;births:Population;removed:Population;deaths:Record<DeathCause,Population>;hunts:Record<'wolf'|'bear',{started:number;successful:number;failed:number}>;fishCaught:number;grassEaten:number;meatEaten:number};
export const population=():Population=>({deer:0,wolf:0,bear:0});
export function createStatistics(time=0):EcosystemStats{return {startedAt:time,samples:[],added:population(),births:population(),removed:population(),deaths:{predation:population(),combat:population(),hunger:population(),thirst:population(),oldAge:population(),other:population()},hunts:{wolf:{started:0,successful:0,failed:0},bear:{started:0,successful:0,failed:0}},fishCaught:0,grassEaten:0,meatEaten:0};}
