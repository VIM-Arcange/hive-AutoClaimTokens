const { Client, PrivateKey, Asset } = require('@hiveio/dhive')
const fs = require('fs')
const axios = require('axios')
const keys = require("../hive-keys")

const config = JSON.parse(fs.readFileSync('settings.json'))
const hiveClient = new Client('https://api.hive.blog');
const heContracts = "https://api.hive-engine.com/rpc/contracts"

const bDebug = process.env.DEBUG==="true"

const msSecond = 1 * 1000
const msMinute = 60 * msSecond
const msHour = 60 * msMinute

const second = 1
const minute = 60 * second
const hour = 60 * minute

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

function service() {
  try {
    config.accounts.forEach(async account => {
      const oKeys = keys.find(o => o.name == account.name)
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
  
        hiveClient.broadcast.sendOperations([op], PrivateKey.from(oKeys.posting))
        .then(res => {
          //console.log(res)
          log(`${account.name} claimed ${pending_tokens.map(x => x.symbol)}`)
        })
        .catch(err => log(err) )
      }
      // if(account.transfer) {
      //   let ops = 0
      //   const balances = await getBalances(account.name)
      //   balances.filter(o => o.balance > 0).forEach(async balance => {
      //     const op = [ 
      //       "custom_json",
      //       {
      //         required_auths: [],
      //         required_posting_auths: [account.name],
      //         id: "ssc-mainnet-hive",
      //         json: JSON.stringify({
      //           contractName: "tokens",
      //           contractAction: "transfer",
      //           contractPayload: {
      //             symbol: balance.symbol,
      //             to: account.transfer,
      //             quantity: balance.balance,
      //             memo: "",
      //           },
      //         })
      //       }
      //     ]
      //     try {
      //       const res = await hiveClient.broadcast.sendOperations([op], PrivateKey.from(oKeys.posting))
      //       console.log(account.name, res)
      //       // if(++ops>=5) {
      //         const r2 = await sleep(3000)
      //         console.log(account.name,"waited")
      //       //   ops = 0
      //       // }
      //     } catch(e) {
      //       console.log(e.message)
      //     }
      //     // ops.push(op)
      //   })
      //   // if(ops.length) {
      //   //   const res = await hiveClient.broadcast.sendOperations(ops, PrivateKey.from(oKeys.posting))
      //   //   console.log(res)
      //   // }
      // }
    })
  } catch (e) {
    log(e.message);
  }
}

(async () => {
  if(bDebug) {
    log("Debug Started ")
    service()
  } else {
    log("Service Started ")
    log(`Interval: ${config.interval.toString()} hour(s)`)
    log(`users: ${config.accounts.map(o => o.name)}`)
    service();
    setInterval(service, config.interval * msHour)
  }
})();
