import io
import json
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

import geopandas as gpd
import pandas as pd
import shapely
from dateutil import parser as date_parser

# Run from anywhere: python build_data.py ["path to the Great Sioux Nation folder"]
# Then run build_map_layers.py. Both write into this folder's data directory.

site_directory = Path(__file__).resolve().parent
project_directory = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("C:/Users/ageis/Documents/Great Sioux Nation")
data_directory = project_directory / "data"
source_directory = site_directory / "source"
download_directory = source_directory / "downloads"
work_directory = site_directory / "work"
download_directory.mkdir(parents=True, exist_ok=True)
work_directory.mkdir(exist_ok=True)
(site_directory / "data" / "text").mkdir(parents=True, exist_ok=True)

forest_archive = download_directory / "S_USA.AdministrativeForest.zip"
if not forest_archive.exists():
    urllib.request.urlretrieve(
        "https://data.fs.usda.gov/geodata/edw/edw_resources/shp/S_USA.AdministrativeForest.zip",
        forest_archive,
    )

equal_area = 5070
square_meters_per_acre = 4046.8564224

# Treaties and agreements (Spirling 2012) ####

date_corrections = {
    "V0112": "1822-08-31",
    "V0347": "1865-11-15",
    "V0354": "1866-07-19",
    "V0321": "1863-10-01",
}

treaties = pd.read_csv(data_directory / "treaty_consideration.csv")
treaties["spirling_date"] = treaties["treaty_date"]
treaties["treaty_date"] = treaties["treaty_id"].map(date_corrections).fillna(
    treaties["treaty_date"]
)
treaties["kind"] = treaties["treaty_id"].str[0]
treaties["nation_list"] = treaties["nations"].fillna("").str.split("; ")


def name_tokens(text):
    words = re.findall(r"[a-z]{3,}", str(text).lower())
    return {word[:5] for word in words} - {
        "india", "tribe", "and", "the", "for", "near", "fort", "terri", "washi", "agenc", "natio", "band", "bands", "confe", "unite", "river",
        "great", "littl", "upper", "lower", "sever", "other",
    }


# National Archives ratified Indian treaties (DigiTreaties list) ####

archive_records = pd.DataFrame(
    json.load(open(source_directory / "national_archives_treaties.json", encoding="utf-8"))
)
archive_records = archive_records[
    archive_records["title"].str.match(r"Ratified Indian Treaty \d+:")
].copy()
archive_records["number"] = archive_records["title"].str.extract(
    r"Ratified Indian Treaty (\d+):"
)[0].astype(int)
archive_records = archive_records[
    ~archive_records["title"].str.contains("Folder 2 of 2")
]


def title_date(title):
    match = re.search(r"([A-Z][a-z]+\.? \d{1,2}, \d{4})\s*(\(Folder 1 of 2\))?$", title)
    if not match:
        return None
    return date_parser.parse(match.group(1)).date().isoformat()


archive_records["iso_date"] = archive_records["title"].map(title_date)
manual_archive_dates = {
    18: "1791-07-02",
    210: "1836-09-10",
    235: "1838-11-23",
    247: "1846-06-05",
    294: "1855-07-01",
}
archive_records["iso_date"] = archive_records["number"].map(
    manual_archive_dates
).fillna(archive_records["iso_date"])

archive_match = {}
review = []
operable = treaties[treaties["kind"] == "V"]
for date, same_date in operable.groupby("treaty_date"):
    candidates = archive_records[archive_records["iso_date"] == date].sort_values("number")
    if candidates.empty:
        continue
    if len(same_date) == 1 and len(candidates) == 1:
        archive_match[same_date.iloc[0]["treaty_id"]] = candidates.iloc[0]
        continue
    pairs = []
    for treaty_position, treaty in enumerate(same_date.itertuples()):
        tokens = name_tokens(treaty.nations) | name_tokens(treaty.place)
        for candidate_position, candidate in enumerate(candidates.itertuples()):
            score = len(tokens & name_tokens(candidate.title))
            pairs.append((-score, abs(treaty_position - candidate_position), treaty_position, candidate_position))
    taken_treaties, taken_candidates = set(), set()
    for negative_score, _, treaty_position, candidate_position in sorted(pairs):
        if treaty_position in taken_treaties or candidate_position in taken_candidates:
            continue
        if negative_score == 0 and len(same_date) != len(candidates):
            continue
        taken_treaties.add(treaty_position)
        taken_candidates.add(candidate_position)
        treaty_id = same_date.iloc[treaty_position]["treaty_id"]
        archive_match[treaty_id] = candidates.iloc[candidate_position]
        review.append((date, treaty_id, same_date.iloc[treaty_position]["nations"], same_date.iloc[treaty_position]["place"], -negative_score, candidates.iloc[candidate_position]["title"]))
