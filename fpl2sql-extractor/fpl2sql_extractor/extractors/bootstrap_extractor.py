import logging

from fpl2sql_extractor.extractors.utils import get_request
from fpl2sql_extractor.models.bootstrap import Bootstrap, TopElementInfo
from pydantic import BaseModel, TypeAdapter


logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


async def get_bootstrap() -> Bootstrap:
    response: dict = await get_request(url="https://fantasy.premierleague.com/api/bootstrap-static/")
    ta = TypeAdapter(Bootstrap)
    return ta.validate_python(response)


class TotalPlayers(BaseModel):
    total_players: int


async def get_bootstrap_tables():
    logger.info("Getting Bootstrap records")
    bootstrap: Bootstrap = await get_bootstrap()

    # DuckDB requires all structs to have the same key value pairs
    for event in bootstrap.events:
        event.top_element_info = event.top_element_info if event.top_element_info else TopElementInfo(id=-1, points=-1)

    return {
        "events": bootstrap.events,
        "game_settings": [bootstrap.game_settings],
        "phases": bootstrap.phases,
        "teams": bootstrap.teams,
        "total_players": [TotalPlayers(total_players=bootstrap.total_players)],
        "elements": bootstrap.elements,
        "element_stats": bootstrap.element_stats,
        "element_types": bootstrap.element_types,
    }
