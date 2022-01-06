import {
  ADDRESS_ZERO,
  BIG_DECIMAL_1E18,
  BIG_DECIMAL_1E6,
  BIG_DECIMAL_ZERO,
  BIG_INT_ZERO,
  HOTPOT_BAR_ADDRESS,
  HOTPOT_TOKEN_ADDRESS,
  HOTPOT_USDT_PAIR_ADDRESS,
} from 'const'
import { Address, BigDecimal, BigInt, dataSource, ethereum, log } from '@graphprotocol/graph-ts'
import { Bar, History, User } from '../generated/schema'
import { Bar as BarContract, Transfer as TransferEvent } from '../generated/HotpotBar/Bar'

import { Pair as PairContract } from '../generated/HotpotBar/Pair'
import { HotpotToken as HotpotTokenContract } from '../generated/HotpotBar/HotpotToken'

// TODO: Get averages of multiple hotpot stablecoin pairs
function getHotpotPrice(): BigDecimal {
  const pair = PairContract.bind(HOTPOT_USDT_PAIR_ADDRESS)
  const reserves = pair.getReserves()
  return reserves.value1.toBigDecimal().times(BIG_DECIMAL_1E18).div(reserves.value0.toBigDecimal()).div(BIG_DECIMAL_1E6)
}

function createBar(block: ethereum.Block): Bar {
  const contract = BarContract.bind(dataSource.address())
  const bar = new Bar(dataSource.address().toHex())
  bar.decimals = contract.decimals()
  bar.name = contract.name()
  bar.hotpot = contract.hotpot()
  bar.symbol = contract.symbol()
  bar.totalSupply = BIG_DECIMAL_ZERO
  bar.hotpotStaked = BIG_DECIMAL_ZERO
  bar.hotpotStakedUSD = BIG_DECIMAL_ZERO
  bar.hotpotHarvested = BIG_DECIMAL_ZERO
  bar.hotpotHarvestedUSD = BIG_DECIMAL_ZERO
  bar.xHotpotMinted = BIG_DECIMAL_ZERO
  bar.xHotpotBurned = BIG_DECIMAL_ZERO
  bar.xHotpotAge = BIG_DECIMAL_ZERO
  bar.xHotpotAgeDestroyed = BIG_DECIMAL_ZERO
  bar.ratio = BIG_DECIMAL_ZERO
  bar.updatedAt = block.timestamp
  bar.save()

  return bar as Bar
}

function getBar(block: ethereum.Block): Bar {
  let bar = Bar.load(dataSource.address().toHex())

  if (bar === null) {
    bar = createBar(block)
  }

  return bar as Bar
}

function createUser(address: Address, block: ethereum.Block): User {
  const user = new User(address.toHex())

  // Set relation to bar
  user.bar = dataSource.address().toHex()

  user.xHotpot = BIG_DECIMAL_ZERO
  user.xHotpotMinted = BIG_DECIMAL_ZERO
  user.xHotpotBurned = BIG_DECIMAL_ZERO

  user.hotpotStaked = BIG_DECIMAL_ZERO
  user.hotpotStakedUSD = BIG_DECIMAL_ZERO

  user.hotpotHarvested = BIG_DECIMAL_ZERO
  user.hotpotHarvestedUSD = BIG_DECIMAL_ZERO

  // In/Out
  user.xHotpotOut = BIG_DECIMAL_ZERO
  user.hotpotOut = BIG_DECIMAL_ZERO
  user.usdOut = BIG_DECIMAL_ZERO

  user.xHotpotIn = BIG_DECIMAL_ZERO
  user.hotpotIn = BIG_DECIMAL_ZERO
  user.usdIn = BIG_DECIMAL_ZERO

  user.xHotpotAge = BIG_DECIMAL_ZERO
  user.xHotpotAgeDestroyed = BIG_DECIMAL_ZERO

  user.xHotpotOffset = BIG_DECIMAL_ZERO
  user.hotpotOffset = BIG_DECIMAL_ZERO
  user.usdOffset = BIG_DECIMAL_ZERO
  user.updatedAt = block.timestamp

  return user as User
}

function getUser(address: Address, block: ethereum.Block): User {
  let user = User.load(address.toHex())

  if (user === null) {
    user = createUser(address, block)
  }

  return user as User
}

function getHistory(block: ethereum.Block): History {
  const day = block.timestamp.toI32() / 86400

  const id = BigInt.fromI32(day).toString()

  let history = History.load(id)

  if (history === null) {
    const date = day * 86400
    history = new History(id)
    history.date = date
    history.timeframe = 'Day'
    history.hotpotStaked = BIG_DECIMAL_ZERO
    history.hotpotStakedUSD = BIG_DECIMAL_ZERO
    history.hotpotHarvested = BIG_DECIMAL_ZERO
    history.hotpotHarvestedUSD = BIG_DECIMAL_ZERO
    history.xHotpotAge = BIG_DECIMAL_ZERO
    history.xHotpotAgeDestroyed = BIG_DECIMAL_ZERO
    history.xHotpotMinted = BIG_DECIMAL_ZERO
    history.xHotpotBurned = BIG_DECIMAL_ZERO
    history.xHotpotSupply = BIG_DECIMAL_ZERO
    history.ratio = BIG_DECIMAL_ZERO
  }

  return history as History
}

