export const fixturesQueryString = `-- Get upcoming team fixtures.

with

team_names as (
    select id, name from teams
)

select
    h.name as h_team,
    a.name as a_team,
    f.kickoff_time,
    f.team_h_difficulty,
    f.team_a_difficulty
from
    fixtures f
join
    team_names h on f.team_h = h.id
join
    team_names a on f.team_a = a.id
where
    f.finished is False
order by
    f.kickoff_time asc;
`;

export const resultsQueryString = `-- Get previous team results.

with

team_names as (
    select id, name from teams
)

select
    h.name as h_team,
    a.name as a_team,
    f.kickoff_time,
    f.team_h_score as h_score,
    f.team_a_score as a_score,
    f.team_h_difficulty,
    f.team_a_difficulty
from
    fixtures f
join
    team_names h on f.team_h = h.id
join
    team_names a on f.team_a = a.id
where
    f.finished is  True
order by
    f.kickoff_time desc;
`;

export const playerResultsQueryString = `-- Get historical results for a given player (e.g. Ødegaard).

with

player as (
select 'Ødegaard' as web_name
),


team_names as (
select
    id,
    name as opponent_team
from
    teams
)

select
   eh.round,
   eh.kickoff_time,
   t.opponent_team,
   eh.was_home,
   eh.team_h_score,
   eh.team_a_score,
   eh.total_points,
   eh.minutes,
   round(eh.value::decimal / 10, 1) as value,
   eh.transfers_balance,
   eh.selected,
   eh.transfers_in,
   eh.transfers_out,
   eh.goals_scored,
   eh.assists,
   eh.clean_sheets,
   eh.goals_conceded,
   eh.own_goals,
   eh.penalties_saved,
   eh.penalties_missed,
   eh.yellow_cards,
   eh.red_cards,
   eh.saves,
   eh.bonus,
   eh.bps,
   eh.influence,
   eh.creativity,
   eh.threat,
   eh.ict_index,
   eh.starts,
   eh.expected_goals,
   eh.expected_assists,
   eh.expected_goal_involvements,
   eh.expected_goals_conceded
from
    element_history eh
join
  team_names t on eh.opponent_team = t.id
cross join
  player p
where
    eh.element IN (select id from elements where web_name = p.web_name)
order by
    eh.kickoff_time desc;
`;

export const playerStatsQueryString = `-- Get player stats sorted by average points over the last 4 gameweeks.
with

last_4_gameweeks as (
    select
        id,
        name
    from
        events
    where
        finished
    order by
        deadline_time::timestamp desc
    limit 4
),

ranked_fixtures as (
    select
        f.kickoff_time,
        f.team_h as team,    -- home team as team
        f.team_a as opponent, -- away team as opponent
        f.team_h_difficulty as fdr,
        row_number() over (partition by f.team_h order by f.kickoff_time) as match_rank_home,
        row_number() over (partition by f.team_a order by f.kickoff_time) as match_rank_away
    from
        fixtures f
    where
        f.finished = false
    union all
    select
        f.kickoff_time,
        f.team_a as team,    -- away team as team
        f.team_h as opponent, -- home team as opponent
        f.team_a_difficulty as fdr,
        row_number() over (partition by f.team_a order by f.kickoff_time) as match_rank_home,
        row_number() over (partition by f.team_h order by f.kickoff_time) as match_rank_away
    from
        fixtures f
    where
        f.finished = false
),

final_ranked_fixtures as (
    -- combine home and away fixtures and assign a final row number for each team
    select
        team,
        opponent,
        fdr,
        kickoff_time,
        row_number() over (partition by team order by kickoff_time) as final_rank
    from
        ranked_fixtures
),

next_4_fixtures as (
    select
        team,
        max(case when final_rank = 1 then t.name end) as opponent_1,
        max(case when final_rank = 1 then frf.fdr end) as fdr_1,
        max(case when final_rank = 2 then t.name end) as opponent_2,
        max(case when final_rank = 2 then frf.fdr end) as fdr_2,
        max(case when final_rank = 3 then t.name end) as opponent_3,
        max(case when final_rank = 3 then frf.fdr end) as fdr_3,
        max(case when final_rank = 4 then t.name end) as opponent_4,
        max(case when final_rank = 5 then frf.fdr end) as fdr_4
    from
        final_ranked_fixtures frf
    join
        teams t on frf.opponent = t.id
    group by
        team
),

agg as (
    select
        e.web_name,
        e.now_cost::double / 10 as now_cost,
        round(avg(eh.total_points), 1) as avg_points,
        round((n4f.fdr_1 + n4f.fdr_2 + n4f.fdr_3 + n4f.fdr_4)/4, 1) as avg_fdr,
          -- Calculate bang for buck score: (avg_points / now_cost) * (1 - (avg_fdr / 5))
        round(
            (avg(eh.total_points) / (e.now_cost::double / 10))
            * (1 - (round((n4f.fdr_1 + n4f.fdr_2 + n4f.fdr_3 + n4f.fdr_4)/4, 1) / 10)), 2
        ) as bang_for_buck,
        n4f.opponent_1,
        n4f.fdr_1,
        n4f.opponent_2,
        n4f.fdr_2,
        n4f.opponent_3,
        n4f.fdr_3,
        n4f.opponent_4,
        n4f.fdr_4,
        round(avg(eh.bps), 1) as avg_bps,
        round(avg(eh.minutes), 1) as avg_minutes,
        round(avg(eh.starts), 1) as avg_starts,
        round(avg(eh.goals_scored), 1) as avg_goals_scored,
        round(avg(eh.assists), 1) as avg_assists,
        round(avg(eh.red_cards), 1) as avg_red_cards,
        round(avg(eh.yellow_cards), 1) as avg_yellow_cards,
        round(avg(eh.clean_sheets), 1) as avg_clean_sheets,
        round(avg(eh.goals_conceded), 1) as avg_goals_conceded,
        round(avg(eh.saves), 1) as avg_saves
    from
        element_history eh
    join
        elements e on eh.element = e.id
    join
        last_4_gameweeks l4g on eh.round = l4g.id
    join
        next_4_fixtures n4f on e.team = n4f.team
    group by
        e.web_name,
        e.now_cost,
        n4f.opponent_1,
        n4f.fdr_1,
        n4f.opponent_2,
        n4f.fdr_2,
        n4f.opponent_3,
        n4f.fdr_3,
        n4f.opponent_4,
        n4f.fdr_4
)

select * from agg
order by avg_points desc;
`;

