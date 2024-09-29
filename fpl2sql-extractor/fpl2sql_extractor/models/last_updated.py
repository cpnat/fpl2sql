from pydantic import BaseModel


class LastUpdated(BaseModel):
    last_updated: str
