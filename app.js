const { Client, PrivateKey, Asset } = require('@hiveio/dhive')
const fs = require('fs')
const axios = require('axios')

const config = JSON.parse(fs.readFileSync('settings.json'))
const hiveClient = new Client('https://api.hive.blog');
hiveClient.database.getVersion().then((res) => {
  //console.log("blockchain version",res.blockchain_version)
  if (res.blockchain_version !== '0.23.0') {
    hiveClient.updateOperations(true)
  }
})


const bDebug = process.env.DEBUG==="true"

const msSecond = 1 * 1000
const msMinute = 60 * msSecond
const msHour = 60 * msMinute

const second = 1
const minute = 60 * second
const hour = 60 * minute

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
  const tokens = (await axios.get(`https://scot-api.steem-engine.com/@${account}?hive=1`)).data
  if(tokens) {
    for (const symbol in tokens) {
      if (tokens[symbol].pending_token > 0) {
        pending.push({symbol})
      }
    }
  }
  return pending
}

function service() {
  try {
    config.accounts.forEach(async account => {
      const pending_tokens = await get_pending_tokens(account.name)

      if (pending_tokens.length > 0) {
        const op = [
          'custom_json',
          {
            id: 'scot_claim_token',
            required_auths: [],
            required_posting_auths: [account.name],
            json: JSON.stringify(pending_tokens),
          },
        ]
  
        hiveClient.broadcast.sendOperations([op], PrivateKey.from(account.keyPosting))
        .then(res => {
          //console.log(res)
          log(`${account.name} claimed ${pending_tokens.map(x => x.symbol)}`)
        })
        .catch(err => log(err) )
      }
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