export const playerStatsShabangQueryString = `-- Get player stats sorted by Bang For Buck score
with

last_4_gameweeks as (
    select
        id,
        name
    from
        events
    where
        finished
    order by
        deadline_time::timestamp desc
    limit 4
),

ranked_fixtures as (
    select
        f.kickoff_time,
        f.team_h as team,    -- home team as team
        f.team_a as opponent, -- away team as opponent
        f.team_h_difficulty as fdr,
        row_number() over (partition by f.team_h order by f.kickoff_time) as match_rank_home,
        row_number() over (partition by f.team_a order by f.kickoff_time) as match_rank_away
    from
        fixtures f
    where
        f.finished = false
    union all
    select
        f.kickoff_time,
        f.team_a as team,    -- away team as team
        f.team_h as opponent, -- home team as opponent
        f.team_a_difficulty as fdr,
        row_number() over (partition by f.team_a order by f.kickoff_time) as match_rank_home,
        row_number() over (partition by f.team_h order by f.kickoff_time) as match_rank_away
    from
        fixtures f
    where
        f.finished = false
),

final_ranked_fixtures as (
    -- combine home and away fixtures and assign a final row number for each team
    select
        team,
        opponent,
        fdr,
        kickoff_time,
        row_number() over (partition by team order by kickoff_time) as final_rank
    from
        ranked_fixtures
),

next_4_fixtures as (
    select
        team,
        max(case when final_rank = 1 then t.name end) as opponent_1,
        max(case when final_rank = 1 then frf.fdr end) as fdr_1,
        max(case when final_rank = 2 then t.name end) as opponent_2,
        max(case when final_rank = 2 then frf.fdr end) as fdr_2,
        max(case when final_rank = 3 then t.name end) as opponent_3,
        max(case when final_rank = 3 then frf.fdr end) as fdr_3,
        max(case when final_rank = 4 then t.name end) as opponent_4,
        max(case when final_rank = 5 then frf.fdr end) as fdr_4
    from
        final_ranked_fixtures frf
    join
        teams t on frf.opponent = t.id
    group by
        team
),

agg as (
    select
        e.web_name,
        e.now_cost::double / 10 as now_cost,
        round(avg(eh.total_points), 1) as avg_points,
        round((n4f.fdr_1 + n4f.fdr_2 + n4f.fdr_3 + n4f.fdr_4)/4, 1) as avg_fdr,
          -- Calculate bang for buck score: (avg_points / now_cost) * (1 - (avg_fdr / 5))
        round(
            (avg(eh.total_points) / (e.now_cost::double / 10))
            * (1 - (round((n4f.fdr_1 + n4f.fdr_2 + n4f.fdr_3 + n4f.fdr_4)/4, 1) / 10)), 2
        ) as bang_for_buck,
        n4f.opponent_1,
        n4f.fdr_1,
        n4f.opponent_2,
        n4f.fdr_2,
        n4f.opponent_3,
        n4f.fdr_3,
        n4f.opponent_4,
        n4f.fdr_4,
        round(avg(eh.bps), 1) as avg_bps,
        round(avg(eh.minutes), 1) as avg_minutes,
        round(avg(eh.starts), 1) as avg_starts,
        round(avg(eh.goals_scored), 1) as avg_goals_scored,
        round(avg(eh.assists), 1) as avg_assists,
        round(avg(eh.red_cards), 1) as avg_red_cards,
        round(avg(eh.yellow_cards), 1) as avg_yellow_cards,
        round(avg(eh.clean_sheets), 1) as avg_clean_sheets,
        round(avg(eh.goals_conceded), 1) as avg_goals_conceded,
        round(avg(eh.saves), 1) as avg_saves
    from
        element_history eh
    join
        elements e on eh.element = e.id
    join
        last_4_gameweeks l4g on eh.round = l4g.id
    join
        next_4_fixtures n4f on e.team = n4f.team
    group by
        e.web_name,
        e.now_cost,
        n4f.opponent_1,
        n4f.fdr_1,
        n4f.opponent_2,
        n4f.fdr_2,
        n4f.opponent_3,
        n4f.fdr_3,
        n4f.opponent_4,
        n4f.fdr_4
)

-- Select all fields, ordering by bang for buck score
select * from agg
order by bang_for_buck desc;
`;