archive_match["V0011"] = archive_records[archive_records["number"] == 18].iloc[0]
pd.DataFrame(
    review, columns=["treaty_date", "treaty_id", "nations", "place", "name_overlap", "archive_title"]
).to_csv(work_directory / "archive_match_review.csv", index=False)

used = pd.Series([record["number"] for record in archive_match.values()])

# Royce cessions (Forest Service 2018 release) ####

cessions = gpd.read_file(data_directory / "cessions" / "indian_land_cessions.gpkg")
cessions["number"] = cessions["CESSNUM"].astype(str)
first_acres = pd.read_csv(data_directory / "cessions" / "cessions_first_acres.csv")
first_acres["number"] = first_acres["CESSNUM"].astype(str)
cessions = cessions.merge(
    first_acres[["number", "first_cession_acres", "instrument"]], on="number", how="left"
)

treaties_by_date = treaties.groupby("treaty_date")


def instruments_on(date, nation_text):
    if date not in treaties_by_date.groups:
        return []
    same_date = treaties_by_date.get_group(date)
    if len(same_date) == 1:
        return same_date["treaty_id"].tolist()
    tokens = name_tokens(nation_text)
    overlap = same_date[
        same_date["nations"].map(lambda nations: len(tokens & name_tokens(nations)) > 0)
    ]
    return (overlap if len(overlap) else same_date)["treaty_id"].tolist()


cession_dates = []
cession_links = []
schedule_links = []
kappler_links = []
for cession in cessions.itertuples():
    dates = []
    schedule = []
    kappler = []
    for order in range(1, 6):
        value = getattr(cession, f"cessdate{order}")
        if pd.notna(value) and 1700 < pd.Timestamp(value).year < 1900:
            dates.append(pd.Timestamp(value).date().isoformat())
            schedule.append(getattr(cession, f"date{order}link_royce_schedule"))
            kappler.append(getattr(cession, f"date{order}link_kappler_treaty"))
    cession_dates.append(dates)
    cession_links.append([instruments_on(date, cession.schdtrb) for date in dates])
    schedule_links.append([link if isinstance(link, str) else None for link in schedule])
    kappler_links.append([link if isinstance(link, str) else None for link in kappler])
cessions["dates"] = cession_dates
cessions["links"] = cession_links
cessions["schedule_links"] = schedule_links
cessions["kappler_links"] = kappler_links
kind_of = treaties.set_index("treaty_id")["kind"]


def cession_class(cession):
    first = cession["links"][0] if cession["links"] else []
    kinds = {kind_of[treaty_id] for treaty_id in first}
    if "V" in kinds:
        return "T"
    if "A" in kinds:
        return "A"
    if kinds:
        return "U"
    if pd.notna(cession["link_executive_order"]):
        return "E"
    if pd.notna(cession["link_federal_statute"]):
        return "S"
    return "T" if cession["instrument"] == "Ratified treaty" else "N"


cessions["cession_class"] = cessions.apply(cession_class, axis=1)

# Present-day status of ceded land ####

cessions_area = cessions.to_crs(equal_area)
cessions_area["geometry"] = cessions_area.geometry.make_valid()
cession_square_meters = cessions_area.geometry.area

reservations = gpd.read_file(
    "zip://" + str(data_directory / "raw" / "tiger_2023" / "tl_2023_us_aiannh.zip")
)
reservations = reservations[reservations["MTFCC"].isin(["G2101", "G2102"])].to_crs(equal_area)
reservation_union = shapely.union_all(reservations.geometry.make_valid().values)

forests = gpd.read_file("zip://" + str(forest_archive)).to_crs(equal_area)
forests["geometry"] = forests.geometry.simplify(150).make_valid()
forest_union = shapely.union_all(forests.geometry.values)

shapely.prepare(reservation_union)
shapely.prepare(forest_union)
cessions["reservation_acres"] = (
    cessions_area.geometry.intersection(reservation_union).area / square_meters_per_acre
).values
cessions["forest_acres"] = (
    cessions_area.geometry.intersection(forest_union).area / square_meters_per_acre
).values
cessions["gis_acres"] = (cession_square_meters / square_meters_per_acre).values

