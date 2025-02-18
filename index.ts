import { serve } from "bun"
import { mkdir } from "node:fs/promises"

// Quick env setup - add these to your .env file
const PASSWORD = process.env.PASSWORD || "password"
const URLS_DIR = process.env.URLS_DIR || "urls"
const ADD_PATH = process.env.ADD_PATH || "new"
const MAIN_REDIRECT = process.env.MAIN_REDIRECT || "https://example.com"
const PORT = process.env.PORT || 411
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || "10", 10) || 10
const RATE_LIMIT_TIME = parseInt(process.env.RATE_LIMIT_TIME || "1", 10) || 1
const RATE_LIMIT_WINDOW = RATE_LIMIT_TIME * 60 * 1000

if (!URLS_DIR || !PASSWORD || !MAIN_REDIRECT || !PORT) {
  throw new Error("Missing environment variables in .env file.")
}

// Insert common CSS constants after the config and before mkdir calls

const baseCSS = `<style>
:root {
  --primary: #6366f1;
  --primary-hover: #4f46e5;
  --bg: #f8fafc;
  --text: #0f172a;
  --border: #e2e8f0;
  --success-bg: #f0fdf4;
  --success-border: #bbf7d0;
  --error-bg: #fef2f2;
  --error-border: #fecaca;
  --error-text: #dc2626;
}
body {
  font-family: system-ui, -apple-system, sans-serif;
  max-width: 600px;
  margin: 0 auto;
  padding: 2rem 1rem;
  line-height: 1.5;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  background: var(--bg);
  color: var(--text);
}
.container {
  width: 100%;
  background: white;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  margin-bottom: 0.5rem;
}
h1 {
  margin-top: 0;
  font-size: 1.5rem;
  color: var(--text);
}
form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
input {
  padding: 0.75rem;
  font-size: 1rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  transition: border-color 0.15s ease;
}
input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}
button {
  background: var(--primary);
  color: white;
  border: none;
  padding: 0.75rem;
  font-size: 1rem;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.15s ease;
}
button:hover {
  background: var(--primary-hover);
}
.success {
  background: var(--success-bg);
  border: 1px solid var(--success-border);
  padding: 1rem;
  border-radius: 8px;
  margin: 1rem 0;
}
.error {
  background: var(--error-bg);
  border: 1px solid var(--error-border);
  color: var(--error-text);
  padding: 1rem;
  border-radius: 8px;
  margin: 1rem 0;
}
a {
  color: var(--primary);
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
</style>`

const tableCSS = `<style>
table {
  width: 100%;
  border-collapse: collapse;
}
th, td {
  border: 1px solid var(--border);
  padding: 8px;
  text-align: left;
}
th {
  background: var(--bg);
}
</style>`

// Move HTML template to a function to inject dynamic domain
const getHTML = (domain: string, formData?: { url?: string; shortname?: string }) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>URL Shortener - ${domain}</title>
  ${baseCSS}
  <script>
    document.addEventListener("DOMContentLoaded", function() {
      const passwordInput = document.querySelector('input[name="password"]');
      const storedPassword = localStorage.getItem("shortenerPassword");
      if (storedPassword) passwordInput.value = storedPassword

      passwordInput.addEventListener("input", () => localStorage.setItem("shortenerPassword", passwordInput.value))
    });
  </script>
</head>
<body>
  <div class="container">
    <h1>Create Short URL on ${domain}</h1>
    <form method="POST" style="display: flex; flex-direction: column; gap: 1rem;">
      <div style="display: flex; align-items: center;">
        <span style="font-weight: bold; margin-right: 0.5rem;">${domain}/</span>
        <input
          type="text"
          name="shortname"
          placeholder="shortname"
          autofocus
          required
          pattern="[a-zA-Z0-9-]+"
          title="Letters, numbers, and hyphens only"
          value="${formData?.shortname || ""}"
          style="flex: 1;"
          autocomplete="off"
        />
      </div>
      <input
        type="url"
        name="url"
        placeholder="https://example.com"
        required
        value="${formData?.url || ""}"
        autocomplete="off"
      />
      <div style="display: flex; gap: 1rem;">
        <input
          type="password"
          name="password"
          placeholder="Password"
          required
          autocomplete="new-password"
          style="flex: 1;"
        />
        <button type="submit" style="min-width: 120px;">Create Short URL</button>
      </div>
    </form>
    {{message}}
  </div>
  <div style="text-align: center; color: #94a3b8; font-size: 0.75rem;">
    powered by <a href="https://jamon.me/jmn" target="_blank" style="color: inherit;">jmn</a>
  </div>
