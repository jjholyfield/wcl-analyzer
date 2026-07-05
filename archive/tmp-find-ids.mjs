import { readFileSync } from 'fs';
const S = 'C:/Users/jjhol/.openclaw/workspace/.secrets';
const CID = readFileSync(S+'/warcraftlogs-v2-client-id.txt','utf8').trim();
const CS = readFileSync(S+'/warcraftlogs-v2-client-secret.txt','utf8').trim();
const creds = Buffer.from(CID+':'+CS).toString('base64');
const t = await fetch('https://www.warcraftlogs.com/oauth/token',{method:'POST',headers:{'Authorization':'Basic '+creds,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
const td = await t.json();
const token = td.access_token;
async function gql(q){const r=await fetch('https://www.warcraftlogs.com/api/v2/client',{method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query:q})});return r.json();}

for (const fid of [1, 15]) {
  console.log(`\n=== Fight #${fid} healers ===`);
  const pd = await gql(`{ reportData { report(code: "x2jCDbqdvWHwKQFM") { playerDetails(fightIDs: [${fid}]) } } }`);
  const details = pd.data?.reportData?.report?.playerDetails?.data?.playerDetails;
  if (details) {
    for (const p of (details.healers || [])) {
      console.log(`  ${p.name} — id: ${p.id}, type: ${p.type}, spec: ${p.specs?.[0]?.spec}`);
    }
  }
}