forest_index = forests.sindex
forest_names = []
for geometry in cessions_area.geometry:
    hits = forests.iloc[forest_index.query(geometry, predicate="intersects")]
    overlap = hits.geometry.intersection(geometry).area / square_meters_per_acre
    names = hits.loc[overlap > 5000].assign(overlap=overlap).sort_values(
        "overlap", ascending=False
    )["FORESTNAME"]
    forest_names.append(names.tolist())
cessions["forest_names"] = forest_names

land_grants = pd.read_csv(data_directory / "land_grant_parcels_by_cession.csv")
land_grants["number"] = land_grants["Royce_ID"].astype(str)
land_grant_purchase = pd.read_csv(
    data_directory
    / "landgrabu-data"
    / "Morrill_Act_of_1862_Indigenous_Land_Parcels_Database"
    / "CSVs"
    / "Cessions.csv",
    encoding="latin1",
)
land_grant_purchase["number"] = land_grant_purchase["Royce_ID"].astype(str)


def dollars(series):
    return pd.to_numeric(
        series.astype(str).str.replace(r"[$, ]", "", regex=True), errors="coerce"
    )


land_grant_purchase["cession_paid"] = dollars(land_grant_purchase["Total_US_Paid"])
land_grant_purchase["cession_acres"] = dollars(land_grant_purchase["Total_Acres"])
cessions = cessions.merge(
    land_grants[["number", "acres", "us_paid", "endowment_raised", "universities"]].rename(
        columns={"acres": "grant_acres", "us_paid": "grant_paid", "endowment_raised": "grant_raised"}
    ),
    on="number",
    how="left",
).merge(
    land_grant_purchase[["number", "cession_paid", "cession_acres", "US_Acquired_Mode"]],
    on="number",
    how="left",
)

# Treaty-level aggregates ####

cession_rows = []
for cession in cessions.itertuples():
    for order, (date, linked) in enumerate(zip(cession.dates, cession.links)):
        for treaty_id in linked:
            cession_rows.append(
                {"treaty_id": treaty_id, "number": cession.number, "order": order, "date": date}
            )
treaty_cessions = pd.DataFrame(cession_rows).merge(
    cessions[
        [
            "number", "gis_acres", "first_cession_acres", "reservation_acres",
            "forest_acres", "grant_acres", "grant_paid", "grant_raised",
        ]
    ],
    on="number",
)
treaty_cessions = treaty_cessions.drop_duplicates(["treaty_id", "number"])
aggregate = treaty_cessions.groupby("treaty_id").agg(
    cession_numbers=("number", list),
    mapped_acres=("gis_acres", "sum"),
    reservation_acres=("reservation_acres", "sum"),
    forest_acres=("forest_acres", "sum"),
    grant_acres=("grant_acres", "sum"),
    grant_paid=("grant_paid", "sum"),
    grant_raised=("grant_raised", "sum"),
)
first_only = (
    treaty_cessions[treaty_cessions["order"] == 0]
    .groupby("treaty_id")["first_cession_acres"]
    .sum()
    .rename("first_cession_acres")
)
treaties = treaties.merge(aggregate, on="treaty_id", how="left").merge(
    first_only, on="treaty_id", how="left"
)

wars = pd.read_csv(data_directory / "raw" / "spirling_treaties" / "IndianWars.csv", encoding="latin1")
war_of = {}
for war in wars.itertuples():
    for code in [war.Treaty1code, war.Treaty2code, war.Treaty3code]:
        if isinstance(code, str) and code.strip():
            war_of[code.strip()] = [war.War, war.Begin[-4:], war.End[-4:]]

# Payments read from each treaty text and checked by hand (treaties with mapped land) ####

audited_payments = pd.read_csv(source_directory / "treaty_payments_audited.csv").fillna("")
audited_payments = audited_payments.set_index("treaty_id")
basis_code = {
    "sale proceeds": "P",
    "senate": "S",
}
basis_note = {
    "sale proceeds": "The nation was to be paid, in whole or in part, from the proceeds of the land’s sale.",
    "senate": "The treaty left the price for the Senate to fix.",
}

number_words = (
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen "
    "sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety "
    "hundred hundreds thousand thousands million millions"
).replace(" ", "|")
word_separator = r"(?:\s+and\s+|,\s*(?:and\s+)?|\s+of\s+|[\s-]+)"
dollar_pattern = re.compile(
    r"\$\s?(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\)?,?\s+dollars|\b((?:(?:"
    + number_words
    + ")"
    + word_separator
    + ")*(?:"
    + number_words
    + r"))(?:\s*\(\s*\$?\s*[\d,\.]+\s*\))?,?\s+(?:of\s+)?dollars",
    re.IGNORECASE,
)


