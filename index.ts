import { serve } from "bun";
import { mkdir } from "node:fs/promises";

// Add to your .env file at the root of your project
const URLS_DIR = process.env.URLS_DIR;
const PASSWORD = process.env.SHORTENER_PASSWORD;
const MAIN_REDIRECT = process.env.MAIN_REDIRECT;

if (!URLS_DIR || !PASSWORD || !MAIN_REDIRECT) {
  throw new Error("Missing environment variables in .env file.");
}

// Move HTML template to a function to inject dynamic domain
const getHTML = (
  domain: string,
  formData?: { url?: string; shortname?: string }
) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>URL Shortener - ${domain}</title>
  <style>
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
      padding: 0 1rem;
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      background: var(--bg);
      color: var(--text);
    }
    .container {
      width: 100%;
      background: white;
      padding: 2rem;
      border-radius: 12px;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
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
  </style>
  <script>
    document.addEventListener("DOMContentLoaded", function() {
      const passwordInput = document.querySelector('input[name="password"]');
      const storedPassword = localStorage.getItem("shortenerPassword");
      if (storedPassword) {
        passwordInput.value = storedPassword;
      }
      passwordInput.addEventListener("input", function() {
        localStorage.setItem("shortenerPassword", passwordInput.value);
      });
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
      <input
        type="password"
        name="password"
        placeholder="Password"
        required
        autocomplete="new-password"
      />
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
            getHTML(domain, { url: targetUrl, shortname }).replace(
              "{{message}}",
              `<div class="error">All fields are required</div>`
            ),
            { headers: { "Content-Type": "text/html" } }
          );
        }

        if (password !== PASSWORD) {
          return new Response(
            getHTML(domain, { url: targetUrl, shortname }).replace(
              "{{message}}",
              `<div class="error">Invalid password</div>`
            ),
            { headers: { "Content-Type": "text/html" } }
          );
        }

        const shortUrl = `https://${domain}/${shortname}`;
        await Bun.write(`${URLS_DIR}/${shortname}.url`, targetUrl);

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
        );
      }
    }

    // Handle short URLs
    const shortname = url.pathname.slice(1);
    const urlFile = `${URLS_DIR}/${shortname}.url`;
    const file = Bun.file(urlFile);

    if (await file.exists()) {
      const targetUrl = (await file.text()).trim();
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
