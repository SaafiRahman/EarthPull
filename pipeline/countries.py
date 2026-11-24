"""The countries the pipeline can build, and what each one needs.

Launch pool (developer, 2026-11-24): every North American country. Other regions are added after launch
by adding rows here.

  qid     the country's Wikidata item (P17 "country" in queries)
  local   its local Wikipedia language, used next to English for articles, page views, flavour and the
          gone-places check (None when English is the local language)
  ne      how to find its regions in Natural Earth admin-1: its ISO country code (iso_a2), or a list of
          ISO 3166-2 codes for places Natural Earth files under another country (Guadeloupe is FR-GP)
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Country:
    code: str
    name: str
    qid: str
    local: str | None
    ne: tuple[str, ...] = ()  # ISO 3166-2 codes when not found by iso_a2

    @property
    def langs(self) -> tuple[str, ...]:
        """Wikipedias to use, English first."""
        return ("en",) if self.local in (None, "en") else ("en", self.local)


_ROWS = [
    # code, name, Wikidata item, local Wikipedia
    ("CA", "Canada", "Q16", "fr"),
    ("US", "United States", "Q30", None),
    ("MX", "Mexico", "Q96", "es"),
    # Central America
    ("BZ", "Belize", "Q242", None), ("GT", "Guatemala", "Q774", "es"), ("SV", "El Salvador", "Q792", "es"),
    ("HN", "Honduras", "Q783", "es"), ("NI", "Nicaragua", "Q811", "es"), ("CR", "Costa Rica", "Q800", "es"),
    ("PA", "Panama", "Q804", "es"),
    # Caribbean
    ("CU", "Cuba", "Q241", "es"), ("DO", "Dominican Republic", "Q786", "es"), ("PR", "Puerto Rico", "Q1183", "es"),
    ("HT", "Haiti", "Q790", "fr"), ("JM", "Jamaica", "Q766", None), ("BS", "Bahamas", "Q778", None),
    ("TT", "Trinidad and Tobago", "Q754", None), ("BB", "Barbados", "Q244", None), ("LC", "Saint Lucia", "Q760", None),
    ("VC", "Saint Vincent and the Grenadines", "Q757", None), ("GD", "Grenada", "Q769", None),
    ("AG", "Antigua and Barbuda", "Q781", None), ("DM", "Dominica", "Q784", None), ("KN", "Saint Kitts and Nevis", "Q763", None),
    ("KY", "Cayman Islands", "Q5785", None), ("TC", "Turks and Caicos Islands", "Q18221", None),
    ("VG", "British Virgin Islands", "Q25305", None), ("VI", "United States Virgin Islands", "Q11703", None),
    ("AI", "Anguilla", "Q25228", None), ("MS", "Montserrat", "Q13353", None), ("BM", "Bermuda", "Q23635", None),
    ("AW", "Aruba", "Q21203", "nl"), ("CW", "Curaçao", "Q25279", "nl"), ("SX", "Sint Maarten", "Q26273", "nl"),
    ("GP", "Guadeloupe", "Q17012", "fr"), ("MQ", "Martinique", "Q17054", "fr"), ("BL", "Saint Barthélemy", "Q25362", "fr"),
    ("MF", "Saint Martin", "Q126125", "fr"), ("PM", "Saint Pierre and Miquelon", "Q34617", "fr"),
    ("GL", "Greenland", "Q223", "da"),
]
_NE = {"GP": ("FR-GP",), "MQ": ("FR-MQ",), "BQ": ("NL-BQ1", "NL-BQ2", "NL-BQ3")}

COUNTRIES = {c: Country(c, n, q, l, _NE.get(c, ())) for c, n, q, l in _ROWS}
COUNTRIES["BQ"] = Country("BQ", "Caribbean Netherlands", "Q27561", "nl", _NE["BQ"])
NORTH_AMERICA = tuple(COUNTRIES)


def get(code: str) -> Country:
    return COUNTRIES[code.upper()]


def interim(code: str):
    """data/interim/<CC>/, where every step reads and writes that country's tables."""
    from pathlib import Path
    d = Path(__file__).parent / "data" / "interim" / code.upper()
    d.mkdir(parents=True, exist_ok=True)
    return d
