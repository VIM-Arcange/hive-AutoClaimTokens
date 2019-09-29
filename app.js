const { Client, PrivateKey, Asset } = require('dsteem');
const fs = require('fs');
const axios = require('axios');

const client = new Client('https://api.steemit.com');
const config = JSON.parse(fs.readFileSync('settings.json'))

const log = (message) => {
  console.log(`${new Date().toString()} - ${message}`);
};

async function get_pending_tokens(account) {
  const pending = []
  const tokens = (await axios.get(`https://scot-api.steem-engine.com/@${account}`)).data
  if(tokens) {
    for (const symbol in tokens) {
      if (tokens[symbol].pending_token > 0) {
        pending.push({symbol})
      }
    }
  }
  return pending
}

function process() {
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
  
        client.broadcast.sendOperations([op], PrivateKey.from(account.posting))
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
  log("Process Started ")
  console.log(`users: ${config.accounts.map(o => o.name)}`)
  console.log(`Interval: ${config.interval.toString()} hour(s)`)
  process();

  // Running `startProcessing` function every hour
  setInterval(startProcessing, config.interval * 60 * 60 * 1000);
})();