def dollar_passages(text):
    flat = re.sub(r"\s+", " ", text)
    passages = []
    for sentence in re.split(r"(?<=[.;])\s+", flat):
        if dollar_pattern.search(sentence) and sentence not in passages:
            passages.append(sentence if len(sentence) <= 360 else sentence[:360].rsplit(" ", 1)[0] + "…")
    return passages[:16]


# Treaty texts (Kappler; Deloria and DeMallie, as transcribed for Spirling 2012) ####

treaty_texts = {}
for archive_name in [
    "justdocsVCUT.zip",
    "justdocsACUT.zip",
    "justdocsRCUT.zip",
    "justdocsUCUT.zip",
]:
    with zipfile.ZipFile(data_directory / "raw" / "spirling_treaties" / archive_name) as archive:
        for member in archive.namelist():
            file_name = member.split("/")[-1]
            if re.fullmatch(r"[VARU]\d{4}[A-Z]?\.txt", file_name):
                treaty_texts[file_name[:-4]] = archive.read(member).decode("utf-8", errors="replace")
treaty_texts["V0344"] = (source_directory / "treaty_text_V0344.txt").read_text(encoding="utf-8")


def number_or_none(value, digits=0):
    if pd.isna(value):
        return None
    return round(float(value), digits) if digits else int(round(float(value)))


