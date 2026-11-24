# Resume & Metrics

Back to [[00 Home]]. Source: [[Roadmap]] (Metrics and resume story).

**Track a few honest numbers from day one so the resume line is specific and defensible in an interview.**

## Metrics to track (PostHog)
| Metric | Latest value | Date |
|---|---|---|
| Total unique players | | |
| Peak daily players | | |
| Packs opened | | |
| Cards minted | | |
| Day-1 retention | | |
| Day-7 retention | | |
| Shares per player | | |
| Countries reached | | |
| Peak requests per second handled | | |

The event list behind these is an open question in [[Decisions]].

## Resume line templates
Fill with real numbers only.
- Built and launched Pull the Planet, a browser collecting game where every real place on Earth is a card; reached [X] players in [Y] countries within [Z] weeks.
- Designed a transactional serial-minting system in Firestore that issued [N] numbered cards with zero duplicates under [P] concurrent users.
- Built a geospatial data pipeline (GeoNames, Wikidata, Wikipedia page views) generating [N] cards with data-derived rarity and real-world facts.

## Interview talking points
1. Concurrency: why minting is a race condition and how one atomic update solves it ([[Architecture#The minting transaction]]).
2. Data engineering: joining messy geographic datasets and scoring fame from page views ([[Data Pipeline]]).
3. Scaling: what broke (or didn't) on launch day, caching the world map, spending caps.
4. Product: how beta data changed the rarity caps, and what drove sharing ([[Game Design]]).

## Evidence to keep
The dev log, launch-day screenshots and the PostHog dashboard.