</body>
</html>`

// Create urls directory if it doesn't exist
await mkdir(URLS_DIR, { recursive: true })
// Create stats directory if it doesn't exist
await mkdir("stats", { recursive: true })

// Track failed password attempts for rate limiting
let failedAttempts = 0
let isBlocked = () => failedAttempts >= RATE_LIMIT_MAX

// Reset rate limit counter periodically
setInterval(() => {
  failedAttempts = 0
}, RATE_LIMIT_WINDOW)

const getStatsHTML = (domain: string, formData?: { shortname?: string }, message?: string) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Stats Dashboard - ${domain}</title>
  ${baseCSS}
  <script>
    document.addEventListener("DOMContentLoaded", function() {
      const passwordInput = document.querySelector('input[name="password"]');
      const storedPassword = localStorage.getItem("shortenerPassword");
      if (storedPassword) passwordInput.value = storedPassword;
      passwordInput.addEventListener("input", () => localStorage.setItem("shortenerPassword", passwordInput.value));
    });
  </script>
</head>
<body>
  <div class="container">
    <h1>View Stats for ${domain}</h1>
    <form method="POST" style="display: flex; flex-direction: column; gap: 1rem;">
      <div style="display: flex; align-items: center;">
        <span style="font-weight: bold; margin-right: 0.5rem;">${domain}/</span>
        <input
          type="text"
          name="shortname"
          placeholder="shortname"
          required
          pattern="[a-zA-Z0-9-]+"
          title="Letters, numbers, and hyphens only"
          value="${formData?.shortname || ""}"
          style="flex: 1;"
          autocomplete="off"
        />
      </div>
      <div style="display: flex; gap: 1rem;">
        <input
          type="password"
          name="password"
          placeholder="Password"
          required
          autocomplete="new-password"
          style="flex: 1;"
        />
        <button type="submit" style="min-width: 120px;">View Stats</button>
      </div>
    </form>
    ${message || ""}
  </div>
  <div style="text-align: center; color: #94a3b8; font-size: 0.75rem;">
    powered by <a href="https://jamon.me/jmn" target="_blank" style="color: inherit;">jmn</a>
  </div>
</body>
</html>`

