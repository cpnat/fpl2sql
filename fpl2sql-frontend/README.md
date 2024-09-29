# fpl2sql-frontend

## Overview

The fpl2sql-frontend provides an intuitive interface for interaction with an in-memory database powered by DuckDB. This database is populated with Parquet files containing data extracted from the [Fantasy Premier League](https://fantasy.premierleague.com/) (FPL) API by the [fpl2sql-extractor](../fpl2sql-extractor/README.md) and loaded as static files upon page initialisation.

The core functionality is largely enabled by [Handsontable](https://handsontable.com/) and [DuckDB WASM](https://duckdb.org/docs/api/wasm/overview.html).

## Development Setup

The following tools are required:

| Tool                          | Description                         |
| ----------------------------- | ----------------------------------- |
| [npm](https://www.npmjs.com/) | Dependency management and packaging |

- Run `npm install` to install dependencies.
- Execute `npm run dev` to start the development server.

## Deployment

The site is deployed to [Vercel](https://vercel.com) and accessible at [www.fpl2sql.com](https://www.fpl2sql.com/)


## Future development

- Reduce console logging by DuckDB.
- Use database introspection to improve autocompletion.
- Implement CI/CD using GitHub Actions.
- Add unit and integration tests to enhance code reliability.
- Refactor `main.ts` by splitting out logic into discrete modules for better organization.
- Clean up `style.css` to improve maintainability.
- Consider refactoring to React if the frontend functionality is extended; however, HTML/CSS/TypeScript is sufficient for now.