export function transfer(event: TransferEvent): void {
  // Convert to BigDecimal with 18 places, 1e18.
  const value = event.params.value.divDecimal(BIG_DECIMAL_1E18)

  // If value is zero, do nothing.
  if (value.equals(BIG_DECIMAL_ZERO)) {
    log.warning('Transfer zero value! Value: {} Tx: {}', [
      event.params.value.toString(),
      event.transaction.hash.toHex(),
    ])
    return
  }

  const bar = getBar(event.block)
  const barContract = BarContract.bind(HOTPOT_BAR_ADDRESS)

  const hotpotPrice = getHotpotPrice()

  bar.totalSupply = barContract.totalSupply().divDecimal(BIG_DECIMAL_1E18)
  bar.hotpotStaked = HotpotTokenContract.bind(HOTPOT_TOKEN_ADDRESS)
    .balanceOf(HOTPOT_BAR_ADDRESS)
    .divDecimal(BIG_DECIMAL_1E18)
  bar.ratio = bar.hotpotStaked.div(bar.totalSupply)

  const what = value.times(bar.ratio)

  // Minted xHotpot
  if (event.params.from == ADDRESS_ZERO) {
    const user = getUser(event.params.to, event.block)

    log.info('{} minted {} xHotpot in exchange for {} hotpot - hotpotStaked before {} hotpotStaked after {}', [
      event.params.to.toHex(),
      value.toString(),
      what.toString(),
      user.hotpotStaked.toString(),
      user.hotpotStaked.plus(what).toString(),
    ])

    if (user.xHotpot == BIG_DECIMAL_ZERO) {
      log.info('{} entered the bar', [user.id])
      user.bar = bar.id
    }

    user.xHotpotMinted = user.xHotpotMinted.plus(value)

    const hotpotStakedUSD = what.times(hotpotPrice)

    user.hotpotStaked = user.hotpotStaked.plus(what)
    user.hotpotStakedUSD = user.hotpotStakedUSD.plus(hotpotStakedUSD)

    const days = event.block.timestamp.minus(user.updatedAt).divDecimal(BigDecimal.fromString('86400'))

    const xHotpotAge = days.times(user.xHotpot)

    user.xHotpotAge = user.xHotpotAge.plus(xHotpotAge)

    // Update last
    user.xHotpot = user.xHotpot.plus(value)

    user.updatedAt = event.block.timestamp

    user.save()

    const barDays = event.block.timestamp.minus(bar.updatedAt).divDecimal(BigDecimal.fromString('86400'))
    const barXhotpot = bar.xHotpotMinted.minus(bar.xHotpotBurned)
    bar.xHotpotMinted = bar.xHotpotMinted.plus(value)
    bar.xHotpotAge = bar.xHotpotAge.plus(barDays.times(barXhotpot))
    bar.hotpotStaked = bar.hotpotStaked.plus(what)
    bar.hotpotStakedUSD = bar.hotpotStakedUSD.plus(hotpotStakedUSD)
    bar.updatedAt = event.block.timestamp

    const history = getHistory(event.block)
    history.xHotpotAge = bar.xHotpotAge
    history.xHotpotMinted = history.xHotpotMinted.plus(value)
    history.xHotpotSupply = bar.totalSupply
    history.hotpotStaked = history.hotpotStaked.plus(what)
    history.hotpotStakedUSD = history.hotpotStakedUSD.plus(hotpotStakedUSD)
    history.ratio = bar.ratio
    history.save()
  }

  // Burned xHotpot
  if (event.params.to == ADDRESS_ZERO) {
    log.info('{} burned {} xHotpot', [event.params.from.toHex(), value.toString()])

    const user = getUser(event.params.from, event.block)

    user.xHotpotBurned = user.xHotpotBurned.plus(value)

    user.hotpotHarvested = user.hotpotHarvested.plus(what)

    const hotpotHarvestedUSD = what.times(hotpotPrice)

    user.hotpotHarvestedUSD = user.hotpotHarvestedUSD.plus(hotpotHarvestedUSD)

    const days = event.block.timestamp.minus(user.updatedAt).divDecimal(BigDecimal.fromString('86400'))

    const xHotpotAge = days.times(user.xHotpot)

    user.xHotpotAge = user.xHotpotAge.plus(xHotpotAge)

    const xHotpotAgeDestroyed = user.xHotpotAge.div(user.xHotpot).times(value)

    user.xHotpotAgeDestroyed = user.xHotpotAgeDestroyed.plus(xHotpotAgeDestroyed)

    // remove xHotpotAge
    user.xHotpotAge = user.xHotpotAge.minus(xHotpotAgeDestroyed)
    // Update xHotpot last
    user.xHotpot = user.xHotpot.minus(value)

    if (user.xHotpot == BIG_DECIMAL_ZERO) {
      log.info('{} left the bar', [user.id])
      user.bar = null
    }

    user.updatedAt = event.block.timestamp

    user.save()

    const barDays = event.block.timestamp.minus(bar.updatedAt).divDecimal(BigDecimal.fromString('86400'))
    const barXhotpot = bar.xHotpotMinted.minus(bar.xHotpotBurned)
    bar.xHotpotBurned = bar.xHotpotBurned.plus(value)
    bar.xHotpotAge = bar.xHotpotAge.plus(barDays.times(barXhotpot)).minus(xHotpotAgeDestroyed)
    bar.xHotpotAgeDestroyed = bar.xHotpotAgeDestroyed.plus(xHotpotAgeDestroyed)
    bar.hotpotHarvested = bar.hotpotHarvested.plus(what)
    bar.hotpotHarvestedUSD = bar.hotpotHarvestedUSD.plus(hotpotHarvestedUSD)
    bar.updatedAt = event.block.timestamp

    const history = getHistory(event.block)
    history.xHotpotSupply = bar.totalSupply
    history.xHotpotBurned = history.xHotpotBurned.plus(value)
    history.xHotpotAge = bar.xHotpotAge
    history.xHotpotAgeDestroyed = history.xHotpotAgeDestroyed.plus(xHotpotAgeDestroyed)
    history.hotpotHarvested = history.hotpotHarvested.plus(what)
    history.hotpotHarvestedUSD = history.hotpotHarvestedUSD.plus(hotpotHarvestedUSD)
    history.ratio = bar.ratio
    history.save()
  }

  // If transfer from address to address and not known xHotpot pools.
  if (event.params.from != ADDRESS_ZERO && event.params.to != ADDRESS_ZERO) {
    log.info('transfered {} xHotpot from {} to {}', [
      value.toString(),
      event.params.from.toHex(),
      event.params.to.toHex(),
    ])

    const fromUser = getUser(event.params.from, event.block)

    const fromUserDays = event.block.timestamp.minus(fromUser.updatedAt).divDecimal(BigDecimal.fromString('86400'))

    // Recalc xHotpot age first
    fromUser.xHotpotAge = fromUser.xHotpotAge.plus(fromUserDays.times(fromUser.xHotpot))
    // Calculate xHotpotAge being transfered
    const xHotpotAgeTranfered = fromUser.xHotpotAge.div(fromUser.xHotpot).times(value)
    // Subtract from xHotpotAge
    fromUser.xHotpotAge = fromUser.xHotpotAge.minus(xHotpotAgeTranfered)
    fromUser.updatedAt = event.block.timestamp

    fromUser.xHotpot = fromUser.xHotpot.minus(value)
    fromUser.xHotpotOut = fromUser.xHotpotOut.plus(value)
    fromUser.hotpotOut = fromUser.hotpotOut.plus(what)
    fromUser.usdOut = fromUser.usdOut.plus(what.times(hotpotPrice))

    if (fromUser.xHotpot == BIG_DECIMAL_ZERO) {
      log.info('{} left the bar by transfer OUT', [fromUser.id])
      fromUser.bar = null
    }

    fromUser.save()

    const toUser = getUser(event.params.to, event.block)

    if (toUser.bar === null) {
      log.info('{} entered the bar by transfer IN', [fromUser.id])
      toUser.bar = bar.id
    }

    // Recalculate xHotpot age and add incoming xHotpotAgeTransfered
    const toUserDays = event.block.timestamp.minus(toUser.updatedAt).divDecimal(BigDecimal.fromString('86400'))

    toUser.xHotpotAge = toUser.xHotpotAge.plus(toUserDays.times(toUser.xHotpot)).plus(xHotpotAgeTranfered)
    toUser.updatedAt = event.block.timestamp

    toUser.xHotpot = toUser.xHotpot.plus(value)
    toUser.xHotpotIn = toUser.xHotpotIn.plus(value)
    toUser.hotpotIn = toUser.hotpotIn.plus(what)
    toUser.usdIn = toUser.usdIn.plus(what.times(hotpotPrice))

    const difference = toUser.xHotpotIn.minus(toUser.xHotpotOut).minus(toUser.xHotpotOffset)

    // If difference of hotpot in - hotpot out - offset > 0, then add on the difference
    // in staked hotpot based on xHotpot:Hotpot ratio at time of reciept.
    if (difference.gt(BIG_DECIMAL_ZERO)) {
      const hotpot = toUser.hotpotIn.minus(toUser.hotpotOut).minus(toUser.hotpotOffset)
      const usd = toUser.usdIn.minus(toUser.usdOut).minus(toUser.usdOffset)

      log.info('{} recieved a transfer of {} xHotpot from {}, hotpot value of transfer is {}', [
        toUser.id,
        value.toString(),
        fromUser.id,
        what.toString(),
      ])

      toUser.hotpotStaked = toUser.hotpotStaked.plus(hotpot)
      toUser.hotpotStakedUSD = toUser.hotpotStakedUSD.plus(usd)

      toUser.xHotpotOffset = toUser.xHotpotOffset.plus(difference)
      toUser.hotpotOffset = toUser.hotpotOffset.plus(hotpot)
      toUser.usdOffset = toUser.usdOffset.plus(usd)
    }

    toUser.save()
  }

  bar.save()
}