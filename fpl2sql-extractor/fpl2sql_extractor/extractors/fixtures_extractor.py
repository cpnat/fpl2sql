import logging

from fpl2sql_extractor.extractors.utils import get_request
from fpl2sql_extractor.models.fixtures import Fixtures
from pydantic import TypeAdapter


logger = logging.getLogger(__name__)


async def get_fixtures() -> Fixtures:
    response: dict = await get_request(url="https://fantasy.premierleague.com/api/fixtures/")
    ta = TypeAdapter(Fixtures)
    return ta.validate_python(response)


async def get_fixtures_table():
    logger.info("Getting Fixtures records")
    fixtures: Fixtures = await get_fixtures()

    return {"fixtures": fixtures.root}