const getStatsDisplayHTML = (domain: string, stats: any, shortname: string) => {
  let tableRows = ""
  stats.shorturls.forEach((record: any, index: number) => {
    const ips = Object.entries(record.ips)
      .map(([ip, count]) => ip + ": " + count)
      .join(", ")
    tableRows += `<tr>
      <td><a href=\"#\" onclick=\"showChart(${index}); return false;\">${record.url}</a></td>
      <td>${record.created}</td>
      <td>${record.visits}</td>
      <td>${record.uniques}</td>
      <td>${ips}</td>
    </tr>`
  })

  let chartsHTML = ""
  stats.shorturls.forEach((record: any, index: number) => {
    const createdDate = new Date(record.created)
    const now = new Date()
    const daysDiff = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
    let grouping = "daily"
    if (daysDiff > 30 && daysDiff <= 730) {
      grouping = "weekly"
    } else if (daysDiff > 730) {
      grouping = "monthly"
    }
    let aggregatedData: { label: string; count: number }[] = []

    if (grouping === "daily") {
      let current = new Date(createdDate)
      current.setHours(0, 0, 0, 0)
      const end = new Date(now)
      end.setHours(0, 0, 0, 0)
      while (current <= end) {
        const ymd = current.toISOString().split("T")[0]
        const count = record.dailyClicks && record.dailyClicks[ymd] ? record.dailyClicks[ymd] : 0
        aggregatedData.push({ label: ymd, count })
        current.setDate(current.getDate() + 1)
      }
    } else if (grouping === "weekly") {
      let current = new Date(createdDate)
      current.setHours(0, 0, 0, 0)
      const day = current.getDay()
      const diffToMonday = day === 0 ? -6 : 1 - day
      current.setDate(current.getDate() + diffToMonday)
      const end = new Date(now)
      end.setHours(0, 0, 0, 0)
      while (current <= end) {
        let weekStart = new Date(current)
        let sum = 0
        for (let i = 0; i < 7; i++) {
          let dayDate = new Date(current)
          dayDate.setDate(dayDate.getDate() + i)
          const ymd = dayDate.toISOString().split("T")[0]
          sum += record.dailyClicks && record.dailyClicks[ymd] ? record.dailyClicks[ymd] : 0
        }
        aggregatedData.push({ label: weekStart.toISOString().split("T")[0], count: sum })
        current.setDate(current.getDate() + 7)
      }
    } else {
      // monthly
      let current = new Date(record.created)
      current = new Date(current.getFullYear(), current.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 1)
      while (current <= end) {
        let label = current.getFullYear() + "-" + String(current.getMonth() + 1).padStart(2, "0")
        let sum = 0
        let d = new Date(current)
        while (d.getMonth() === current.getMonth()) {
          const ymd = d.toISOString().split("T")[0]
          sum += record.dailyClicks && record.dailyClicks[ymd] ? record.dailyClicks[ymd] : 0
          d.setDate(d.getDate() + 1)
        }
        aggregatedData.push({ label, count: sum })
        current.setMonth(current.getMonth() + 1)
      }
    }

    const barWidth = 40
    const gap = 20
    const chartHeight = 300
    const chartWidth = aggregatedData.length * (barWidth + gap) + gap
    let barsSvg = ""
    const maxCount = Math.max(...aggregatedData.map((d: any) => d.count), 1)
    aggregatedData.forEach((d: any, idx: number) => {
      const barHeight = Math.round((d.count / maxCount) * (chartHeight - 40))
      const x = gap + idx * (barWidth + gap)
      const y = chartHeight - barHeight
      barsSvg += `<rect x=\"${x}\" y=\"${y}\" width=\"${barWidth}\" height=\"${barHeight}\" fill=\"var(--primary)\" />\n`
      barsSvg += `<text x=\"${x + barWidth / 2}\" y=\"${
        y - 5
      }\" text-anchor=\"middle\" font-size=\"12\" fill=\"var(--text)\">${d.count}</text>\n`
      barsSvg += `<text x=\"${x + barWidth / 2}\" y=\"${
        chartHeight + 15
      }\" text-anchor=\"middle\" font-size=\"12\" fill=\"var(--text)\">${d.label}</text>\n`
    })
    const svgChart = `<svg width=\"${chartWidth}\" height=\"${
      chartHeight + 30
    }\" style=\"display: block; margin: 20px auto;\">\n${barsSvg}\n</svg>`

    chartsHTML += `<div id=\"chart-${index}\" class=\"chart\" style=\"display: none;\">\n<h2>Chart for ${record.url}</h2>\n${svgChart}\n<a href=\"#\" onclick=\"showAllCharts(); return false;\">Show All Charts</a>\n</div>`
  })

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset=\"utf-8\">
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
  <title>Stats for ${domain}/${shortname}</title>
  ${baseCSS}
  ${tableCSS}
</head>
<body>
  <div class=\"container\">
    <h1>Stats for ${domain}/${shortname}</h1>
    <table>
      <thead>
        <tr>
          <th>URL</th>
          <th>Created</th>
          <th>Visits</th>
          <th>Uniques</th>
          <th>IPs</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
    <div id=\"chartsContainer\">
      ${chartsHTML}
    </div>
  </div>
  <div style=\"text-align: center; color: #94a3b8; font-size: 0.75rem;\">
    powered by <a href=\"https://jamon.me/jmn\" target=\"_blank\" style=\"color: inherit;\">jmn</a>
  </div>
  <script>
    function showChart(index) {
      var charts = document.querySelectorAll('.chart');
      charts.forEach(function(chart) { chart.style.display = 'none'; });
      document.getElementById('chart-' + index).style.display = 'block';
    }
    function showAllCharts() {
      var charts = document.querySelectorAll('.chart');
      charts.forEach(function(chart) { chart.style.display = 'block'; });
    }
  </script>
</body>
</html>`
}

const server = serve({
  port: process.env.PORT || 4111,
  async fetch(req) {
    const url = new URL(req.url)
    const domain = url.host

    // Block requests if too many failed password attempts
    if (isBlocked()) {
      return new Response(
        getHTML(domain).replace("{{message}}", `<div class="error">Service temporarily unavailable.</div>`),
        { status: 503, headers: { "Content-Type": "text/html" } }
      )
    }

    // Redirect root to main site
    if (url.pathname === "/") return new Response(null, { status: 302, headers: { Location: MAIN_REDIRECT } })

    // Handle URL creation form
    if (url.pathname === `/${ADD_PATH}`) {
      if (req.method === "GET") {
        return new Response(getHTML(domain).replace("{{message}}", ""), { headers: { "Content-Type": "text/html" } })
      }

      if (req.method === "POST") {
        const formData = await req.formData()
        const targetUrl = formData.get("url")?.toString()
        const shortname = formData.get("shortname")?.toString().replace("/", "")
        const password = formData.get("password")?.toString()

        if (!targetUrl || !shortname || !password) {
          return new Response(
            getHTML(domain, { url: targetUrl, shortname }).replace(
              "{{message}}",
              `<div class="error">All fields are required</div>`
            ),
            { headers: { "Content-Type": "text/html" } }
          )
        }

        if (password !== PASSWORD) {
          failedAttempts++

          if (isBlocked()) {
            return new Response(
              getHTML(domain, { url: targetUrl, shortname }).replace(
                "{{message}}",
                `<div class="error">Too many failed attempts. Service temporarily unavailable. Please try again in a minute.</div>`
              ),
              { status: 503, headers: { "Content-Type": "text/html", "Retry-After": "60" } }
            )
          }

          return new Response(
            getHTML(domain, { url: targetUrl, shortname }).replace(
              "{{message}}",
              `<div class="error">Invalid password</div>`
            ),
            { headers: { "Content-Type": "text/html" } }
          )
        }

        // Reset failed attempts on successful password
        failedAttempts = 0

        const shortUrl = `https://${domain}/${shortname}`
        await Bun.write(`${URLS_DIR}/${shortname}.url`, targetUrl)

        // Update stats for short URL creation
        try {
          const statsPath = `stats/${shortname}.json`
          let stats = {
            visits: 0,
            shorturls: [
              {
                url: targetUrl,
                created: new Date().toISOString(),
                visits: 0,
                uniques: 0,
                ips: {},
                dailyClicks: {},
              },
            ],
          }
          const statsFile = Bun.file(statsPath)
          if (await statsFile.exists()) {
            const rawStats = await Bun.file(statsPath).text()
            stats = JSON.parse(rawStats)
            stats.shorturls.push({
              url: targetUrl,
              created: new Date().toISOString(),
              visits: 0,
              uniques: 0,
              ips: {},
              dailyClicks: {},
            })
          }
          await Bun.write(statsPath, JSON.stringify(stats, null, 2))
        } catch (e) {
          console.error("Error updating stats for creation", e)
        }

        return new Response(
          getHTML(domain, { url: targetUrl, shortname }).replace(
            "{{message}}",
            `<div class="success">
              URL created! <a href="${shortUrl}" target="_blank">${shortUrl}</a>
              <br><br>
              <a href="/make">Create another</a>
            </div>`
          ),
          { headers: { "Content-Type": "text/html" } }
        )
      }
    }

    // Insert stats dashboard route in the fetch handler (place this before the short URL redirection logic)
    if (url.pathname === "/stats") {
      if (req.method === "GET") {
        return new Response(getStatsHTML(domain), { headers: { "Content-Type": "text/html" } })
      }

      if (req.method === "POST") {
        const formData = await req.formData()
        const shortname = formData.get("shortname")?.toString().trim()
        const password = formData.get("password")?.toString()

        if (!shortname || !password) {
          return new Response(getStatsHTML(domain, { shortname }, `<div class="error">All fields are required</div>`), {
            headers: { "Content-Type": "text/html" },
          })
        }

        if (password !== PASSWORD) {
          failedAttempts++
          if (isBlocked()) {
            return new Response(
              getStatsHTML(
                domain,
                { shortname },
                `<div class="error">Too many failed attempts. Service temporarily unavailable. Please try again in a minute.</div>`
              ),
              { status: 503, headers: { "Content-Type": "text/html", "Retry-After": "60" } }
            )
          }
          return new Response(getStatsHTML(domain, { shortname }, `<div class="error">Invalid password</div>`), {
            headers: { "Content-Type": "text/html" },
          })
        }

        // Reset failed attempts on successful password
        failedAttempts = 0

        const statsPath = `stats/${shortname}.json`
        const statsFile = Bun.file(statsPath)
        if (!(await statsFile.exists())) {
          return new Response(
            getStatsHTML(domain, { shortname }, `<div class="error">No stats found for this short URL.</div>`),
            { headers: { "Content-Type": "text/html" } }
          )
        }
        const rawStats = await statsFile.text()
        const statsData = JSON.parse(rawStats)

        return new Response(getStatsDisplayHTML(domain, statsData, shortname), {
          headers: { "Content-Type": "text/html" },
        })
      }
    }

    // Look up and redirect short URLs
    const shortname = url.pathname.slice(1)
    const urlFile = `${URLS_DIR}/${shortname}.url`
    const file = Bun.file(urlFile)

    if (await file.exists()) {
      const targetUrl = (await file.text()).trim()
      if (!targetUrl) return new Response("Invalid URL", { status: 404 })

      // Prevent redirect loops
      if (targetUrl.startsWith(`https://${domain}/`)) return new Response("Invalid URL", { status: 404 })

      // Update stats for visit
      try {
        const statsPath = `stats/${shortname}.json`
        const statsFile = Bun.file(statsPath)
        if (await statsFile.exists()) {
          const rawStats = await statsFile.text()
          const stats = JSON.parse(rawStats)
          stats.visits = (stats.visits || 0) + 1

          const urlRecord = stats.shorturls.find((record: any) => record.url === targetUrl)
          if (urlRecord) {
            urlRecord.visits = (urlRecord.visits || 0) + 1
            const visitorIP = server.requestIP(req)?.address || "unknown"
            if (visitorIP in urlRecord.ips) {
              urlRecord.ips[visitorIP] += 1
            } else {
              urlRecord.ips[visitorIP] = 1
              urlRecord.uniques = (urlRecord.uniques || 0) + 1
            }
          }
          await Bun.write(statsPath, JSON.stringify(stats, null, 2))
        }
      } catch (e) {
        console.error("Error updating stats for visit", e)
      }

      return new Response(null, { status: 302, headers: { Location: targetUrl } })
    }

    return new Response("Not found", { status: 404 })
  },
})

console.log(`\n`)
console.log(`URL Shortener powered by jmn (https://jamon.me/jmn)`)
console.log(`Server: http://localhost:${PORT}`)
console.log(`Create: http://localhost:${PORT}/${ADD_PATH}`)
console.log(`Stats:  http://localhost:${PORT}/stats`)
console.log(`\n`)
