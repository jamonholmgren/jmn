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

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.1.27. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
