import { Address, log } from '@graphprotocol/graph-ts'
import { FACTORY_ADDRESS, BIG_DECIMAL_ONE } from 'const'
import { getMaker, getServer } from '../entities'
import { Serving } from '../../generated/schema'
import { Factory as FactoryContract } from '../../generated/HotpotMaker/Factory'
import { LogConvert } from '../../generated/HotpotMaker/HotpotMaker'


export function handleLogConvert(event: LogConvert): void {
  log.info('[HotpotMaker] Log Convert {} {} {} {} {} {}', [
    event.params.server.toHex(),
    event.params.token0.toHex(),
    event.params.token1.toHex(),
    event.params.amount0.toString(),
    event.params.amount1.toString(),
    event.params.amountHOTPOT.toString()
  ])

  const maker = getMaker(event.block)
  const server = getServer(event.params.server, event.block)

  const factoryContract = FactoryContract.bind(FACTORY_ADDRESS)
  const pair = factoryContract.getPair(event.params.token0, event.params.token1)

  const id = pair.toHex().concat('-').concat(event.block.number.toString())
  let serving = new Serving(id)

  serving.maker = maker.id
  serving.server = server.id
  serving.tx = event.transaction.hash
  serving.token0 = event.params.token0
  serving.token1 = event.params.token1
  serving.amount0 = event.params.amount0
  serving.amount1 = event.params.amount1
  serving.amountHotpot = event.params.amountHOTPOT
  serving.block = event.block.number
  serving.timestamp = event.block.timestamp
  serving.save()

  maker.hotpotServed = maker.hotpotServed.plus(event.params.amountHOTPOT)
  maker.totalServings = maker.totalServings.plus(BIG_DECIMAL_ONE)
  maker.save()

  server.hotpotServed = server.hotpotServed.plus(event.params.amountHOTPOT)
  server.totalServings = server.totalServings.plus(BIG_DECIMAL_ONE)
  server.save()
}
