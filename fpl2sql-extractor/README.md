# fpl2sql-extractor

## Overview

The fpl2sql-extractor is a Python application which extracts data from the [Fantasy Premier League](https://fantasy.premierleague.com/) (FPL) API.

This data is read to [Pydantic](https://docs.pydantic.dev/latest/) classes and written to an instance of [DuckDB](https://duckdb.org/).

The application then exports the database as Parquet files with data, and SQL scripts with DML actions to re-create the database. These are uploaded to a cloud storage bucket (currently [Cloudflare R2](https://www.cloudflare.com/en-gb/developer-platform/r2/)). The export is used by [fpl2sql-frontend](../fpl2sql-frontend/README.md), which loads this data as static files.

## Setup development environment

The following tools are required:

| Tool                                                          | Description                         |
|---------------------------------------------------------------|-------------------------------------|
| [Poetry](https://python-poetry.org/)                          | Dependency management and packaging |
| [pyenv](https://github.com/pyenv/pyenv)                       | Manage Python versions              |
| [pyenv-virtualenv](https://github.com/pyenv/pyenv-virtualenv) | Manage Python virtual environments  |
| [direnv](https://direnv.net/)                                 | Manage local environment variables  |


- Create a Python virtual environment using `pyenv-virtualenv`
- Install dependencies with `poetry install`
- If using the upload functionality, populate relevant s3 client credentials in `.envrc`. See [.envrc_example](.envrc_example)
- Run the application, `python -m fpl2sql_extractor.main`
- Run the API with uvicorn, `uvicorn fpl2sql_extractor.api.app:app --reload` (note, Authorization header must be passed by default)

## Generate Pydantic models

Pydantic models are generated using `datamodel-code-generator`

```

datamodel-codegen --input ./dump/bootstrap.json --output ./models/bootstrap.py  --class-name Bootstrap --output-model-type "pydantic_v2.BaseModel"

datamodel-codegen --input ./dump/element-summary-1.json --output ./models/element_summary.py  --class-name ElementSummary --output-model-type "pydantic_v2.BaseModel"

datamodel-codegen --input ./dump/fixtures.json --output ./models/fixtures.py --class-name Fixtures --output-model-type "pydantic_v2.BaseModel"
```


## Deployment

The application is deployed as a [Vercel Function](https://vercel.com/docs/functions) and schedule to run daily at 0100 CET.

### Application

Steps to deploy are as follow:

1) Export the `requirements.txt`
`poetry export --without-hashes --without dev --format=requirements.txt > requirements.txt`
2) Run `sed -i '' 's/ ;.*//' requirements.txt` to provide the file in a format Vercel can handle
3) Run `vercel --prod` to deploy
4) Set environment variables for the application in Vercel
5) Set CRON schedule in Vercel

## Future development

- Implement CI/CD using GitHub Actions
- Add unit and integration tests
- Remove the need for a Authorization header when running the API localhost.
- Improve the local development workflow by replacing calls to the FPL API with dependency injection to read from the data dump
