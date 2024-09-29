import asyncio
import logging

from asyncio import Semaphore
from itertools import chain
from typing import List

from fpl2sql_extractor.extractors.bootstrap_extractor import get_bootstrap
from fpl2sql_extractor.extractors.utils import get_request
from fpl2sql_extractor.models.element_summary import ElementSummary
from pydantic import TypeAdapter


logger = logging.getLogger(__name__)


async def get_element_summary(element_id: int, semaphore: Semaphore) -> ElementSummary:
    async with semaphore:
        response: dict = await get_request(url=f"https://fantasy.premierleague.com/api/element-summary/{element_id}/")

        ta = TypeAdapter(ElementSummary)
        return ta.validate_python(response)


async def get_elements(semaphore: Semaphore) -> List[ElementSummary]:
    bootstrap = await get_bootstrap()
    element_ids = [element.id for element in bootstrap.elements]
    logger.info(f"Getting ElementSummary records for {len(element_ids)} elements")

    tasks = [get_element_summary(element_id=element_id, semaphore=semaphore) for element_id in element_ids]

    return await asyncio.gather(*tasks)


async def get_element_summary_table(semaphore: Semaphore) -> dict:
    elements: List[ElementSummary] = await get_elements(semaphore=semaphore)

    return {
        "element_history": chain.from_iterable([element.history for element in elements]),
        # "element_history_past": chain.from_iterable([element.history_past for element in elements])
    }
