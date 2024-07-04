const { Client, PrivateKey, Asset } = require('@hiveio/dhive')
const fs = require('fs')
const axios = require('axios')
const keys = require("../hive-keys")

const settings = JSON.parse(fs.readFileSync('settings.json'))
const hiveClient = new Client(settings.nodes);
const heContracts = "https://api.hive-engine.com/rpc/contracts"

const bDebug = process.env.DEBUG==="true"

const msSecond = 1 * 1000
const msMinute = 60 * msSecond
const msHour = 60 * msMinute

const second = 1
const minute = 60 * second
const hour = 60 * minute

function getRndInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1) ) + min;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function datetoISO(date) {
  return date.toISOString().replace(/T|Z/g," ")
}

function log(message) {
  console.log(`${datetoISO(new Date())} - ${message}`);
}

function logerror(message, info="") {
  console.error(`${datetoISO(new Date())} - ${message}`);
  if(!bDebug) {
    notify(`[hive-ACR] ${message}`, info)
  }
}

async function get_pending_tokens(account) {
  const pending = []
  const tokens = (await axios.get(`https://scot-api.hive-engine.com/@${account}`)).data
  if(tokens) {
    for (const symbol in tokens) {
      if (tokens[symbol].pending_token > 0) {
        pending.push({symbol})
      }
    }
  }
  return pending
}

async function getBalances(name) {
  const call = {
    id:1,
    jsonrpc:"2.0",
    method:"find",
    params:
          {
          contract: "tokens",
          table: "balances",
          query: {account: name},
          limit: 100,
          offset: 0,
          indexes: []
      }
  }
  return (await axios.post(heContracts, call)).data.result
}

async function service() {
  try {
    for(const account of settings.accounts) {
      const opsHE = [];
      const oKeys = keys.find(o => o.name == account.name)
      const balances = await getBalances(account.name)
      const pending_tokens = await get_pending_tokens(account.name)
      if (pending_tokens.length > 0) {
        const op = [
          'custom_json',
          {
            required_auths: [],
            required_posting_auths: [account.name],
            id: 'scot_claim_token',
            json: JSON.stringify(pending_tokens),
          },
        ]

        try {
          const res = await hiveClient.broadcast.sendOperations([op], PrivateKey.from(oKeys.posting))
          //console.log(res)
          log(`${account.name} claimed ${pending_tokens.map(x => x.symbol)}`)
          await sleep(getRndInteger(3,9) * msSecond)
        } catch(e) {
          logerror(e.message)
        }
      }
      if(account.unstake) {
        balances.filter(o => o.stake > 0 && o.pendingUnstake == 0).forEach(async balance => {
          if(JSON.stringify(opsHE).length < 8000 && (!account.unstake.exclude || !account.unstake.exclude.includes(balance.symbol))) {
            log(`${account.name} unstake ${balance.stake} ${balance.symbol}`)
            opsHE.push({
              contractName: "tokens",
              contractAction: "unstake",
              contractPayload: {
                symbol: balance.symbol,
                quantity: balance.stake.toString()
              }
            })
          }
        })
      }
      if(account.transfer) {
        balances.filter(o => o.balance > 0).forEach(async balance => {
          if(JSON.stringify(opsHE).length < 8000 && (!account.transfer.exclude || !account.transfer.exclude.includes(balance.symbol))) {
            log(`${account.name} transfer ${balance.balance} ${balance.symbol} to ${account.transfer.to}`)
            opsHE.push({
              contractName: "tokens",
              contractAction: "transfer",
              contractPayload: {
                symbol: balance.symbol,
                to: account.transfer.to,
                quantity: balance.balance.toString(),
                memo: "",
              }
            })
          }
        })
      }
      if(opsHE.length) {
        const op = [
          "custom_json",
          {
            required_auths: [account.name],
            required_posting_auths: [],
            id: 'ssc-mainnet-hive',
            json: JSON.stringify(opsHE)
          }
        ]
        try {
          const res = await hiveClient.broadcast.sendOperations([op], PrivateKey.from(oKeys.active))
          log(`${account.name} broadcasted custom_json - txid: ${res.id}`)
          await sleep(getRndInteger(3,9) * msSecond)
        } catch(e) {
          console.log(e.message)
        }
      }
    }
  } catch (e) {
    log(e.stack);
  }
  await sleep(2000) // wait a bit to avoid triggering HE node rate limiting
}

(async () => {
  if(bDebug) {
    log("Debug Started ")
    service()
  } else {
    log("Service Started ")
    log(`Interval: ${settings.interval.toString()} hour(s)`)
    log(`users: ${settings.accounts.map(o => o.name)}`)
    service();
    setInterval(service, settings.interval * msHour)
  }
})();
