import json
import logging

from typing import Sequence, Union

import aiohttp
import backoff
import pandas as pd  # type: ignore

from fpl2sql_extractor.models.bootstrap import Bootstrap
from fpl2sql_extractor.models.element_summary import ElementSummary
from fpl2sql_extractor.models.fixtures import Fixtures
from fpl2sql_extractor.models.last_updated import LastUpdated


logger = logging.getLogger(__name__)


@backoff.on_exception(backoff.expo, aiohttp.ClientError, max_tries=3)
async def get_request(url) -> dict:
    logger.info(f"GET {url}")

    headers = {
        "User-Agent": "FPL2SQL/1.0 (http://www.fpl2sql.com)",
        "Accept": "application/json",
    }

    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=headers) as response:
            response.raise_for_status()

            json: dict = await response.json()
            return json


async def get_request_from_dump(path) -> dict:
    logger.info(f"GET {path}")

    with open(path) as f:
        return json.load(f)


def pydantic_records_to_df(
    records: Sequence[Union[Bootstrap, ElementSummary, Fixtures, LastUpdated]]
) -> pd.DataFrame:  # type: ignore
    return pd.DataFrame([record.dict() for record in records])
