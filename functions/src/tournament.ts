import _ from 'lodash';
import { getPerFighterMatchStats } from './matches/matchesUtils';

/*
-- Example 128 Fighter Bracket --
Round of 64 (a, 32 matchups) - zeta   \
                                        total 128 fighters
Round of 64 (b, 32 matchups) - theta  /
Round of 32 (a, 16 matchups) - zeta   \
                                        total 64 fighters
Round of 32 (b, 16 matchups) - theta  /
Round of 16 (a) - zeta   \
                           total 32 fighters
Round of 16 (b) - theta  /
Round of 16 (a + b, combined) - sigma
Round of 8 - sigma
Round of 4 - sigma
Round of 2 (final match) - omega
*/

const isFightingBlock = (blockNumber: string): boolean => {
  return _.floor(parseInt(blockNumber, 10) / 10 % 2) === 1;
};

export const scheduleTournamentForBlock = async (
  db: any,
  blockNumber: string
) => {
  const block = increasedToNextFightingBlock(blockNumber);
  try {
    await scheduleTournamentFirstBrackets(db, block);
    await scheduleTournamentFinalistBrackets(db, block);
  } catch (error) {
    console.error(`scheduleTournamentForBlock error ${error}`);
  }
};

const addedNumberToBlock = (blockNumber: string, numberToAdd: number): string => {
  return (parseInt(blockNumber, 10) + numberToAdd).toString();
};
/*
There are ~6500 blocks every day. We want about 2 hours between rounds, which is 270 blocks.
*/
const twoHoursOfBlocks = 270;

export const scheduleTournamentFirstBrackets = async (
  db: any,
  blockNumber: string,
) => {
  const fighters = await getAllFightersRankedOrder(db);
  const [firstHalf, secondHalf] = inHalf(fighters);
  const paired = zip(firstHalf, secondHalf);

  const zeta: any[] = [];
  const theta: any[] = [];

  paired.forEach((matchup, index) => {
    if (index % 2 === 0) {
      zeta.push(matchup);
    } else {
      theta.push(matchup);
    }
  });

  scheduleBracket(db, 'zeta', 3, zeta, blockNumber);
  scheduleEmptyBracket(db, 'zeta', 3, zeta.length / 2, addedNumberToBlock(blockNumber, twoHoursOfBlocks), 1);
  scheduleEmptyBracket(db, 'zeta', 3, zeta.length / 4, addedNumberToBlock(blockNumber, twoHoursOfBlocks * 2), 2);

  scheduleBracket(db, 'theta', 3, theta, blockNumber);
  scheduleEmptyBracket(db, 'theta', 3, theta.length / 2, addedNumberToBlock(blockNumber, twoHoursOfBlocks), 1);
  scheduleEmptyBracket(db, 'theta', 3, theta.length / 4, addedNumberToBlock(blockNumber, twoHoursOfBlocks * 2), 2);
};

export const scheduleTournamentFinalistBrackets = async (
  db: any,
  firstRoundBlockStart: string,
) => {
  /*
  We want our finalist rounds, sigma and omega, to start the following day at approximately the same time.
  */
  const sigmaStart = addedNumberToBlock(firstRoundBlockStart, 6500);
  const sigmaSize = 16;

  scheduleEmptyBracket(db, 'sigma', 5, sigmaSize, sigmaStart, 0);
  scheduleEmptyBracket(db, 'sigma', 5, sigmaSize, addedNumberToBlock(sigmaStart, twoHoursOfBlocks), 1);
  scheduleEmptyBracket(db, 'sigma', 5, sigmaSize, addedNumberToBlock(sigmaStart, twoHoursOfBlocks * 2), 2);

  scheduleEmptyBracket(db, 'omega', 7, 1, addedNumberToBlock(sigmaStart, twoHoursOfBlocks * 3), 0);
};

const zip = (left: any[], right: any[]): any[] => {
  return left.map(function(item, i) {
    return [item, right[i]];
  });
};

