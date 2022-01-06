import { Address, BigInt, log } from '@graphprotocol/graph-ts'

import { StakingRewardsHotpot as StakingRewardsContract} from '../../generated/templates/StakingRewardsHotpot/StakingRewardsHotpot'
import { RewardAdded } from '../../generated/templates/StakingRewardsHotpot/StakingRewardsHotpot'
import { getRewarder } from '../entities'

export function rewardAdded(event: RewardAdded): void {
  log.info('[MasterChefV2:StakingRewarder] Log Reward Added {}', [
    event.params.reward.toString()
  ])
  const rewarderContract = StakingRewardsContract.bind(event.address)

  const rewarder = getRewarder(event.address, event.block)
  rewarder.rewardPerSecond = rewarderContract.rewardPerSecond()
  rewarder.save()
}
