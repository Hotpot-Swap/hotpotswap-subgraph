import { BIG_INT_ZERO, HOTPOT_TOKEN_ADDRESS } from 'const'
import { dataSource, ethereum } from '@graphprotocol/graph-ts'

import { MiniChef } from '../../generated/schema'

export function getMiniChef(block: ethereum.Block): MiniChef {
  let miniChef = MiniChef.load(dataSource.address().toHex())

  if (miniChef === null) {
    miniChef = new MiniChef(dataSource.address().toHex())
    miniChef.hotpot = HOTPOT_TOKEN_ADDRESS
    miniChef.hotpotPerSecond = BIG_INT_ZERO
    miniChef.totalAllocPoint = BIG_INT_ZERO
    miniChef.poolCount = BIG_INT_ZERO
    miniChef.timestamp = block.timestamp
    miniChef.block = block.number
    miniChef.save()
  }

  return miniChef as MiniChef
}