const getAllFightersRankedOrder = async (db: any) => {
  const snapshot = await db.collection('nft-death-games')
    .doc('season_0')
    .collection('fighters')
    .where('is_doping', '==', false)
    .where('is_invalid', '==', false)
    .orderBy('ranking')
    .get();
  return snapshot.docs.map((f: any) => f.data());
};

const inHalf = (array: any[]): any[] => {
  const midIndex = Math.ceil(array.length / 2);

  const firstHalf = array.slice(0, midIndex);
  const secondHalf = array.slice(-midIndex).reverse();
  return [firstHalf, secondHalf];
};

const tournamentPath = (db: any) => {
  return db.collection('nft-death-games').doc('season_0').collection('tournament');
};

const fightsPath = (db: any) => {
  return db.collection('nft-death-games').doc('season_0').collection('fights');
};

export const runFightsForBlock = async (
  db: any,
  blockNumber: string,
) => {
  try {
    const fights = await fightsPath(db)
      .where('block', '==', blockNumber)
      .get();
    Promise.all(fights
      .docs
      .map((f: any) => f.data())
      .map(async (fight: any) => {
        console.log(`HMM ${fight.id}`);
        return fightsPath(db)
          .doc(fight.id)
          .update({
            simulate: true
          });
      }));
  } catch (error) {
    console.error(`runFightsForBlock error: ${error}`);
  }
};

export const scheduleEmptyBracket = async (
  db: any,
  bracketName: string,
  bestOfFights: number,
  matchupCount: number,
  blockNumber: string,
  roundNumber: number,
) => {
  for (let i = 0; i < matchupCount; i++) {
    const matchupId = `${roundNumber}-${i}`;
    try {
      await tournamentPath(db)
        .doc(bracketName)
        .collection('matches')
        .doc(matchupId)
        .create({
          best_of: bestOfFights,
          bracket: bracketName,
          fighter1FightWins: 0,
          fighter2FightWins: 0,
          round: roundNumber,
          slot: i,
          startingBlock: blockNumber,
        });

      console.log(`Scheduled empty bracket ${bracketName} round ${roundNumber} bracket succeeded.`);
    } catch (error) {
      console.error(`Scheduling empty bracket ${bracketName} round ${roundNumber} failed: ${error}`);
    }

    try {
      await scheduleFightsForTournamentMatchup(db, bracketName, bestOfFights, matchupId, blockNumber);
      console.log(`Scheduling fights for matchup ${bracketName} succeeded.`);
    } catch (error) {
      console.error(`Scheduling empty fights for ${bracketName} round ${roundNumber} failed: ${error}`);
    }
  }
};

export const scheduleBracket = async (
  db: any,
  bracketName: string,
  bestOfFights: number,
  matchups: any[],
  blockNumber: string,
) => {
  await Promise.all(matchups.map(async (matchup: any, index: number) => {
    const [higher, lower] = matchup;
    const matchupId = `0-${index}`;
    try {
      await tournamentPath(db)
        .doc(bracketName)
        .collection('matches')
        .doc(matchupId)
        .create({
          best_of: bestOfFights,
          bracket: bracketName,
          fighter1: higher,
          fighter2: lower,
          fighter1FightWins: 0,
          fighter2FightWins: 0,
          rank1: higher.ranking,
          rank2: lower.ranking,
          round: 0,
          slot: index,
          startingBlock: blockNumber,
        });

      console.log(`Scheduling ${bracketName} bracket succeeded.`);
    } catch (error) {
      console.error(`Creating tournament ${bracketName} match between ${higher.id} and ${lower.id} failed: ${error}`);
    }

    try {
      await scheduleFightsForTournamentMatchup(db, bracketName, bestOfFights, matchupId, blockNumber, higher, lower);
      console.log(`Scheduling fights for matchup ${bracketName} succeeded.`);
    } catch (error) {
      console.error(`Scheduling fights for ${bracketName} match between ${higher.id} and ${lower.id} failed: ${error}`);
    }
  }));
};

