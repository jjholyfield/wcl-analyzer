import { readFileSync } from 'fs';
const SECRETS = 'C:/Users/jjhol/.openclaw/workspace/.secrets';
const CLIENT_ID = readFileSync(SECRETS + '/warcraftlogs-v2-client-id.txt', 'utf8').trim();
const CLIENT_SECRET = readFileSync(SECRETS + '/warcraftlogs-v2-client-secret.txt', 'utf8').trim();

let cachedToken = null;
let tokenExpiry = 0;
async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://www.warcraftlogs.com/oauth/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function gql(query) {
  const token = await getToken();
  const res = await fetch('https://www.warcraftlogs.com/api/v2/client', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function main() {
  // Get guild/server info from a known report
  const data = await gql(`{
    reportData {
      report(code: "w9CLGQXPWdDnfcrb") {
        guild { name server { slug region { slug } } }
        owner { name }
        title
      }
    }
  }`);

  const guild = data.reportData.report.guild;
  const owner = data.reportData.report.owner;
  console.log('Guild:', guild?.name, '—', guild?.server?.slug, guild?.server?.region?.slug);
  console.log('Owner:', owner?.name);

  // Now look up character on correct server
  if (guild?.server) {
    const charData = await gql(`{
      characterData {
        character(name: "Senssay", serverSlug: "${guild.server.slug}", serverRegion: "${guild.server.region.slug}") {
          recentReports(limit: 10) {
            data {
              code
              title
              startTime
              endTime
              zone { name }
            }
          }
        }
      }
    }`);

    const reports = charData.characterData?.character?.recentReports?.data || [];
    console.log(`\nRecent reports for Senssay on ${guild.server.slug} (${reports.length}):`);
    for (const r of reports) {
      const date = new Date(r.startTime);
      const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      console.log(`  ${r.code} — ${dateStr} — ${r.title || r.zone?.name}`);
    }

    // Also try guild reports
    if (guild?.name) {
      const guildData = await gql(`{
        reportData {
          reports(guildName: "${guild.name}", guildServerSlug: "${guild.server.slug}", guildServerRegion: "${guild.server.region.slug}", limit: 10) {
            data {
              code
              title
              startTime
              endTime
              zone { name }
            }
          }
        }
      }`);

      const guildReports = guildData.reportData?.reports?.data || [];
      console.log(`\nGuild reports for ${guild.name} (${guildReports.length}):`);
      for (const r of guildReports) {
        const date = new Date(r.startTime);
        const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        console.log(`  ${r.code} — ${dateStr} — ${r.title || r.zone?.name}`);
      }
    }
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
