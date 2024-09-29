# generated by datamodel-codegen:
#   filename:  element-summary-1.json
#   timestamp: 2024-09-21T16:33:15+00:00

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class Fixture(BaseModel):
    id: int
    code: int
    team_h: int
    team_h_score: None
    team_a: int
    team_a_score: None
    event: int
    finished: bool
    minutes: int
    provisional_start_time: bool
    kickoff_time: str
    event_name: str
    is_home: bool
    difficulty: int


class HistoryItem(BaseModel):
    element: int
    fixture: int
    opponent_team: int
    total_points: int
    was_home: bool
    kickoff_time: str
    team_h_score: Optional[int] = None
    team_a_score: Optional[int] = None
    round: int
    minutes: int
    goals_scored: int
    assists: int
    clean_sheets: int
    goals_conceded: int
    own_goals: int
    penalties_saved: int
    penalties_missed: int
    yellow_cards: int
    red_cards: int
    saves: int
    bonus: int
    bps: int
    influence: str
    creativity: str
    threat: str
    ict_index: str
    starts: int
    expected_goals: str
    expected_assists: str
    expected_goal_involvements: str
    expected_goals_conceded: str
    value: int
    transfers_balance: int
    selected: int
    transfers_in: int
    transfers_out: int


class HistoryPastItem(BaseModel):
    season_name: str
    element_code: int
    start_cost: int
    end_cost: int
    total_points: int
    minutes: int
    goals_scored: int
    assists: int
    clean_sheets: int
    goals_conceded: int
    own_goals: int
    penalties_saved: int
    penalties_missed: int
    yellow_cards: int
    red_cards: int
    saves: int
    bonus: int
    bps: int
    influence: str
    creativity: str
    threat: str
    ict_index: str
    starts: int
    expected_goals: str
    expected_assists: str
    expected_goal_involvements: str
    expected_goals_conceded: str


class ElementSummary(BaseModel):
    fixtures: List[Fixture]
    history: List[HistoryItem]
    history_past: List[HistoryPastItem]