treaty_records = []
text_records = {}
for treaty in treaties.sort_values(["treaty_date", "treaty_id"]).itertuples():
    record = {
        "id": treaty.treaty_id,
        "k": treaty.kind,
        "d": treaty.treaty_date,
        "n": [nation.strip() for nation in treaty.nation_list if nation.strip()],
        "p": treaty.place.strip() if isinstance(treaty.place, str) else "",
        "s": treaty.state if isinstance(treaty.state, str) else "",
    }
    if treaty.treaty_id in archive_match:
        archive = archive_match[treaty.treaty_id]
        record["rit"] = int(archive["number"])
        record["naid"] = archive["naid"]
        record["img"] = archive["img"].replace("!150,150", "!600,600")
    if isinstance(treaty.cession_numbers, list):
        record["c"] = sorted(
            treaty.cession_numbers,
            key=lambda number: (int(re.sub(r"\D", "", number)), number),
        )
        record["ac"] = number_or_none(treaty.mapped_acres)
        record["fa"] = number_or_none(treaty.first_cession_acres)
        record["ra"] = number_or_none(treaty.reservation_acres)
        record["nf"] = number_or_none(treaty.forest_acres)
        if treaty.grant_acres > 0:
            record["lg"] = [
                number_or_none(treaty.grant_acres),
                number_or_none(treaty.grant_paid),
                number_or_none(treaty.grant_raised),
            ]
    if treaty.treaty_id in war_of:
        record["w"] = war_of[treaty.treaty_id]
    if treaty.treaty_id in audited_payments.index:
        payment = audited_payments.loc[treaty.treaty_id]
        annuities = [
            [float(part.split(" x ")[0]), int(part.split(" x ")[1])]
            for part in payment["term_annuities"].split("; ")
            if part
        ]
        record["pl"] = round(float(payment["one_time_dollars"]))
        record["pa"] = [[round(amount), years] for amount, years in annuities]
        record["pp"] = round(float(payment["open_ended_annual_dollars"]))
        record["sc"] = round(
            float(payment["one_time_dollars"]) + sum(amount * years for amount, years in annuities)
        )
        if payment["payment_basis"] in basis_code:
            record["pn"] = basis_note[payment["payment_basis"]]
            record["pk"] = basis_code[payment["payment_basis"]]
        elif payment["note"]:
            record["pn"] = payment["note"]
    treaty_records.append(record)

    text = treaty_texts.get(treaty.treaty_id, "")
    text = text.replace("﻿", "").replace("\r", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    passages = dollar_passages(text)
    record["np"] = len(passages)
    text_records[treaty.treaty_id] = {"t": text, "pc": passages}

missing_text = [key for key, value in text_records.items() if not value["t"]]

(site_directory / "data" / "treaties.js").write_text(
    "window.TREATIES=" + json.dumps(treaty_records, separators=(",", ":"), ensure_ascii=False) + ";",
    encoding="utf-8",
)

chunk_size = 30
ordered_ids = [record["id"] for record in treaty_records]
chunk_of = {}
for start in range(0, len(ordered_ids), chunk_size):
    chunk_number = start // chunk_size
    chunk = {treaty_id: text_records[treaty_id] for treaty_id in ordered_ids[start:start + chunk_size]}
    for treaty_id in chunk:
        chunk_of[treaty_id] = chunk_number
    (site_directory / "data" / "text" / f"{chunk_number:02d}.js").write_text(
        f"window.TEXT_CHUNK({chunk_number},"
        + json.dumps(chunk, separators=(",", ":"), ensure_ascii=False)
        + ");",
        encoding="utf-8",
    )
(site_directory / "data" / "text_index.js").write_text(
    "window.TEXT_INDEX=" + json.dumps(chunk_of, separators=(",", ":")) + ";", encoding="utf-8"
)

# Cession attributes and geometry ####


def clean(value):
    return value if isinstance(value, str) and value.strip() else None


cession_records = {}
for cession in cessions.itertuples():
    record = {
        "d": cession.dates,
        "t": cession.links,
        "k": cession.cession_class,
        "nat": clean(cession.schdtrb) or "",
        "now": [name.strip() for name in str(cession.presdaytrb).split(";") if name.strip()]
        if clean(cession.presdaytrb)
        else [],
        "st": clean(cession.state) or "",
        "ac": number_or_none(cession.gis_acres),
        "fa": number_or_none(cession.first_cession_acres),
        "ra": number_or_none(cession.reservation_acres),
        "nf": number_or_none(cession.forest_acres),
        "rs": cession.schedule_links,
        "kp": cession.kappler_links,
        "mp": clean(cession.mapurl1),
        "mn": clean(cession.mapname1),
        "fs": clean(cession.link_federal_statute),
        "eo": clean(cession.link_executive_order),
    }
    if cession.forest_names:
        record["fn"] = cession.forest_names[:4]
    if pd.notna(cession.grant_acres):
        record["lg"] = [
            number_or_none(cession.grant_acres),
            number_or_none(cession.grant_paid),
            number_or_none(cession.grant_raised),
            cession.universities,
        ]
    if pd.notna(cession.cession_paid):
        record["hp"] = [number_or_none(cession.cession_paid), cession.US_Acquired_Mode]
    cession_records[cession.number] = {key: value for key, value in record.items() if value is not None}

(site_directory / "data" / "cessions.js").write_text(
    "window.CESSIONS=" + json.dumps(cession_records, separators=(",", ":"), ensure_ascii=False) + ";",
    encoding="utf-8",
)

cession_shapes = cessions[["number", "geometry"]].copy()
cession_shapes["y"] = cessions["dates"].map(lambda dates: int(dates[0][:4]) if dates else None)
cession_shapes = cession_shapes.rename(columns={"number": "n"}).to_crs(4326)
cession_shapes.to_file(work_directory / "cessions.geojson", driver="GeoJSON")

land_status = gpd.read_file(data_directory / "cessions" / "land_status.gpkg")
land_status = land_status.set_crs("ESRI:102003", allow_override=True)
outside = land_status[land_status["source"].str.startswith("Outside Royce")].copy()
group_of = {
    1783: "Original states: colonial and state acquisition",
    1791: "Original states: colonial and state acquisition",
    1796: "Kentucky, Tennessee, West Virginia: crown and state cessions",
    1803: "Gulf coast: acquired from France and Spain",
    1817: "Gulf coast: acquired from France and Spain",
    1819: "Gulf coast: acquired from France and Spain",
    1821: "Gulf coast: acquired from France and Spain",
    1845: "Texas: Republic and state removal",
    1875: "Texas: Republic and state removal",
    1852: "California: no ratified treaty",
    1904: "Dakota: taken by executive order and settlement",
}
outside["g"] = outside["taken_year"].astype(int).map(group_of)
outside["y"] = outside["taken_year"].astype(int)
outside = outside.dissolve(by=["g", "y"], as_index=False)[["g", "y", "geometry"]]
outside["a"] = (outside.geometry.area / square_meters_per_acre).round().astype(int)
outside.to_crs(4326).to_file(work_directory / "outside.geojson", driver="GeoJSON")

reservations_out = reservations[["NAME", "geometry"]].to_crs(4326)
reservations_out = reservations_out.cx[-125:-66, 24:50]
reservations_out.to_file(work_directory / "reservations.geojson", driver="GeoJSON")


print("Wrote treaties.js, cessions.js and the treaty texts. Run build_map_layers.py next.")