const increasedToNextFightingBlock = (block: string): string => {
  if (!isFightingBlock(block)) {
    return addedNumberToBlock(block, 10).toString();
  }
  return block;
};

export const scheduleFightsForTournamentMatchup = async (
  db: any,
  bracketName: string,
  bestOf: number,
  matchupId: string,
  blockNumber: string,
  fighter1?: any,
  fighter2?: any,
) => {
  try {
    console.log(`scheduleFightsForTournamentMatchup with ${bestOf} rounds.`);
    for (let i = 0; i < bestOf; i++) {
      let fightBlock = addedNumberToBlock(blockNumber, i).toString();
      fightBlock = increasedToNextFightingBlock(fightBlock);

      const id = `${bracketName}-${matchupId}-${i}`;
      const fight: any = {
        block: fightBlock,
        bracket: bracketName,
        id,
        log: '',
        match_id: matchupId,
        randomness: '',
      };

      if (fighter1 != null && fighter2 != null) {
        fight.fighter1 = fighter1;
        fight.fighter2 = fighter2;
      }

      fight.isFinalFight = i === (bestOf - 1);

      await db
        .collection('nft-death-games')
        .doc('season_0')
        .collection('fights')
        .doc(id)
        .create(fight);
    }
  } catch (error) {
    console.error(`scheduleFightsForTournamentMatchup error ${error}`);
  }
};

const seasonPath = (db: any) => {
  return db.collection('nft-death-games').doc('season_0');
};

export const updateStatsForFightResult = async (
  db: any,
  fight: any
) => {
  const { stats1, stats2 } = getPerFighterMatchStats(fight.log, fight.fighter1.player, fight.fighter2.player);
  try {
    await seasonPath(db)
      .collection('fights')
      .doc(fight.id)
      .update({
        stats1,
        stats2,
        updateStats: false,
        statsDone: true,
      });

    [fight.fighter1, fight.fighter2].forEach(async (fighter) => {
      await seasonPath(db)
        .collection('fighters')
        .doc(fighter.id)
        .update({
          updateStats: true,
        });
    });

    const matchPath = seasonPath(db).collection('tournament').doc(fight.bracket).collection('matches').doc(fight.match_id);

    const snap = await matchPath.get();
    const match = snap.data();

    const newFighter1Wins = match.fighter1FightWins + (stats1.won ? 1 : 0);
    const newFighter2Wins = match.fighter2FightWins + (stats2.won ? 1 : 0);
    await matchPath.update({
      fighter1FightWins: newFighter1Wins,
      fighter2FightWins: newFighter2Wins
    });

    if (fight.isFinalFight) {
      const fighter1WonMatch = newFighter1Wins > newFighter2Wins;
      moveFighterToNextRound(db, fighter1WonMatch ? match.fighter1 : match.fighter2, match);
    }
  } catch (error) {
    console.error(`updateStatsForFightResult error ${error}`);
  }
};

const moveFighterToNextRound = async (db: any, fighter: any, matchFighterWon: any) => {
  const nextRound = matchFighterWon.round + 1;
  const nextSlot = Math.floor(matchFighterWon.slot / 2);

  const matchPath = seasonPath(db)
    .collection('tournament')
    .doc(matchFighterWon.bracket)
    .collection('matches')
    .doc(`${nextRound}-${nextSlot}`);

  /* We retain above/below ordering for visual continuity in a bracket. For example:
  a _
     \
      b
  b _/

  c _
     \
      d
  d _/
  For the next round, we always want the winner of c-d to be slotted into player2, and winner of a-b into player1.
  */
  const wasUpperSlot = matchFighterWon.slot % 2 === 0;
  if (wasUpperSlot) {
    await matchPath.update({
      fighter1: fighter
    });
  } else {
    await matchPath.update({
      fighter2: fighter
    });
  }
};
