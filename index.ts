import { serve } from "bun";
import { mkdir, exists } from "node:fs/promises";

// Add to your .env file at the root of your project
const URLS_DIR = process.env.URLS_DIR;
const PASSWORD = process.env.SHORTENER_PASSWORD;
const MAIN_REDIRECT = process.env.MAIN_REDIRECT;

if (!URLS_DIR || !PASSWORD || !MAIN_REDIRECT) {
  throw new Error("Missing environment variables in .env file.");
}

// Move HTML template to a function to inject dynamic domain
const getHTML = (domain: string) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>URL Shortener - ${domain}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 600px;
      margin: 0 auto;
      padding: 0 1rem;
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      align-items: center;
    }
    .container {
      width: 100%;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    input {
      padding: 0.5rem;
      font-size: 1rem;
      border: 1px solid #ccc;
      border-radius: 4px;
    }
    button {
      background: #0066ff;
      color: white;
      border: none;
      padding: 0.75rem;
      font-size: 1rem;
      border-radius: 4px;
      cursor: pointer;
    }
    button:hover {
      background: #0052cc;
    }
    .success {
      background: #e6ffe6;
      padding: 1rem;
      border-radius: 4px;
      margin: 1rem 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Create Short URL on ${domain}</h1>
    <form method="POST">
      <input type="url" name="url" placeholder="URL to shorten" required autofocus>
      <input type="text" name="shortname" placeholder="Short name (e.g., 'github')" required pattern="[a-zA-Z0-9-]+" title="Letters, numbers, and hyphens only">
      <input type="password" name="password" placeholder="Password" required>
      <button type="submit">Create Short URL</button>
    </form>
    {{message}}
  </div>
</body>
</html>`;

// Ensure urls directory exists
await mkdir(URLS_DIR, { recursive: true });

serve({
  port: 411,
  async fetch(req) {
    const url = new URL(req.url);
    const domain = url.host;

    // Root path redirect
    if (url.pathname === "/") {
      return new Response(null, {
        status: 301,
        headers: { Location: MAIN_REDIRECT },
      });
    }

    // URL creation form
    if (url.pathname === "/make") {
      if (req.method === "GET") {
        return new Response(getHTML(domain).replace("{{message}}", ""), {
          headers: { "Content-Type": "text/html" },
        });
      }

      if (req.method === "POST") {
        const formData = await req.formData();
        const targetUrl = formData.get("url")?.toString();
        const shortname = formData.get("shortname")?.toString();
        const password = formData.get("password")?.toString();

        if (!targetUrl || !shortname || !password) {
          return new Response(
            getHTML(domain).replace(
              "{{message}}",
              `<div style="color: red; margin-top: 1rem;">All fields are required</div>`
            ),
            { headers: { "Content-Type": "text/html" } }
          );
        }

        if (password !== PASSWORD) {
          return new Response(
            getHTML(domain).replace(
              "{{message}}",
              `<div style="color: red; margin-top: 1rem;">Invalid password</div>`
            ),
            { headers: { "Content-Type": "text/html" } }
          );
        }

        const shortUrl = `https://${domain}/${shortname}`;
        await Bun.write(`${URLS_DIR}/${shortname}.url`, targetUrl);

        return new Response(
          getHTML(domain).replace(
            "{{message}}",
            `<div class="success">
              URL created! <a href="${shortUrl}" target="_blank">${shortUrl}</a>
              <br><br>
              <a href="/make">Create another</a>
            </div>`
          ),
          { headers: { "Content-Type": "text/html" } }
        );
      }
    }

    // Handle short URLs
    const shortname = url.pathname.slice(1);
    const urlFile = `${URLS_DIR}/${shortname}.url`;

    if (await exists(urlFile)) {
      const targetUrl = (await Bun.file(urlFile).text()).trim();
      if (!targetUrl) {
        return new Response("Invalid URL", { status: 404 });
      }
      return new Response(null, {
        status: 301,
        headers: { Location: targetUrl },
      });
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log("URL shortener running at http://localhost:411");
