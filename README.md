# Simple URL Shortener

A lightweight URL shortener service built with Bun. Creates short URLs in the format `example.com/shortname` that redirect to their target URLs.

## Features

- Create short URLs via web form at `/make`
- Permanent (301) redirects
- File-based storage (no database required)
- Simple password protection for URL creation
- Clean, mobile-friendly interface

## Requirements

- [Bun](https://bun.sh) runtime

## Installation

Add the following to your `.env` file:

```
URLS_DIR=./urls
PASSWORD=your-password
MAIN_REDIRECT=https://example.com
PORT=3000
RATE_LIMIT_MAX=10
RATE_LIMIT_TIME=1
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.1.27. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
